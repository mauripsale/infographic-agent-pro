---
active: true
iteration: 1
max_iterations: 0
completion_promise: "IMAGEN_PURGED_FOREVER"
started_at: "2026-02-12T21:02:06Z"
---

Purge All Traces of Imagen and Force User IDs
Obiettivo: Eliminare ogni traccia residua di  e assicurare che  sia usato ovunque.

Analisi:
1.  Ho modificato  e .
2.  Tuttavia,  potrebbe avere un valore di default nel metodo  o  che sta ancora usando il vecchio ID se il parametro non viene passato correttamente.
3.  Anche  potrebbe avere logica che fa fallback se l'header manca.

Piano d'Azione:
1.  **Grep Totale:** Cercare  in TUTTA la cartella  e  per trovare il colpevole.
2.  **Fix Spietato:** Sostituire qualsiasi occorrenza trovata con i valori corretti dalla memoria ().
3.  **Deploy e Verifica:** Pushare la correzione.

Esecuzione:
- Grep ricorsivo.
- Replace.
