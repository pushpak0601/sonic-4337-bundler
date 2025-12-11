#!/bin/bash
# Fix the effectiveGasPrice issue
sed -i '128s|const effectiveGasPrice = receipt.gasPrice || receipt.effectiveGasPrice || 0n;|const effectiveGasPrice = (receipt as any).gasPrice || (receipt as any).effectiveGasPrice || 0n;|' src/executor/BundleExecutor.ts
