import sqlite3 from 'sqlite3';
import { UserOperation } from '../types/index';

export class DatabaseManager {
    private db: sqlite3.Database;

    constructor(databasePath: string = './bundler.db') {
        this.db = new sqlite3.Database(databasePath);
        this.initializeDatabase();
    }

    private initializeDatabase(): void {
        // Create tables
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_op_hash TEXT UNIQUE NOT NULL,
                sender TEXT NOT NULL,
                nonce TEXT NOT NULL,
                call_data TEXT NOT NULL,
                call_gas_limit TEXT NOT NULL,
                verification_gas_limit TEXT NOT NULL,
                pre_verification_gas TEXT NOT NULL,
                max_fee_per_gas TEXT NOT NULL,
                max_priority_fee_per_gas TEXT NOT NULL,
                paymaster_and_data TEXT,
                signature TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                submitted_at DATETIME,
                confirmed_at DATETIME,
                tx_hash TEXT,
                gas_used TEXT,
                gas_cost TEXT,
                error_message TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_user_ops_status ON user_operations(status);
            CREATE INDEX IF NOT EXISTS idx_user_ops_sender ON user_operations(sender);

            CREATE TABLE IF NOT EXISTS bundles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bundle_hash TEXT UNIQUE NOT NULL,
                tx_hash TEXT NOT NULL,
                user_op_count INTEGER NOT NULL,
                total_gas_used TEXT,
                total_gas_cost TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                submitted_at DATETIME,
                confirmed_at DATETIME,
                block_number INTEGER
            );
        `, (err) => {
            if (err) console.error('Database initialization error:', err);
        });
    }

    async saveUserOperation(userOp: UserOperation, userOpHash: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO user_operations (
                    user_op_hash, sender, nonce, call_data, call_gas_limit,
                    verification_gas_limit, pre_verification_gas, max_fee_per_gas,
                    max_priority_fee_per_gas, paymaster_and_data, signature, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                userOpHash,
                userOp.sender,
                userOp.nonce,
                userOp.callData,
                userOp.callGasLimit,
                userOp.verificationGasLimit,
                userOp.preVerificationGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas,
                userOp.paymasterAndData || null,
                userOp.signature,
                'pending',
                (err: Error | null) => {
                    if (err) reject(err);
                    else resolve();
                }
            );

            stmt.finalize();
        });
    }

    async saveBundle(bundleHash: string, txHash: string, userOpHashes: string[]): Promise<number> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO bundles (bundle_hash, tx_hash, user_op_count, status) VALUES (?, ?, ?, 'submitted')`,
                [bundleHash, txHash, userOpHashes.length],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async updateBundleStatus(
        bundleHash: string,
        status: string,
        blockNumber?: number,
        totalGasUsed?: string,
        totalGasCost?: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            let query = `UPDATE bundles SET status = ?`;
            const params: any[] = [status];

            if (blockNumber !== undefined) {
                query += ', block_number = ?';
                params.push(blockNumber);
            }
            if (totalGasUsed) {
                query += ', total_gas_used = ?';
                params.push(totalGasUsed);
            }
            if (totalGasCost) {
                query += ', total_gas_cost = ?';
                params.push(totalGasCost);
            }
            if (status === 'confirmed') {
                query += ', confirmed_at = CURRENT_TIMESTAMP';
            }

            query += ' WHERE bundle_hash = ?';
            params.push(bundleHash);

            this.db.run(query, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async getUserOperationByHash(userOpHash: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM user_operations WHERE user_op_hash = ?`,
                [userOpHash],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async getPendingUserOperations(limit: number = 100): Promise<any[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM user_operations WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async updateUserOperationStatus(
        userOpHash: string,
        status: string,
        txHash?: string,
        gasUsed?: string,
        gasCost?: string,
        errorMessage?: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            let query = `UPDATE user_operations SET status = ?`;
            const params: any[] = [status];

            if (txHash) {
                query += ', tx_hash = ?';
                params.push(txHash);
            }
            if (gasUsed) {
                query += ', gas_used = ?';
                params.push(gasUsed);
            }
            if (gasCost) {
                query += ', gas_cost = ?';
                params.push(gasCost);
            }
            if (errorMessage) {
                query += ', error_message = ?';
                params.push(errorMessage);
            }
            if (status === 'submitted') {
                query += ', submitted_at = CURRENT_TIMESTAMP';
            } else if (status === 'confirmed') {
                query += ', confirmed_at = CURRENT_TIMESTAMP';
            }

            query += ' WHERE user_op_hash = ?';
            params.push(userOpHash);

            this.db.run(query, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}
