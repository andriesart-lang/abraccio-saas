"""
Integrazione Google Gemini con la chiave API del Server (SaaS Owner).
Nessun costo o configurazione richiesta all'utente finale.
"""
import os
import httpx
import json
import base64
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

def get_system_prompt(profile: dict, has_audio: bool, has_text: bool) -> str:
    input_type = "un audio (nota vocale) e un testo integrativo" if has_audio and has_text else ("un audio (nota vocale)" if has_audio else "un testo in linguaggio naturale")
    business_name = profile.get("business_name") or "Professionista / Freelance"
    regime = profile.get("fiscal_regime") or "forfettario"
    vat_rate = profile.get("vat_rate", 22.0)
    deposit_pct = profile.get("default_deposit_pct", 30.0)
    revisions = profile.get("default_revisions", 2)

    regola_iva = (
        f"2. Il fornitore è in regime ordinario con IVA al {vat_rate}%. Scorpora l'IVA se i prezzi sono indicati come lordi."
        if regime == "ordinario"
        else "2. Il fornitore è in regime forfettario (esente IVA): riporta i prezzi concordati netti senza applicare alcuna imposta."
    )

    return f"""Sei un assistente legale e commerciale d'élite specializzato nell'estrazione e strutturazione di preventivi e contratti per freelance e partite IVA.

Il tuo compito:
Riceverai {input_type} in cui un professionista descrive a braccio un lavoro svolto o commissionato da un cliente.

Devi estrarre e strutturare TUTTE le seguenti informazioni in formato JSON valido:
{{
  "titolo_progetto": "Titolo chiaro e professionale del lavoro",
  "dati_cliente": {{
    "nome_o_azienda": "Nome del cliente o dell'azienda citata (oppure 'Da definire')",
    "contatti": "Email o telefono se menzionati"
  }},
  "dati_fornitore": {{
    "nome": "{business_name}"
  }},
  "descrizione_lavoro": "Sintesi chiara e professionale delle attività concordate",
  "voci_preventivo": [
    {{
      "descrizione": "Singola prestazione o deliverable",
      "quantita": 1,
      "prezzo_unitario": 0.00,
      "totale": 0.00
    }}
  ],
  "pacchetti_opzionali": [
    {{
      "id": "opt-1",
      "titolo": "Supporto e Assistenza Prioritaria (3 Mesi)",
      "descrizione": "Canale diretto prioritario per modifiche minori e assistenza tecnica continua.",
      "prezzo": 180.00,
      "selezionato": false
    }},
    {{
      "id": "opt-2",
      "titolo": "Consegna Express Prioritaria",
      "descrizione": "Priorità assoluta con accorciamento dei tempi di consegna del 40%.",
      "prezzo": 120.00,
      "selezionato": false
    }}
  ],
  "totale_imponibile": 0.00,
  "acconto_richiesto_percentuale": {deposit_pct},
  "acconto_richiesto_valore": 0.00,
  "tempistiche_consegna": "Scadenze o giorni lavorativi stimati",
  "clausole_chiave": [
    "Proprietà intellettuale, file sorgente ed esecutivi rilasciati solo a saldo avvenuto al 100%",
    "Inclusi massimo {revisions} cicli di revisione; eventuali ulteriori modifiche tariffate a parte",
    "Termini di pagamento: acconto del {deposit_pct}% alla firma, saldo entro 7 giorni dalla consegna",
    "Validità dell'offerta: 14 giorni dalla data di emissione. L'acconto versato non è rimborsabile in caso di recesso del committente",
    "Approvazione materiali: il cliente si impegna a fornire feedback entro 10 giorni lavorativi, decorsi i quali le consegne si intendono approvate"
  ],
  "messaggio_whatsapp_cliente": "Un messaggio breve, cordiale e persuasivo da inviare al cliente via WhatsApp insieme al link del preventivo.",
  "trascrizione": "Trascrizione fedele del contenuto vocale ricevuto"
}}

Regole operative:
1. Se nel vocale mancano dettagli precisi, applica i valori predefiniti indicati (acconto {deposit_pct}%, {revisions} revisioni).
{regola_iva}
3. Se una quantità è esplicita (es. '3 grafiche a 150€'), compila quantita e prezzo_unitario.
4. Genera sempre 1 o 2 'pacchetti_opzionali' coerenti e pertinenti con il tipo di lavoro (upselling intelligente).
5. Tutti gli importi numerici devono essere numeri validi (senza simboli di valuta).
6. Rispondi ESCLUSIVAMENTE con il blocco JSON puro, senza commenti o markdown aggiuntivo."""

async def generate_quote_from_ai(profile: dict, text: Optional[str] = None, audio_bytes: Optional[bytes] = None, mime_type: str = "audio/webm") -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY non configurata sul server.")

    parts = [{"text": get_system_prompt(profile, bool(audio_bytes), bool(text))}]

    if text:
        parts.append({"text": f"DESCRIZIONE TESTUALE DEL LAVORO:\n{text}"})

    if audio_bytes:
        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        parts.append({
            "inline_data": {
                "mime_type": mime_type,
                "data": b64_audio
            }
        })

    model_name = "gemini-flash-lite-latest"
    url = f"{GEMINI_BASE}/models/{model_name}:generateContent?key={api_key}"

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload)
        if response.status_code != 200:
            error_data = response.json()
            msg = error_data.get("error", {}).get("message", response.text)
            raise RuntimeError(f"Errore Gemini ({response.status_code}): {msg}")

        data = response.json()
        cand = data.get("candidates", [{}])[0]
        text_res = cand.get("content", {}).get("parts", [{}])[0].get("text", "")

        t = text_res.strip()
        if t.startswith("```json"):
            t = t[7:]
        if t.startswith("```"):
            t = t[3:]
        if t.endswith("```"):
            t = t[:-3]
        
        return json.loads(t.strip())

