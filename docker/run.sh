#!/bin/bash

echo "🚀 Running Sonic Bundler from docker/ folder"
echo "==========================================="

# Go to docker folder
cd "$(dirname "$0")"

# Create necessary directories in parent
mkdir -p ../data ../logs

# Check if .env exists in parent
if [ ! -f "../.env" ]; then
    echo "⚠️  Warning: ../.env not found"
    echo "Creating from template..."
    cp ../.env.example ../.env 2>/dev/null || echo "Could not create .env"
    echo "Please edit ../.env with your configuration"
fi

# Build and run
echo "Building Docker image..."
docker-compose build

echo "Starting services..."
docker-compose up -d

echo ""
echo "✅ Docker containers started!"
echo ""
echo "📊 Check status:"
echo "   docker-compose ps"
echo ""
echo "📋 View logs:"
echo "   docker-compose logs -f"
echo ""
echo "🌐 Health check:"
echo "   curl http://localhost:3000/health"
