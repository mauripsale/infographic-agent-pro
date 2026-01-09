import os
import zipfile
import uuid
from fpdf import FPDF
from pathlib import Path
import logging

logger = logging.getLogger(__name__)
STATIC_DIR = Path("static")

class ExportTool:
    def __init__(self):
        self.static_dir = STATIC_DIR

    def create_zip(self, file_paths: list[str]) -> str:
        """Creates a ZIP file from a list of local file paths or URLs."""
        try:
            if not file_paths:
                return ""
                
            zip_filename = f"presentation_export_{uuid.uuid4().hex}.zip"
            zip_path = self.static_dir / zip_filename
            
            files_added = 0
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                for file_path in file_paths:
                    # Robust filename extraction: works for /static/img.png or https://.../img.png
                    filename = os.path.basename(file_path.split("?")[0]) # Remove query params if any
                    local_path = self.static_dir / filename
                    
                    if local_path.exists():
                        logger.info(f"Adding to ZIP: {local_path}")
                        zipf.write(local_path, arcname=filename)
                        files_added += 1
                    else:
                        logger.warning(f"File missing for ZIP: {local_path} (from {file_path})")
            
            if files_added == 0:
                logger.error("No files were added to the ZIP archive.")
                return ""
                
            return f"/static/{zip_filename}"
        except Exception as e:
            logger.error(f"ZIP Creation Error: {e}")
            return ""

    def create_pdf(self, file_paths: list[str], title: str = "Presentation") -> str:
        """Creates a PDF file from a list of images."""
        try:
            if not file_paths:
                return ""

            pdf = FPDF()
            pdf.set_auto_page_break(0)
            
            files_added = 0
            for file_path in file_paths:
                filename = os.path.basename(file_path.split("?")[0])
                local_path = self.static_dir / filename
                
                if local_path.exists():
                    pdf.add_page()
                    # A4 size roughly, fitting image to width (keep aspect ratio logic simple for now)
                    pdf.image(str(local_path), x=10, y=10, w=190)
                    files_added += 1
                else:
                    logger.warning(f"File missing for PDF: {local_path}")

            if files_added == 0:
                return ""

            pdf_filename = f"presentation_export_{uuid.uuid4().hex}.pdf"
            pdf_path = self.static_dir / pdf_filename
            pdf.output(str(pdf_path))
            
            return f"/static/{pdf_filename}"
        except Exception as e:
            logger.error(f"PDF Creation Error: {e}")
            return ""
