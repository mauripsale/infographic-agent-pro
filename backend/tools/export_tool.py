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
        """Creates a ZIP file from a list of local file paths or URLs, preserving order in filenames."""
        try:
            if not file_paths:
                return ""
                
            zip_filename = f"presentation_export_{uuid.uuid4().hex}.zip"
            zip_path = self.static_dir / zip_filename
            
            files_added = 0
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                for idx, file_path in enumerate(file_paths):
                    # Robust filename extraction: works for /static/img.png or https://.../img.png
                    original_filename = os.path.basename(file_path.split("?")[0]) # Remove query params if any
                    local_path = self.static_dir / original_filename
                    
                    # Create a sequential filename for the ZIP: slide_01_originalhash.png
                    # We keep the hash part to avoid collisions if somehow generating duplicates, 
                    # but prefix with slide_XX for sorting.
                    ext = os.path.splitext(original_filename)[1]
                    clean_name = os.path.splitext(original_filename)[0]
                    # arcname is the name INSIDE the zip
                    arcname = f"slide_{idx+1:02d}_{clean_name[-8:]}{ext}" 
                    
                    if local_path.exists():
                        logger.info(f"Adding to ZIP: {local_path} as {arcname}")
                        zipf.write(local_path, arcname=arcname)
                        files_added += 1
                    else:
                        logger.warning(f"File missing for ZIP: {local_path} (from {file_path})")
            
            if files_added == 0:
                logger.error("No files were added to the ZIP archive.")
                if zip_path.exists():
                    os.remove(zip_path)
                return ""
                
            return f"/static/{zip_filename}"
        except Exception as e:
            logger.error(f"ZIP Creation Error: {e}")
            return ""

    def create_pdf(self, file_paths: list[str], title: str = "Presentation") -> str:
        """Creates a PDF file from a list of images, adapting orientation to image ratio."""
        try:
            if not file_paths:
                return ""

            # Defer import to avoid circular dependency issues if any
            from PIL import Image

            pdf = FPDF()
            pdf.set_auto_page_break(0)
            
            files_added = 0
            for file_path in file_paths:
                # Clean filename from potential query params or URL junk
                filename = os.path.basename(file_path.split("?")[0])
                local_path = self.static_dir / filename
                
                if local_path.exists():
                    try:
                        # 1. Analyze Image
                        with Image.open(local_path) as img:
                            width_px, height_px = img.size
                            aspect_ratio = width_px / height_px
                        
                        # 2. Determine Orientation
                        # > 1.1 means Landscape (e.g. 16:9 ~ 1.77). Square/near-square (1.0) stays Portrait.
                        orientation = 'L' if aspect_ratio > 1.1 else 'P' 
                        
                        pdf.add_page(orientation=orientation)
                        
                        # 3. Calculate Dimensions & Centering
                        # A4 Dimensions in mm
                        a4_w_portrait = 210
                        a4_h_portrait = 297
                        
                        if orientation == 'L':
                            page_w = a4_h_portrait # 297
                            page_h = a4_w_portrait # 210
                        else:
                            page_w = a4_w_portrait # 210
                            page_h = a4_h_portrait # 297
                            
                        margin = 10
                        printable_w = page_w - (2 * margin)
                        printable_h = page_h - (2 * margin)
                        
                        # Fit Logic: maximize width/height while keeping AR
                        # Calculate target dimensions
                        target_w = printable_w
                        target_h = target_w / aspect_ratio
                        
                        if target_h > printable_h:
                            # Too tall, fit to height
                            target_h = printable_h
                            target_w = target_h * aspect_ratio
                            
                        # Centering
                        x = (page_w - target_w) / 2
                        y = (page_h - target_h) / 2
                        
                        pdf.image(str(local_path), x=x, y=y, w=target_w)
                        files_added += 1
                        
                    except Exception as img_err:
                        logger.error(f"Error processing image {local_path}: {img_err}")
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