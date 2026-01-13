import logging
import os

import requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

_NETWORK_TIMEOUT = 30
# Standard 16:9 Slide Dimensions in Points
PAGE_WIDTH = 720
PAGE_HEIGHT = 405

class GoogleSlidesTool:
    def __init__(self, access_token: str):
        self.creds = Credentials(token=access_token)
        self.slides_service = build('slides', 'v1', credentials=self.creds, cache_discovery=False)

    def _check_image_url(self, url: str) -> bool:
        """Verifies if the image URL is reachable."""
        try:
            # Try HEAD first (faster)
            response = requests.head(url, timeout=5)
            if response.status_code == 200:
                return True
            # Fallback to GET if HEAD is not supported/blocked
            response = requests.get(url, stream=True, timeout=5)
            response.close()
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"Image URL check failed for {url}: {e}")
            return False

    def create_presentation(self, title: str, slides_data: list) -> str:
        try:
            # 1. Create Presentation
            presentation = self.slides_service.presentations().create(body={'title': title}).execute()
            presentation_id = presentation.get('presentationId')
            
            # 2. Batch 1: Create Slides & Images
            requests = []
            
            for i, slide in enumerate(slides_data):
                page_id = f"slide_{i}_page"
                
                # Create Slide
                requests.append({
                    'createSlide': {
                        'objectId': page_id,
                        'slideLayoutReference': {'predefinedLayout': 'BLANK'}
                    }
                })

                img_url = slide.get('image_url')
                if img_url and self._check_image_url(img_url):
                    img_obj_id = f"img_{i}"
                    requests.append({
                        'createImage': {
                            'objectId': img_obj_id,
                            'url': img_url,
                            'elementProperties': {
                                'pageObjectId': page_id,
                                'size': {'width': {'magnitude': PAGE_WIDTH, 'unit': 'PT'}, 'height': {'magnitude': PAGE_HEIGHT, 'unit': 'PT'}},
                                'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': 0, 'translateY': 0, 'unit': 'PT'}
                            }
                        }
                    })

            # Execute Batch 1
            if requests:
                self.slides_service.presentations().batchUpdate(presentationId=presentation_id, body={'requests': requests}).execute()

            # 3. Batch 2: Add Speaker Notes
            # Fetch minimal data needed to locate speaker notes body placeholders
            presentation = self.slides_service.presentations().get(
                presentationId=presentation_id,
                fields='slides(objectId,slideProperties/notesPage/pageElements(objectId,shape/placeholder/type))'
            ).execute()
            
            notes_requests = []
            slides_map = {s['objectId']: s for s in presentation.get('slides', [])}

            for i, slide_data in enumerate(slides_data):
                page_id = f"slide_{i}_page"
                slide_obj = slides_map.get(page_id)
                
                if not slide_obj:
                    continue
                    
                notes_page = slide_obj.get('slideProperties', {}).get('notesPage')
                if not notes_page:
                    continue

                # Find the Body placeholder in the notes page
                body_placeholder_id = None
                for element in notes_page.get('pageElements', []):
                    if element.get('shape', {}).get('placeholder', {}).get('type') == 'BODY':
                        body_placeholder_id = element['objectId']
                        break
                
                if body_placeholder_id:
                    note_text = f"Title: {slide_data.get('title', 'Untitled')}\n\n{slide_data.get('description', '')}"
                    notes_requests.append({
                        'insertText': {
                            'objectId': body_placeholder_id,
                            'text': note_text
                        }
                    })

            # Execute Batch 2
            if notes_requests:
                self.slides_service.presentations().batchUpdate(presentationId=presentation_id, body={'requests': notes_requests}).execute()

            return f"https://docs.google.com/presentation/d/{presentation_id}/edit"

        except Exception as e:
            logger.error(f"Slides Export Error: {e}")
            raise
