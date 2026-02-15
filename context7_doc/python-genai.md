# Google GenAI Python SDK Documentation

The Google GenAI Python SDK (`google-genai`) is the official library for accessing Google's Gemini models.

## Automatic Function Calling with MCP

Configure automatic function calling using the Model Context Protocol (MCP). This example sets up a local MCP server (e.g., weather) and lets Gemini call its tools automatically.

```python
import os
import asyncio
from datetime import datetime
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from google import genai

client = genai.Client()

# Create server parameters for stdio connection
server_params = StdioServerParameters(
    command="npx",  # Executable
    args=["-y", "@philschmid/weather-mcp"],  # MCP Server
    env=None,  # Optional environment variables
)

async def run():
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            prompt = f"What is the weather in London in {datetime.now().strftime('%Y-%m-%d')}?"

            await session.initialize()

            # Send request with MCP session as a tool
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=0,
                    tools=[session],  # Automatic function calling via MCP
                ),
            )
            print(response.text)

asyncio.run(run())
```

## Token Counting

Count tokens for a request, including system instructions and tools, to estimate costs.

```python
def my_function(x: int) -> int:
    """A sample function."""
    return x * 2

response = client.models.count_tokens(
    model='gemini-2.5-flash',
    contents='Call the function with 5',
    config=types.GenerateContentConfig(
        system_instruction='You are a calculator',
        tools=[my_function]
    )
)
print(f'Total tokens: {response.total_tokens}')
```

## System Instructions

Guide the model's behavior using system instructions within the configuration.

```python
from google.genai import types

response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents='high',
    config=types.GenerateContentConfig(
        system_instruction='I say high, you say low',
        max_output_tokens=3,
        temperature=0.3,
    ),
)
print(response.text)
```
