# ADK Samples: Agent Development Kit Sample Repository

The ADK Samples repository is a comprehensive collection of production-ready AI agent implementations built on Google's Agent Development Kit (ADK). This repository serves as both a learning resource and a foundation for developers building intelligent agents across various domains, from customer service and financial analysis to data science and content creation. The samples demonstrate best practices for agent architecture, tool integration, multi-agent orchestration, and deployment to production environments like Vertex AI Agent Engine.

The repository contains implementations in Python, TypeScript, Java, and Go, covering over 40 different agent samples across multiple industry verticals. Each agent demonstrates specific capabilities such as RAG (Retrieval-Augmented Generation), multi-agent workflows, custom tool creation, BigQuery integration, real-time conversations, MCP (Model Context Protocol) integration, Application Integration Connectors, computer use automation, and deployment patterns. The samples range from simple single-agent implementations to complex multi-agent systems with specialized sub-agents, making them suitable for developers at all skill levels looking to build sophisticated AI-powered applications.

## Agent Creation and Deployment

### Creating a Basic RAG Agent

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
            rag_corpus=os.environ.get("RAG_CORPUS")  # e.g., projects/123/locations/us-central1/ragCorpora/456
        )
    ],
    similarity_top_k=10,
    vector_distance_threshold=0.6,
)

# Create the agent with RAG capabilities
root_agent = Agent(
    model='gemini-2.0-flash-001',
    name='ask_rag_agent',
    instruction="""You are a documentation assistant. Use the RAG retrieval tool to find relevant
    information and provide accurate answers with proper citations. Always cite your sources.""",
    tools=[ask_vertex_retrieval]
)

# Query the agent
response = root_agent.query("What are the key features of BigQuery ML?")
print(response)
```

### Building a Multi-Agent Blog Writing System

```python
from google.adk.agents import Agent
from google.adk.tools import FunctionTool
import datetime

# Define custom tools
def save_blog_post_to_file(content: str, filename: str) -> dict:
    """Save blog post content to a markdown file."""
    with open(f"{filename}.md", "w") as f:
        f.write(content)
    return {"status": "success", "filename": f"{filename}.md"}

def analyze_codebase(directory: str) -> dict:
    """Analyze a codebase directory to understand structure."""
    # Implementation would scan directory structure
    return {"files": [], "languages": [], "structure": {}}

# Create specialized sub-agents
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

blog_editor = Agent(
    name="blog_editor",
    model="gemini-2.0-flash-001",
    instruction="Review and improve blog posts based on user feedback.",
)

# Create main orchestrator agent
interactive_blogger_agent = Agent(
    name="interactive_blogger_agent",
    model="gemini-2.0-flash-001",
    description="Technical blogging assistant that collaborates with users to create blog posts.",
    instruction=f"""
    You are a technical blogging assistant. Your workflow:
    1. Analyze Codebase (Optional): Use analyze_codebase if directory provided
    2. Plan: Generate outline using blog_planner sub-agent
    3. Refine: Iterate on outline based on user feedback
    4. Write: Create blog post using blog_writer sub-agent
    5. Edit: Revise using blog_editor based on feedback
    6. Export: Save final version using save_blog_post_to_file

    Current date: {datetime.datetime.now().strftime("%Y-%m-%d")}
    """,
    sub_agents=[blog_planner, blog_writer, blog_editor],
    tools=[
        FunctionTool(save_blog_post_to_file),
        FunctionTool(analyze_codebase),
    ],
    output_key="blog_outline",
)

# Use the agent
response = interactive_blogger_agent.query(
    "I want to write a blog post about using Vertex AI for ML workflows"
)
print(response)
```

### Creating a Data Science Multi-Agent System

```python
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.genai import types
from datetime import date
import os

# Define agent tools for database and data science operations
def call_bigquery_agent(query: str) -> dict:
    """Execute SQL queries against BigQuery database."""
    # Implementation executes NL2SQL conversion and query
    return {"status": "success", "results": [], "query": ""}

def call_analytics_agent(task: str, data: dict) -> dict:
    """Perform data science analysis and visualization."""
    # Implementation handles Python data analysis
    return {"status": "success", "analysis": {}, "visualizations": []}

def get_database_settings() -> dict:
    """Retrieve BigQuery connection settings."""
    return {
        "project_id": os.getenv("BQ_COMPUTE_PROJECT_ID"),
        "dataset_id": os.getenv("BQ_DATASET_ID"),
        "schema": "Table: sales (id, date, amount, product)"
    }

