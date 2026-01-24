import logging
import asyncio
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
        
        session = Session(
            id=sid,
            app_name=app_name,
            user_id=user_id,
            state=state or {},
            events=[],
            last_update_time=time.time()
        )

        try:
            # Use create() to prevent overwriting existing sessions
            doc_data = session.model_dump(mode='json', by_alias=True)
            # Run blocking I/O in a thread
            await asyncio.to_thread(self.collection.document(sid).create, doc_data)
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
            # Run blocking I/O in a thread
            doc = await asyncio.to_thread(doc_ref.get)
            
            if not doc.exists:
                return None
            
            data = doc.to_dict()
            
            # Simple validation to ensure it belongs to user/app
            if data.get("appName") != app_name or data.get("userId") != user_id:
                logger.warning(f"Session {session_id} access mismatch for user {user_id}")
                return None

            # Deserialize
            session = Session.model_validate(data)
            
            # Config optimization hook (placeholder)
            # if config and not config.include_events: session.events = []
            
            return session
            
        except Exception as e:
            logger.error(f"Failed to get session {session_id}: {e}")
            raise

    async def delete_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
    ) -> None:
        transaction = self.db.transaction()
        doc_ref = self.collection.document(session_id)

        @firestore.transactional
        def delete_in_transaction(transaction, ref):
            snapshot = ref.get(transaction=transaction)
            if not snapshot.exists:
                logger.warning(f"Session {session_id} not found for deletion")
                return
            
            data = snapshot.to_dict()
            if data.get("userId") != user_id or data.get("appName") != app_name:
                logger.warning(f"Unauthorized deletion attempt for session {session_id} by user {user_id}")
                return
            
            transaction.delete(ref)
            logger.info(f"Deleted session {session_id}")

        try:
            # Run the entire transaction block in a thread
            await asyncio.to_thread(delete_in_transaction, transaction, doc_ref)
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
            # Note: Pagination/Ordering disabled to avoid Composite Index requirement.
            # query = query.order_by("lastUpdateTime", direction=firestore.Query.DESCENDING)
            query = query.limit(page_size)

            # Consume stream in a thread
            docs = await asyncio.to_thread(lambda: list(query.stream()))
            
            sessions = []
            for d in docs:
                try:
                    sessions.append(Session.model_validate(d.to_dict()))
                except Exception as ve:
                    logger.warning(f"Skipping invalid session doc {d.id}: {ve}")

            return ListSessionsResponse(sessions=sessions, next_page_token=None)
        except Exception as e:
            logger.error(f"List sessions failed: {e}")
            raise

    async def append_event(self, session: Session, event: Event) -> Event:
        """Appends an event to the session and updates Firestore.

        Note: This method mutates the input `session` object by appending the new
        event to its `events` list and updating `last_update_time`.
        """
        try:
            session.events.append(event)
            session.last_update_time = time.time()
            
            doc_ref = self.collection.document(session.id)
            event_data = event.model_dump(mode='json', by_alias=True)
            
            # Run blocking update in a thread
            await asyncio.to_thread(doc_ref.update, {
                "events": firestore.ArrayUnion([event_data]),
                "lastUpdateTime": session.last_update_time
            })
            
            return event
        except Exception as e:
            logger.error(f"Failed to append event to session {session.id}: {e}")
            raise
