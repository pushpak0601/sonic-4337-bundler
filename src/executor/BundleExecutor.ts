import { ethers } from 'ethers';
import { UserOperation } from '../types/index';
import { BlockchainService } from '../blockchain/BlockchainService';
import { DatabaseManager } from '../database/DatabaseManager';
import { MempoolManager } from '../mempool/MempoolManager';

export class BundleExecutor {
    private blockchainService: BlockchainService;
    private db: DatabaseManager;
    private mempool: MempoolManager;
    private beneficiary: string;
    private isExecuting: boolean = false;
    private executionInterval: NodeJS.Timeout | null = null;

    constructor(
        blockchainService: BlockchainService,
        databaseManager: DatabaseManager,
        mempoolManager: MempoolManager,
        beneficiary: string
    ) {
        this.blockchainService = blockchainService;
        this.db = databaseManager;
        this.mempool = mempoolManager;
        this.beneficiary = beneficiary;
    }

    async createBundle(): Promise<{
        userOps: UserOperation[];
        userOpHashes: string[];
        bundleHash: string;
    }> {
        const allUserOps = this.mempool.getAll();
        
        if (allUserOps.length === 0) {
            throw new Error('No UserOperations in mempool');
        }

        // Sort by maxFeePerGas (descending) for optimal revenue
        const sortedUserOps = [...allUserOps].sort((a, b) => {
            const feeA = BigInt(a.maxFeePerGas);
            const feeB = BigInt(b.maxFeePerGas);
            return feeA > feeB ? -1 : feeA < feeB ? 1 : 0;
        });

        // Take up to 10 UserOperations per bundle (gas limit consideration)
        const bundleUserOps = sortedUserOps.slice(0, 10);
        const userOpHashes: string[] = [];

        // Get hashes for all UserOperations in bundle
        for (const userOp of bundleUserOps) {
            try {
                const hash = await this.blockchainService.getUserOpHash(userOp);
                userOpHashes.push(hash);
            } catch (error) {
                console.error('Failed to get hash for UserOperation:', error);
                // Skip this UserOperation if hash cannot be computed
                continue;
            }
        }

        // Create bundle hash (hash of concatenated UserOperation hashes)
        const concatenatedHashes = userOpHashes.join('');
        const bundleHash = ethers.keccak256(ethers.toUtf8Bytes(concatenatedHashes));

        return {
            userOps: bundleUserOps,
            userOpHashes,
            bundleHash
        };
    }

    async executeBundle(): Promise<{
        success: boolean;
        bundleHash?: string;
        txHash?: string;
        error?: string;
        gasUsed?: bigint;
        gasCost?: bigint;
    }> {
        if (this.isExecuting) {
            return {
                success: false,
                error: 'Another bundle execution is in progress'
            };
        }

        this.isExecuting = true;

        try {
            // Create bundle
            const bundle = await this.createBundle();
            
            if (bundle.userOps.length === 0) {
                return {
                    success: false,
                    error: 'No valid UserOperations for bundling'
                };
            }

            console.log(`Executing bundle with ${bundle.userOps.length} UserOperations`);

            // Execute on blockchain
            const result = await this.blockchainService.handleOps(
                bundle.userOps,
                this.beneficiary
            );

            // Save bundle to database
            const bundleId = await this.db.saveBundle(
                bundle.bundleHash,
                result.txHash,
                bundle.userOpHashes
            );

            console.log(`Bundle ${bundleId} submitted: ${result.txHash}`);

            // Mark UserOperations as submitted
            for (const userOpHash of bundle.userOpHashes) {
                await this.mempool.markAsSubmitted(userOpHash, result.txHash);
            }

            // Wait for transaction confirmation
            const receipt = await this.blockchainService.waitForTransaction(result.txHash);

            if (receipt && receipt.status === 1) {
                // Transaction succeeded
                const gasUsed = receipt.gasUsed;
                const effectiveGasPrice = receipt.gasPrice || (receipt as any).effectiveGasPrice || 0n;
                const gasCost = gasUsed * effectiveGasPrice;

                // Update bundle status
                await this.db.updateBundleStatus(
                    bundle.bundleHash,
                    'confirmed',
                    receipt.blockNumber,
                    gasUsed.toString(),
                    gasCost.toString()
                );

                // Mark UserOperations as confirmed
                for (const userOpHash of bundle.userOpHashes) {
                    await this.mempool.markAsConfirmed(
                        userOpHash,
                        gasUsed.toString(),
                        gasCost.toString()
                    );
                }

                console.log(`Bundle confirmed in block ${receipt.blockNumber}`);
                console.log(`Gas used: ${gasUsed}, Gas cost: ${ethers.formatEther(gasCost)} SONIC`);

                return {
                    success: true,
                    bundleHash: bundle.bundleHash,
                    txHash: result.txHash,
                    gasUsed,
                    gasCost
                };

            } else {
                // Transaction failed
                const errorMessage = 'Transaction reverted';
                
                await this.db.updateBundleStatus(
                    bundle.bundleHash,
                    'failed'
                );

                for (const userOpHash of bundle.userOpHashes) {
                    await this.mempool.markAsFailed(userOpHash, errorMessage);
                }

                return {
                    success: false,
                    bundleHash: bundle.bundleHash,
                    txHash: result.txHash,
                    error: errorMessage
                };
            }

        } catch (error: any) {
            console.error('Bundle execution failed:', error);
            
            return {
                success: false,
                error: error.message
            };
        } finally {
            this.isExecuting = false;
        }
    }

    startAutoExecution(intervalMs: number = 15000): void {
        if (this.executionInterval) {
            clearInterval(this.executionInterval);
        }

        this.executionInterval = setInterval(async () => {
            const pendingCount = this.mempool.getPendingCount();
            
            if (pendingCount > 0) {
                console.log(`Auto-executing bundle (${pendingCount} pending UserOperations)`);
                
                try {
                    const result = await this.executeBundle();
                    
                    if (!result.success) {
                        console.error(`Auto-execution failed: ${result.error}`);
                    }
                } catch (error) {
                    console.error('Auto-execution error:', error);
                }
            }
        }, intervalMs);

        console.log(`Auto-execution started with interval ${intervalMs}ms`);
    }

    stopAutoExecution(): void {
        if (this.executionInterval) {
            clearInterval(this.executionInterval);
            this.executionInterval = null;
            console.log('Auto-execution stopped');
        }
    }

    getExecutionStatus(): {
        isExecuting: boolean;
        pendingCount: number;
    } {
        return {
            isExecuting: this.isExecuting,
            pendingCount: this.mempool.getPendingCount()
        };
    }
}
