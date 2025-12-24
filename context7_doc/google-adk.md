### Uvicorn Server Startup Output

Source: https://google.github.io/adk-docs/a2a/quickstart-exposing

Example console output displayed when the uvicorn server successfully starts. Shows the process ID, startup status, and the URL where the server is accessible.

```text
INFO:     Started server process [10615]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://localhost:8001 (Press CTRL+C to quit)
```

--------------------------------

### Install ADK - Go get

Source: https://google.github.io/adk-docs/index

Install the Google Agent Development Kit (ADK) for Go using the go get command. This retrieves the ADK module from the official Google repository.

```bash
go get google.golang.org/adk
```

--------------------------------

### Install and Run Development Server

Source: https://google.github.io/adk-docs/tools/third-party/ag-ui

These commands install project dependencies and start the development server, allowing you to test your AG-UI application locally.

```bash
npm install && npm run dev

```

--------------------------------

### Start ADK Web Interface Server

Source: https://google.github.io/adk-docs/get-started/python

Launches the ADK web user interface server on a specified port, providing a chat-based interface for testing agents. Must be run from the parent directory containing agent projects and is intended for development and debugging only.

```bash
adk web --port 8000
```

--------------------------------

### Example ADK TypeScript package.json Configuration

Source: https://google.github.io/adk-docs/get-started/typescript

This 'package.json' example shows the expected configuration after installing ADK dependencies. It defines project metadata, sets 'agent.ts' as the main entry, and lists 'typescript', '@google/adk', and '@google/adk-devtools' as dependencies.

```json
{
  "name": "my-agent",
  "version": "1.0.0",
  "description": "My ADK Agent",
  "main": "agent.ts",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "@google/adk": "^0.2.0",
    "@google/adk-devtools": "^0.2.0"
  }
}
```

--------------------------------

### Install ADK Package and Configure Gemini API Key in Python

Source: https://google.github.io/adk-docs/callbacks/types-of-callbacks

This snippet provides the necessary setup instructions for running ADK (Agent Development Kit) examples in a Python environment. It covers installing the `google-adk` package using pip and setting up the `GOOGLE_API_KEY` environment variable, which is crucial for authenticating with Google AI services like Gemini.

Dependencies: Python 3 environment.
Inputs: Your Google AI Studio API key.
Outputs: `google-adk` package installed, `GOOGLE_API_KEY` set in the current process's environment variables.

```Python
# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# # --- Setup Instructions ---
# # 1. Install the ADK package:
#!pip install google-adk
# # Make sure to restart kernel if using colab/jupyter notebooks

# # 2. Set up your Gemini API Key:
# #    - Get a key from Google AI Studio: https://aistudio.google.com/app/apikey
# #    - Set it as an environment variable:
import os
os.environ["GOOGLE_API_KEY"] = "YOUR_API_KEY_HERE" # <--- REPLACE with your actual key
```

--------------------------------

### Initialize Go Modules and Install Dependencies

Source: https://google.github.io/adk-docs/get-started/go

Initializes Go module management for the ADK agent project and resolves all import dependencies. Executes go mod init to create module configuration and go mod tidy to download and manage required packages based on import statements.

```bash
go mod init my-agent/main
go mod tidy
```

--------------------------------

### Navigate to a2a_basic sample directory in Go

Source: https://google.github.io/adk-docs/a2a/quickstart-consuming-go

Changes to the a2a_basic example directory to access the multi-agent system sample code. This directory contains the main root agent and remote prime agent implementations.

```bash
cd examples/go/a2a_basic
```

--------------------------------

### Install ADK TypeScript Project Dependencies

Source: https://google.github.io/adk-docs/get-started/typescript

This sequence of 'npm' and 'npx' commands initializes a Node.js project, installs TypeScript as a dev dependency, configures 'tsconfig.json', and then installs the core '@google/adk' and '@google/adk-devtools' libraries as project dependencies.

```bash
cd my-agent/
# initialize a project with default values
npm init --yes
# configure TypeScript
npm install -D typescript
npx tsc --init
# install ADK libraries
npm install @google/adk
npm install @google/adk-devtools
```

--------------------------------

### Setup A2A Web Launcher and Server Configuration in Go

Source: https://google.github.io/adk-docs/a2a/quickstart-exposing-go

Initializes the A2A web launcher on port 8001 and creates the ADK configuration with a single agent loader and in-memory session service. The launcher dynamically generates the agent card and handles incoming A2A requests. Includes error handling for launcher parsing and execution.

```go
port := 8001
webLauncher := web.NewLauncher(a2a.NewLauncher())
_, err = webLauncher.Parse([]string{
    "--port", strconv.Itoa(port),
    "a2a", "--a2a_agent_url", "http://localhost:" + strconv.Itoa(port),
})
if err != nil {
    log.Fatalf("launcher.Parse() error = %v", err)
}

config := &launcher.Config{
    AgentLoader:    agent.NewSingleLoader(primeAgent),
    SessionService: session.InMemoryService(),
}

log.Printf("Starting A2A prime checker server on port %d\n", port)
if err := webLauncher.Run(context.Background(), config); err != nil {
    log.Fatalf("webLauncher.Run() error = %v", err)
}
```