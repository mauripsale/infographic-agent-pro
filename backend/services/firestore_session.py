from typing import Optional, Dict, Any, List
from google.adk.sessions import Session
from google.adk.sessions.base_session_service import BaseSessionService
from google.cloud import firestore
import time
import uuid

class FirestoreSessionService(BaseSessionService):
    def __init__(self, client: firestore.Client, collection_name: str = "adk_sessions"):
        self.db = client
        self.collection = self.db.collection(collection_name)

    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> Session:
        sid = session_id or str(uuid.uuid4())
        
        session = Session(
            id=sid,
            app_name=app_name,
            user_id=user_id,
            state=state or {},
            events=[],
            last_update_time=time.time()
        )

        doc_data = session.model_dump(mode='json', by_alias=True)
        await asyncio.to_thread(self.collection.document(sid).set, doc_data)
        return session

    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: Optional[Any] = None,
    ) -> Optional[Session]:
        doc_ref = self.collection.document(session_id)
        doc = await asyncio.to_thread(doc_ref.get)
        
        if not doc.exists:
            return None
        
        data = doc.to_dict()
        if data.get("appName") != app_name or data.get("userId") != user_id:
            return None

        return Session.model_validate(data)

    async def update_session_state(
        self,
        app_name: str,
        user_id: str,
        session_id: str,
        state: Dict[str, Any],
    ) -> Session:
        doc_ref = self.collection.document(session_id)
        current_time = time.time()
        
        update_data = {
            "state": state,
            "lastUpdateTime": current_time
        }
        
        await asyncio.to_thread(doc_ref.update, update_data)
        
        return Session(
            id=session_id,
            app_name=app_name,
            user_id=user_id,
            state=state,
            events=[], 
            last_update_time=current_time
        )

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        await asyncio.to_thread(self.collection.document(session_id).delete)

    async def list_sessions(self, *, app_name: str, user_id: str, page_size: int = 20, page_token: Optional[str] = None) -> Any:
        # Minimal impl for compatibility
        return None

    async def append_event(self, session: Session, event: Any) -> Any:
        return event