# Gemini API: Image Generation (Nano Banana) Guide

This guide details how to use Gemini's native image generation capabilities, referred to as **Nano Banana**, using the `google-genai` Python SDK.

## 1. Supported Models (Nano Banana Lineup)

*   **Nano Banana (`gemini-2.5-flash-image`)**: Optimized for speed and high-volume tasks.
*   **Nano Banana Pro (`gemini-3-pro-image-preview`)**: Professional-grade asset production, advanced reasoning, and high-fidelity text rendering.

## 2. Core Generation Logic

Unlike legacy "Imagen" models that used `client.models.generate_images`, Nano Banana uses the standard `generate_content` (or `chats`) method with specific response modalities.

### Basic Generation Example

```python
from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

prompt = "A professional infographic illustration about solar energy. Style: clean vector, minimalist."

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[prompt],
    config=types.GenerateContentConfig(
        response_modalities=['IMAGE']
    )
)

# Extract and save the image
for part in response.parts:
    if part.inline_data:
        image = part.as_image()
        image.save("solar_infographic.png")
```

## 3. Advanced Configuration (ImageConfig)

You can control the output format using `ImageConfig` within the generation request.

| Parameter | Values |
| :--- | :--- |
| `aspect_ratio` | `"1:1"`, `"2:3"`, `"3:2"`, `"3:4"`, `"4:3"`, `"4:5"`, `"5:4"`, `"9:16"`, `"16:9"`, `"21:9"` |
| `image_size` | `"1K"`, `"2K"`, `"4K"` (Note: Use uppercase 'K') |

### Example with Aspect Ratio and Resolution

```python
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[prompt],
    config=types.GenerateContentConfig(
        response_modalities=['IMAGE'],
        image_config=types.ImageConfig(
            aspect_ratio="16:9",
            image_size="2K"
        )
    )
)
```

## 4. Grounding with Google Search

Nano Banana Pro can use Google Search to verify facts before generating an image (e.g., for accurate charts or maps).

```python
config = types.GenerateContentConfig(
    response_modalities=['IMAGE'],
    tools=[{"google_search": {}}]
)
```

## 5. Conversational Editing (Multi-Turn)

You can refine an image by sending follow-up messages in a chat session.

```python
chat = client.chats.create(
    model="gemini-3-pro-image-preview",
    config=types.GenerateContentConfig(response_modalities=['TEXT', 'IMAGE'])
)

# Step 1: Initial generation
response1 = chat.send_message("Create a logo for a futuristic farm.")

# Step 2: Iterative edit
response2 = chat.send_message("Make the sky more orange and add a drone.")
```

## 6. Key Strategy: "Describe, Don't List"

For the best results with Nano Banana, use narrative, descriptive paragraphs instead of a list of keywords. Specify camera angles, lighting, and fine details for photorealistic results, or explicit artistic styles for illustrations.
