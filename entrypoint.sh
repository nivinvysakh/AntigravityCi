#!/bin/bash
set -e

# Configure git safe directory in container
git config --global --add safe.directory "$GITHUB_WORKSPACE" || true
git config --global --add safe.directory /github/workspace || true

ENGINE="${INPUT_ENGINE:-auto}"
GEMINI_KEY="${GEMINI_API_KEY:-}"

# Determine whether local LLM server needs to be booted
START_LOCAL="false"
if [ "$ENGINE" = "local" ] || [ -z "$GEMINI_KEY" ] || [ "$ENGINE" = "auto" ]; then
    START_LOCAL="true"
fi

if [ "$START_LOCAL" = "true" ] && [ -f "/app/models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf" ] && [ -f "/app/llama-server" ]; then
    echo "🧠 [AntigravityCI] Starting embedded local Qwen2.5-Coder-1.5B server..."
    /app/llama-server \
        -m /app/models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf \
        --host 127.0.0.1 \
        --port 8080 \
        -c 4096 \
        -t 2 \
        --log-disable > /tmp/llama.log 2>&1 &
    
    SERVER_PID=$!

    # Wait up to 20 seconds for health check
    for i in $(seq 1 20); do
        if curl -s http://127.0.0.1:8080/health > /dev/null 2>&1; then
            echo "✅ [AntigravityCI] Local LLM engine is ready on CPU (127.0.0.1:8080)!"
            break
        fi
        sleep 1
    done
fi

# Run the AntigravityCI Python assistant
python3 /app/main.py
EXIT_CODE=$?

# Cleanup local server if running
if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
fi

exit $EXIT_CODE
