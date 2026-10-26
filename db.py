"""
Database e modelli per il SaaS Preventivo AI
Gestione Utenti, Abbonamenti Stripe, Limiti Preventivi e Cloud Storage Preventivi.
"""
import aiosqlite
import os
from pathlib import Path

DB_PATH = Path(os.getenv("DATABASE_PATH", Path(__file__).parent / "preventivo_saas.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        # Tabella Utenti
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                name TEXT DEFAULT '',
                plan TEXT DEFAULT 'free', -- 'free' | 'pro'
                quotes_used_this_month INTEGER DEFAULT 0,
                stripe_customer_id TEXT DEFAULT '',
                stripe_subscription_id TEXT DEFAULT '',
                subscription_status TEXT DEFAULT 'inactive',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Tabella Dati Aziendali / Freelance per Utente (precompilati sui preventivi)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                business_name TEXT DEFAULT '',
                vat_id TEXT DEFAULT '',
                address TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                iban TEXT DEFAULT '',
                fiscal_regime TEXT DEFAULT 'forfettario', -- 'forfettario' | 'ordinario'
                vat_rate REAL DEFAULT 22.0,
                default_deposit_pct REAL DEFAULT 30.0,
                default_revisions INTEGER DEFAULT 2,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Tabella Preventivi Cloud
        await db.execute("""
            CREATE TABLE IF NOT EXISTS quotes (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                number TEXT NOT NULL,
                title TEXT NOT NULL,
                client_name TEXT NOT NULL,
                client_contact TEXT DEFAULT '',
                status TEXT DEFAULT 'bozza', -- 'bozza' | 'inviato' | 'accettato' | 'rifiutato'
                total_amount REAL DEFAULT 0.0,
                deposit_amount REAL DEFAULT 0.0,
                balance_amount REAL DEFAULT 0.0,
                data_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Tabella Rubrica & Agenda Clienti con Potenziale Ricavo e Pipeline
        await db.execute("""
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                company TEXT DEFAULT '',
                contact_person TEXT DEFAULT '',
                email TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                status TEXT DEFAULT 'da_contattare', -- 'nuovo' | 'da_contattare' | 'contattato' | 'in_trattativa' | 'attivo' | 'perso'
                estimated_revenue REAL DEFAULT 0.0,
                notes TEXT DEFAULT '',
                next_follow_up TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Tabella Feedbacks e Valutazioni Utenti
        await db.execute("""
            CREATE TABLE IF NOT EXISTS feedbacks (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_email TEXT DEFAULT '',
                user_name TEXT DEFAULT '',
                rating INTEGER NOT NULL,
                category TEXT DEFAULT 'generale',
                comment TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Migrazioni soft per users (referral & loyalty 2-mesi minimo)
        user_migration_columns = [
            ("referral_code", "TEXT DEFAULT ''"),
            ("referred_by", "TEXT DEFAULT ''"),
            ("referral_bonus_months", "INTEGER DEFAULT 0"),
            ("referral_count", "INTEGER DEFAULT 0"),
            ("pro_months_paid", "INTEGER DEFAULT 0"),
            ("is_gold_ambassador", "INTEGER DEFAULT 0"),
            ("active_paying_friends", "INTEGER DEFAULT 0")
        ]
        for col_name, col_def in user_migration_columns:
            try:
                await db.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")
            except Exception:
                pass

        # Migrazioni soft per quotes
        migration_columns = [
            ("client_id", "TEXT DEFAULT ''"),
            ("views_count", "INTEGER DEFAULT 0"),
            ("last_viewed_at", "TIMESTAMP DEFAULT NULL"),
            ("signed_at", "TIMESTAMP DEFAULT NULL"),
            ("signature_data", "TEXT DEFAULT ''"),
            ("signed_by_name", "TEXT DEFAULT ''"),
            ("signed_by_ip", "TEXT DEFAULT ''"),
            ("selected_addons_json", "TEXT DEFAULT '[]'")
        ]
        for col_name, col_def in migration_columns:
            try:
                await db.execute(f"ALTER TABLE quotes ADD COLUMN {col_name} {col_def}")
            except Exception:
                pass

        await db.commit()
