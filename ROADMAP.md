# Infographic Agent Pro - Development Roadmap

This document tracks the planned features, architectural improvements, and future vision for Infographic Agent Pro.

## 🚀 Phase 1: Core & Stability (Completed)
- [x] **ADK Native Architecture**: Implementation of `LlmAgent`, `Runner`, and A2UI streaming protocol.
- [x] **Pro Infographics**: "Visual Data Architect" persona for high-quality, structured layout prompts (Level 1-5).
- [x] **Granular Control**: Stop generation, Retry single slide, Fullscreen Lightbox navigation.
- [x] **Multimodal Input**: Document upload (PDF/TXT) via Gemini File API (Ephemeral).
- [x] **Robust Backend**: Async/Thread-safe handling, FPDF export fixes, Zip ordering.

---

## 🏛️ Phase 2: Persistence & Enterprise Ready (Completed)

### 2.1 Persistence & History
- [x] **ADK Artifacts**: Refactored storage layer to wrap `GcsArtifactService` for native ADK compliance (Ralph Loop).
- [x] **Project History**: Firestore-backed session history with Sidebar UI to reload past projects.
- [x] **User Persistence**: Secure API Key storage encrypted in Firestore.
- [x] **Reset Session**: "New Project" workflow with double confirmation.

### 2.2 Google Slides Export (Production)
- [x] **Incremental Auth**: Implemented secure, on-demand OAuth scope request (`drive.file`).
- [x] **Native Export**: `GoogleSlidesTool` integration for creating editable presentations.
- [x] **Token Security**: Fixed state propagation issues to ensure fresh tokens are used for exports.
- [x] **Download UX**: Implemented hidden anchor method for PDF/ZIP to bypass popup blockers and prevent page reloads.

---

## 🎨 Phase 3: Advanced Styling & Polish (Completed)

### 3.1 Advanced Styling & Branding
- [x] **Brand Awareness**: Agent prompt updated to analyze "Brand Guide" files.
- [x] **Visual Injection**: Automatically extracts hex colors and style keywords to enforce visual consistency in image prompts.
- [x] **Logo Watermarking**: Backend automatically detects uploaded logo images and overlays them on generated slides using Pillow.

### 3.2 UX & Interface Polish
- [x] **Header Redesign**: Explicitly expand "IPSA" acronym and reposition the "Visual Data Architect" tagline.
- [x] **Multi-Upload UX**: Support for multiple source files and clear "Staged Files" list.
- [x] **Smart Skip**: Implemented "Skip Generation" button visible and clickable *during* the generation process.

### 3.3 Advanced Export Formats
- [x] **Smart PDF**: Auto-detection of image aspect ratio. Switches PDF page to Landscape if images are wide (16:9).
- [x] **Handout Mode**: New export format (`pdf_handout`) creating vertical A4 pages with Slide Image (top) + Title & Description (bottom).

### 3.4 Resilience & Optimization
- [x] **Request Batching**: Frontend refactored to request slides in chunks (batch size: 3) to prevent Cloud Run timeouts on large presentations.
- [x] **DevOps**: Optimized `cloudbuild.yaml` with caching to reduce deployment times.
- [x] **Sessions**: Migrated to `FirestoreSessionService` for persistent state management across reloads.

---

## 🔮 Phase 4: Moonshots (Future Vision)

### 4.1 Advanced Brand Control
- [ ] **Brand Kit UI**: Dedicated sidebar section to manually input Hex Colors and Fonts, overriding the AI's auto-detection.
- [ ] **Logo Preview**: Visual indicator in the upload area showing the currently active logo for watermarking.

### 4.2 Multi-Agent Team (Orchestration)
*   **Goal**: Higher quality content by specializing roles.
*   **Implementation**:
    *   **Researcher Agent**: Reads the doc and extracts key facts (RAG).
    *   **Copywriter Agent**: Writes the script text (Title/Body).
    *   **Art Director Agent**: Writes the visual prompts.
    *   *Coordinator*: Manages the workflow using ADK's `SequentialAgent` or `ParallelAgent` patterns.

### 4.3 Voice Interaction (Bidi-Streaming)
*   **Goal**: "Talk to your designer".
*   **Implementation**:
    *   Use Gemini's Native Audio capabilities.
    *   Implement WebSocket bidirectional streaming for real-time voice feedback.
