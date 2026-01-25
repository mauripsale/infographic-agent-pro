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

## 🎨 Phase 3: Advanced Styling & Polish (In Progress)

### 3.1 Advanced Styling (Deployed)
- [x] **Brand Awareness**: Agent prompt updated to analyze "Brand Guide" files.
- [x] **Visual Injection**: Automatically extracts hex colors and style keywords to enforce visual consistency in image prompts.

### 3.2 UX & Interface Polish (In Progress - Branch feat/multi-upload-ux)
- [x] **Header Redesign**: Explicitly expand "IPSA" acronym and reposition the "Visual Data Architect" tagline.
- [x] **Multi-Upload UX**: 
    -   **Quantity**: Support multiple source files (N documents) and multiple brand assets.
    -   **Quality**: Implement a clear "Staged Files" list with badges and remove buttons to give users full visibility before generation.

### 3.4 Persistence Purist: DB Sessions (In Progress - Branch feat/firestore-sessions)
- [x] **Goal**: Replace `InMemorySessionService` with a persistent database.
- [x] **Implementation**: Created `FirestoreSessionService` implementing ADK `BaseSessionService` interface.
- [ ] **Optimization**: Migrate from synchronous `firestore.Client` (wrapped in `to_thread`) to native `firestore.AsyncClient` for better performance and resource management.

### 3.5 DevOps Optimization (Completed)
- [x] **Goal**: Reduce Cloud Run deployment time (currently ~5m).
- [x] **Implementation**: Implement `cloudbuild.yaml` with Kaniko cache or `--cache-from` to reuse Docker layers for dependencies.

### 3.5 Advanced Export Formats (Pending)
- [ ] **Goal**: Better PDF layouts and Landscape support.
- [ ] **Implementation**: Refactor `ExportTool` to support `F_LANDSCAPE` and "Handout" modes (3 slides per page with notes).

### 3.6 Resilience & Speed (Backlog)
- [ ] **Goal**: Handle large projects without timeout.
- [ ] **Implementation**: 
    *   Implement `asyncio.gather` for parallel image generation (with rate limiting).
    *   Add retry logic with exponential backoff for GCS/Gemini API calls.

---

## 🔮 Phase 4: Moonshots (Future Vision)

### 4.1 Multi-Agent Team (Orchestration)
*   **Goal**: Higher quality content by specializing roles.
*   **Implementation**:
    *   **Researcher Agent**: Reads the doc and extracts key facts (RAG).
    *   **Copywriter Agent**: Writes the script text (Title/Body).
    *   **Art Director Agent**: Writes the visual prompts.
    *   *Coordinator*: Manages the workflow using ADK's `SequentialAgent` or `ParallelAgent` patterns.

### 4.2 Voice Interaction (Bidi-Streaming)
*   **Goal**: "Talk to your designer".
*   **Implementation**:
    *   Use Gemini's Native Audio capabilities.
    *   Implement WebSocket bidirectional streaming for real-time voice feedback.