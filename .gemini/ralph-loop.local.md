---
active: true
iteration: 1
max_iterations: 0
completion_promise: "ADK_PURA_ESTASI"
started_at: "2026-01-26T12:00:00Z"
---

Implementa AI Content Refiner e rifattorizza Image Generation per essere 100% ADK Native. Crea branch feature/adk-native-refactor. Modifica backend/agents/infographic_agent/agent.py aggiungendo create_refiner_agent(api_key) che restituisce un LlmAgent Editor che riscrive JSON {title, description} basandosi su instruction, e aggiungendo create_image_artist_agent(api_key, img_tool) che restituisce un LlmAgent Artista che DEVE usare il tool generate_image per produrre URL immagini. Modifica backend/main.py rifattorizzando l'endpoint /agent/stream (fase graphics) per non chiamare più img_tool direttamente, ma tramite un Runner che esegue image_artist_agent inviandogli il prompt; aggiungi l'endpoint /agent/refine_text che usa un Runner con refiner_agent per aggiornare i testi e salvali su Firestore. Modifica frontend/src/app/page.tsx aggiungendo l'icona Magic Wand sulla card della slide, gestendo l'input dell'istruzione e aggiornando lo stato locale script e Firestore al successo della rifinitura.