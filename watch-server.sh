#!/usr/bin/env bash
# Keeps the Vite dev server alive on port 8080.
# Restarts automatically if it crashes. Logs to /tmp/brainstorm-server.log

PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/brainstorm-server.log"

echo "▶ Auto-restart watcher started (port $PORT)" | tee -a "$LOG"
echo "  Project: $DIR" | tee -a "$LOG"
echo "  Logs:    $LOG" | tee -a "$LOG"
echo "" | tee -a "$LOG"

while true; do
  # Check if port is already in use
  if lsof -i ":$PORT" | grep -q LISTEN 2>/dev/null; then
    # Server is running — sleep and check again
    sleep 5
    continue
  fi

  echo "[$(date '+%H:%M:%S')] Server not running. Starting npm run dev..." | tee -a "$LOG"
  cd "$DIR" && npm run dev >> "$LOG" 2>&1 &
  SERVER_PID=$!
  echo "[$(date '+%H:%M:%S')] Started PID $SERVER_PID" | tee -a "$LOG"

  # Wait for the server process to exit
  wait $SERVER_PID
  echo "[$(date '+%H:%M:%S')] Server crashed (PID $SERVER_PID). Restarting in 3s..." | tee -a "$LOG"
  sleep 3
done
