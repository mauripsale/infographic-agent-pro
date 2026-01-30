
try:
    from google.adk.models import Gemini
    import inspect
    print(inspect.signature(Gemini.__init__))
except ImportError:
    print("Gemini model class not found in google.adk.models")
    # Try finding where the model wrapper is
    import google.adk.models
    print(dir(google.adk.models))
