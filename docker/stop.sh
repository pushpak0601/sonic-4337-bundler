#!/bin/bash
echo "🛑 Stopping Sonic Bundler..."
docker-compose down
echo "✅ Stopped!"
docker ps | grep sonic || echo "No sonic containers running"
