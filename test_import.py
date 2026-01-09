
import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

print("Attempting to import main...")
try:
    from backend import main
    print("Successfully imported main.")
except Exception as e:
    print(f"Failed to import main: {e}")
    import traceback
    traceback.print_exc()