# Setup callback to initialize database connection
def load_database_settings_in_context(callback_context: CallbackContext):
    """Initialize database settings in agent state."""
    if "database_settings" not in callback_context.state:
        callback_context.state["database_settings"] = get_database_settings()

# Create BQML sub-agent for machine learning tasks
bqml_agent = LlmAgent(
    name="bqml_agent",
    model="gemini-2.0-flash-001",
    instruction="Create and train BigQuery ML models using SQL syntax.",
)

# Create root orchestrator agent
root_agent = LlmAgent(
    model=os.getenv("ROOT_AGENT_MODEL", "gemini-2.0-flash-001"),
    name="data_science_root_agent",
    instruction="""You are a Data Science Multi-Agent System.
    Use call_bigquery_agent for database queries and call_analytics_agent for analysis.
    Coordinate between database access, data analysis, and machine learning tasks.""",
    global_instruction=f"You are a Data Science and Analytics System. Today's date: {date.today()}",
    sub_agents=[bqml_agent],
    tools=[call_bigquery_agent, call_analytics_agent],
    before_agent_callback=load_database_settings_in_context,
    generate_content_config=types.GenerateContentConfig(temperature=0.01),
)

# Use the agent
response = root_agent.query(
    "Analyze total sales by product category and create a forecast model"
)
print(response)
```

### Creating a Real-Time Conversational Agent

```python
from google.adk.agents import Agent
from google.genai.types import (
    GenerateContentConfig,
    HarmBlockThreshold,
    HarmCategory,
    SafetySetting,
)

# Configuration for the agent
genai_config = GenerateContentConfig(
    temperature=0.5
)

# Create real-time conversational agent with native audio support
root_agent = Agent(
   name="realtime_assistant",
   model="gemini-live-2.5-flash-preview-native-audio",
   description="A helpful AI assistant with real-time audio capabilities.",
   instruction="""You are a real-time conversational assistant. Respond naturally
   to user queries with appropriate tone and context. Handle audio input and output
   for seamless voice interactions."""
)

# The agent can handle real-time bidirectional audio streams
# Typically used with WebSocket or streaming APIs for live conversations
```

## Environment Setup and Configuration

### Setting Up Python Project with Poetry/uv

```bash
# Clone the repository
git clone https://github.com/google/adk-samples.git
cd adk-samples/python/agents/<agent-name>

# Using Poetry
poetry install
poetry shell

# Using uv (faster alternative)
uv sync
source .venv/bin/activate

# Configure environment variables
cp .env.example .env
# Edit .env with your settings:
# GOOGLE_GENAI_USE_VERTEXAI=1
# GOOGLE_CLOUD_PROJECT=your-project-id
# GOOGLE_CLOUD_LOCATION=us-central1
# GOOGLE_API_KEY=your-api-key (if using ML Dev backend)

# Authenticate with Google Cloud
gcloud auth application-default login
gcloud auth application-default set-quota-project $GOOGLE_CLOUD_PROJECT

# Run the agent
adk run <agent_name>  # CLI interface
adk web              # Web UI interface
```

### Deploying to Vertex AI Agent Engine

```bash
# Build agent wheel package
poetry build --format=wheel --out-dir deployment
# or with uv
uv build --wheel --out-dir deployment

# Set up Agent Engine permissions
export RE_SA="service-${GOOGLE_CLOUD_PROJECT_NUMBER}@gcp-sa-aiplatform-re.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding ${GOOGLE_CLOUD_PROJECT} \
    --member="serviceAccount:${RE_SA}" \
    --role="roles/bigquery.user"

# Deploy to Agent Engine
cd deployment/
python deploy.py --create

# Output will show resource ID:
# projects/PROJECT_ID/locations/LOCATION/reasoningEngines/REASONING_ENGINE_ID

# Test deployed agent
export RESOURCE_ID=<reasoning_engine_id>
export USER_ID=test_user
python test_deployment.py --resource_id=$RESOURCE_ID --user_id=$USER_ID

# Delete deployment when done
python deploy.py --delete --resource_id=$RESOURCE_ID
```

### Creating and Managing RAG Corpus

```python
import os
from vertexai.preview import rag
import vertexai
import requests

