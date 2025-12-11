#!/bin/bash

# Sonic ERC-4337 Bundler Startup Script
# Usage: ./start-bundler.sh [--dev|--prod]

set -e

ENV="prod"
LOG_FILE="./logs/bundler.log"
PID_FILE="./bundler.pid"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dev)
      ENV="dev"
      shift
      ;;
    --prod)
      ENV="prod"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "🚀 Starting Sonic ERC-4337 Bundler ($ENV mode)"
echo "============================================"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "⚠️  Bundler is already running with PID: $PID"
    echo "   Use: ./stop-bundler.sh to stop it first"
    exit 1
  else
    echo "⚠️  Removing stale PID file"
    rm "$PID_FILE"
  fi
fi

# Create logs directory
mkdir -p ./logs

# Load environment
if [ "$ENV" = "dev" ]; then
  export NODE_ENV=development
  echo "📝 Development mode enabled"
else
  export NODE_ENV=production
  echo "🏭 Production mode enabled"
fi

# Check environment file
if [ ! -f ".env" ]; then
  echo "❌ Error: .env file not found"
  echo "   Copy .env.example to .env and configure it"
  exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Error: Node.js 18 or higher required"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm ci --only=production
fi

# Build if needed
if [ "$ENV" = "prod" ] && [ ! -d "dist" ]; then
  echo "🔨 Building TypeScript..."
  npm run build
fi

# Check bundler wallet balance
echo "💰 Checking bundler wallet balance..."
node scripts/management/check-balance.js

# Start the bundler
echo "▶️  Starting bundler..."
if [ "$ENV" = "dev" ]; then
  npm run dev > "$LOG_FILE" 2>&1 &
else
  npm start > "$LOG_FILE" 2>&1 &
fi

# Save PID
BUNDLER_PID=$!
echo $BUNDLER_PID > "$PID_FILE"

echo "✅ Bundler started with PID: $BUNDLER_PID"
echo "📝 Logs: $LOG_FILE"
echo "🌐 RPC: http://localhost:3000"
echo "🏥 Health: http://localhost:3000/health"
echo "📊 Metrics: http://localhost:9091/metrics"

# Monitor startup
echo -n "⏳ Waiting for bundler to be ready"
for i in {1..30}; do
  if curl -s http://localhost:3000/health > /dev/null; then
    echo ""
    echo "✅ Bundler is ready and healthy!"
    break
  fi
  echo -n "."
  sleep 1
  
  if [ $i -eq 30 ]; then
    echo ""
    echo "❌ Bundler failed to start within 30 seconds"
    echo "   Check logs: $LOG_FILE"
    exit 1
  fi
done

echo ""
echo "🎉 Sonic ERC-4337 Bundler is now running!"
echo ""
echo "📋 Quick Commands:"
echo "   ./stop-bundler.sh          - Stop the bundler"
echo "   ./monitor-bundler.sh       - Monitor performance"
echo "   tail -f $LOG_FILE   - View logs"
echo ""
echo "🔗 Integration:"
echo "   Update your frontend to use: http://localhost:3000"
echo ""
exit 0
