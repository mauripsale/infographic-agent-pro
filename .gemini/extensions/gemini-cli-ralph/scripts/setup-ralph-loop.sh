#!/bin/bash
PROMPT="$1"
shift
MAX_ITERATIONS=0
COMPLETION_PROMISE=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --max-iterations) MAX_ITERATIONS="$2"; shift ;;
        --completion-promise) COMPLETION_PROMISE="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

cat <<EOF > .gemini/ralph-loop.local.md
---
active: true
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_promise: "$COMPLETION_PROMISE"
started_at: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
---

$PROMPT
EOF

echo "Ralph loop state initialized."