# Initialize Vertex AI
vertexai.init(
    project=os.getenv("GOOGLE_CLOUD_PROJECT"),
    location=os.getenv("GOOGLE_CLOUD_LOCATION")
)

def create_or_get_corpus(corpus_name: str, description: str):
    """Create new RAG corpus or retrieve existing one."""
    try:
        corpus = rag.create_corpus(
            display_name=corpus_name,
            description=description
        )
        print(f"Created corpus: {corpus.name}")
        return corpus
    except Exception as e:
        print(f"Corpus may already exist: {e}")
        corpora = rag.list_corpora()
        for corpus in corpora:
            if corpus.display_name == corpus_name:
                return corpus
        raise

def upload_pdf_to_corpus(corpus_name: str, pdf_url: str, file_name: str):
    """Download PDF from URL and upload to RAG corpus."""
    # Download PDF
    response = requests.get(pdf_url)
    local_path = f"/tmp/{file_name}"
    with open(local_path, 'wb') as f:
        f.write(response.content)

    # Upload to corpus
    rag_file = rag.upload_file(
        corpus_name=corpus_name,
        path=local_path,
        display_name=file_name,
        description=f"Uploaded from {pdf_url}"
    )
    print(f"Uploaded file: {rag_file.name}")
    return rag_file

# Usage example
corpus = create_or_get_corpus(
    corpus_name="Financial_Reports_2024",
    description="Annual financial reports and SEC filings"
)

upload_pdf_to_corpus(
    corpus_name=corpus.name,
    pdf_url="https://abc.xyz/investor/static/pdf/2024_alphabet_annual_report.pdf",
    file_name="alphabet_10k_2024.pdf"
)

# Update .env file with corpus resource name
# RAG_CORPUS=projects/123/locations/us-central1/ragCorpora/456
```

## Testing and Evaluation

### Running Unit Tests and Evaluations

```bash
# Install test dependencies
poetry install  # or: uv sync

# Run unit tests
pytest tests/
pytest tests/unit/

# Run integration tests
pytest tests/integration/

# Run evaluation tests
pytest eval/

# Run specific test file with verbose output
pytest tests/test_agent.py -v

# Run tests with coverage report
pytest --cov=agent_name --cov-report=html tests/
```

### Creating Evaluation Tests

```python
# eval/test_eval.py
import pytest
from google.adk.evaluation import AgentEvaluator
from agent_name.agent import root_agent

def test_agent_evaluation():
    """Evaluate agent performance on test dataset."""
    evaluator = AgentEvaluator(
        agent=root_agent,
        test_data_path="eval/conversation.test.json",
        config_path="eval/test_config.json"
    )

    results = evaluator.run()

    # Assert minimum performance thresholds
    assert results["tool_trajectory_avg_score"] >= 0.7
    assert results["response_match_score"] >= 0.75

    print(f"Evaluation Results: {results}")

# eval/conversation.test.json
{
  "test_cases": [
    {
      "user_query": "What are the revenue trends for Q4?",
      "expected_tools": ["call_db_agent"],
      "expected_tool_args": {"query": "revenue Q4"},
      "reference_answer": "Q4 revenue increased by 15% year-over-year..."
    }
  ]
}

# eval/test_config.json
{
  "criteria": {
    "tool_trajectory_avg_score": {
      "threshold": 0.7,
      "weight": 0.5
    },
    "response_match_score": {
      "threshold": 0.75,
      "weight": 0.5
    }
  }
}
```

### Interacting with Deployed Agents

```python
import vertexai
from vertexai import agent_engines

# Initialize Vertex AI
vertexai.init(
    project="your-project-id",
    location="us-central1"
)

# Get deployed agent
RESOURCE_ID = "projects/123/locations/us-central1/reasoningEngines/456"
remote_agent = agent_engines.get(RESOURCE_ID)

# Create user session
USER_ID = "user123"
session = remote_agent.create_session(user_id=USER_ID)

# Stream responses from agent
def chat_with_agent(message: str):
    """Send message to agent and stream response."""
    for event in remote_agent.stream_query(
        user_id=USER_ID,
        session_id=session["id"],
        message=message,
    ):
        parts = event.get("content", {}).get("parts", [])
        for part in parts:
            if "text" in part:
                print(part["text"], end="", flush=True)
        print()  # New line after complete response

# Example conversation
chat_with_agent("Hello, what data do you have access to?")
chat_with_agent("Show me total sales by region")
chat_with_agent("Create a visualization of monthly trends")

