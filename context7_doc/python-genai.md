### Apply System Instructions to Gemini Models with google-genai

Source: https://github.com/googleapis/python-genai/blob/main/codegen_instructions.md

This Python example illustrates how to guide a model's behavior using system instructions. A `system_instruction` is set within `types.GenerateContentConfig` and passed to the `generate_content` method, enabling developers to define the model's persona or specific guidelines for its responses.

```python
from google import genai
from google.genai import types

client = genai.Client()

config = types.GenerateContentConfig(
    system_instruction='You are a pirate',
)

response = client.models.generate_content(
    model='gemini-2.5-flash',
    config=config,
)

print(response.text)
```

--------------------------------

### Install Google GenAI SDK - Python

Source: https://github.com/googleapis/python-genai/blob/main/codegen_instructions.md

Installation command for the official Google GenAI SDK. This is the correct and current package for Gemini API interactions as of 2025. The legacy google-generativeai package is deprecated and should not be used.

```bash
pip install google-genai
```

--------------------------------

### Install Google Gen AI Python SDK

Source: https://github.com/googleapis/python-genai/blob/main/README.md

Instructions for installing the Google Gen AI Python SDK using either `pip` or `uv`, which are Python package managers.

```sh
pip install google-genai
```

```sh
uv pip install google-genai
```

--------------------------------

### Initialize Google Gen AI Client Using Environment Variables

Source: https://github.com/googleapis/python-genai/blob/main/README.md

Creates a client instance that automatically uses configuration details provided through environment variables, simplifying client setup.

```python
from google import genai

client = genai.Client()
```

--------------------------------

### Asynchronously List Tuned Models (Python)

Source: https://github.com/googleapis/python-genai/blob/main/README.md

These Python examples demonstrate how to asynchronously list tuned models. They cover both using an `async for` loop for direct iteration and interacting with an `async_pager` object for asynchronous pagination control.

```python
async for job in await client.aio.models.list(config={'page_size': 10, 'query_base': False}):
    print(job)
```

```python
async_pager = await client.aio.models.list(config={'page_size': 10, 'query_base': False})
print(async_pager.page_size)
print(async_pager[0])
await async_pager.next_page()
print(async_pager[0])
```

--------------------------------

### Paginate Asynchronous Listing of Gemini Base Models (Python)

Source: https://github.com/googleapis/python-genai/blob/main/README.md

This Python example demonstrates how to asynchronously retrieve a paginated list of base models. It sets a page size, awaits the first item, and then fetches the next page of results asynchronously, printing items from both pages.

```python
async_pager = await client.aio.models.list(config={'page_size': 10})
print(async_pager.page_size)
print(async_pager[0])
await async_pager.next_page()
print(async_pager[0])
```

--------------------------------

### GET /caches

Source: https://github.com/googleapis/python-genai/blob/main/docs/modules.html

Lists all cache entries or resources.

```APIDOC
## GET /caches

### Description
Lists all cache entries or resources.

### Method
GET

### Endpoint
/caches

### Parameters
#### Query Parameters
- **pageSize** (integer) - Optional - The maximum number of caches to return.
- **pageToken** (string) - Optional - A page token received from a previous ListCaches call.

### Request Example
```json
{}
```

### Response
#### Success Response (200)
- **caches** (array of objects) - A list of cache summaries.
- **nextPageToken** (string) - A token to retrieve the next page of results.

#### Response Example
```json
{
  "caches": [
    {
      "cacheId": "cache-abc-123",
      "name": "my-data-cache"
    },
    {
      "cacheId": "cache-def-456",
      "name": "another-cache"
    }
  ],
  "nextPageToken": ""
}
```
```

--------------------------------

### Set Up MCP Server with Stdio Connection in Python

Source: https://github.com/googleapis/python-genai/blob/main/docs/index.html

Demonstrates how to establish a connection to a local MCP server using stdio parameters and integrate it with Google GenAI for automatic function calling. The example uses an async context manager to initialize the MCP session and send a prompt to the Gemini model with weather data from the MCP server.

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
            # Prompt to get the weather for the current day in London.
            prompt = f"What is the weather in London in {datetime.now().strftime('%Y-%m-%d')}?"

            # Initialize the connection between client and server
            await session.initialize()

            # Send request to the model with MCP function declarations
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=0,
                    tools=[session],  # uses the session, will automatically call the tool using automatic function calling
                ),
            )
            print(response.text)

