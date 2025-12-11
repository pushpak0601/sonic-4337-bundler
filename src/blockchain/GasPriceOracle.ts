import { ethers } from 'ethers';

export class GasPriceOracle {
  private provider: ethers.JsonRpcProvider;
  private gasPriceCache: {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    timestamp: number;
  } | null = null;
  private cacheDuration = 15000; // 15 seconds

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  async getGasPrice(): Promise<{
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  }> {
    // Check cache
    if (this.gasPriceCache && 
        Date.now() - this.gasPriceCache.timestamp < this.cacheDuration) {
      return {
        maxFeePerGas: this.gasPriceCache.maxFeePerGas.toString(),
        maxPriorityFeePerGas: this.gasPriceCache.maxPriorityFeePerGas.toString()
      };
    }

    try {
      const feeData = await this.provider.getFeeData();
      
      // For Sonic Testnet, use reasonable defaults if fee data is not available
      let maxFeePerGas = feeData.maxFeePerGas || 1000000000n; // 1 Gwei
      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n;

      // Apply multipliers from config
      const multiplier = parseFloat(process.env.MAX_FEE_PER_GAS_MULTIPLIER || '1.5');
      maxFeePerGas = maxFeePerGas * BigInt(Math.floor(multiplier * 100)) / 100n;

      // Cache the result
      this.gasPriceCache = {
        maxFeePerGas,
        maxPriorityFeePerGas,
        timestamp: Date.now()
      };

      return {
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString()
      };

    } catch (error) {
      console.error('Failed to fetch gas price:', error);
      
      // Fallback to hardcoded values for Sonic Testnet
      return {
        maxFeePerGas: '1500000000', // 1.5 Gwei
        maxPriorityFeePerGas: '1500000000'
      };
    }
  }

  async estimateGasForUserOp(
    userOp: any
  ): Promise<{
    preVerificationGas: string;
    verificationGasLimit: string;
    callGasLimit: string;
  }> {
    // Sonic Testnet specific gas estimation
    const baseGas = 21000n;
    
    // Calculate based on call data length
    const callDataLength = ethers.dataLength(userOp.callData) || 0;
    const dataGas = BigInt(callDataLength) * 16n;
    
    // Basic estimation formula for Sonic
    const preVerificationGas = (baseGas + dataGas) * 12n / 10n; // +20%
    const verificationGasLimit = preVerificationGas * 2n;
    
    // Default call gas, can be overridden by user
    const callGasLimit = BigInt(userOp.callGasLimit || '100000');

    return {
      preVerificationGas: preVerificationGas.toString(),
      verificationGasLimit: verificationGasLimit.toString(),
      callGasLimit: callGasLimit.toString()
    };
  }
}