# List all deployed agents
def list_agents():
    """List all deployed agents in project."""
    agents = agent_engines.list()
    for agent in agents:
        print(f"Agent ID: {agent.resource_name}")
        print(f"  Name: {agent.display_name}")
        print(f"  Created: {agent.create_time}")

list_agents()
```

## Custom Tools and Integration

### Creating Custom Function Tools

```python
from google.adk.tools import FunctionTool
from typing import Literal
import requests
import json

def send_email_notification(
    recipient: str,
    subject: str,
    body: str,
    priority: Literal["low", "normal", "high"] = "normal"
) -> dict:
    """
    Send email notification to recipient.

    Args:
        recipient: Email address of recipient
        subject: Email subject line
        body: Email body content
        priority: Email priority level

    Returns:
        Status dictionary with success/failure info
    """
    try:
        # Integration with email service
        response = requests.post(
            "https://api.emailservice.com/send",
            json={
                "to": recipient,
                "subject": subject,
                "body": body,
                "priority": priority
            },
            headers={"Authorization": "Bearer YOUR_API_KEY"}
        )
        return {
            "status": "success",
            "message": f"Email sent to {recipient}",
            "message_id": response.json().get("id")
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

def query_bigquery_table(
    project_id: str,
    dataset_id: str,
    query: str
) -> dict:
    """
    Execute SQL query against BigQuery.

    Args:
        project_id: GCP project ID
        dataset_id: BigQuery dataset ID
        query: SQL query to execute

    Returns:
        Query results as dictionary
    """
    from google.cloud import bigquery

    client = bigquery.Client(project=project_id)
    query_job = client.query(query)
    results = query_job.result()

    rows = [dict(row) for row in results]
    return {
        "status": "success",
        "row_count": len(rows),
        "data": rows,
        "schema": [field.name for field in results.schema]
    }

# Create agent with custom tools
from google.adk.agents import Agent

agent = Agent(
    name="business_assistant",
    model="gemini-2.0-flash-001",
    instruction="""You are a business assistant. Use send_email_notification to send
    important updates and query_bigquery_table to access business data.""",
    tools=[
        FunctionTool(send_email_notification),
        FunctionTool(query_bigquery_table)
    ]
)

# Use the agent
response = agent.query(
    "Query the sales table for last month's revenue and email the summary to finance@company.com"
)
```

### Creating Async Tools for External Services

```python
import asyncio
from google.adk.tools import FunctionTool
from typing import Optional

async def schedule_service_appointment(
    customer_id: str,
    service_type: str,
    preferred_date: str,
    time_range: str,
    notes: Optional[str] = None
) -> dict:
    """
    Schedule service appointment asynchronously.

    Args:
        customer_id: Customer identifier
        service_type: Type of service (e.g., 'planting', 'maintenance')
        preferred_date: Requested date (YYYY-MM-DD)
        time_range: Preferred time (e.g., '9am-12pm')
        notes: Additional appointment notes

    Returns:
        Appointment confirmation details
    """
    # Simulate async API call
    await asyncio.sleep(0.5)

    appointment_id = f"APT-{customer_id[-4:]}-{preferred_date.replace('-', '')}"

    return {
        "status": "confirmed",
        "appointment_id": appointment_id,
        "customer_id": customer_id,
        "service_type": service_type,
        "scheduled_date": preferred_date,
        "time_range": time_range,
        "notes": notes,
        "confirmation_sent": True
    }

async def check_inventory_availability(
    product_id: str,
    store_id: str,
    quantity: int = 1
) -> dict:
    """
    Check real-time product availability.

    Args:
        product_id: Product SKU or ID
        store_id: Store location identifier
        quantity: Desired quantity

    Returns:
        Availability status and quantity
    """
    await asyncio.sleep(0.3)

    # Simulate inventory check
    available_quantity = 50

    return {
        "product_id": product_id,
        "store_id": store_id,
        "available": quantity <= available_quantity,
        "quantity_available": available_quantity,
        "requested_quantity": quantity,
        "can_fulfill": quantity <= available_quantity
    }

# Create agent with async tools
agent = Agent(
    name="customer_service_agent",
    model="gemini-2.0-flash-001",
    instruction="""You are a customer service agent. Help customers schedule appointments
    and check product availability in real-time.""",
    tools=[
        FunctionTool(schedule_service_appointment),
        FunctionTool(check_inventory_availability)
    ]
)

# Use agent (async execution handled automatically)
response = agent.query(
    "Check if we have 5 units of product SKU-12345 at store LAX01, and if available, "
    "schedule a delivery for tomorrow between 2pm-5pm"
)
```

### Integrating MCP (Model Context Protocol) Servers

```python
from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool import MCPToolset, StreamableHTTPConnectionParams, StdioConnectionParams
from mcp import StdioServerParameters
import os

# Example 1: HTTP-based MCP server connection
currency_agent = LlmAgent(
    model="gemini-2.0-flash-001",
    name="currency_agent",
    description="Agent that can help with currency conversions",
    instruction="""You are a specialized assistant for currency conversions.
    Use the get_exchange_rate tool to answer questions about currency exchange rates.""",
    tools=[
        MCPToolset(
            connection_params=StreamableHTTPConnectionParams(
                url=os.getenv("MCP_SERVER_URL", "http://localhost:8080/mcp")
            )
        )
    ],
)

# Example 2: Stdio-based MCP server connection
payment_agent = LlmAgent(
    name="antom_payment_agent",
    model="gemini-2.0-flash",
    description="Agent creates payment links for merchants and queries payment details",
    instruction="""You are an Antom payment agent who can help users create payment links
    and query payment result details. Generate RequestId randomly and describe orders in one sentence.""",
    tools=[
        MCPToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command='uvx',
                    args=["ant-intl-antom-mcp"],
                    env={
                        "GATEWAY_URL": os.getenv("GATEWAY_URL"),
                        "CLIENT_ID": os.getenv("CLIENT_ID"),
                        "MERCHANT_PRIVATE_KEY": os.getenv("MERCHANT_PRIVATE_KEY"),
                        "ALIPAY_PUBLIC_KEY": os.getenv("ALIPAY_PUBLIC_KEY"),
                        "PAYMENT_REDIRECT_URL": os.getenv("PAYMENT_REDIRECT_URL"),
                        "PAYMENT_NOTIFY_URL": os.getenv("PAYMENT_NOTIFY_URL"),
                    }
                ),
            ),
        )
    ],
)

