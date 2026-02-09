---
active: true
iteration: 1
max_iterations: 0
completion_promise: "ADK_REFACTOR_COMPLETE"
started_at: "2026-02-09T19:27:36Z"
---

Refactor Codebase to ADK Best Practices
Obiettivo: Ristrutturare il progetto  per aderire alle Best Practices ADK definite in .

Fasi del Refactoring:
1.  **Struttura del Progetto (Principio 1):**
    - Creare  per centralizzare le impostazioni.
    - Spostare le costanti (modelli, bucket, project ID) in .
    - Spostare i prompt lunghi (es. istruzioni ) in .

2.  **Tool Design (Principio 2):**
    - Verificare/Adattare i tool in  per usare  (se applicabile con l'attuale architettura ADK Python).
    - *Nota:* L'ADK Python attuale usa  o iniezione automatica. Controllerò la documentazione per mappare  correttamente alla versione in uso.

3.  **State Management (Principio 3):**
    - Implementare  (o simile callback) in  per gestire variabili dinamiche come la data odierna o l'ID utente, invece di passarle come argomenti sparsi.

4.  **Prompt Engineering (Principio 4):**
    - Caricare i prompt dai file Markdown in  invece di averli hardcoded nelle stringhe Python.

5.  **Logging e Error Handling (Principio 5):**
    - Assicurarsi che  e i tool usino il logging standard e gestiscano le eccezioni restituendo messaggi user-friendly all'LLM (già parzialmente fatto, ma da uniformare).

Piano d'Azione Immediato:
1.  Creare la directory .
2.  Estrarre il System Prompt di  da  a .
3.  Creare  per gestire le variabili d'ambiente (PROJECT_ID, BUCKET, MODELS).
4.  Aggiornare  per leggere la configurazione e i prompt dai nuovi file.
5.  Aggiornare  per usare .
