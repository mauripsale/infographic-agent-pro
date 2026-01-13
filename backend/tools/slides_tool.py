import logging
import os
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials

logger = logging.getLogger(__name__)

class GoogleSlidesTool:
    def __init__(self, access_token: str):
        self.creds = Credentials(token=access_token)
        self.slides_service = build('slides', 'v1', credentials=self.creds)
        self.drive_service = build('drive', 'v3', credentials=self.creds)

    def _upload_image_to_drive(self, local_path: str) -> str:
        """Uploads image to Drive and returns the file ID."""
        if not os.path.exists(local_path):
            # If path is a URL (from cloud run), we might need to download it first or handle differently.
            # Assuming local path relative to backend for now.
            if local_path.startswith("http"):
                # TODO: Handle remote URL if needed, but 'image_gen' saves locally to 'static/'
                # We need to resolve the absolute path from the static URL
                filename = local_path.split("/")[-1]
                local_path = f"static/{filename}"
            
        if not os.path.exists(local_path):
            logger.warning(f"Image not found at {local_path}, skipping upload.")
            return None

        file_metadata = {'name': 'Infographic Asset', 'mimeType': 'image/png'}
        media = MediaFileUpload(local_path, mimetype='image/png')
        file = self.drive_service.files().create(body=file_metadata, media_body=media, fields='id').execute()
        return file.get('id')

    def create_presentation(self, title: str, slides_data: list) -> str:
        try:
            # 1. Create Presentation
            presentation = self.slides_service.presentations().create(body={'title': title}).execute()
            presentation_id = presentation.get('presentationId')
            
            # 2. Build Requests
            requests = []
            
            for i, slide in enumerate(slides_data):
                page_id = f"slide_{i}_page"
                
                # Add Blank Slide
                requests.append({
                    'createSlide': {
                        'objectId': page_id,
                        'slideLayoutReference': {'predefinedLayout': 'BLANK'}
                    }
                })

                # Add Title (Top Text Box)
                title_id = f"title_{i}"
                requests.append({
                    'createShape': {
                        'objectId': title_id,
                        'shapeType': 'TEXT_BOX',
                        'elementProperties': {
                            'pageObjectId': page_id,
                            'size': {'width': {'magnitude': 700, 'unit': 'PT'}, 'height': {'magnitude': 60, 'unit': 'PT'}},
                            'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': 20, 'translateY': 20, 'unit': 'PT'}
                        }
                    }
                })
                requests.append({'insertText': {'objectId': title_id, 'text': slide.get('title', '')}})

                # Add Body Text (Left Side)
                body_id = f"body_{i}"
                requests.append({
                    'createShape': {
                        'objectId': body_id,
                        'shapeType': 'TEXT_BOX',
                        'elementProperties': {
                            'pageObjectId': page_id,
                            'size': {'width': {'magnitude': 300, 'unit': 'PT'}, 'height': {'magnitude': 300, 'unit': 'PT'}},
                            'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': 20, 'translateY': 100, 'unit': 'PT'}
                        }
                    }
                })
                requests.append({'insertText': {'objectId': body_id, 'text': slide.get('description', '')}})

                # Upload and Add Image (Right Side)
                img_url = slide.get('image_url')
                if img_url:
                    drive_img_id = self._upload_image_to_drive(img_url)
                    if drive_img_id:
                        img_obj_id = f"img_{i}"
                        requests.append({
                            'createImage': {
                                'objectId': img_obj_id,
                                'url': f'https://drive.google.com/uc?id={drive_img_id}', # Direct link trick
                                'elementProperties': {
                                    'pageObjectId': page_id,
                                    'size': {'width': {'magnitude': 350, 'unit': 'PT'}, 'height': {'magnitude': 300, 'unit': 'PT'}},
                                    'transform': {'scaleX': 1, 'scaleY': 1, 'translateX': 350, 'translateY': 100, 'unit': 'PT'}
                                }
                            }
                        })

            # Execute Batch
            if requests:
                self.slides_service.presentations().batchUpdate(presentationId=presentation_id, body={'requests': requests}).execute()

            return f"https://docs.google.com/presentation/d/{presentation_id}/edit"

        except Exception as e:
            logger.error(f"Slides Export Error: {e}")
            raise e