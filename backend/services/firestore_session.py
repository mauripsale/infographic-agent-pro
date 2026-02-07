from typing import Optional, Dict, Any, List
from google.adk.sessions import Session, SessionService
from google.cloud import firestore
import datetime

class FirestoreSessionService(SessionService):
    def __init__(self, db: firestore.Client):
        self.db = db

    async def create_session(
        self,
        app_name: str,
        user_id: str,
        session_id: Optional[str] = None,
        state: Optional[Dict[str, Any]] = None,
    ) -> Session:
        if not session_id:
            import uuid
            session_id = str(uuid.uuid4())
        
        doc_ref = self.db.collection("users").document(user_id).collection("sessions").document(session_id)
        
        session_data = {
            "id": session_id,
            "user_id": user_id,
            "app_name": app_name,
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
            "state": state or {}
        }
        
        doc_ref.set(session_data, merge=True)
        
        return Session(
            id=session_id,
            user_id=user_id,
            app_name=app_name,
            state=state or {},
            created_at=datetime.datetime.now(), # Approximation for return obj
            updated_at=datetime.datetime.now()
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
        return Session(
            id=data.get("id"),
            user_id=data.get("user_id"),
            app_name=data.get("app_name"),
            state=data.get("state", {}),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at")
        )

    async def list_sessions(
        self,
        app_name: str,
        user_id: str,
        page_size: int = 10,
        page_token: Optional[str] = None,
    ) -> List[Session]:
        # Simple implementation ignoring pagination for now
        docs = self.db.collection("users").document(user_id).collection("sessions").limit(page_size).stream()
        sessions = []
        for doc in docs:
            data = doc.to_dict()
            sessions.append(Session(
                id=data.get("id"),
                user_id=data.get("user_id"),
                app_name=data.get("app_name"),
                state=data.get("state", {}),
                created_at=data.get("created_at"),
                updated_at=data.get("updated_at")
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
        
        # Verify existence (optional but good practice)
        # doc = doc_ref.get()
        # if not doc.exists:
        #    raise ValueError(f"Session {session_id} not found")

        update_data = {
            "state": state,
            "updated_at": firestore.SERVER_TIMESTAMP
        }
        
        doc_ref.set(update_data, merge=True)
        
        # Return updated session object (fetching fresh or constructing)
        return Session(
            id=session_id,
            user_id=user_id,
            app_name=app_name,
            state=state,
            created_at=datetime.datetime.now(), # Placeholder
            updated_at=datetime.datetime.now()
        )