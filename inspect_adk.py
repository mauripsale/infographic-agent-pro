
import inspect
import json
try:
    import google_adk
    import google_adk.runners
    import google_adk.agents
    print("ROOT: google_adk found")
    print("RUNNERS:", dir(google_adk.runners))
    print("AGENTS:", dir(google_adk.agents))
except ImportError as e:
    print(f"ImportError: {e}")
