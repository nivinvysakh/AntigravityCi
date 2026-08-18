#!/bin/bash
set -e

# Configure git safe directory in container
git config --global --add safe.directory "$GITHUB_WORKSPACE" || true
git config --global --add safe.directory /github/workspace || true

# Execute AntigravityCI Python assistant directly
exec python3 /app/main.py
