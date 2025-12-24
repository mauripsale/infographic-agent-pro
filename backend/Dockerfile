FROM python:3.11.9-slim
WORKDIR /app

# Required for git-based dependencies
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN adduser --disabled-password --gecos "" myuser
USER myuser
WORKDIR /home/myuser/app

# Set PATH and PYTHONPATH to include user's local installations
ENV PATH="/home/myuser/.local/bin:$PATH"
ENV PYTHONPATH="/home/myuser/.local/lib/python3.11/site-packages"

# Install dependencies as the non-root user
COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir --user -r requirements.txt

# Copy application code
COPY . .

# Use shell form to expand $PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]