# ADK Samples

This collection demonstrates production-ready AI agent implementations using Google ADK.

## Retrieval-Augmented Generation (RAG) Agent

Create an agent that uses Vertex AI RAG to answer questions based on a corpus of documents.

```python
from google.adk.agents import Agent
from google.adk.tools.retrieval.vertex_ai_rag_retrieval import VertexAiRagRetrieval
from vertexai.preview import rag
import os

# Create a retrieval tool connected to Vertex AI RAG corpus
ask_vertex_retrieval = VertexAiRagRetrieval(
    name='retrieve_rag_documentation',
    description='Use this tool to retrieve documentation and reference materials from the RAG corpus',
    rag_resources=[
        rag.RagResource(
            rag_corpus=os.environ.get("RAG_CORPUS")
        )
    ],
    similarity_top_k=10,
    vector_distance_threshold=0.6,
)

# Create the agent
root_agent = Agent(
    model='gemini-2.0-flash-001',
    name='ask_rag_agent',
    instruction="""You are a documentation assistant. Use the RAG retrieval tool to find relevant
    information and provide accurate answers with proper citations. Always cite your sources.""",
    tools=[ask_vertex_retrieval]
)
```

## Multi-Agent Blog Writing System

A system that plans, writes, and edits blog posts using specialized sub-agents.

```python
from google.adk.agents import Agent
from google.adk.tools import FunctionTool

# Specialized sub-agents
blog_planner = Agent(
    name="blog_planner",
    model="gemini-2.0-flash-001",
    instruction="Create detailed blog post outlines with clear sections and key points.",
)

blog_writer = Agent(
    name="blog_writer",
    model="gemini-2.5-pro",
    instruction="Write engaging technical blog posts based on approved outlines.",
)

# Main orchestrator
interactive_blogger_agent = Agent(
    name="interactive_blogger_agent",
    model="gemini-2.0-flash-001",
    description="Technical blogging assistant that collaborates with users to create blog posts.",
    instruction="""
    You are a technical blogging assistant. Your workflow:
    1. Plan: Generate outline using blog_planner
    2. Write: Create blog post using blog_writer
    """,
    sub_agents=[blog_planner, blog_writer],
)
```

## Real-Time Conversational Agent

Create an agent with native audio support for real-time bidirectional conversations.

```python
from google.adk.agents import Agent

# Create real-time conversational agent
root_agent = Agent(
   name="realtime_assistant",
   model="gemini-live-2.5-flash-preview-native-audio",
   description="A helpful AI assistant with real-time audio capabilities.",
   instruction="""You are a real-time conversational assistant. Respond naturally
   to user queries with appropriate tone and context. Handle audio input and output
   for seamless voice interactions."""
)
```

## Data Science Multi-Agent

An agent that coordinates between BigQuery data retrieval and Python-based analysis.

```python
from google.adk.agents import LlmAgent
import os

# Create BQML sub-agent
bqml_agent = LlmAgent(
    name="bqml_agent",
    model="gemini-2.0-flash-001",
    instruction="Create and train BigQuery ML models using SQL syntax.",
)

# Create root orchestrator
root_agent = LlmAgent(
    model="gemini-2.0-flash-001",
    name="data_science_root_agent",
    instruction="""You are a Data Science Multi-Agent System.
    Coordinate between database access, data analysis, and machine learning tasks.""",
    sub_agents=[bqml_agent],
    # tools=[call_bigquery_agent, call_analytics_agent], # Assume tools are defined
)
```
