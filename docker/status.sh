#!/bin/bash
echo "📊 Sonic Bundler Status"
echo "======================"
docker-compose ps
echo -e "\n🌐 Health Check:"
curl -s http://localhost:3000/health 2>/dev/null || echo "Not reachable"
