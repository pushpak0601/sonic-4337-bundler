#!/bin/bash
echo "🔄 Updating bundler to use standard port 4337..."

cd ~/sonic-real-bundler

# 1. Update .env file
echo "1. Updating .env file..."
sed -i 's/PORT=3000/PORT=4337/' .env

# 2. Update package.json scripts if they reference port 3000
echo "2. Updating package.json..."
sed -i 's/:3000/:4337/g' package.json

# 3. Update index.ts default port
echo "3. Updating index.ts..."
sed -i "s/parseInt(process.env.PORT || '3000')/parseInt(process.env.PORT || '4337')/" src/index.ts

# 4. Update startup scripts
echo "4. Updating startup scripts..."
find scripts/ -name "*.sh" -o -name "*.js" | xargs sed -i 's/3000/4337/g' 2>/dev/null || true

# 5. Update documentation/comments
echo "5. Updating documentation..."
find . -name "*.md" -o -name "*.txt" | xargs sed -i 's/port 3000/port 4337/g' 2>/dev/null || true

# 6. Update frontend references (in case)
echo "6. Checking for port references..."
grep -r ":3000" . --include="*.js" --include="*.ts" --include="*.json" | grep -v node_modules

echo "✅ Port updated to 4337!"
echo "Restart bundler: npm run dev"
