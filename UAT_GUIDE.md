# 🧪 Infographic Agent Pro: UAT Guide

Questa guida accompagna l'utente nel test delle funzionalità principali rilasciate nelle ultime iterazioni: **Persistent Sessions**, **Multi-Upload**, **Project History** e **Styling**.

## 1. Setup Iniziale
*   Assicurati di essere loggato con Google (bottone "Sign in with Google").
*   Vai su **Settings** (icona ingranaggio) e inserisci la tua **Gemini API Key** (deve iniziare con `AIza`).
*   Salva e verifica che l'icona diventi grigia (segno che la chiave è stata criptata e salvata).

## 2. Test Multi-Upload & Analisi (New Feature) 📂
**Obiettivo:** Verificare che l'agente legga più file e rispetti i brand asset.

1.  **Prepare:** Prepara 2 file PDF/TXT semplici (es. "Report Q1.pdf", "Dati Mercato.txt") e 1 immagine o PDF di Brand (es. "BrandGuide.pdf" o logo aziendale).
2.  **Upload:**
    *   Clicca **Source Docs** e seleziona i due file di contenuto. Verifica che appaiano nella lista "Files Ready" con il badge verde.
    *   Clicca **Brand Assets** e seleziona il file di brand. Verifica il badge blu.
    *   *Opzionale:* Clicca la "X" su uno dei file per rimuoverlo e poi riaggiungilo.
3.  **Prompt:** Scrivi nel box: "Crea una presentazione di vendita basata su questi dati, usando uno stile coerente con il brand guide."
4.  **Action:** Clicca **Generate Script**.
5.  **Verifica:**
    *   L'agente conferma di aver ricevuto i file?
    *   Lo script generato cita dati da entrambi i documenti sorgente?
    *   (Opzionale) Se hai messo istruzioni di stile nel Brand Guide, l'agente le menziona nei "Visual Prompts"?

## 3. Test "Soft Reset" & Interruzione 🛑
**Obiettivo:** Verificare che non si perdano i file caricati se si cambia idea.

1.  Mentre l'agente sta generando (o appena finito lo script), clicca **STOP**.
2.  Cambia un parametro (es. Stile da "Professional" a "Cyberpunk").
3.  Clicca di nuovo **Generate Script**.
4.  **Popup:** Dovrebbe apparire "New Project?". Clicca **"Restart Generation"** (NON "Fully Reset").
5.  **Verifica:** La generazione riparte usando i file caricati prima (non devi ricaricarli) ma con il nuovo stile scelto.

## 4. Test Persistenza Sessione (Persistence Check) 🛡️
**Obiettivo:** Verificare che la chat sopravviva al riavvio (simulato col refresh).

1.  Dopo aver generato lo script (fase "Review"), **ricarica la pagina del browser (F5)**.
2.  L'interfaccia tornerà allo stato iniziale (perché il Frontend è stateless sul refresh).
3.  *Nota:* Questo test verifica la persistenza *lato server*. Per vedere l'effetto lato utente, usiamo la **Project History**.

## 5. Test Project History & Reload 📜
**Obiettivo:** Recuperare il lavoro perso o riprendere progetti passati.

1.  Clicca sull'icona **Orologio** (History) in alto a destra.
2.  Dovresti vedere il progetto appena creato in cima alla lista.
3.  Clicca sul progetto per caricarlo.
4.  **Verifica:**
    *   L'interfaccia si popola immediatamente con lo script e le immagini generate (se presenti).
    *   Non devi rigenerare nulla. Tutto è stato caricato da Firestore.

## 6. Test Generazione Grafica & Export 🎨
**Obiettivo:** Provare la pipeline creativa completa.

1.  Se non lo hai fatto, clicca **Generate Graphics**.
2.  Aspetta che qualche slide venga generata.
3.  Clicca su un'immagine per aprire il **Lightbox** (Full Screen). Usa le frecce della tastiera per navigare tra le slide.
4.  **Export:**
    *   Prova **ZIP**: Verifica il download di un pacchetto con tutte le immagini.
    *   Prova **PDF**: Verifica che venga generato un documento unico con le slide.
    *   Prova **Google Slides**: Accetta i permessi extra. Dovrebbe aprirsi una nuova presentazione Google Slides modificabile su Drive con i tuoi contenuti.

## 7. Stress Test (Scalability) 🔥
*   Prova a caricare 5+ file insieme.
*   Prova a generare una presentazione lunga (10+ slide).
*   Verifica che la UI rimanga reattiva durante la generazione grazie alla gestione non-blocking asincrona nel backend.
