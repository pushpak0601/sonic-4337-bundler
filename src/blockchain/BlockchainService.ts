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
        
        // IMPORTANT: Make sure EntryPointABI is the actual ABI array
        // If EntryPointABI is an object with an 'abi' property, use EntryPointABI.abi
        const abi = Array.isArray(EntryPointABI) ? EntryPointABI : 
                   (EntryPointABI as any).abi ? (EntryPointABI as any).abi : [];
        
        if (abi.length === 0) {
            throw new Error('Invalid EntryPoint ABI. Check src/abis/EntryPoint.json');
        }
        
        this.entryPointContract = new Contract(
            entryPointAddress,
            abi,
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
            // Note: simulateValidation doesn't return a value on success, it reverts on failure
            await entryPointWithSigner.simulateValidation.staticCall(userOp);
            
            // If we get here, simulation succeeded
            return { success: true, result: null };
            
        } catch (error: any) {
            // Parse the error to get validation result
            console.error('Validation error:', error);
            
            if (error.data) {
                try {
                    const decodedError = this.entryPointContract.interface.parseError(error.data);
                    return { 
                        success: false, 
                        error: decodedError?.name || 'Validation failed',
                        data: decodedError?.args 
                    };
                } catch (e) {
                    return { success: false, error: error.message };
                }
            }
            return { success: false, error: error.message };
        }
    }

    async getUserOpHash(userOp: UserOperation): Promise<string> {
        try {
            const hash = await this.entryPointContract.getUserOpHash.staticCall(userOp);
            return hash;
        } catch (error: any) {
            console.error('Failed to get UserOp hash:', error);
            throw new Error(`Failed to compute hash: ${error.message}`);
        }
    }

    async getNonce(sender: string, key: number = 0): Promise<string> {
        try {
            return await this.entryPointContract.getNonce(sender, key);
        } catch (error: any) {
            console.error('Failed to get nonce:', error);
            return '0x0'; // Return default if fails
        }
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
        return await this.provider.waitForTransaction(txHash);
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
        // Simple estimation for now
        return {
            preVerificationGas: '100000',
            verificationGasLimit: '100000',
            callGasLimit: '100000'
        };
    }
}
