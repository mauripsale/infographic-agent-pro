import logging
from typing import Optional, List, Any
from google.cloud import firestore
from google.adk.sessions import BaseSessionService, Session, GetSessionConfig, ListSessionsResponse
from google.adk.events.event import Event
import uuid
import time

logger = logging.getLogger(__name__)

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
        
        # Ensure session_id is unique per user/app if we want strict namespacing, 
        # but here we rely on the ID provided or generated.
        # Construct the ADK Session object
        session = Session(
            id=sid,
            app_name=app_name,
            user_id=user_id,
            state=state or {},
            events=[],
            last_update_time=time.time()
        )

        # Persist to Firestore
        try:
            # We use model_dump(mode='json') to ensure all types are JSON compatible
            doc_data = session.model_dump(mode='json', by_alias=True)
            self.collection.document(sid).set(doc_data)
            logger.info(f"Created Firestore session: {sid}")
            return session
        except Exception as e:
            logger.error(f"Failed to create session {sid}: {e}")
            raise

    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: Optional[GetSessionConfig] = None,
    ) -> Optional[Session]:
        try:
            doc_ref = self.collection.document(session_id)
            doc = doc_ref.get()
            
            if not doc.exists:
                return None
            
            data = doc.to_dict()
            
            # Simple validation to ensure it belongs to user/app
            if data.get("appName") != app_name or data.get("userId") != user_id:
                logger.warning(f"Session {session_id} access mismatch for user {user_id}")
                return None

            # Deserialize
            session = Session.model_validate(data)
            return session
            
        except Exception as e:
            logger.error(f"Failed to get session {session_id}: {e}")
            return None

    async def delete_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
    ) -> None:
        try:
            doc_ref = self.collection.document(session_id)
            doc = doc_ref.get()
            
            if not doc.exists:
                logger.warning(f"Session {session_id} not found for deletion")
                return

            data = doc.to_dict()
            # Verify ownership
            if data.get("userId") != user_id or data.get("appName") != app_name:
                logger.warning(f"Unauthorized deletion attempt for session {session_id} by user {user_id}")
                return

            doc_ref.delete()
            logger.info(f"Deleted session {session_id}")
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
            raise

    async def list_sessions(
        self,
        *,
        app_name: str,
        user_id: str,
        page_size: int = 20,
        page_token: Optional[str] = None,
    ) -> ListSessionsResponse:
        try:
            query = self.collection.where("appName", "==", app_name).where("userId", "==", user_id)
            query = query.order_by("lastUpdateTime", direction=firestore.Query.DESCENDING)
            query = query.limit(page_size)

            if page_token:
                # Firestore cursor pagination usually requires the actual document snapshot or field values
                # For simplicity in this implementation, we might skip complex token handling 
                # or assume page_token is a document ID to start after?
                # A robust impl would need to serialize/deserialize the cursor.
                # For now, let's just return the first page or basic logic.
                pass

            docs = query.stream()
            sessions = []
            for d in docs:
                try:
                    sessions.append(Session.model_validate(d.to_dict()))
                except Exception as ve:
                    logger.warning(f"Skipping invalid session doc {d.id}: {ve}")

            return ListSessionsResponse(sessions=sessions, next_page_token=None)
        except Exception as e:
            logger.error(f"List sessions failed: {e}")
            return ListSessionsResponse(sessions=[], next_page_token=None)

    async def append_event(self, session: Session, event: Event) -> Event:
        """Appends an event to the session and updates Firestore."""
        try:
            # 1. Update the in-memory session object first (as ADK expects)
            session.events.append(event)
            session.last_update_time = time.time()
            
            # 2. Persist to Firestore
            # We can use ArrayUnion to append just this event to the 'events' array
            doc_ref = self.collection.document(session.id)
            
            # Serialize the event
            event_data = event.model_dump(mode='json', by_alias=True)
            
            doc_ref.update({
                "events": firestore.ArrayUnion([event_data]),
                "lastUpdateTime": session.last_update_time
            })
            
            return event
        except Exception as e:
            logger.error(f"Failed to append event to session {session.id}: {e}")
            raise
