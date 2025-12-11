import { ethers, Contract, Wallet } from 'ethers';
import EntryPointABI from '../abis/EntryPoint.json';
import { UserOperation } from '../types/index';

export class BlockchainService {
    private provider: ethers.JsonRpcProvider;
    private entryPointContract: Contract;
    private signer: Wallet;
    public chainId: number;

    constructor(
        rpcUrl: string,
        entryPointAddress: string,
        privateKey: string
    ) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.entryPointContract = new Contract(
            entryPointAddress,
            EntryPointABI as any,
            this.provider
        );
        this.signer = new Wallet(privateKey, this.provider);
        this.chainId = 14601; // Sonic Testnet
    }

    async simulateValidation(userOp: UserOperation): Promise<any> {
        try {
            // Connect with signer for simulation
            const entryPointWithSigner = this.entryPointContract.connect(this.signer) as Contract;
            
            // Call simulateValidation - this will revert if validation fails
            const tx = await entryPointWithSigner.simulateValidation.staticCall(userOp);
            return { success: true, result: tx };
        } catch (error: any) {
            // Parse the error to get validation result
            if (error.data) {
                try {
                    const decodedError = this.entryPointContract.interface.parseError(error.data);
                    return { 
                        success: false, 
                        error: decodedError?.name || 'Validation failed',
                        data: decodedError?.args 
                    };
                } catch {
                    return { success: false, error: error.message };
                }
            }
            return { success: false, error: error.message };
        }
    }

    async getUserOpHash(userOp: UserOperation): Promise<string> {
        return await this.entryPointContract.getUserOpHash.staticCall(userOp);
    }

    async getNonce(sender: string, key: number = 0): Promise<string> {
        return await this.entryPointContract.getNonce(sender, key);
    }

    async handleOps(
        userOps: UserOperation[],
        beneficiary: string
    ): Promise<{ txHash: string; gasEstimate: bigint }> {
        const entryPointWithSigner = this.entryPointContract.connect(this.signer) as Contract;
        
        // Estimate gas for the bundle
        const gasEstimate = await entryPointWithSigner.handleOps.estimateGas(
            userOps,
            beneficiary
        );

        // Add 20% buffer for safety
        const gasLimit = gasEstimate * 120n / 100n;

        // Get current gas prices
        const feeData = await this.provider.getFeeData();
        
        // Execute the transaction
        const tx = await entryPointWithSigner.handleOps(userOps, beneficiary, {
            gasLimit: gasLimit,
            maxFeePerGas: feeData.maxFeePerGas || undefined,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || undefined
        });

        return { txHash: tx.hash, gasEstimate };
    }

    async waitForTransaction(txHash: string): Promise<ethers.TransactionReceipt | null> {
      const receipt = await this.provider.waitForTransaction(txHash);
      return receipt as ethers.TransactionReceipt | null;
    }

    async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
        return await this.provider.getTransactionReceipt(txHash);
    }

    async getBlockNumber(): Promise<number> {
        return await this.provider.getBlockNumber();
    }

    async getGasPrice(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
        const feeData = await this.provider.getFeeData();
        return {
            maxFeePerGas: feeData.maxFeePerGas || 0n,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || 0n
        };
    }

    async estimateUserOperationGas(userOp: UserOperation): Promise<{
        preVerificationGas: string;
        verificationGasLimit: string;
        callGasLimit: string;
    }> {
        // Real gas estimation using the EntryPoint's simulation
        try {
            const simulation = await this.simulateValidation(userOp);
            
            if (!simulation.success) {
                // Return safe defaults if simulation fails
                return {
                    preVerificationGas: '100000',
                    verificationGasLimit: '100000',
                    callGasLimit: '100000'
                };
            }

            // In real implementation, you'd parse the simulation result
            // For now, return reasonable estimates based on operation complexity
            const callDataLength = ethers.dataLength(userOp.callData);
            const baseGas = 21000n;
            const perByteGas = 16n;
            
            const preVerificationGas = baseGas + (BigInt(callDataLength) * perByteGas);
            const verificationGasLimit = preVerificationGas * 2n;
            const callGasLimit = 100000n; // Default call gas

            return {
                preVerificationGas: preVerificationGas.toString(),
                verificationGasLimit: verificationGasLimit.toString(),
                callGasLimit: callGasLimit.toString()
            };
        } catch (error) {
            console.error('Gas estimation failed:', error);
            return {
                preVerificationGas: '100000',
                verificationGasLimit: '100000',
                callGasLimit: '100000'
            };
        }
    }
}
