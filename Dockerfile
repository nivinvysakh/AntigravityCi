# syntax=docker/dockerfile:1
FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies, Git, and runtime libraries for llama.cpp
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    unzip \
    libgomp1 \
    libcurl4 \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install pre-compiled llama.cpp binary (high-performance C++ CPU inference)
ARG LLAMA_VERSION=b4400
RUN mkdir -p /app/bin && \
    curl -fsSL -o /tmp/llama.zip "https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-ubuntu-x64.zip" && \
    unzip -q /tmp/llama.zip -d /app/bin && \
    (mv /app/bin/build/bin/llama-server /app/llama-server 2>/dev/null || mv /app/bin/llama-server /app/llama-server || true) && \
    chmod +x /app/llama-server || true && \
    rm -rf /tmp/llama.zip /app/bin

# Download embedded Qwen2.5-Coder-1.5B-Instruct GGUF model (~1.0 GB)
RUN mkdir -p /app/models && \
    curl -fL -o /app/models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf \
    "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"

# Install Python requirements
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application files
COPY main.py /app/main.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
