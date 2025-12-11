import { UserOperationValidator } from '../../validation/UserOperationValidator';
import { MempoolManager } from '../../mempool/MempoolManager';
import { MetricsCollector } from '../../monitoring/MetricsCollector';
import { UserOperation } from '../../types/index';

export class SendUserOperationMethod {
  constructor(
    private validator: UserOperationValidator,
    private mempool: MempoolManager,
    private metrics: MetricsCollector,
    private entryPointAddress: string
  ) {}

  async execute(params: any[]): Promise<any> {
    const startTime = Date.now();
    
    try {
      if (params.length < 2) {
        throw {
          code: -32602,
          message: 'Invalid params: expected [userOp, entryPoint]'
        };
      }

      const [userOp, entryPoint] = params;

      // Validate entry point
      if (entryPoint.toLowerCase() !== this.entryPointAddress.toLowerCase()) {
        throw {
          code: -32500,
          message: `Unsupported EntryPoint. Supported: ${this.entryPointAddress}`
        };
      }

      // Validate UserOperation
      const validation = await this.validator.validate(userOp as UserOperation);
      
      if (!validation.isValid) {
        this.metrics.recordUserOpReceived('rejected');
        throw {
          code: -32500,
          message: 'UserOperation validation failed',
          data: validation.error
        };
      }

      // Add to mempool
      await this.mempool.add(userOp as UserOperation, validation.userOpHash!);
      
      this.metrics.recordUserOpReceived('accepted');
      this.metrics.recordRpcRequest('eth_sendUserOperation', 'success');

      return validation.userOpHash;

    } catch (error: any) {
      this.metrics.recordError('rpc_method_error');
      this.metrics.recordRpcRequest('eth_sendUserOperation', 'error');
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      console.log(`eth_sendUserOperation executed in ${duration}ms`);
    }
  }
}
