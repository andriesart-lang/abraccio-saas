"""
FastAPI Server Principale per Preventivo AI SaaS.
"""
import os
import uuid
import json
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, Request, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import aiosqlite

load_dotenv()

from db import init_db, DB_PATH
from auth import hash_password, verify_password, create_access_token, get_current_user
from gemini_service import generate_quote_from_ai, analyze_quote_strategy, generate_followup_messages
from stripe_service import create_checkout_session, create_customer_portal, handle_stripe_webhook, verify_checkout_session

FREE_LIMIT = int(os.getenv("FREE_QUOTES_LIMIT", 3))

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="A BRACCIO — SaaS API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servire i file statici frontend (Apple Style UI)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Modelli Dati
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ""
    ref: Optional[str] = ""

class FeedbackSubmit(BaseModel):
    rating: int # 1 to 5
    category: Optional[str] = "generale"
    comment: Optional[str] = ""

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdate(BaseModel):
    business_name: Optional[str] = ""
    vat_id: Optional[str] = ""
    address: Optional[str] = ""
    phone: Optional[str] = ""
    iban: Optional[str] = ""
    fiscal_regime: Optional[str] = "forfettario"
    vat_rate: Optional[float] = 22.0
    default_deposit_pct: Optional[float] = 30.0
    default_revisions: Optional[int] = 2

class QuoteSave(BaseModel):
    id: Optional[str] = None
    number: Optional[str] = None
    title: str
    client_name: str
    client_contact: Optional[str] = ""
    client_id: Optional[str] = ""
    status: Optional[str] = "bozza"
    total_amount: float
    deposit_amount: float
    balance_amount: float
    data: dict

class QuoteStatusUpdate(BaseModel):
    status: str

# Modelli Rubrica / Agenda Clienti
class ClientCreate(BaseModel):
    name: str
    company: Optional[str] = ""
    contact_person: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    status: Optional[str] = "da_contattare" # nuovo | da_contattare | contattato | in_trattativa | attivo | perso
    estimated_revenue: Optional[float] = 0.0
    notes: Optional[str] = ""
    next_follow_up: Optional[str] = ""

class ClientUpdate(BaseModel):
    name: str
    company: Optional[str] = ""
    contact_person: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    status: Optional[str] = "da_contattare"
    estimated_revenue: Optional[float] = 0.0
    notes: Optional[str] = ""
    next_follow_up: Optional[str] = ""

class ClientStatusUpdate(BaseModel):
    status: str

class QuoteSignRequest(BaseModel):
    signer_name: str
    signature_data: str # Base64 PNG image from touch/canvas
    selected_addons: Optional[list] = []
    final_total: Optional[float] = None
    final_deposit: Optional[float] = None

# ----------------- ENDPOINT PREVENTIVI & OPERATIVITÀ -----------------

@app.patch("/api/quotes/{quote_id}/status")
async def update_quote_status(quote_id: str, req: QuoteStatusUpdate, user: dict = Depends(get_current_user)):
    valid_statuses = ["bozza", "inviato", "accettato", "in_corso", "completato", "rifiutato"]
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Stato non valido")

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE quotes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
            (req.status, quote_id, user["id"])
        )
        await db.commit()
    return {"status": "success", "new_status": req.status}

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT status, total_amount, deposit_amount, balance_amount, created_at FROM quotes WHERE user_id = ?", (user["id"],)) as c:
            rows = await c.fetchall()

    counts = {
        "bozza": 0,
        "inviato": 0,
        "accettato": 0,
        "in_corso": 0,
        "completato": 0,
        "rifiutato": 0,
        "totale_preventivi": len(rows),
        "valore_totale": 0.0,
        "valore_accettato_in_corso": 0.0,
        "acconti_incassati": 0.0,
        "conclusi_totali": 0,
        "valore_medio_commessa": 0.0,
        "tasso_conversione": 0
    }

    for r in rows:
        st = r["status"]
        if st in counts:
            counts[st] += 1
        counts["valore_totale"] += (r["total_amount"] or 0.0)
        if st in ["accettato", "in_corso", "completato"]:
            counts["valore_accettato_in_corso"] += (r["total_amount"] or 0.0)
            counts["acconti_incassati"] += (r["deposit_amount"] or 0.0)
            counts["conclusi_totali"] += 1

    tot_prev = counts["totale_preventivi"]
    conclusi = counts["conclusi_totali"]
    if conclusi > 0:
        counts["valore_medio_commessa"] = round(counts["valore_accettato_in_corso"] / conclusi, 2)
    elif tot_prev > 0:
        counts["valore_medio_commessa"] = round(counts["valore_totale"] / tot_prev, 2)

    if tot_prev > 0:
        counts["tasso_conversione"] = round((conclusi / tot_prev) * 100)

    return counts

