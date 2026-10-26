"""
Integrazione Pagamenti e Abbonamenti Stripe.
"""
import os
import stripe
from fastapi import HTTPException
import aiosqlite
from db import DB_PATH

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "sk_test_placeholder")
PRICE_ID_MONTHLY = os.getenv("STRIPE_PRICE_ID_MONTHLY", "price_placeholder")

async def create_checkout_session(user: dict, app_url: str) -> str:
    secret_key = os.getenv("STRIPE_SECRET_KEY", "")
    if not secret_key or secret_key == "sk_test_placeholder":
        # Modalità simulazione per sviluppo locale senza bloccare l'utente
        return f"{app_url}/#upgrade-success?demo=true"

    customer_id = user.get("stripe_customer_id")
    if not customer_id:
        customer = stripe.Customer.create(
            email=user["email"],
            name=user.get("name") or user["email"],
            metadata={"user_id": user["id"]}
        )
        customer_id = customer.id
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("UPDATE users SET stripe_customer_id = ? WHERE id = ?", (customer_id, user["id"]))
            await db.commit()

    # Se PRICE_ID_MONTHLY è specificato usiamo quello, altrimenti creiamo il piano dinamicamente con price_data
    price_id = os.getenv("STRIPE_PRICE_ID_MONTHLY", "")
    if price_id and price_id != "price_placeholder":
        line_item = {
            "price": price_id,
            "quantity": 1,
        }
    else:
        line_item = {
            "price_data": {
                "currency": "eur",
                "product_data": {
                    "name": "A BRACCIO PRO — Abbonamento Mensile",
                    "description": "Preventivi vocali illimitati, Smart Tech Pack (Firma, QR EPC, Tracking, AI Follow-up) e CRM",
                },
                "unit_amount": 999, # 9,99 € in centesimi
                "recurring": {"interval": "month"}
            },
            "quantity": 1,
        }

    session = stripe.checkout.Session.create(
        customer=customer_id,
        line_items=[line_item],
        mode="subscription",
        success_url=f"{app_url}/#upgrade-success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{app_url}/#/pricing",
        metadata={"user_id": user["id"]}
    )
    return session.url

async def verify_checkout_session(session_id: str, user: dict) -> dict:
    secret_key = os.getenv("STRIPE_SECRET_KEY", "")
    if not secret_key or secret_key == "sk_test_placeholder" or session_id == "demo":
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("UPDATE users SET plan = 'pro', subscription_status = 'active' WHERE id = ?", (user["id"],))
            await db.commit()
        return {"status": "active", "plan": "pro"}

    try:
        session = stripe.checkout.Session.retrieve(session_id)
        if session.payment_status in ["paid", "no_payment_required"]:
            customer_id = session.customer
            sub_id = session.subscription
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    "UPDATE users SET plan = 'pro', subscription_status = 'active', stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?",
                    (customer_id, sub_id, user["id"])
                )
                await db.commit()
            return {"status": "active", "plan": "pro"}
        return {"status": session.payment_status, "plan": "free"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

async def create_customer_portal(user: dict, app_url: str) -> str:
    customer_id = user.get("stripe_customer_id")
    if not customer_id or customer_id == "":
        raise HTTPException(status_code=400, detail="Nessun abbonamento attivo trovato.")

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=f"{app_url}/#/account",
    )
    return session.url

async def handle_stripe_webhook(payload: bytes, sig_header: str):
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Gestione attivazione/disattivazione abbonamento
    if event["type"] in ["customer.subscription.created", "customer.subscription.updated"]:
        sub = event["data"]["object"]
        status = sub["status"] # active, trailing, past_due, canceled
        customer_id = sub["customer"]
        plan = "pro" if status in ["active", "trialing"] else "free"

        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE users SET plan = ?, subscription_status = ?, stripe_subscription_id = ? WHERE stripe_customer_id = ?",
                (plan, status, sub["id"], customer_id)
            )
            await db.commit()

    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE users SET plan = 'free', subscription_status = 'canceled' WHERE stripe_customer_id = ?",
                (customer_id,)
            )
            await db.commit()
