#!/usr/bin/env bash
# Launches the Ledgr backend and frontend concurrently.
# Ctrl-C kills both.

set -e
cd "$(dirname "$0")"

if [ ! -d "server/node_modules" ]; then
  echo "→ Installing server dependencies..."
  (cd server && npm install)
fi

if [ ! -d "client/node_modules" ]; then
  echo "→ Installing client dependencies..."
  (cd client && npm install)
fi

echo ""
echo "→ Starting backend on http://localhost:3001"
(cd server && npm start) &
SERVER_PID=$!

echo "→ Starting frontend on http://localhost:5173"
(cd client && npm run dev) &
CLIENT_PID=$!

cleanup() {
  echo ""
  echo "→ Shutting down..."
  kill $SERVER_PID $CLIENT_PID 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

wait
