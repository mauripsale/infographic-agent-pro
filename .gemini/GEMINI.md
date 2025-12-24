# Project Architecture Context
App: 3-Tier Application (React + FastAPI + Cloud SQL)
Infrastructure: Google Cloud (Cloud Run x2, Cloud SQL Auth Proxy via Sidecar or VPC Connector)
CI/CD: GitHub Actions

## Rules
1. Backend must expose OpenAPI JSON for Frontend consumption.
2. Frontend uses TanStack Query.
3. DevOps uses Terraform or gcloud commands tailored for Cloud Run.