# ----------------- FUNZIONE PRO EXCLUSIVE: ADVISOR STRATEGICO AI -----------------
@app.post("/api/quotes/{quote_id}/ai-advisor")
async def get_quote_ai_advisor(quote_id: str, user: dict = Depends(get_current_user)):
    # Verifica che l'utente sia abbonato PRO (oppure gli permettiamo 1 prova gratuita se lo desidera)
    if user["plan"] != "pro" and user["quotes_used_this_month"] > 1:
        raise HTTPException(
            status_code=403,
            detail="Questa funzione di Consulenza Commerciale & Legale AI è riservata agli abbonati A BRACCIO PRO."
        )

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT data_json FROM quotes WHERE id = ? AND user_id = ?", (quote_id, user["id"])) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Preventivo non trovato")
            quote_data = json.loads(row["data_json"]) if isinstance(row["data_json"], str) else row["data_json"]

    try:
        advice = await analyze_quote_strategy(quote_data)
        return advice
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- ENDPOINT AUTENTICAZIONE & REFERRAL -----------------

@app.post("/api/auth/register")
async def register(req: UserRegister):
    user_id = str(uuid.uuid4())
    hashed = hash_password(req.password)
    # Genera codice referral univoco e memorabile
    clean_prefix = ''.join(c for c in (req.name or 'PRO') if c.isalnum())[:4].upper() or 'PRO'
    referral_code = f"BRACCIO-{clean_prefix}-{uuid.uuid4().hex[:4].upper()}"

    referred_by_id = ""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Se fornito codice invito, collega l'amico che lo ha invitato
        if req.ref:
            ref_clean = req.ref.strip().upper()
            async with db.execute("SELECT id, referral_count FROM users WHERE UPPER(referral_code) = ?", (ref_clean,)) as cur:
                referrer = await cur.fetchone()
                if referrer:
                    referred_by_id = referrer["id"]
                    # Incrementa conteggio inviti registrati (ma il bonus maturerà solo dopo 2 mesi PRO attivi)
                    await db.execute(
                        "UPDATE users SET referral_count = referral_count + 1 WHERE id = ?",
                        (referrer["id"],)
                    )

        try:
            await db.execute(
                """INSERT INTO users (id, email, hashed_password, name, referral_code, referred_by, pro_months_paid) 
                   VALUES (?, ?, ?, ?, ?, ?, 0)""",
                (user_id, req.email.lower(), hashed, req.name, referral_code, referred_by_id)
            )
            # Crea profilo vuoto
            await db.execute("INSERT INTO user_profiles (user_id) VALUES (?)", (user_id,))
            await db.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(status_code=400, detail="Un account con questa email esiste già.")

    token = create_access_token(user_id, req.email.lower())
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": req.email,
            "name": req.name,
            "plan": "free",
            "referral_code": referral_code
        }
    }

