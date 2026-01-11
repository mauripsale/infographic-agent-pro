# Infographic Agent Pro - Development Roadmap

This document tracks the planned features, architectural improvements, and future vision for Infographic Agent Pro.

## 🚀 Phase 1: Core & Stability (Completed)
- [x] **ADK Native Architecture**: Implementation of `LlmAgent`, `Runner`, and A2UI streaming protocol.
- [x] **Pro Infographics**: "Visual Data Architect" persona for high-quality, structured layout prompts (Level 1-5).
- [x] **Granular Control**: Stop generation, Retry single slide, Fullscreen Lightbox navigation.
- [x] **Multimodal Input**: Document upload (PDF/TXT) via Gemini File API (Ephemeral).
- [x] **Robust Backend**: Async/Thread-safe handling, FPDF export fixes, Zip ordering.

---

## 🚧 Phase 2: Performance & Persistence (Next Steps)

### 2.1 Parallel Generation (Performance)
*   **Goal**: Reduce total generation time for 5+ slides.
*   **Implementation**: Re-enable the UI toggle. Refactor backend to use `asyncio.gather` for the `ImageGenerationTool` calls, generating all images concurrently while maintaining ordered A2UI updates.

### 2.2 Artifact Management (Persistence)
*   **Goal**: Allow users to download the original uploaded document and manage generated assets over time.
*   **Implementation**: 
    *   Integrate **ADK ArtifactService** (File-based or Cloud Storage).
    *   Store uploaded docs as Session Artifacts.
    *   Expose download endpoints for these artifacts.

### 2.3 Session History (Memory)
*   **Goal**: Allow users to resume previous sessions or "undo" actions.
*   **Implementation**:
    *   Replace `InMemorySessionService` with `SqliteSessionService` or `Firestore`.
    *   Add a "History" sidebar in the UI to load past infographic projects.

---

## 🔌 Phase 3: Integrations & Formats

### 3.1 Google Slides Export (Real Implementation)
*   **Goal**: True native export, not just a PDF.
*   **Implementation**:
    *   Use `google-api-python-client` with Slides API.
    *   Create a specialized tool `GoogleSlidesExportTool`.
    *   Map the JSON script (Title, Body, Image) to actual Slide Layouts (Title + Body + Image placeholder).

### 3.2 Advanced Styling & Theming
*   **Goal**: User-defined branding.
*   **Implementation**:
    *   Allow users to upload a "Brand Kit" (Logo, Color Palette hex codes).
    *   Inject these constraints into the Agent's system prompt and Image Generation prompt.

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
    *   Implement WebSocket bidirectional streaming for real-time voice feedback ("Make the second slide more blue").
