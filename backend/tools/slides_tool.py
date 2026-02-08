import google.oauth2.credentials
import google.auth
from googleapiclient.discovery import build
import logging

class GoogleSlidesTool:
    def __init__(self, access_token: str = None):
        """
        Initializes the Google Slides tool.
        If access_token is provided, it uses that (User Auth).
        If not, it falls back to Application Default Credentials (Service Account).
        """
        if access_token:
            self.creds = google.oauth2.credentials.Credentials(token=access_token)
            logging.info("GoogleSlidesTool initialized with User Access Token")
        else:
            self.creds, _ = google.auth.default()
            logging.info("GoogleSlidesTool initialized with ADC (Service Account)")

        self.service = build('slides', 'v1', credentials=self.creds)

    def create_presentation(self, slides_data: list, title: str = "Infographic Presentation"):
        try:
            # 1. Create a blank presentation
            presentation = self.service.presentations().create(body={'title': title}).execute()
            presentation_id = presentation.get('presentationId')
            logging.info(f"Created presentation {presentation_id}")

            # 2. Add slides
            requests = []
            for i, slide in enumerate(slides_data):
                slide_id = f"slide_{i}"
                requests.append({
                    'createSlide': {
                        'objectId': slide_id,
                        'slideLayoutReference': {'predefinedLayout': 'TITLE_AND_BODY'}
                    }
                })
                
                # Title
                requests.append({
                    'insertText': {
                        'objectId': slide_id,
                        'insertionIndex': 0,
                        'text': slide.get('title', 'Slide')
                    }
                })
                
                # Note: To insert text into specific placeholders, we need to know their IDs.
                # For simplicity in MVP, we just create the slide.
                # A more robust impl would query the layout placeholders.

            if requests:
                self.service.presentations().batchUpdate(
                    presentationId=presentation_id, 
                    body={'requests': requests}
                ).execute()

            return presentation_id

        except Exception as e:
            logging.error(f"Failed to create slides: {e}")
            raise e