@app.post("/api/auth/login")
async def login(req: UserLogin):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM users WHERE email = ?", (req.email.lower(),)) as cursor:
            user = await cursor.fetchone()
            if not user or not verify_password(req.password, user["hashed_password"]):
                raise HTTPException(status_code=400, detail="Credenziali non valide.")
            user_dict = dict(user)

    token = create_access_token(user_dict["id"], user_dict["email"])
    return {
        "token": token,
        "user": {
            "id": user_dict["id"],
            "email": user_dict["email"],
            "name": user_dict["name"],
            "plan": user_dict["plan"],
            "quotes_used": user_dict["quotes_used_this_month"],
            "free_limit": FREE_LIMIT,
            "referral_code": user_dict.get("referral_code") or ""
        }
    }

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user["id"],)) as c:
            profile = await c.fetchone()
            profile_dict = dict(profile) if profile else {}

        # Assicuriamoci che l'utente abbia sempre un referral_code
        ref_code = user.get("referral_code")
        if not ref_code:
            clean_prefix = ''.join(c for c in (user.get("name") or 'PRO') if c.isalnum())[:4].upper() or 'PRO'
            ref_code = f"BRACCIO-{clean_prefix}-{uuid.uuid4().hex[:4].upper()}"
            await db.execute("UPDATE users SET referral_code = ? WHERE id = ?", (ref_code, user["id"]))
            await db.commit()

        # Leggiamo statistiche referral con la regola sostenibile:
        # L'amico deve attivare PRO ed essere attivo da ALMENO 2 MESI (pro_months_paid >= 2)
        async with db.execute("SELECT COUNT(*) as total_invited FROM users WHERE referred_by = ?", (user["id"],)) as ic:
            tot_row = await ic.fetchone()
            total_invited = tot_row["total_invited"] if tot_row else 0

        async with db.execute(
            "SELECT COUNT(*) as qualified FROM users WHERE referred_by = ? AND plan = 'pro' AND pro_months_paid >= 2",
            (user["id"],)
        ) as qc:
            q_row = await qc.fetchone()
            qualified_count = q_row["qualified"] if q_row else 0

        async with db.execute(
            "SELECT COUNT(*) as maturing FROM users WHERE referred_by = ? AND plan = 'pro' AND pro_months_paid < 2",
            (user["id"],)
        ) as mc:
            m_row = await mc.fetchone()
            maturing_count = m_row["maturing"] if m_row else 0

        has_gold = 1 if qualified_count >= 1 else 0
        discount_eur = min(qualified_count * 1.0, 3.0)

    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "plan": user["plan"],
            "quotes_used": user["quotes_used_this_month"],
            "free_limit": FREE_LIMIT,
            "subscription_status": user["subscription_status"],
            "referral_code": ref_code,
            "referral_count": total_invited,
            "qualified_friends": qualified_count,
            "maturing_friends": maturing_count,
            "is_gold_ambassador": has_gold,
            "referral_discount_eur": discount_eur
        },
        "profile": profile_dict
    }

@app.get("/api/support/referrals")
async def get_referral_details(user: dict = Depends(get_current_user)):
    """Dettaglio inviti con monitoraggio maturazione dei 2 mesi attivi."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT id, name, email, plan, pro_months_paid, created_at 
            FROM users 
            WHERE referred_by = ?
            ORDER BY created_at DESC
        """, (user["id"],)) as c:
            rows = await c.fetchall()

    friends = []
    qualified_count = 0
    maturing_count = 0

    for r in rows:
        email_masked = (r["email"][:2] + "***@" + r["email"].split("@")[-1]) if "@" in r["email"] else "Collega"
        is_pro = (r["plan"] == "pro")
        months = r["pro_months_paid"] or 0
        if is_pro and months >= 2:
            status = "qualificato" # 2+ mesi pagati
            qualified_count += 1
        elif is_pro:
            status = f"in_maturazione" # Mese 1 di 2
            maturing_count += 1
        else:
            status = "registrato_free"

        friends.append({
            "name": r["name"] or "Collega Freelance",
            "email_masked": email_masked,
            "status": status,
            "pro_months_paid": months,
            "created_at": r["created_at"]
        })

    discount_eur = min(qualified_count * 1.0, 3.0)
    has_gold = (qualified_count >= 1)

    return {
        "referral_code": user.get("referral_code", ""),
        "total_invited": len(friends),
        "maturing_count": maturing_count,
        "qualified_count": qualified_count,
        "discount_eur": discount_eur,
        "has_gold_superpowers": has_gold,
        "friends": friends
    }

@app.put("/api/user/profile")
async def update_profile(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO user_profiles 
            (user_id, business_name, vat_id, address, phone, iban, fiscal_regime, vat_rate, default_deposit_pct, default_revisions)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user["id"], req.business_name, req.vat_id, req.address, req.phone, req.iban,
            req.fiscal_regime, req.vat_rate, req.default_deposit_pct, req.default_revisions
        ))
        await db.commit()
    return {"status": "success", "message": "Profilo aggiornato"}

# ----------------- GENERAZIONE PREVENTIVO AI -----------------

