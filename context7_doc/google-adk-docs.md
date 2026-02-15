# Google Agent Development Kit (ADK) Documentation

The Google Agent Development Kit (ADK) is a comprehensive framework for building, testing, and deploying AI agents. It provides a structured approach to agent development, ensuring best practices and scalability.

## Installation

Install the ADK for your preferred language.

### Python
```bash
pip install google-adk
```

### TypeScript
```bash
npm install @google/adk @google/adk-devtools
```

### Go
```bash
go get google.golang.org/adk
```

### Java (Maven)
Add to your `pom.xml`:
```xml
<dependency>
  <groupId>com.google.adk</groupId>
  <artifactId>google-adk</artifactId>
  <version>0.5.0</version>
</dependency>
```

## Development UI

Launch the development UI for interactive testing and debugging of agents through a web-based interface.

### Starting the Development UI

#### Python
```bash
adk web
```
**Access at**: http://localhost:8000

#### TypeScript
```bash
npx adk web
```
**Access at**: http://localhost:8000

### Features
- Interactive agent testing
- Real-time message sending and response viewing
- Session management
- Conversation history
- Debug information and logging
- Agent configuration inspection

## Module Structure

The ADK is organized into several key modules:

- **google.adk.agents**: Agent framework and base classes (Agent, BaseAgent, InvocationContext).
- **google.adk.tools**: Tool implementations and integrations (Search, API, Memory, Grounding).
- **google.adk.a2a**: Agent-to-Agent communication protocol.
- **google.adk.utils**: Utility functions and helpers.

## Available Tools

The ADK includes a rich set of pre-built tools:

### Core Tools
- **google_maps_grounding_tool**: Location-based grounding using Google Maps API.
- **google_search_tool**: Google Search functionality for information retrieval.
- **vertex_ai_search_tool**: Connects to Vertex AI Search for enterprise search capabilities.

### Integration Tools
- **langchain_tool**: LangChain framework integration.
- **openapi_tool**: Generic OpenAPI/REST API integration.
- **mcp_tool**: Model Context Protocol (MCP) tool support.

### Data Management Tools
- **load_artifacts_tool**: Load and manage artifacts.
- **load_memory_tool**: Access and retrieve memory data.
- **url_context_tool**: Extract context from URLs.

### Utility Tools
- **long_running_tool**: Handle long-running operations.
- **transfer_to_agent_tool**: Transfer execution to another agent.
