#!/bin/bash
export PATH="/usr/local/opt/postgresql@15/bin:/usr/local/opt/redis/bin:/usr/local/opt/node@18/bin:/usr/local/bin:/usr/bin:/bin"
export NODE_ENV=production
export HOME=/Users/luisbrochet

cd /Users/luisbrochet/ule-rpa

# Ensure services are running
/usr/local/bin/brew services start postgresql@15 2>/dev/null
/usr/local/bin/brew services start redis 2>/dev/null

# Wait for services
/bin/sleep 5

# Start API server and worker
/usr/local/opt/node@18/bin/node dist/api/server.js &
SERVER_PID=$!

/usr/local/opt/node@18/bin/node dist/orchestrator/worker.js &
WORKER_PID=$!

echo "Server PID: $SERVER_PID, Worker PID: $WORKER_PID"
wait