# Use the agent
response = currency_agent.query("What is the exchange rate from USD to EUR?")
print(response)

response = payment_agent.query("Create a payment link for $50 USD")
print(response)
```

### Using AgentTool for Multi-Agent Coordination

```python
from google.adk.agents import LlmAgent
from google.adk.tools.agent_tool import AgentTool
from google.adk.tools import google_search

# Create specialized sub-agents
websearch_agent = LlmAgent(
    model="gemini-2.5-pro",
    name="academic_websearch_agent",
    instruction="Find research papers and academic resources using web search.",
    output_key="recent_citing_papers",
    tools=[google_search],
)

research_agent = LlmAgent(
    model="gemini-2.5-pro",
    name="academic_research_agent",
    instruction="Analyze research papers and suggest new research directions.",
)

# Create coordinator agent that uses sub-agents as tools
coordinator_agent = LlmAgent(
    name="academic_coordinator",
    model="gemini-2.5-pro",
    description="""Analyze seminal papers, provide research advice, locate relevant papers,
    generate new research directions, and access web resources.""",
    instruction="You are an academic research assistant. Delegate tasks to specialized agents.",
    output_key="seminal_paper",
    tools=[
        AgentTool(agent=websearch_agent),
        AgentTool(agent=research_agent),
    ],
)

# Use the coordinator
response = coordinator_agent.query(
    "Find recent papers related to transformer architectures and suggest new research directions"
)
print(response)
```

## Agent Patterns and Best Practices

### State Management and Context Persistence

```python
from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from typing import Dict, Any

def initialize_session_state(callback_context: CallbackContext):
    """Initialize session state with default values."""
    if "conversation_history" not in callback_context.state:
        callback_context.state["conversation_history"] = []

    if "user_preferences" not in callback_context.state:
        callback_context.state["user_preferences"] = {
            "risk_tolerance": None,
            "investment_horizon": None,
            "portfolio_value": None
        }

    if "analysis_results" not in callback_context.state:
        callback_context.state["analysis_results"] = {}

def track_conversation(callback_context: CallbackContext):
    """Track conversation turns for context."""
    current_message = callback_context._invocation_context.message

    callback_context.state["conversation_history"].append({
        "turn": len(callback_context.state["conversation_history"]) + 1,
        "user_message": current_message,
        "timestamp": datetime.now().isoformat()
    })

    # Limit history to last 10 turns
    if len(callback_context.state["conversation_history"]) > 10:
        callback_context.state["conversation_history"] = \
            callback_context.state["conversation_history"][-10:]

