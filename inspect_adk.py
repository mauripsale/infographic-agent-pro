import json
try:
    import google.adk.events as events
    print("Events module found")
    print(dir(events))
    from google.adk.events import Event
    print("Event class found:", Event)
    print("Event fields:", Event.model_fields.keys())
except ImportError as e:
    print(f"ImportError: {e}")
except Exception as e:
    print(f"Error: {e}")