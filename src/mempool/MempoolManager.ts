import { UserOperation } from '../types/index';
import { DatabaseManager } from '../database/DatabaseManager';

export class MempoolManager {
    private db: DatabaseManager;
    private inMemoryMempool: Map<string, UserOperation> = new Map();
    private senderNonces: Map<string, Set<string>> = new Map();

    constructor(databaseManager: DatabaseManager) {
        this.db = databaseManager;
        this.loadFromDatabase();
    }

    private async loadFromDatabase(): Promise<void> {
        try {
            const pendingOps = await this.db.getPendingUserOperations();
            
            for (const op of pendingOps) {
                const userOp: UserOperation = {
                    sender: op.sender,
                    nonce: op.nonce,
                    initCode: op.init_code || '0x',
                    callData: op.call_data,
                    callGasLimit: op.call_gas_limit,
                    verificationGasLimit: op.verification_gas_limit,
                    preVerificationGas: op.pre_verification_gas,
                    maxFeePerGas: op.max_fee_per_gas,
                    maxPriorityFeePerGas: op.max_priority_fee_per_gas,
                    paymasterAndData: op.paymaster_and_data || '0x',
                    signature: op.signature
                };

                this.inMemoryMempool.set(op.user_op_hash, userOp);
                
                // Track nonces
                const sender = userOp.sender.toLowerCase();
                const nonces = this.senderNonces.get(sender) || new Set();
                nonces.add(userOp.nonce);
                this.senderNonces.set(sender, nonces);
            }

            console.log(`Loaded ${pendingOps.length} pending UserOperations from database`);
        } catch (error) {
            console.error('Failed to load mempool from database:', error);
        }
    }

    async add(userOp: UserOperation, userOpHash: string): Promise<void> {
        const sender = userOp.sender.toLowerCase();
        
        // Check for duplicates
        if (this.inMemoryMempool.has(userOpHash)) {
            throw new Error('UserOperation already in mempool');
        }

        // Check nonce conflicts
        const existingNonces = this.senderNonces.get(sender);
        if (existingNonces?.has(userOp.nonce)) {
            throw new Error(`Nonce ${userOp.nonce} already used by sender ${sender}`);
        }

        // Add to in-memory cache
        this.inMemoryMempool.set(userOpHash, userOp);
        
        // Update nonce tracking
        const nonces = existingNonces || new Set();
        nonces.add(userOp.nonce);
        this.senderNonces.set(sender, nonces);

        // Persist to database
        await this.db.saveUserOperation(userOp, userOpHash);
    }

    get(userOpHash: string): UserOperation | undefined {
        return this.inMemoryMempool.get(userOpHash);
    }

    async remove(userOpHash: string): Promise<void> {
        const userOp = this.inMemoryMempool.get(userOpHash);
        if (userOp) {
            // Remove from in-memory cache
            this.inMemoryMempool.delete(userOpHash);
            
            const sender = userOp.sender.toLowerCase();
            const nonces = this.senderNonces.get(sender);
            if (nonces) {
                nonces.delete(userOp.nonce);
                if (nonces.size === 0) {
                    this.senderNonces.delete(sender);
                }
            }
            
            // Update database status
            await this.db.updateUserOperationStatus(userOpHash, 'removed');
        }
    }

    async markAsSubmitted(userOpHash: string, txHash: string): Promise<void> {
        await this.db.updateUserOperationStatus(userOpHash, 'submitted', txHash);
    }

    async markAsConfirmed(userOpHash: string, gasUsed: string, gasCost: string): Promise<void> {
        await this.db.updateUserOperationStatus(
            userOpHash,
            'confirmed',
            undefined,
            gasUsed,
            gasCost
        );
        
        // Remove from in-memory cache after confirmation
        this.inMemoryMempool.delete(userOpHash);
        
        const userOp = this.inMemoryMempool.get(userOpHash);
        if (userOp) {
            const sender = userOp.sender.toLowerCase();
            const nonces = this.senderNonces.get(sender);
            if (nonces) {
                nonces.delete(userOp.nonce);
            }
        }
    }

    async markAsFailed(userOpHash: string, errorMessage: string): Promise<void> {
        await this.db.updateUserOperationStatus(
            userOpHash,
            'failed',
            undefined,
            undefined,
            undefined,
            errorMessage
        );
        
        this.inMemoryMempool.delete(userOpHash);
    }

    getAll(): UserOperation[] {
        return Array.from(this.inMemoryMempool.values());
    }

    getBySender(sender: string): UserOperation[] {
        const senderLower = sender.toLowerCase();
        return Array.from(this.inMemoryMempool.values())
            .filter(op => op.sender.toLowerCase() === senderLower);
    }

    getPendingCount(): number {
        return this.inMemoryMempool.size;
    }

    clear(): void {
        this.inMemoryMempool.clear();
        this.senderNonces.clear();
    }
}
