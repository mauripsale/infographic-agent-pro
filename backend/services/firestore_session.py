import asyncio
from typing import Optional, Dict, Any, List
from google.adk.sessions import Session
from google.adk.sessions.base_session_service import BaseSessionService
from google.adk.events import Event
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
        
        # Ensure we don't overwrite an existing session's history if it exists
        doc_ref = self.collection.document(sid)
        doc = await asyncio.to_thread(doc_ref.get)
        
        current_time = time.time()
        
        if doc.exists:
            # If exists, we preserve events but might update state
            data = doc.to_dict()
            existing_events_data = data.get("events", [])
            existing_events = [Event.model_validate(e) for e in existing_events_data]
            
            # Update state if provided, else keep existing
            new_state = state if state is not None else data.get("state", {})
            
            return Session(
                id=sid,
                app_name=app_name,
                user_id=user_id,
                state=new_state,
                events=existing_events,
                last_update_time=current_time
            )
            
        # Create New
        session = Session(
            id=sid,
            app_name=app_name,
            user_id=user_id,
            state=state or {},
            events=[],
            last_update_time=current_time
        )

        doc_data = session.model_dump(mode='json', by_alias=True)
        await asyncio.to_thread(doc_ref.set, doc_data)
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

        # Deserialize Events explicitly to ensure Pydantic validation passes
        events_data = data.get("events", [])
        events_objects = []
        for e in events_data:
            try:
                events_objects.append(Event.model_validate(e))
            except Exception as err:
                print(f"Warning: Failed to deserialize event: {err}")
                # Skip malformed events to avoid crashing the whole session load

        # Reconstruct Session
        return Session(
            id=data.get("id"),
            app_name=data.get("appName") or data.get("app_name"), # Handle aliasing
            user_id=data.get("userId") or data.get("user_id"),
            state=data.get("state", {}),
            events=events_objects,
            last_update_time=data.get("lastUpdateTime") or data.get("last_update_time") or time.time()
        )

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
        
        # We need to return the full session object, so we must fetch it or reconstruct it.
        # Fetching is safer to ensure we have the events.
        return await self.get_session(app_name=app_name, user_id=user_id, session_id=session_id)

    async def delete_session(self, *, app_name: str, user_id: str, session_id: str) -> None:
        await asyncio.to_thread(self.collection.document(session_id).delete)

    async def list_sessions(self, *, app_name: str, user_id: str, page_size: int = 20, page_token: Optional[str] = None) -> Any:
        return []

    async def append_event(self, session: Session, event: Event) -> Event:
        """
        Persists the event to Firestore by appending it to the 'events' array.
        This is critical for ADK Runner history.
        """
        # 1. Update in-memory session (Runner expects this mutation)
        session.events.append(event)
        session.last_update_time = time.time()

        # 2. Persist to Firestore
        doc_ref = self.collection.document(session.id)
        
        # Serialize event using Pydantic V2
        event_data = event.model_dump(mode='json', by_alias=True)
        
        # Use ArrayUnion to append atomicaly
        await asyncio.to_thread(doc_ref.update, {
            "events": firestore.ArrayUnion([event_data]),
            "lastUpdateTime": session.last_update_time
        })
        
        return event