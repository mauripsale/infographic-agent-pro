# ADK Application Development: Best Practices Guide

Based on the analysis of the `match_data_agent` application, this guide outlines architectural patterns and coding standards for building robust, scalable agents with the Google Agent Developer Kit (ADK).

## 1. Project Structure & Organization

A clean hierarchy separates concerns, making the agent easier to maintain and extend.

```text
my_agent_project/
├── agent.py                 # Main entry point (Defines the Agent)
├── tools.py                 # Public tools exposed to the LLM
├── utils.py                 # Internal helper logic (API calls, data processing)
├── config/                  # Configuration module
│   ├── __init__.py
│   ├── settings.py          # Environment variables & constants
│   ├── prompts/             # Markdown files for system & tool prompts
│   │   ├── agent_prompt.md
│   │   └── tool_specific_prompt.md
│   └── ...
└── ...
```

### Key Principles:
*   **Centralized Configuration:** Keep all environment variables, constants, and configuration logic in a dedicated `config/` module. Avoid scattering `os.environ` calls throughout the code.
*   **Prompts as Code:** Store long system instructions and tool-specific prompts in separate Markdown (`.md`) files within `config/prompts/`. This keeps Python code clean and allows prompts to be edited easily (even by non-developers).
*   **Separation of Concerns:**
    *   `agent.py`: Orchestration only. Defines *who* the agent is and *what* tools it has.
    *   `tools.py`: The "Public API" for the LLM. Defines *how* the agent interacts with the world.
    *   `utils.py`: The "Engine Room". Contains the reusable, heavy-lifting logic shared across tools.

## 2. Tool Design & `ToolContext`

Tools are the bridge between the LLM and your business logic.

### The `ToolContext` Pattern
Always include `tool_context: ToolContext` as the first argument in your tool functions. This object is crucial for:
1.  **Session Management:** Persisting state across multiple turns of conversation.
2.  **User Context:** Accessing user-specific data (e.g., ID, preferences).
3.  **Artifact Management:** Returning rich media (charts, files) alongside text.

```python
# tools.py
from google.adk.tools.tool_context import ToolContext

async def my_public_tool(tool_context: ToolContext, user_query: str):
    """
    Docstring explaining the tool to the LLM.
    """
    # Access session state
    session_id = tool_context.session_id
    
    # Delegate to internal logic
    return await _internal_helper(tool_context, user_query)
```

### Public vs. Private Helpers
Use the underscore prefix convention (`_function_name`) to distinguish between:
*   **Public Tools (`function_name`):** Functions exposed to the LLM in `agent.py`. These should have clear docstrings and handle high-level intent.
*   **Private Helpers (`_function_name`):** Internal functions in `utils.py` or `tools.py` that handle repetitive logic (API calls, error handling, formatting). The LLM *never* sees these.

## 3. State Management with Callbacks

Use ADK callbacks to inject dynamic context or manage state *before* the agent processes a request.

### The `before_agent_callback`
This is powerful for injecting real-time data (like the current date) or user-specific session variables into the agent's context.

```python
# agent.py
from google.adk.agents.callback_context import CallbackContext
from datetime import datetime

def inject_runtime_variables(context: CallbackContext):
    # Inject current date into the prompt context
    context.state["temp:date"] = datetime.now().strftime("%Y-%m-%d")
    
    # Access/Modify session state
    user_id = context.session_state.get("user_id")

root_agent = Agent(
    # ...
    before_agent_callback=inject_runtime_variables
)
```

**Usage in Prompts:**
You can then reference these variables directly in your Markdown prompts:
`Today's date is {temp:date?}`.

## 4. Prompt Engineering Architecture

Treat prompts as dynamic templates, not static strings.

*   **System Instructions:** Define the agent's persona, constraints, and operational protocols in `agent_prompt.md`.
*   **Tool-Specific Prompts:** For complex tools (like Text-to-SQL), pass specific instructions *at runtime*.
    *   *Example:* The `_conversational_analysis` helper reads a specific `.md` file for the requested table and combines it with the user's question before sending it to the model. This keeps the main agent context lighter.

## 5. Error Handling & Logging

*   **Robust Logging:** Use Python's `logging` module to trace execution flow. Log entry/exit points of tools and any errors caught.
    *   `logger.info(f"[TOOL_NAME] Called with: {query}")`
*   **Graceful Failures:** Tools should return meaningful error messages to the LLM, not crash the application. If an API call fails, catch the exception and return a string like `"Error: Database unavailable. Please try again."`. The LLM can then relay this politely to the user.

## 6. Dependency Injection (Configuration)

Avoid hardcoding. Pass configuration objects (like `BigQueryTableConfig`) to your helper functions.

```python
# tools.py
async def player_tool(context, query):
    # We pass the specific CONFIG for players
    return await _analyze(context, query, TableConfig.PLAYERS)

async def team_tool(context, query):
    # We reuse the SAME logic, but pass the TEAM config
    return await _analyze(context, query, TableConfig.TEAMS)
```

This pattern allows you to scale your application (e.g., adding a new dataset) simply by adding a new configuration entry and a new public tool wrapper, without rewriting the core logic.