# Start the asyncio event loop and run the main function
asyncio.run(run())
```

--------------------------------

### List Tuned Models (Python)

Source: https://github.com/googleapis/python-genai/blob/main/README.md

These Python examples illustrate how to list available tuned models. They demonstrate both iterating directly through the results and using a pager object for more granular control over pagination, filtering out base models.

```python
for model in client.models.list(config={'page_size': 10, 'query_base': False}):
    print(model)
```

```python
pager = client.models.list(config={'page_size': 10, 'query_base': False})
print(pager.page_size)
print(pager[0])
pager.next_page()
print(pager[0])
```

--------------------------------

### GET /batches

Source: https://github.com/googleapis/python-genai/blob/main/docs/modules.html

Lists all batch processing jobs associated with the current user or project.

```APIDOC
## GET /batches

### Description
Lists all batch processing jobs associated with the current user or project.

### Method
GET

### Endpoint
/batches

### Parameters
#### Query Parameters
- **pageSize** (integer) - Optional - The maximum number of batch jobs to return.
- **pageToken** (string) - Optional - A page token received from a previous ListBatches call.

### Request Example
```json
{}
```

### Response
#### Success Response (200)
- **batches** (array of objects) - A list of batch job summaries.
- **nextPageToken** (string) - A token to retrieve the next page of results.

#### Response Example
```json
{
  "batches": [
    {
      "batchId": "batch-12345",
      "status": "COMPLETED"
    },
    {
      "batchId": "batch-67890",
      "status": "RUNNING"
    }
  ],
  "nextPageToken": ""
}
```
```

--------------------------------

### Set Up MCP Server with Stdio Connection in Python

Source: https://github.com/googleapis/python-genai/blob/main/docs/index.html

Demonstrates how to establish a connection to a local MCP server using stdio parameters and integrate it with Google GenAI for automatic function calling. The example uses an async context manager to initialize the MCP session and send a prompt to the Gemini model with weather data from the MCP server.

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
            # Prompt to get the weather for the current day in London.
            prompt = f"What is the weather in London in {datetime.now().strftime('%Y-%m-%d')}?"

            # Initialize the connection between client and server
            await session.initialize()

            # Send request to the model with MCP function declarations
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=0,
                    tools=[session],  # uses the session, will automatically call the tool using automatic function calling
                ),
            )
            print(response.text)

# Start the asyncio event loop and run the main function
asyncio.run(run())
```

--------------------------------

### List Tuned Models (Python)

Source: https://github.com/googleapis/python-genai/blob/main/README.md

These Python examples illustrate how to list available tuned models. They demonstrate both iterating directly through the results and using a pager object for more granular control over pagination, filtering out base models.

```python
for model in client.models.list(config={'page_size': 10, 'query_base': False}):
    print(model)
```

```python
pager = client.models.list(config={'page_size': 10, 'query_base': False})
print(pager.page_size)
print(pager[0])
pager.next_page()
print(pager[0])
```

--------------------------------

### GET /batches

Source: https://github.com/googleapis/python-genai/blob/main/docs/modules.html

Lists all batch processing jobs associated with the current user or project.

```APIDOC
## GET /batches

### Description
Lists all batch processing jobs associated with the current user or project.

### Method
GET

### Endpoint
/batches

### Parameters
#### Query Parameters
- **pageSize** (integer) - Optional - The maximum number of batch jobs to return.
- **pageToken** (string) - Optional - A page token received from a previous ListBatches call.

### Request Example
```json
{}
```

### Response
#### Success Response (200)
- **batches** (array of objects) - A list of batch job summaries.
- **nextPageToken** (string) - A token to retrieve the next page of results.

#### Response Example
```json
{
  "batches": [
    {
      "batchId": "batch-12345",
      "status": "COMPLETED"
    },
    {
      "batchId": "batch-67890",
      "status": "RUNNING"
    }
  ],
  "nextPageToken": ""
}
```
```