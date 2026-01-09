import os
import zipfile
from fpdf import FPDF
from pathlib import Path
import logging

logger = logging.getLogger(__name__)
STATIC_DIR = Path("static")

class ExportTool:
    def __init__(self):
        self.static_dir = STATIC_DIR

    def create_zip(self, file_paths: list[str]) -> str:
        """Creates a ZIP file from a list of local file paths."""
        try:
            zip_filename = f"presentation_export.zip"
            zip_path = self.static_dir / zip_filename
            
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                for file_path in file_paths:
                    # Expecting file_path to be relative static url like "/static/infographic_..."
                    # Convert to local path
                    local_name = file_path.split("/")[-1]
                    local_path = self.static_dir / local_name
                    if local_path.exists():
                        zipf.write(local_path, arcname=local_name)
                    else:
                        logger.warning(f"File not found for zip: {local_path}")
            
            return f"/static/{zip_filename}"
        except Exception as e:
            logger.error(f"ZIP Creation Error: {e}")
            return ""

    def create_pdf(self, file_paths: list[str], title: str = "Presentation") -> str:
        """Creates a PDF file from a list of images."""
        try:
            pdf = FPDF()
            pdf.set_auto_page_break(0)
            
            for file_path in file_paths:
                local_name = file_path.split("/")[-1]
                local_path = self.static_dir / local_name
                
                if local_path.exists():
                    pdf.add_page()
                    # A4 size roughly, fitting image to width
                    pdf.image(str(local_path), x=10, y=10, w=190)
                else:
                    logger.warning(f"File not found for pdf: {local_path}")

            pdf_filename = f"presentation_export.pdf"
            pdf_path = self.static_dir / pdf_filename
            pdf.output(str(pdf_path))
            
            return f"/static/{pdf_filename}"
        except Exception as e:
            logger.error(f"PDF Creation Error: {e}")
            return ""
