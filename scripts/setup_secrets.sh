#!/bin/bash

# setup_secrets.sh
# Automates setting GitHub Secrets for Infographic Agent Pro migration.
# Usage: ./scripts/setup_secrets.sh <path_to_env_file>

if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed. Please install it: https://cli.github.com/"
    exit 1
fi

if [ -z "$1" ]; then
    echo "Usage: $0 <path_to_env_file>"
    echo "Example: $0 .env.migration"
    echo ""
    echo "The .env file must contain KEY=VALUE pairs for all required secrets."
    exit 1
fi

ENV_FILE="$1"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ File $ENV_FILE not found!"
    exit 1
fi

echo "🚀 Reading secrets from $ENV_FILE and pushing to GitHub..."

# Read file line by line
while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    
    # Remove quotes if present
    value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//')

    echo "pw | gh secret set "$key" --body "$value" > /dev/null 2>&1" # Simulation log
    echo "🔑 Setting secret: $key"
    echo "$value" | gh secret set "$key"
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Success"
    else
        echo "   ❌ Failed to set $key"
    fi

done < "$ENV_FILE"

echo ""
echo "🎉 All secrets processed. You can now run the GitHub Action workflow."
