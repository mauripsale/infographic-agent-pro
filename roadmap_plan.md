# Roadmap Plan - Fixes & Features (January 14, 2026)

This document outlines the planned fixes and features discussed on Jan 13, following the testing phase of the Infographic Agent.

## 1. Authentication & Timeout Resilience
### Problem Analysis
- **Timeout:** Generating 30 slides in a single request exceeds the typical 5-minute timeout of Cloud Run/Load Balancers.
- **Auth Expiry:** Firebase tokens (1h duration) might expire during long-running background processes, leading to 401/403 errors on subsequent calls (like Slides Export).
- **State Loss:** Current UI state for "Generate Graphics" is volatile; logging out/in loses the context required to resume large batch operations.

### Proposed Fixes
- **Preemptive Auth Refresh:** Modify the frontend to call `user.getIdToken(true)` before long-running operations to ensure a fresh session.
- **Request Batching:** Refactor the frontend generation logic to request slides in smaller chunks (e.g., batches of 5) instead of all at once.
- **Stream Recovery:** Add a "Resume Generation" button in the UI if the connection drops unexpectedly.

## 2. Advanced PDF Export
### Problem Analysis
- **Layout Mismatch:** Current PDF export uses a default Portrait (A4) layout, causing 16:9 landscape slides to occupy only half the page.

### Proposed Features
- **Landscape Mode:** Update `backend/tools/export_tool.py` to detect the aspect ratio and rotate the PDF page to Landscape if the images are 16:9.
- **"Handout" Mode (Slides + Notes):** 
    - Create a new export mode where each page is Vertical.
    - Top half: The Slide image.
    - Bottom half: Formatted text containing the Slide Title and Description (Speaker Notes).

## 3. UI Granularity & Session Persistence
### Problem Analysis
- **Stuck Generations:** A single slide hanging indefinitely blocks the entire batch. The global "Stop" button is too destructive.
- **Session Loss (Refresh):** 
    - **Frontend:** Refreshes generate a new Session ID, disconnecting from previous work.
    - **Backend:** Currently uses `InMemorySessionService`, so server restarts (Cloud Run) wipe conversation history.

### Proposed Features
- **Per-Slide Controls:** Implement a "Stop/Skip" button on each individual slide card.
- **Session Restoration (Step 1 - Frontend):** 
    - Store the current `session_id` and the "Script/Slides" data in `localStorage`. 
    - On page load, check if a previous session exists and offer to "Resume".
- **Backend Persistence (Step 2 - Robustness):** 
    - Replace `InMemorySessionService` with a persistent implementation (e.g., Firestore-backed or Database) to ensure sessions survive server restarts. *For tomorrow, we will focus on the Frontend restoration first as it solves the immediate user pain.*

## 4. Branding & Style Customization
### Problem Analysis
- **Inconsistency:** Users need slides to match specific brand guidelines (colors, fonts, mood) without manually typing detailed prompts every time.
- **Logo Issues:** Generative models often mangle specific text/logos if asked to "draw" them.

### Proposed Features
- **Branding Guide Support:** Allow users to upload a PDF/TXT branding guide. 
  - The Agent will analyze this document to extract colors, tone of voice, and visual metaphors.
- **Brand Kit Settings:** Allow users to save:
    - Primary/Secondary Hex Colors.
    - Style Keywords (e.g., "Minimalist", "Tech", "Hand-drawn").
    - Reference Image (optional) for Gemini to extract style from.
- **Prompt Injection:** Middleware to automatically append these style constraints to every image generation prompt.
- **Optional Logo Watermarking:**
    - User uploads a transparent PNG logo.
    - Backend (`image_gen.py`) uses `Pillow` to overlay the logo in a fixed position (e.g., bottom-right) *after* generation.
    - **Config:** A toggle in the UI to enable/disable logo application per generation.

## 5. Security & Privacy
### Problem Analysis
- **Over-privileged Scope:** The app currently requests full `https://www.googleapis.com/auth/presentations` access, allowing it to read/modify *all* user presentations, which is a security risk and privacy concern.

### Proposed Fixes
- **Scope Reduction:** 
    - Remove `https://www.googleapis.com/auth/presentations`.
    - Rely solely on `https://www.googleapis.com/auth/drive.file` (which grants access only to files created by the app).

## 6. Enterprise Persistence & History (New)
### Problem Analysis
- **Ephemeral Uploads:** Currently, uploaded files are temp-only. Users have to re-upload context every time.
- **Single File Limit:** Users often have multiple source docs (e.g., "Tech Specs" + "Marketing Brief").
- **No History:** Users cannot see past projects or re-download old decks.

### Proposed Features
- **Multi-File Upload:** Update UI and Backend to accept `List<File>`.
- **GCS Persistence:**
    - Save all uploaded files to a secure GCS bucket: `gs://<bucket>/users/<uid>/uploads/<file>`.
    - Save generated assets (images, pptx) to: `gs://<bucket>/users/<uid>/projects/<project_id>/`.
- **User History (Firestore):**
    - Create a `projects` collection in Firestore.
    - Store metadata: `prompt`, `timestamp`, `file_urls` (GCS), `status`, `generated_pptx_url`.
    - **UI Dashboard:** A "My Projects" view to browse history and re-download assets.

## 7. Implementation Steps (Updated)
1. **Step 1:** Modify `backend/tools/export_tool.py` to support Landscape and Handout layouts using a library like `reportlab` or `FPDF`.
2. **Step 2:** Update the Frontend `AuthContext` and API service to handle preemptive token refreshing.
3. **Step 3:** Update the Frontend UI:
    - Implement batching for generation requests.
    - Add per-slide "Stop/Skip" controls.
    - Implement `localStorage` persistence for `session_id` and workspace state.
4. **Step 4 (Done):** Implement Scope Reduction in `AuthContext.tsx`.
5. **Step 5:** Implement Branding Guide Support (Upload + Agent Analysis).
6. **Step 6:** Implement Multi-File Upload & GCS Persistence.
7. **Step 7:** Implement User History Dashboard.