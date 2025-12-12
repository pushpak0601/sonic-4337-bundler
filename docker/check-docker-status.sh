#!/bin/bash

echo "🐳 Docker Status Check"
echo "====================="

echo "1. Docker Installation:"
if command -v docker &> /dev/null; then
    docker --version
else
    echo "❌ Docker not installed"
fi

echo -e "\n2. Docker Compose:"
if command -v docker-compose &> /dev/null; then
    docker-compose --version
else
    echo "❌ Docker Compose not installed"
fi

echo -e "\n3. Docker Service:"
if systemctl is-active --quiet docker 2>/dev/null || service docker status &>/dev/null; then
    echo "✅ Docker service is running"
else
    echo "❌ Docker service not running"
fi

echo -e "\n4. Running Containers:"
docker ps 2>/dev/null || echo "Cannot run docker ps"

echo -e "\n5. Sonic Bundler Containers:"
docker ps --filter "name=sonic" 2>/dev/null || echo "No sonic containers found"

echo -e "\n6. Current Environment:"
if [ -f /.dockerenv ]; then
    echo "✅ You are INSIDE a Docker container"
    echo "Container ID: $(cat /etc/hostname)"
else
    echo "📦 You are on the HOST machine (not in container)"
fi

echo -e "\n7. Port 3000 Status:"
if ss -tulpn 2>/dev/null | grep -q ":3000"; then
    echo "✅ Port 3000 is in use"
    ss -tulpn | grep ":3000"
else
    echo "❌ Port 3000 not in use"
fi

echo -e "\n8. Process on Port 3000:"
sudo lsof -i :3000 2>/dev/null || echo "Cannot check process (try with sudo)"
