
import inspect
from google.adk.planners import BuiltInPlanner

print("BuiltInPlanner signature:")
print(inspect.signature(BuiltInPlanner.__init__))
print("\nDocstring:")
print(BuiltInPlanner.__doc__)
