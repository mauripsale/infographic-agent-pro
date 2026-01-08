from contextvars import ContextVar

# Default to the standard model if not specified
model_context: ContextVar[str] = ContextVar("model_context", default="gemini-2.5-flash")
