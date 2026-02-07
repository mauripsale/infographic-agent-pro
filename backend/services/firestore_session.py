from typing import Optional, Dict, Any, List
from google.adk.sessions import Session
from google.adk.sessions.base_session_service import BaseSessionService
from google.cloud import firestore
import time
import uuid

class FirestoreSessionService(BaseSessionService):
    def __init__(self, db: firestore.Client):
        self.db = db

    async def create_session(
        self,
        app_name: str,
        user_id: str,
        session_id: Optional[str] = None,
        state: Optional[Dict[str, Any]] = None,
    ) -> Session:
        sid = session_id or str(uuid.uuid4())
        
        doc_ref = self.db.collection("users").document(user_id).collection("sessions").document(sid)
        
        current_time = time.time()
        
        session_data = {
            "id": sid,
            "user_id": user_id,
            "app_name": app_name,
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
            "state": state or {}
        }
        
        doc_ref.set(session_data, merge=True)
        
        # fields: ['id', 'app_name', 'user_id', 'state', 'events', 'last_update_time']
        return Session(
            id=sid,
            user_id=user_id,
            app_name=app_name,
            state=state or {},
            events=[], 
            last_update_time=current_time
        )

    async def get_session(
        self,
        app_name: str,
        user_id: str,
        session_id: str,
    ) -> Session:
        doc_ref = self.db.collection("users").document(user_id).collection("sessions").document(session_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            raise ValueError(f"Session {session_id} not found")
            
        data = doc.to_dict()
        
        last_update = data.get("updated_at")
        if hasattr(last_update, 'timestamp'):
            last_update_ts = last_update.timestamp()
        else:
            last_update_ts = time.time()

        return Session(
            id=data.get("id"),
            user_id=data.get("user_id"),
            app_name=data.get("app_name"),
            state=data.get("state", {}),
            events=data.get("events", []),
            last_update_time=last_update_ts
        )

    async def list_sessions(
        self,
        app_name: str,
        user_id: str,
        page_size: int = 10,
        page_token: Optional[str] = None,
    ) -> List[Session]:
        docs = self.db.collection("users").document(user_id).collection("sessions").limit(page_size).stream()
        sessions = []
        for doc in docs:
            data = doc.to_dict()
            last_update = data.get("updated_at")
            last_update_ts = last_update.timestamp() if hasattr(last_update, 'timestamp') else time.time()
            
            sessions.append(Session(
                id=data.get("id"),
                user_id=data.get("user_id"),
                app_name=data.get("app_name"),
                state=data.get("state", {}),
                events=data.get("events", []),
                last_update_time=last_update_ts
            ))
        return sessions

    async def delete_session(
        self,
        app_name: str,
        user_id: str,
        session_id: str,
    ) -> None:
        self.db.collection("users").document(user_id).collection("sessions").document(session_id).delete()

    async def update_session_state(
        self,
        app_name: str,
        user_id: str,
        session_id: str,
        state: Dict[str, Any],
    ) -> Session:
        """Updates the state of an existing session."""
        doc_ref = self.db.collection("users").document(user_id).collection("sessions").document(session_id)
        
        current_time = time.time()
        update_data = {
            "state": state,
            "updated_at": firestore.SERVER_TIMESTAMP
        }
        
        doc_ref.set(update_data, merge=True)
        
        return Session(
            id=session_id,
            user_id=user_id,
            app_name=app_name,
            state=state,
            events=[], 
            last_update_time=current_time
        )
