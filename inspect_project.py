import firebase_admin
from firebase_admin import credentials, firestore
import json
import os
from dotenv import load_dotenv

# Carica le variabili d'ambiente
load_dotenv(".gemini/.env")

def inspect_last_project():
    # Inizializza Firebase
    if not firebase_admin._apps:
        try:
            firebase_admin.initialize_app()
        except Exception:
            # Fallback se non ci sono credenziali default
            print("⚠️ Impossibile inizializzare Firebase automaticamente.")
            return
    
    db = firestore.client()
    
    print("🔍 Recupero l'ultimo progetto da Firestore...")
    
    try:
        users = db.collection("users").stream()
        
        last_project = None
        last_time = None
        user_owner = ""

        for user in users:
            # Cerchiamo i progetti per ogni utente
            projects = db.collection("users").document(user.id).collection("projects").order_by("created_at", direction=firestore.Query.DESCENDING).limit(1).stream()
            for p in projects:
                p_data = p.to_dict()
                created_at = p_data.get("created_at")
                # Firestore timestamps possono essere comparati direttamente
                if not last_time or (created_at and created_at > last_time):
                    last_time = created_at
                    last_project = p_data
                    last_project["id"] = p.id
                    user_owner = user.id

        if last_project:
            print(f"\n✅ PROGETTO TROVATO")
            print(f"🆔 ID: {last_project['id']}")
            print(f"👤 Utente: {user_owner}")
            print("-" * 30)
            
            # Formattiamo lo script per renderlo leggibile
            script = last_project.get("script", {})
            print("\n📜 CONTENUTO DELLO SCRIPT (JSON):")
            print(json.dumps(script, indent=2, ensure_ascii=False))
            
            status = last_project.get("status", "N/A")
            print(f"\n📊 Stato attuale: {status}")
        else:
            print("❌ Nessun progetto trovato nelle collezioni degli utenti.")
            
    except Exception as e:
        print(f"❌ Erroce durante la lettura da Firestore: {e}")

if __name__ == "__main__":
    inspect_last_project()
