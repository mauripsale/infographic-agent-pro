FROM python:3.11-slim
WORKDIR /app

# Required for git-based dependencies in requirements.txt
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN adduser --disabled-password --gecos "" myuser

# Copy files and set ownership in a single layer to optimize image size
COPY --chown=myuser:myuser . .

USER myuser

ENV PATH="/home/myuser/.local/bin:$PATH"

# Use shell form to expand $PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]