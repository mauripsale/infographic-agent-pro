# Use an official Python runtime as a parent image
FROM python:3.11.9-slim

# Set the working directory in the container
WORKDIR /app

# Install git
RUN apt-get update && apt-get install -y git

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend application code into the container at /app
COPY . .

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Run the production API server on the correct host and port for Cloud Run
# Using shell form to allow environment variable substitution for $PORT
CMD exec adk api_server agents --host 0.0.0.0 --port $PORT