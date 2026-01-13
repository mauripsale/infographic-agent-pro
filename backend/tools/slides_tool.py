import logging
import os

import requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

# Layout Constants for maintainability
TITLE_WIDTH = 700
TITLE_HEIGHT = 60
TITLE_X = 20
TITLE_Y = 20

BODY_WIDTH = 300
BODY_HEIGHT = 300
BODY_X = 20
BODY_Y = 100

IMG_WIDTH = 350
IMG_HEIGHT = 300
IMG_X = 350
IMG_Y = 100

_NETWORK_TIMEOUT = 30

class GoogleSlidesTool:
    def __init__(self, access_token: str):
        self.creds = Credentials(token=access_token)
        self.slides_service = build('slides', 'v1', credentials=self.creds, cache_discovery=False)

    def create_presentation(self, title: str, slides_data: list) -> str:
        try:
            # 1. Create Presentation
            presentation = self.slides_service.presentations().create(body={'title': title}).execute()
            presentation_id = presentation.get('presentationId')
            
            # 2. Build Requests
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

                # Add Elements with coordinate-based positioning
                title_id = f"title_{i}"
                requests.append({
                    'createShape': {
                        'objectId': title_id,
                        'shapeType': 'TEXT_BOX',
                        'elementProperties': {
                            'pageObjectId': page_id,
                            'size': {'width': {'magnitude': TITLE_WIDTH, 'unit': 'PT'}, 'height': {'magnitude': TITLE_HEIGHT, 'unit': 'PT'}},
                            'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': TITLE_X, 'translateY': TITLE_Y, 'unit': 'PT'}
                        }
                    }
                })
                requests.append({'insertText': {'objectId': title_id, 'text': slide.get('title', 'Untitled')}})

                body_id = f"body_{i}"
                requests.append({
                    'createShape': {
                        'objectId': body_id,
                        'shapeType': 'TEXT_BOX',
                        'elementProperties': {
                            'pageObjectId': page_id,
                            'size': {'width': {'magnitude': BODY_WIDTH, 'unit': 'PT'}, 'height': {'magnitude': BODY_HEIGHT, 'unit': 'PT'}},
                            'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': BODY_X, 'translateY': BODY_Y, 'unit': 'PT'}
                        }
                    }
                })
                requests.append({'insertText': {'objectId': body_id, 'text': slide.get('description', '')}})

                img_url = slide.get('image_url')
                if img_url:
                    img_obj_id = f"img_{i}"
                    requests.append({
                        'createImage': {
                            'objectId': img_obj_id,
                            'url': img_url,
                            'elementProperties': {
                                'pageObjectId': page_id,
                                'size': {'width': {'magnitude': IMG_WIDTH, 'unit': 'PT'}, 'height': {'magnitude': IMG_HEIGHT, 'unit': 'PT'}},
                                'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': IMG_X, 'translateY': IMG_Y, 'unit': 'PT'}
                            }
                        }
                    })

            # Execute Batch Update
            if requests:
                self.slides_service.presentations().batchUpdate(presentationId=presentation_id, body={'requests': requests}).execute()

            return f"https://docs.google.com/presentation/d/{presentation_id}/edit"

        except Exception as e:
            logger.error(f"Slides Export Error: {e}")
            raise
