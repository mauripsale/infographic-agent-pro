import concurrent.futures
import logging
import os
import tempfile

import requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

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
        self.slides_service = build('slides', 'v1', credentials=self.creds)
        self.drive_service = build('drive', 'v3', credentials=self.creds)

    def _upload_image_to_drive(self, image_url: str) -> str | None:
        """Downloads image from URL and uploads to Drive. Returns file ID."""
        if not image_url:
            return None
        
        tmp_path = None
        try:
            # 1. Download Image with timeout to prevent blocking
            response = requests.get(image_url, stream=True, timeout=_NETWORK_TIMEOUT)
            if response.status_code != 200:
                logger.warning(f"Failed to download image from {image_url}: {response.status_code}")
                return None
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                for chunk in response.iter_content(chunk_size=8192):
                    tmp.write(chunk)
                tmp_path = tmp.name

            # 2. Upload to Drive
            file_metadata = {'name': 'Infographic Asset', 'mimeType': 'image/png'}
            media = MediaFileUpload(tmp_path, mimetype='image/png')
            file = self.drive_service.files().create(body=file_metadata, media_body=media, fields='id').execute()
            file_id = file.get('id')
            
            # 3. Make Public (Best effort)
            if file_id:
                try:
                    self.drive_service.permissions().create(
                        fileId=file_id, 
                        body={'type': 'anyone', 'role': 'reader'}
                    ).execute()
                except Exception as perm_err:
                    logger.warning(f"Failed to set public permissions: {perm_err}")
                return file_id
                
        except Exception as e:
            logger.error(f"Drive Upload Error for {image_url}: {e}")
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
        
        return None

    def create_presentation(self, title: str, slides_data: list) -> str:
        try:
            # 1. Create Presentation
            presentation = self.slides_service.presentations().create(body={'title': title}).execute()
            presentation_id = presentation.get('presentationId')
            
            # 2. Upload Images in Parallel for better performance
            image_map = {} 
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future_to_idx = {}
                for i, slide in enumerate(slides_data):
                    img_url = slide.get('image_url')
                    if img_url:
                        future = executor.submit(self._upload_image_to_drive, img_url)
                        future_to_idx[future] = i
                
                for future in concurrent.futures.as_completed(future_to_idx):
                    idx = future_to_idx[future]
                    try:
                        file_id = future.result()
                        if file_id:
                            image_map[idx] = file_id
                    except Exception as exc:
                        logger.error(f"Image upload parallel task failed for slide {idx}: {exc}")

            # 3. Build Requests
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

                if i in image_map:
                    img_obj_id = f"img_{i}"
                    requests.append({
                        'createImage': {
                            'objectId': img_obj_id,
                            'url': f'https://drive.google.com/uc?id={image_map[i]}',
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
