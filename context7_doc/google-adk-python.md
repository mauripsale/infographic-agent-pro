# Google ADK - Python Library

The Google ADK Python library is the core component for building AI agents with Python. It supports advanced features like multi-agent orchestration, custom tools, and parallel execution.

## Multi-Agent Systems

### Hierarchical Multi-Agent with Sub-Agents

Construct a hierarchical multi-agent system where a coordinator delegates tasks to specialized sub-agents.

```python
from google.adk.agents import Agent, LlmAgent

# Specialized sub-agents
research_agent = LlmAgent(
    name="researcher",
    model="gemini-2.5-flash",
    instruction="""You are a research specialist. When asked to research a topic:
    1. Break down the topic into key areas
    2. Provide detailed, factual information
    3. Cite sources when possible""",
    description="Handles in-depth research queries"
)

writing_agent = LlmAgent(
    name="writer",
    model="gemini-2.5-flash",
    instruction="""You are a professional writer.
    Create well-structured, engaging content based on the research provided.
    Focus on clarity and readability.""",
    description="Creates polished written content"
)

# Coordinator agent that delegates to sub-agents
coordinator = LlmAgent(
    name="coordinator",
    model="gemini-2.5-flash",
    instruction="""You are a project coordinator. Analyze user requests and delegate to the appropriate specialist:
    - Use 'researcher' for factual queries and research tasks
    - Use 'writer' for content creation and editing

    Coordinate between specialists when tasks require multiple skills.""",
    description="Coordinates tasks between specialized agents",
    sub_agents=[research_agent, writing_agent]
)
```

### Sequential Agent Workflows

Create pipeline-style workflows using `SequentialAgent` where the output of one agent serves as input for the next.

```python
from google.adk.agents import SequentialAgent, LlmAgent

# Stage 1: Data extraction
extractor = LlmAgent(
    name="extractor",
    model="gemini-2.5-flash",
    instruction="Extract key facts and data points from the user's input. Output as bullet points.",
    output_key="extracted_data"  # Store output in session state
)

# Stage 2: Analysis
analyzer = LlmAgent(
    name="analyzer",
    model="gemini-2.5-flash",
    instruction="""Analyze the extracted data from {extracted_data}.
    Identify patterns, trends, and insights.""",
    output_key="analysis"
)

pipeline = SequentialAgent(
    name="analysis_pipeline",
    description="Extracts and analyzes data",
    sub_agents=[extractor, analyzer]
)
```

### Parallel Agent Execution

Use `ParallelAgent` to run multiple agents concurrently, useful for gathering diverse perspectives or performing independent tasks simultaneously.

```python
from google.adk.agents import ParallelAgent, LlmAgent

technical_reviewer = LlmAgent(
    name="technical_reviewer",
    model="gemini-2.5-flash",
    instruction="Review the code for technical correctness, performance, and best practices.",
    output_key="technical_review"
)

security_reviewer = LlmAgent(
    name="security_reviewer",
    model="gemini-2.5-flash",
    instruction="Review the code for security vulnerabilities and potential exploits.",
    output_key="security_review"
)

parallel_review = ParallelAgent(
    name="code_review_team",
    description="Performs comprehensive code review from multiple perspectives",
    sub_agents=[technical_reviewer, security_reviewer]
)
```

## Custom Function Tools

Define various types of function tools for ADK agents, including those that interact with `ToolContext`.

```python
from google.adk.agents import Agent
from google.adk.tools import FunctionTool, ToolContext
from pydantic import BaseModel
from typing import Optional

# Simple function tool
def get_weather(city: str, unit: str = "celsius") -> dict:
    """Get the current weather for a city."""
    return {
        "city": city,
        "temperature": 22 if unit == "celsius" else 72,
        "unit": unit,
        "conditions": "partly cloudy"
    }

# Function tool with ToolContext for session state
def save_note(note: str, tool_context: ToolContext) -> str:
    """Save a note to the user's session."""
    notes = tool_context.state.get("notes", [])
    notes.append(note)
    tool_context.state["notes"] = notes
    return f"Note saved. You now have {len(notes)} notes."

# Create agent with tools
agent = Agent(
    name="assistant",
    model="gemini-2.5-flash",
    instruction="Help users with weather and notes.",
    tools=[get_weather, save_note]
)
```
