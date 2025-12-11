#!/bin/bash

echo "🔧 Final Fix for Remaining Errors"
echo "================================="

cd ~/sonic-real-bundler

# 1. Fix type import in BlockchainService
echo "1. Fixing type import..."
sed -i "s|import { UserOperation } from '../types/index/index';|import { UserOperation } from '../types/index';|" src/blockchain/BlockchainService.ts

# 2. Fix effectiveGasPrice in BundleExecutor
echo "2. Fixing effectiveGasPrice..."
sed -i '128s|const effectiveGasPrice = receipt.gasPrice || receipt.effectiveGasPrice || 0n;|const effectiveGasPrice = (receipt as any).gasPrice || (receipt as any).effectiveGasPrice || 0n;|' src/executor/BundleExecutor.ts

# 3. Fix RPC types
echo "3. Fixing RPC types..."
cat > src/types/index.ts << 'TYPESEOF'
export interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

export interface UserOperationReceipt {
  userOpHash: string;
  sender: string;
  nonce: string;
  actualGasCost: string;
  actualGasUsed: string;
  success: boolean;
  logs: any[];
  receipt: any;
}

export interface RPCRequest {
  jsonrpc: string;
  method: string;
  params: any[];
  id: number | string | null;
}

export interface RPCResponse {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number | string | null;
}

export interface BundleResult {
  success: boolean;
  bundleHash?: string;
  txHash?: string;
  error?: string;
  gasUsed?: bigint;
  gasCost?: bigint;
}
TYPESEOF

# 4. Fix RPC Server ID handling
echo "4. Fixing RPC Server..."
sed -i '73s|id: rpcRequest.id || null|id: rpcRequest.id !== null && rpcRequest.id !== undefined ? rpcRequest.id : 1|' src/rpc/RPCServer.ts

echo "✅ All fixes applied!"
echo "Try building: npm run build"
