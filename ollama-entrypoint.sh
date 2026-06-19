#!/bin/bash
# Start Ollama server in background
ollama serve &
SERVER_PID=$!

echo "⏳ Waiting for Ollama API to be ready..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:11434/ > /dev/null 2>&1; then
    echo "✅ Ollama server ready (attempt $i)"
    break
  fi
  sleep 2
done

MODEL="gemma4:e4b"
echo "🔍 Checking if $MODEL is already downloaded..."

if ollama list 2>/dev/null | grep -q "gemma4:e4b"; then
  echo "✅ Model $MODEL already present — skipping pull"
else
  echo "📥 Pulling $MODEL (~7.2GB — first run only, this takes a few minutes)..."
  ollama pull "$MODEL"
  echo "✅ Model $MODEL ready"
fi

echo "🏥 Ollama AI service fully ready"
wait $SERVER_PID
