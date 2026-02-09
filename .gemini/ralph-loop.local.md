---
active: true
iteration: 1
max_iterations: 0
completion_promise: "USER_IDS_RESTORED"
started_at: "2026-02-09T21:55:28Z"
---

Restore User Specified Model IDs
Obiettivo:
1.  **Ripristinare Frontend:**
    - Modificare  per usare ESATTAMENTE gli ID forniti dall'utente nei  delle select.
    - Testo: , , , .
    - Immagini: , .

2.  **Ripristinare Backend:**
    - Modificare  per usare  e  come default.

3.  **Verifica:**
    - Assicurarsi che non ci siano altri mapping nascosti. Se l'API restituisce 404 con questi ID, sarà un problema di allowlist/accesso della chiave API, ma il codice DEVE usare questi ID come richiesto.

Piano d'Azione:
1.  Aggiornare .
2.  Aggiornare .