def after_agent_response(callback_context: CallbackContext):
    """Store agent response and update state."""
    response = callback_context._invocation_context.response

    if callback_context.state["conversation_history"]:
        callback_context.state["conversation_history"][-1]["agent_response"] = response

# Create stateful agent
financial_agent = Agent(
    name="financial_advisor",
    model="gemini-2.5-pro",
    instruction="""You are a financial advisor. Track user preferences across conversations
    and provide personalized advice based on their risk tolerance and investment goals.""",
    before_agent_callback=initialize_session_state,
    before_turn_callback=track_conversation,
    after_agent_callback=after_agent_response,
)

# Session state persists across queries
financial_agent.query("I have moderate risk tolerance and 10-year horizon")
financial_agent.query("Recommend a portfolio for me")  # Uses stored preferences
```

### Error Handling and Retry Logic

```python
from google.adk.tools import FunctionTool
import time
from typing import Optional

def resilient_api_call(
    endpoint: str,
    max_retries: int = 3,
    backoff_factor: float = 2.0
) -> dict:
    """
    Make API call with exponential backoff retry logic.

    Args:
        endpoint: API endpoint URL
        max_retries: Maximum retry attempts
        backoff_factor: Multiplier for exponential backoff

    Returns:
        API response or error details
    """
    for attempt in range(max_retries):
        try:
            response = requests.get(endpoint, timeout=10)
            response.raise_for_status()
            return {
                "status": "success",
                "data": response.json(),
                "attempts": attempt + 1
            }
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                return {
                    "status": "error",
                    "message": f"Failed after {max_retries} attempts: {str(e)}",
                    "attempts": max_retries
                }

            wait_time = backoff_factor ** attempt
            print(f"Attempt {attempt + 1} failed, retrying in {wait_time}s...")
            time.sleep(wait_time)

def safe_database_query(
    query: str,
    fallback_behavior: str = "return_empty"
) -> dict:
    """
    Execute database query with error handling.

    Args:
        query: SQL query
        fallback_behavior: How to handle errors ('return_empty', 'raise', 'use_cache')

    Returns:
        Query results or graceful error response
    """
    try:
        # Execute query
        from google.cloud import bigquery
        client = bigquery.Client()
        results = client.query(query).result()

        return {
            "status": "success",
            "rows": [dict(row) for row in results],
            "query": query
        }
    except Exception as e:
        if fallback_behavior == "return_empty":
            return {
                "status": "partial_success",
                "rows": [],
                "warning": f"Query failed: {str(e)}",
                "fallback_used": True
            }
        elif fallback_behavior == "raise":
            raise
        else:  # use_cache
            # Return cached results if available
            return {
                "status": "using_cache",
                "rows": [],
                "note": "Using cached data due to query failure"
            }

agent = Agent(
    name="resilient_agent",
    model="gemini-2.0-flash-001",
    instruction="Handle errors gracefully and inform users when operations fail.",
    tools=[
        FunctionTool(resilient_api_call),
        FunctionTool(safe_database_query)
    ]
)
```

## Use Cases and Integration Patterns

The ADK Samples repository provides comprehensive examples for building AI agents across diverse domains, from customer service automation to financial analysis and data science workflows. Each sample demonstrates production-ready patterns for multi-agent orchestration, custom tool integration, state management, and deployment to Vertex AI Agent Engine. The repository emphasizes best practices for error handling, testing, evaluation, and scalability.

Key integration patterns include RAG-powered knowledge retrieval, BigQuery and AlloyDB database connectivity for data analysis, MCP (Model Context Protocol) server integration for external tools and services, AgentTool for multi-agent coordination, Application Integration Connectors for enterprise system integration, multi-modal interactions combining text and video, real-time streaming responses with native audio support, computer use automation for web interactions, and seamless deployment to cloud infrastructure. The samples support Python, TypeScript, Java, and Go implementations, with Poetry/uv for Python dependency management, comprehensive testing frameworks, and automated deployment scripts. Developers can use these samples as starting points to build domain-specific agents that leverage Google's Gemini 2.5 and 2.0 models, Vertex AI services, and the full ADK ecosystem for production deployments.
