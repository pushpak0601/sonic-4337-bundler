#!/bin/bash

echo "🚀 Starting Sonic Bundler (Fixed Version)"
echo "========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Clean up any existing containers
echo "Cleaning up..."
docker-compose down 2>/dev/null

# Create directories
mkdir -p ../data ../logs

# Check .env
if [ ! -f "../.env" ]; then
    echo -e "${YELLOW}⚠️  Creating .env from template...${NC}"
    if [ -f "../.env.example" ]; then
        cp ../.env.example ../.env
        echo -e "${YELLOW}⚠️  Please edit ../.env with your BUNDLER_PRIVATE_KEY${NC}"
        echo -e "${YELLOW}   Get SONIC from: https://testnet.soniclabs.com/account${NC}"
    else
        echo -e "${RED}❌ No .env.example found!${NC}"
        exit 1
    fi
fi

# Build with more info
echo -e "\n${GREEN}🔨 Building Docker image...${NC}"
if ! docker-compose build --no-cache; then
    echo -e "${RED}❌ Build failed! Showing last errors:${NC}"
    docker-compose build --no-cache 2>&1 | tail -30
    exit 1
fi

# Start
echo -e "\n${GREEN}🚀 Starting container...${NC}"
if ! docker-compose up -d; then
    echo -e "${RED}❌ Failed to start!${NC}"
    exit 1
fi

echo -e "\n${GREEN}⏳ Waiting for container...${NC}"
for i in {1..10}; do
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Health check passed!${NC}"
        break
    fi
    echo "Waiting... ($i/10)"
    sleep 3
done

# Final status
echo -e "\n${GREEN}📊 Final Status:${NC}"
docker-compose ps

echo -e "\n${GREEN}🧪 Testing endpoints:${NC}"
curl -s http://localhost:3000/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/health

echo -e "\n${GREEN}🎉 Sonic Bundler is running in Docker!${NC}"
echo -e "\n${YELLOW}📋 Commands:${NC}"
echo "  docker-compose logs -f    # View logs"
echo "  docker-compose down       # Stop"
echo "  docker-compose restart    # Restart"
