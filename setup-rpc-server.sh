# 3. Create eth_sendUserOperation.ts if not exists
if [ ! -f "src/rpc/methods/eth_sendUserOperation.ts" ]; then
    echo "Creating eth_sendUserOperation.ts..."
    cat > src/rpc/methods/eth_sendUserOperation.ts << 'SENDUOP_EOF'
import { UserOperationValidator } from '../../validation/UserOperationValidator';
import { MempoolManager } from '../../mempool/MempoolManager';
import { MetricsCollector } from '../../monitoring/MetricsCollector';
import { UserOperation } from '../../types/index';
import { ethers } from 'ethers';

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

            console.log('📥 Received UserOperation:', {
                sender: userOp.sender,
                nonce: userOp.nonce,
                method: userOp.callData?.slice(0, 10) || 'empty',
                entryPoint
            });

            // Validate entry point
            if (entryPoint.toLowerCase() !== this.entryPointAddress.toLowerCase()) {
                console.error('❌ Invalid EntryPoint:', {
                    received: entryPoint,
                    expected: this.entryPointAddress
                });
                
                throw {
                    code: -32500,
                    message: \`Unsupported EntryPoint. Expected: \${this.entryPointAddress}, Received: \${entryPoint}\`
                };
            }

            // Validate UserOperation format
            const userOpFormatted = this.formatUserOperation(userOp);
            
            // Validate UserOperation
            console.log('🔍 Validating UserOperation...');
            const validation = await this.validator.validate(userOpFormatted);
            
            if (!validation.isValid) {
                console.error('❌ UserOperation validation failed:', validation.error);
                this.metrics.recordError('validation_failed', 'SendUserOperationMethod', validation.error);
                
                throw {
                    code: -32500,
                    message: 'UserOperation validation failed',
                    data: validation.error
                };
            }

            console.log('✅ Validation passed. UserOp Hash:', validation.userOpHash);
            
            // Add to mempool
            console.log('📥 Adding to mempool...');
            await this.mempool.add(userOpFormatted, validation.userOpHash!);
            
            console.log('🎯 UserOperation added to mempool successfully');
            
            return validation.userOpHash;

        } catch (error: any) {
            console.error('❌ eth_sendUserOperation error:', error.message || error);
            this.metrics.recordError('execution_failed', 'SendUserOperationMethod', error.message);
            throw error;
        } finally {
            const duration = Date.now() - startTime;
            console.log(\`⏱️ eth_sendUserOperation executed in \${duration}ms\`);
        }
    }

    private formatUserOperation(userOp: any): UserOperation {
        const formatted: UserOperation = {
            sender: this.ensureHex(userOp.sender, true).toLowerCase(),
            nonce: this.ensureHex(userOp.nonce),
            initCode: this.ensureHex(userOp.initCode || '0x'),
            callData: this.ensureHex(userOp.callData || '0x'),
            callGasLimit: this.ensureHex(userOp.callGasLimit || '0xf4240'),
            verificationGasLimit: this.ensureHex(userOp.verificationGasLimit || '0xf4240'),
            preVerificationGas: this.ensureHex(userOp.preVerificationGas || '0xf4240'),
            maxFeePerGas: this.ensureHex(userOp.maxFeePerGas || '0x3b9aca00'),
            maxPriorityFeePerGas: this.ensureHex(userOp.maxPriorityFeePerGas || '0x3b9aca00'),
            paymasterAndData: this.ensureHex(userOp.paymasterAndData || '0x'),
            signature: this.ensureHex(userOp.signature || '0x')
        };

        console.log('📝 Formatted UserOperation:', {
            sender: formatted.sender,
            nonce: formatted.nonce,
            callDataLength: ethers.dataLength(formatted.callData),
            callGasLimit: formatted.callGasLimit,
            maxFeePerGas: formatted.maxFeePerGas
        });

        return formatted;
    }

    private ensureHex(value: any, isAddress: boolean = false): string {
        if (!value && value !== 0) {
            return '0x';
        }

        let strValue = String(value);
        
        if (strValue.startsWith('0x')) {
            strValue = strValue.slice(2);
        }

        if (strValue === '' || strValue === '0') {
            return '0x';
        }

        if (isAddress) {
            strValue = strValue.padStart(40, '0').slice(0, 40);
            return \`0x\${strValue.toLowerCase()}\`;
        }

        if (strValue.length % 2 !== 0) {
            strValue = '0' + strValue;
        }

        return \`0x\${strValue.toLowerCase()}\`;
    }

    async estimateGas(params: any[]): Promise<any> {
        try {
            if (params.length < 2) {
                throw {
                    code: -32602,
                    message: 'Invalid params: expected [userOp, entryPoint]'
                };
            }

            const [userOp, entryPoint] = params;

            if (entryPoint.toLowerCase() !== this.entryPointAddress.toLowerCase()) {
                throw {
                    code: -32500,
                    message: \`Unsupported EntryPoint. Supported: \${this.entryPointAddress}\`
                };
            }

            const userOpFormatted = this.formatUserOperation(userOp);
            const gasEstimate = await this.validator.estimateGas(userOpFormatted);
            
            return gasEstimate;
            
        } catch (error: any) {
            console.error('Gas estimation failed:', error);
            
            return {
                preVerificationGas: '0xf4240',
                verificationGasLimit: '0xf4240',
                callGasLimit: '0xf4240'
            };
        }
    }
}
SENDUOP_EOF
fi