@app.post("/api/quotes/generate-ai")
async def generate_ai(
    text: Optional[str] = Form(None),
    audio: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user)
):
    # Controllo limiti Piano Free
    if user["plan"] == "free" and user["quotes_used_this_month"] >= FREE_LIMIT:
        raise HTTPException(
            status_code=403,
            detail=f"Hai raggiunto il limite di {FREE_LIMIT} preventivi gratuiti del mese. Passa a Pro per crearne illimitati!"
        )

    # Recupera profilo fornitore
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user["id"],)) as c:
            prof = await c.fetchone()
            profile = dict(prof) if prof else {}

    audio_bytes = None
    mime_type = "audio/webm"
    if audio:
        audio_bytes = await audio.read()
        mime_type = audio.content_type or "audio/webm"

    try:
        quote_data = await generate_quote_from_ai(profile, text=text, audio_bytes=audio_bytes, mime_type=mime_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Incrementa contatore preventivi usati
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE users SET quotes_used_this_month = quotes_used_this_month + 1 WHERE id = ?", (user["id"],))
        await db.commit()

    return quote_data

# ----------------- SALVATAGGIO / GESTIONE PREVENTIVI CLOUD -----------------

@app.get("/api/quotes")
async def list_quotes(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC", (user["id"],)) as c:
            rows = await c.fetchall()
            return [dict(r) for r in rows]

@app.get("/api/quotes/{quote_id}")
async def get_quote_detail(quote_id: str, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM quotes WHERE id = ? AND user_id = ?", (quote_id, user["id"])) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Preventivo non trovato")
            return dict(row)

# Endpoint pubblico per visualizzazione preventivo cliente da link protetto
@app.get("/api/public/quotes/{quote_id}")
async def get_public_quote(quote_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Preventivo non trovato o scaduto")
            quote = dict(row)

        # Tracking Apertura in tempo reale
        await db.execute("""
            UPDATE quotes 
            SET views_count = COALESCE(views_count, 0) + 1,
                last_viewed_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (quote_id,))

        # Profilo fornitore per dati pagamento (IBAN, ragione sociale)
        async with db.execute("SELECT business_name, vat_id, address, phone, iban, fiscal_regime FROM user_profiles WHERE user_id = ?", (quote["user_id"],)) as c:
            prof_row = await c.fetchone()
            fornitore_info = dict(prof_row) if prof_row else {}

        # Verifica se il fornitore ha sbloccato i Super Poteri Gold Ambassador (almeno 1 amico attivo 2+ mesi)
        async with db.execute(
            "SELECT COUNT(*) as qualified FROM users WHERE referred_by = ? AND plan = 'pro' AND pro_months_paid >= 2",
            (quote["user_id"],)
        ) as qc:
            q_row = await qc.fetchone()
            fornitore_info["is_gold"] = (q_row["qualified"] >= 1) if q_row else False

        await db.commit()

    quote["fornitore_info"] = fornitore_info
    quote["views_count"] = (quote.get("views_count") or 0) + 1
    return quote

# Endpoint pubblico per firma elettronica e accettazione preventivo
@app.post("/api/public/quotes/{quote_id}/sign")
async def sign_quote(quote_id: str, req: QuoteSignRequest, request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM quotes WHERE id = ?", (quote_id,)) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Preventivo non trovato")
            quote = dict(row)

        quote_data = json.loads(quote["data_json"]) if isinstance(quote["data_json"], str) else quote["data_json"]
        
        final_total = req.final_total if req.final_total is not None else quote["total_amount"]
        final_deposit = req.final_deposit if req.final_deposit is not None else quote["deposit_amount"]
        final_balance = final_total - final_deposit

        if req.selected_addons:
            quote_data["pacchetti_selezionati"] = req.selected_addons
            quote_data["totale_imponibile"] = final_total
            quote_data["acconto_richiesto_valore"] = final_deposit

        await db.execute("""
            UPDATE quotes 
            SET status = 'accettato',
                signed_at = CURRENT_TIMESTAMP,
                signature_data = ?,
                signed_by_name = ?,
                signed_by_ip = ?,
                selected_addons_json = ?,
                total_amount = ?,
                deposit_amount = ?,
                balance_amount = ?,
                data_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (
            req.signature_data,
            req.signer_name.strip(),
            client_ip,
            json.dumps(req.selected_addons),
            final_total,
            final_deposit,
            final_balance,
            json.dumps(quote_data),
            quote_id
        ))

        # Se il cliente esiste in rubrica, aggiorna il suo stato ad 'attivo'
        client_name = quote.get("client_name", "").strip()
        if client_name and client_name.lower() != "da definire":
            await db.execute(
                "UPDATE clients SET status = 'attivo', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND LOWER(name) = ?",
                (quote["user_id"], client_name.lower())
            )

        await db.commit()

    return {
        "status": "success",
        "message": "Preventivo accettato e firmato digitalmente",
        "new_status": "accettato",
        "final_total": final_total,
        "final_deposit": final_deposit
    }

# Endpoint per Generazione Assistente Follow-up AI Diplomatico
@app.post("/api/quotes/{quote_id}/followup")
async def get_quote_followup(quote_id: str, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM quotes WHERE id = ? AND user_id = ?", (quote_id, user["id"])) as c:
            row = await c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Preventivo non trovato")
            quote = dict(row)

    quote_data = json.loads(quote["data_json"]) if isinstance(quote["data_json"], str) else quote["data_json"]
    
    import datetime
    created_raw = quote.get("created_at") or ""
    try:
        created_dt = datetime.datetime.fromisoformat(str(created_raw).replace("Z", "").split(".")[0])
        now = datetime.datetime.now()
        days_passed = max(1, (now - created_dt).days)
    except Exception:
        days_passed = 3

    views_count = quote.get("views_count") or 0

    try:
        messages = await generate_followup_messages(quote_data, days_passed=days_passed, views_count=views_count)
        return {
            "days_passed": days_passed,
            "views_count": views_count,
            "last_viewed_at": quote.get("last_viewed_at"),
            "messages": messages
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- SEZIONE GESTIONE CLIENTI & AGENDA FREELANCER -----------------
@app.get("/api/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # 1. Recupera clienti registrati
        async with db.execute("SELECT * FROM clients WHERE user_id = ? ORDER BY updated_at DESC", (user["id"],)) as c:
            existing_clients = [dict(r) for r in await c.fetchall()]

        # 2. Recupera tutti i preventivi dell'utente per metriche e sincronizzazione
        async with db.execute("SELECT id, client_name, client_contact, status, total_amount, created_at FROM quotes WHERE user_id = ?", (user["id"],)) as c:
            quotes = [dict(r) for r in await c.fetchall()]

        # Sincronizza eventuali clienti storici dai preventivi non ancora in tabella clients
        known_names = {c["name"].strip().lower() for c in existing_clients if c.get("name")}
        for q in quotes:
            q_name = (q.get("client_name") or "").strip()
            if q_name and q_name.lower() not in ["da definire", ""] and q_name.lower() not in known_names:
                new_cid = str(uuid.uuid4())
                initial_status = "attivo" if q.get("status") in ["accettato", "completato"] else ("in_trattativa" if q.get("status") in ["inviato", "in_corso"] else "nuovo")
                await db.execute("""
                    INSERT INTO clients (id, user_id, name, contact_person, status, estimated_revenue, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (new_cid, user["id"], q_name, q.get("client_contact", ""), initial_status, 0.0, "Cliente registrato da preventivo"))
                await db.commit()
                known_names.add(q_name.lower())
                existing_clients.append({
                    "id": new_cid,
                    "user_id": user["id"],
                    "name": q_name,
                    "company": "",
                    "contact_person": q.get("client_contact", ""),
                    "email": "",
                    "phone": "",
                    "status": initial_status,
                    "estimated_revenue": 0.0,
                    "notes": "Cliente registrato da preventivo",
                    "next_follow_up": "",
                    "created_at": q.get("created_at"),
                    "updated_at": q.get("created_at")
                })

        # 3. Calcola metriche per ciascun cliente
        result = []
        for cl in existing_clients:
            cl_name_lower = (cl["name"] or "").strip().lower()

            matching_quotes = [
                q for q in quotes 
                if (q.get("client_name") or "").strip().lower() == cl_name_lower
            ]

            total_quotes = len(matching_quotes)
            revenue_won = sum(q["total_amount"] or 0.0 for q in matching_quotes if q.get("status") in ["accettato", "in_corso", "completato"])
            revenue_pipeline = sum(q["total_amount"] or 0.0 for q in matching_quotes if q.get("status") == "inviato")
            revenue_draft = sum(q["total_amount"] or 0.0 for q in matching_quotes if q.get("status") == "bozza")
            
            estimated = float(cl.get("estimated_revenue") or 0.0)
            
            # Valutazione Potenziale Futuro: commesse storiche vinte + pipeline in corso + stima prospettica del freelancer
            total_potential = revenue_won + revenue_pipeline + estimated
            
            # Rating / Valutazione Commerciale
            if total_potential >= 5000 or revenue_won >= 3000:
                rating = "alto"
            elif total_potential >= 1500 or revenue_won >= 1000:
                rating = "medio"
            else:
                rating = "base"

            cl_data = dict(cl)
            cl_data.update({
                "total_quotes": total_quotes,
                "revenue_won": revenue_won,
                "revenue_pipeline": revenue_pipeline,
                "revenue_draft": revenue_draft,
                "total_potential": total_potential,
                "potential_rating": rating,
                "quotes_count": total_quotes
            })
            result.append(cl_data)

        # Ordina per priorità commerciale
        status_order = {
            "in_trattativa": 1,
            "da_contattare": 2,
            "nuovo": 3,
            "contattato": 4,
            "attivo": 5,
            "perso": 6
        }
        result.sort(key=lambda x: (status_order.get(x.get("status", "da_contattare"), 99), -x.get("total_potential", 0)))
        return result

@app.post("/api/clients")
async def create_client(req: ClientCreate, user: dict = Depends(get_current_user)):
    client_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO clients 
            (id, user_id, name, company, contact_person, email, phone, status, estimated_revenue, notes, next_follow_up)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            client_id, user["id"], req.name.strip(), (req.company or "").strip(), (req.contact_person or "").strip(),
            (req.email or "").strip(), (req.phone or "").strip(), req.status or "da_contattare",
            req.estimated_revenue or 0.0, (req.notes or "").strip(), (req.next_follow_up or "").strip()
        ))
        await db.commit()
    return {"status": "created", "id": client_id}

@app.put("/api/clients/{client_id}")
async def update_client(client_id: str, req: ClientUpdate, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            UPDATE clients 
            SET name = ?, company = ?, contact_person = ?, email = ?, phone = ?,
                status = ?, estimated_revenue = ?, notes = ?, next_follow_up = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        """, (
            req.name.strip(), (req.company or "").strip(), (req.contact_person or "").strip(),
            (req.email or "").strip(), (req.phone or "").strip(), req.status or "da_contattare",
            req.estimated_revenue or 0.0, (req.notes or "").strip(), (req.next_follow_up or "").strip(),
            client_id, user["id"]
        ))
        await db.commit()
    return {"status": "updated"}

@app.patch("/api/clients/{client_id}/status")
async def update_client_status(client_id: str, req: ClientStatusUpdate, user: dict = Depends(get_current_user)):
    valid_statuses = ["nuovo", "da_contattare", "contattato", "in_trattativa", "attivo", "perso"]
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Stato cliente non valido")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE clients SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
            (req.status, client_id, user["id"])
        )
        await db.commit()
    return {"status": "success", "new_status": req.status}

@app.delete("/api/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM clients WHERE id = ? AND user_id = ?", (client_id, user["id"]))
        await db.commit()
    return {"status": "deleted"}

@app.post("/api/quotes")
async def save_quote(req: QuoteSave, user: dict = Depends(get_current_user)):
    quote_id = req.id or str(uuid.uuid4())
    number = req.number or f"PREV-{uuid.uuid4().hex[:6].upper()}"

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO quotes 
            (id, user_id, number, title, client_name, client_contact, client_id, status, total_amount, deposit_amount, balance_amount, data_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            quote_id, user["id"], number, req.title, req.client_name, req.client_contact or "",
            req.client_id or "", req.status or "bozza", req.total_amount, req.deposit_amount, req.balance_amount, json.dumps(req.data)
        ))

        # Auto sincronizzazione cliente in rubrica se non esiste già
        cl_name = req.client_name.strip()
        if cl_name and cl_name.lower() != "da definire":
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT id FROM clients WHERE user_id = ? AND LOWER(name) = ?", (user["id"], cl_name.lower())) as c:
                row = await c.fetchone()
                if not row:
                    new_cid = str(uuid.uuid4())
                    init_status = "attivo" if req.status in ["accettato", "completato"] else ("in_trattativa" if req.status in ["inviato", "in_corso"] else "nuovo")
                    await db.execute("""
                        INSERT INTO clients (id, user_id, name, contact_person, status, estimated_revenue, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (new_cid, user["id"], cl_name, req.client_contact or "", init_status, 0.0, "Cliente da preventivo"))

        await db.commit()
    return {"id": quote_id, "number": number, "status": "saved"}

@app.delete("/api/quotes/{quote_id}")
async def delete_quote(quote_id: str, user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM quotes WHERE id = ? AND user_id = ?", (quote_id, user["id"]))
        await db.commit()
    return {"status": "deleted"}

# ----------------- MONETIZZAZIONE STRIPE & ABBONAMENTI -----------------

@app.post("/api/billing/create-checkout")
async def checkout(request: Request, user: dict = Depends(get_current_user)):
    host = request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto", "https" if "trycloudflare.com" in (host or "") else "http")
    detected_url = f"{proto}://{host}" if host else "http://localhost:8000"
    app_url = os.getenv("APP_URL") or detected_url

    try:
        url = await create_checkout_session(user, app_url)
        return {"checkout_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/billing/verify-session")
async def verify_session(request: Request, user: dict = Depends(get_current_user)):
    try:
        data = await request.json()
    except Exception:
        data = {}
    session_id = data.get("session_id", "demo")
    result = await verify_checkout_session(session_id, user)
    return result

@app.post("/api/billing/customer-portal")
async def portal(request: Request, user: dict = Depends(get_current_user)):
    host = request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto", "https" if "trycloudflare.com" in (host or "") else "http")
    detected_url = f"{proto}://{host}" if host else "http://localhost:8000"
    app_url = os.getenv("APP_URL") or detected_url

    try:
        url = await create_customer_portal(user, app_url)
        return {"portal_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/billing/webhook")
async def webhook(request: Request, stripe_signature: str = Header(None)):
    payload = await request.body()
    await handle_stripe_webhook(payload, stripe_signature)
    return {"status": "success"}

@app.get("/.well-known/assetlinks.json")
async def assetlinks():
    file_path = os.path.join(STATIC_DIR, "assetlinks.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return JSONResponse(content=json.loads(f.read()))
    return JSONResponse(content=[])

@app.post("/api/billing/cancel-subscription")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    """Disdetta abbonamento trasparente ed immediata (senza penali)."""
    import stripe
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if stripe_key and user.get("stripe_subscription_id"):
        try:
            stripe.api_key = stripe_key
            stripe.Subscription.delete(user["stripe_subscription_id"])
        except Exception as e:
            print("Avviso cancellazione Stripe API:", e)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET plan = 'free', subscription_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (user["id"],)
        )
        await db.commit()

    return {
        "status": "success",
        "message": "Abbonamento disdetto con successo. Nessun ulteriore addebito verrà effettuato."
    }

# ----------------- CENTRO ASSISTENZA & FEEDBACK -----------------

@app.post("/api/support/feedback")
async def submit_feedback(req: FeedbackSubmit, user: dict = Depends(get_current_user)):
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Il voto deve essere compreso tra 1 e 5 stelle.")

    fb_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO feedbacks (id, user_id, user_email, user_name, rating, category, comment)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            fb_id, user["id"], user.get("email", ""), user.get("name", ""),
            req.rating, req.category or "generale", req.comment or ""
        ))
        await db.commit()

    return {
        "status": "success",
        "message": "Grazie mille per la tua valutazione! Il tuo feedback è fondamentale per rendere A BRACCIO ancora migliore."
    }

@app.get("/api/support/feedbacks")
async def get_my_feedbacks(user: dict = Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM feedbacks WHERE user_id = ? ORDER BY created_at DESC", (user["id"],)) as c:
            rows = await c.fetchall()
            return [dict(r) for r in rows]

# Serve frontend con disattivazione cache per modifiche istantanee
@app.get("/")
async def root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(
                content=f.read(),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            )
    return HTMLResponse("<h1>Preventivo AI SaaS</h1>")
