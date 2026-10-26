# A BRACCIO — Guida Pubblicazione su Google Play Store (TWA)

Questa cartella contiene i file di configurazione ufficiali conformi alle linee guida di Google per pubblicare l'app su **Google Play Store**.

## Dati Pacchetto Android
- **Package ID**: `com.abraccio.app`
- **Nome App**: `A BRACCIO`
- **Sottotitolo / Payoff**: `Il braccio destro di chi lavora da solo`
- **Versione**: 1.0.0 (Code 1)

---

### Procedura Passo-Passo per Google Play Console

1. **Crea l'App su Google Play Console**:
   - Accedi a [play.google.com/console](https://play.google.com/console)
   - Clicca **"Crea app"**
   - Nome dell'app: `Preventivo AI - Preventivi Vocali`
   - Lingua predefinita: `Italiano`
   - Tipo: `App`
   - Gratuita o a pagamento: seleziona **Gratuita** (perché l'abbonamento Pro è gestito internamente via Stripe/Web).

2. **Generazione del file .AAB (Android App Bundle)**:
   - Puoi usare lo strumento ufficiale di Google [PWABuilder](https://www.pwabuilder.com) (sviluppato in collaborazione con Microsoft e Google):
     1. Inserisci l'URL dell'app online
     2. Clicca **"Package for Stores"** -> **"Android"**
     3. Scarica il file pronto `.aab` già firmato e compilato.

3. **Collegamento di Sicurezza (Digital Asset Links)**:
   - Nella Play Console, vai in **"Integrità delle app"** (App Integrity).
   - Copia la stringa **"Impronta digitale certificato SHA-256"**.
   - Incolla questa impronta dentro il file:
     `d:\ANTIGRAVITY GOOGLE AI\preventivo-saas\static\assetlinks.json`
   - In questo modo l'app Android non mostrerà la barra dell'indirizzo del browser e apparirà al 100% come app nativa Android a schermo intero!

4. **Carica l'AAB su Google Play**:
   - Nella scheda **"Produzione"** (o Test aperto/chiuso), carica il file `.aab`.
   - Compila la scheda dello Store (descrizione breve, screenshot) e invia per la revisione a Google.
