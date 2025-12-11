import { ethers } from 'ethers';
import { UserOperation } from '../types/index';
import { BlockchainService } from '../blockchain/BlockchainService';

export class UserOperationValidator {
  private blockchainService: BlockchainService;

  constructor(blockchainService: BlockchainService, private entryPointAddress: string) {
    this.blockchainService = blockchainService;
  }

  async validate(userOp: UserOperation): Promise<{
    isValid: boolean;
    error?: string;
    userOpHash?: string;
    validationData?: any;
  }> {
    // 1. Basic format validation
    const formatValidation = this.validateFormat(userOp);
    if (!formatValidation.isValid) {
      return formatValidation;
    }

    // 2. Get UserOperation hash
    let userOpHash: string;
    try {
      userOpHash = await this.blockchainService.getUserOpHash(userOp);
    } catch (error: any) {
      return {
        isValid: false,
        error: `Failed to compute UserOperation hash: ${error.message}`
      };
    }

    // 3. Check nonce (real blockchain call)
    try {
      const currentNonce = await this.blockchainService.getNonce(userOp.sender);
      const opNonce = BigInt(userOp.nonce);
      
      if (opNonce < BigInt(currentNonce)) {
        return {
          isValid: false,
          error: `Nonce too low. Current: ${currentNonce}, Provided: ${userOp.nonce}`,
          userOpHash
        };
      }
    } catch (error: any) {
      return {
        isValid: false,
        error: `Failed to check nonce: ${error.message}`,
        userOpHash
      };
    }

    // 4. Real simulation through EntryPoint
    try {
      const simulation = await this.blockchainService.simulateValidation(userOp);
      
      if (!simulation.success) {
        return {
          isValid: false,
          error: `Validation simulation failed: ${simulation.error}`,
          userOpHash,
          validationData: simulation.data
        };
      }

      return {
        isValid: true,
        userOpHash,
        validationData: simulation.data
      };

    } catch (error: any) {
      return {
        isValid: false,
        error: `Validation error: ${error.message}`,
        userOpHash
      };
    }
  }

  private validateFormat(userOp: UserOperation): { isValid: boolean; error?: string } {
    // Check required fields
    const requiredFields = [
      'sender', 'nonce', 'callData', 'callGasLimit',
      'verificationGasLimit', 'preVerificationGas',
      'maxFeePerGas', 'maxPriorityFeePerGas', 'signature'
    ];

    for (const field of requiredFields) {
      if (!userOp[field as keyof UserOperation]) {
        return {
          isValid: false,
          error: `Missing required field: ${field}`
        };
      }
    }

    // Validate addresses
    if (!ethers.isAddress(userOp.sender)) {
      return {
        isValid: false,
        error: `Invalid sender address: ${userOp.sender}`
      };
    }

    // Validate numeric fields
    const numericFields = [
      'nonce', 'callGasLimit', 'verificationGasLimit',
      'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas'
    ];

    for (const field of numericFields) {
      const value = userOp[field as keyof UserOperation];
      if (!value || isNaN(parseInt(value))) {
        return {
          isValid: false,
          error: `Invalid numeric value for ${field}: ${value}`
        };
      }
    }

    // Validate paymaster if present
    if (userOp.paymasterAndData && userOp.paymasterAndData !== '0x') {
      const paymasterAddress = userOp.paymasterAndData.slice(0, 42);
      if (!ethers.isAddress(paymasterAddress)) {
        return {
          isValid: false,
          error: `Invalid paymaster address in paymasterAndData`
        };
      }
    }

    return { isValid: true };
  }

  async estimateGas(userOp: UserOperation): Promise<{
    preVerificationGas: string;
    verificationGasLimit: string;
    callGasLimit: string;
  }> {
    return await this.blockchainService.estimateUserOperationGas(userOp);
  }
}
