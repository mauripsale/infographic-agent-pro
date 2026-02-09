import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv(".gemini/.env") # Try to load from .gemini/.env if exists
api_key = os.environ.get("GOOGLE_API_KEY")

if not api_key:
    print("No API Key found")
    exit(1)

genai.configure(api_key=api_key)

print("Listing Models...")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods or 'image' in m.name:
        print(f"Name: {m.name}")
        print(f"Supported Methods: {m.supported_generation_methods}")
        print("-" * 20)
