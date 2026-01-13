import logging
import os
import concurrent.futures
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials

logger = logging.getLogger(__name__)

# Layout Constants (Points)
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

class GoogleSlidesTool:
    def __init__(self, access_token: str):
        self.creds = Credentials(token=access_token)
        self.slides_service = build('slides', 'v1', credentials=self.creds)
        self.drive_service = build('drive', 'v3', credentials=self.creds)

    def _upload_image_to_drive(self, local_path: str) -> str | None:
        """Uploads image to Drive and makes it public. Returns file ID."""
        if not os.path.exists(local_path):
            if local_path.startswith("http"):
                # Handle Cloud Run local path resolution
                filename = local_path.split("/")[-1]
                local_path = f"static/{filename}"
            
        if not os.path.exists(local_path):
            logger.warning(f"Image not found at {local_path}, skipping upload.")
            return None

        try:
            file_metadata = {'name': 'Infographic Asset', 'mimeType': 'image/png'}
            media = MediaFileUpload(local_path, mimetype='image/png')
            file = self.drive_service.files().create(body=file_metadata, media_body=media, fields='id').execute()
            file_id = file.get('id')
            
            if file_id:
                # Make public for Slides to read it
                self.drive_service.permissions().create(
                    fileId=file_id, 
                    body={'type': 'anyone', 'role': 'reader'}
                ).execute()
                return file_id
        except Exception as e:
            logger.error(f"Drive Upload Error: {e}")
            return None
        return None

    def create_presentation(self, title: str, slides_data: list) -> str:
        try:
            # 1. Create Presentation
            presentation = self.slides_service.presentations().create(body={'title': title}).execute()
            presentation_id = presentation.get('presentationId')
            
            # 2. Upload Images in Parallel
            image_map = {} # index -> file_id
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
                        logger.error(f"Image upload failed for slide {idx}: {exc}")

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

                # Title
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

                # Body Text
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

                # Image (if uploaded)
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

            # Execute Batch
            if requests:
                self.slides_service.presentations().batchUpdate(presentationId=presentation_id, body={'requests': requests}).execute()

            return f"https://docs.google.com/presentation/d/{presentation_id}/edit"

        except Exception as e:
            logger.error(f"Slides Export Error: {e}")
            raise # Re-raise to preserve stack trace