# ----------------- FUNZIONE ESCLUSIVA PRO: CONSULENTE STRATEGICO AI -----------------
async def analyze_quote_strategy(quote_data: dict) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY non configurata.")

    prompt = f"""Sei un consulente senior d'affari e legale per freelance e partite IVA.
Analizza questo preventivo commerciale e fornisci consigli strategici di altissimo valore per proteggere il freelance e massimizzare i suoi guadagni.

DATI PREVENTIVO:
Titolo: {quote_data.get('titolo_progetto')}
Cliente: {quote_data.get('dati_cliente', {}).get('nome_o_azienda')}
Descrizione Lavoro: {quote_data.get('descrizione_lavoro')}
Voci e Prezzi: {json.dumps(quote_data.get('voci_preventivo', []))}
Totale Imponibile: {quote_data.get('totale_imponibile')} EUR
Acconto Richiesto: {quote_data.get('acconto_richiesto_percentuale')}% ({quote_data.get('acconto_richiesto_valore')} EUR)
Tempistiche Consegna: {quote_data.get('tempistiche_consegna')}
Clausole Attuali: {json.dumps(quote_data.get('clausole_chiave', []))}

Rispondi ESCLUSIVAMENTE con un JSON strutturato così:
{{
  "valutazione_prezzo": {{
    "verdetto": "Sottostimato | Allineato al mercato | Ottimo",
    "consiglio": "Analisi breve del prezzo rispetto al valore offerto e se il freelance potrebbe chiedere di più.",
    "forchetta_mercato": "Es. 800€ - 1.200€"
  }},
  "analisi_rischi": [
    "Rischio specifico 1 con suggerimento di tutela",
    "Rischio specifico 2 (es. ambiguità consegne, revisioni, tempi)"
  ],
  "clausole_salvavita_suggerite": [
    "Clausola contrattuale precisa da inserire per evitare problemi"
  ],
  "strategia_trattativa": {{
    "se_chiede_sconto": "Risposta diplomatica e assertiva pronta da copiare per difendere il prezzo senza perdere il cliente",
    "se_chiede_piu_tempo_per_pagare": "Risposta per tutelare il flusso di cassa"
  }}
}}"""

    model_name = "gemini-flash-lite-latest"
    url = f"{GEMINI_BASE}/models/{model_name}:generateContent?key={api_key}"

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json"
        }
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(url, json=payload)
        if res.status_code != 200:
            raise RuntimeError(f"Errore analisi AI: {res.text}")
        data = res.json()
        cand = data.get("candidates", [{}])[0]
        text_res = cand.get("content", {}).get("parts", [{}])[0].get("text", "")
        t = text_res.strip()
        if t.startswith("```json"):
            t = t[7:]
        if t.startswith("```"):
            t = t[3:]
        if t.endswith("```"):
            t = t[:-3]
        return json.loads(t.strip())

# ----------------- FUNZIONE: AI FOLLOW-UP ASSISTANT COMMERCIALE -----------------
async def generate_followup_messages(quote_data: dict, days_passed: int = 3, views_count: int = 0) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY non configurata.")

    client_name = quote_data.get("dati_cliente", {}).get("nome_o_azienda") or "Cliente"
    title = quote_data.get("titolo_progetto") or "la proposta concordata"
    amount = quote_data.get("totale_imponibile", 0)

    prompt = f"""Sei un copywriter commerciale e negoziatore esperto per freelance e partite IVA.
Devi scrivere 3 messaggi diplomatici e ad altissima conversione per riattivare un cliente che ha ricevuto un preventivo ma non ha ancora risposto.

CONTESTO:
- Nome Cliente: {client_name}
- Oggetto Proposta: {title}
- Valore Preventivo: {amount} EUR
- Giorni trascorsi dall'invio: {days_passed} giorni
- Visualizzazioni della proposta online: {views_count} volte

Genera 3 varianti di messaggio pronte all'invio (stile WhatsApp o email breve, con emoji sobrie ed eleganza):
1. "cordiale": Gentile e leggero, ideale dopo 2-3 giorni.
2. "consulenziale": Professionale, chiede se ci sono dubbi su qualche voce specifica o se desidera una call di 10 min.
3. "urgenza_elegante": Raffinato senso di scarsità (es. conferma calendario produzioni del mese o mantenimento slot).

Rispondi ESCLUSIVAMENTE con un JSON strutturato così:
{{
  "cordiale": "Testo completo del messaggio...",
  "consulenziale": "Testo completo del messaggio...",
  "urgenza_elegante": "Testo completo del messaggio..."
}}"""

    model_name = "gemini-flash-lite-latest"
    url = f"{GEMINI_BASE}/models/{model_name}:generateContent?key={api_key}"

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.35,
            "responseMimeType": "application/json"
        }
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(url, json=payload)
        if res.status_code != 200:
            raise RuntimeError(f"Errore follow-up AI: {res.text}")
        data = res.json()
        cand = data.get("candidates", [{}])[0]
        text_res = cand.get("content", {}).get("parts", [{}])[0].get("text", "")
        t = text_res.strip()
        if t.startswith("```json"):
            t = t[7:]
        if t.startswith("```"):
            t = t[3:]
        if t.endswith("```"):
            t = t[:-3]
        return json.loads(t.strip())
