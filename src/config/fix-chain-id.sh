#!/bin/bash
echo "🔄 Fixing Chain ID from 64165 to 14601 (Sonic Testnet)..."

cd ~/sonic-real-bundler

# 1. Fix BlockchainService.ts
echo "1. Fixing BlockchainService.ts..."
sed -i 's/this.chainId = 64165;/this.chainId = 14601; # Sonic Testnet/' src/blockchain/BlockchainService.ts
sed -i 's/this.chainId = 64165/this.chainId = 14601/' src/blockchain/BlockchainService.ts

# 2. Fix RPCServer.ts
echo "2. Fixing RPCServer.ts..."
# Fix health endpoint
sed -i 's/"chainId": 64165,/"chainId": 14601,/' src/rpc/RPCServer.ts
sed -i 's/chainId: 64165,/chainId: 14601,/' src/rpc/RPCServer.ts

# Fix eth_chainId RPC method
sed -i "s/'0xfa65'/'0x3919'/" src/rpc/RPCServer.ts  # 64165 -> 14601 in hex

# 3. Fix index.ts if it has hardcoded chain ID
echo "3. Fixing index.ts..."
sed -i 's/chainId = 64165/chainId = 14601/' src/index.ts

# 4. Fix any other references
echo "4. Fixing other references..."
grep -r "64165" src/ --include="*.ts" --include="*.js"

echo "✅ Chain ID fixes applied!"
echo "Restart bundler: npm run dev"
