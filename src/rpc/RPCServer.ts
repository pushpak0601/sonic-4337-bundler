import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { UserOperationValidator } from '../validation/UserOperationValidator';
import { MempoolManager } from '../mempool/MempoolManager';
import { DatabaseManager } from '../database/DatabaseManager';
import { RPCRequest, RPCResponse, UserOperation } from '../types/index';

export class RPCServer {
    private app: Express;
    private port: number;
    private validator: UserOperationValidator;
    private mempool: MempoolManager;
    private db: DatabaseManager;
    private entryPointAddress: string;

    constructor(
        port: number,
        validator: UserOperationValidator,
        mempool: MempoolManager,
        databaseManager: DatabaseManager,
        entryPointAddress: string
    ) {
        this.app = express();
        this.port = port;
        this.validator = validator;
        this.mempool = mempool;
        this.db = databaseManager;
        this.entryPointAddress = entryPointAddress;
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(bodyParser.json({ limit: '10mb' }));
        this.app.use(morgan('combined'));
    }

    private setupRoutes(): void {
        // Health endpoint
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({
                status: 'healthy',
                chainId: 64165,
                entryPoint: this.entryPointAddress,
                mempoolSize: this.mempool.getPendingCount(),
                timestamp: new Date().toISOString()
            });
        });

        // JSON-RPC endpoint
        this.app.post('/', async (req: Request, res: Response) => {
            const rpcRequest: RPCRequest = req.body;
            
            try {
                const response = await this.handleRPCRequest(rpcRequest);
                res.json(response);
            } catch (error: any) {
                console.error('RPC Error:', error);
                
                const response: RPCResponse = {
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal error',
                        data: error.message
                    },
                    id: rpcRequest.id || null
                };
                
                res.status(500).json(response);
            }
        });

        // Get UserOperation receipt
        this.app.get('/userOp/:hash', async (req: Request, res: Response) => {
            const userOpHash = req.params.hash;
            
            try {
                const userOpData = await this.db.getUserOperationByHash(userOpHash);
                
                if (!userOpData) {
                    res.status(404).json({ error: 'UserOperation not found' });
                    return;
                }
                
                res.json(userOpData);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get mempool status
        this.app.get('/mempool', (req: Request, res: Response) => {
            res.json({
                pendingCount: this.mempool.getPendingCount(),
                userOperations: this.mempool.getAll().map(op => ({
                    sender: op.sender,
                    nonce: op.nonce,
                    maxFeePerGas: op.maxFeePerGas
                }))
            });
        });
    }

    private async handleRPCRequest(request: RPCRequest): Promise<RPCResponse> {
        const { method, params = [], id } = request;

        switch (method) {
            case 'eth_sendUserOperation':
                return await this.handleSendUserOperation(params, id);
                
            case 'eth_estimateUserOperationGas':
                return await this.handleEstimateUserOperationGas(params, id);
                
            case 'eth_getUserOperationReceipt':
                return await this.handleGetUserOperationReceipt(params, id);
                
            case 'eth_supportedEntryPoints':
                return this.handleSupportedEntryPoints(id);
                
            case 'eth_chainId':
                return this.handleChainId(id);
                
            default:
                return {
                    jsonrpc: '2.0',
                    error: {
                        code: -32601,
                        message: `Method not found: ${method}`
                    },
                    id
                };
        }
    }

    private async handleSendUserOperation(params: any[], id: any): Promise<RPCResponse> {
        if (params.length < 2) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32602,
                    message: 'Invalid params: expected [userOp, entryPoint]'
                },
                id
            };
        }

        const [userOp, entryPoint] = params;

        // Verify EntryPoint matches
        if (entryPoint.toLowerCase() !== this.entryPointAddress.toLowerCase()) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32500,
                    message: `Unsupported EntryPoint. Supported: ${this.entryPointAddress}`
                },
                id
            };
        }

        // Validate UserOperation
        const validation = await this.validator.validate(userOp as UserOperation);
        
        if (!validation.isValid) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32500,
                    message: 'UserOperation validation failed',
                    data: validation.error
                },
                id
            };
        }

        // Add to mempool
        try {
            await this.mempool.add(userOp as UserOperation, validation.userOpHash!);
            
            console.log(`UserOperation added to mempool: ${validation.userOpHash}`);
            
            return {
                jsonrpc: '2.0',
                result: validation.userOpHash,
                id
            };
            
        } catch (error: any) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32500,
                    message: 'Failed to add UserOperation to mempool',
                    data: error.message
                },
                id
            };
        }
    }

    private async handleEstimateUserOperationGas(params: any[], id: any): Promise<RPCResponse> {
        if (params.length < 2) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32602,
                    message: 'Invalid params: expected [userOp, entryPoint]'
                },
                id
            };
        }

        const [userOp, entryPoint] = params;

        if (entryPoint.toLowerCase() !== this.entryPointAddress.toLowerCase()) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32500,
                    message: `Unsupported EntryPoint. Supported: ${this.entryPointAddress}`
                },
                id
            };
        }

        try {
            const gasEstimate = await this.validator.estimateGas(userOp as UserOperation);
            
            return {
                jsonrpc: '2.0',
                result: gasEstimate,
                id
            };
            
        } catch (error: any) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32500,
                    message: 'Gas estimation failed',
                    data: error.message
                },
                id
            };
        }
    }

    private async handleGetUserOperationReceipt(params: any[], id: any): Promise<RPCResponse> {
        if (params.length < 1) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32602,
                    message: 'Invalid params: expected [userOpHash]'
                },
                id
            };
        }

        const [userOpHash] = params;

        try {
            const userOpData = await this.db.getUserOperationByHash(userOpHash);
            
            if (!userOpData) {
                return {
                    jsonrpc: '2.0',
                    result: null,
                    id
                };
            }

            // Format response according to ERC-4337 spec
            const receipt = {
                userOpHash: userOpData.user_op_hash,
                entryPoint: this.entryPointAddress,
                sender: userOpData.sender,
                nonce: userOpData.nonce,
                paymaster: userOpData.paymaster_and_data?.slice(0, 42) || null,
                actualGasCost: userOpData.gas_cost || '0x0',
                actualGasUsed: userOpData.gas_used || '0x0',
                success: userOpData.status === 'confirmed',
                reason: userOpData.error_message || null,
                logs: [],
                receipt: {
                    transactionHash: userOpData.tx_hash,
                    transactionIndex: '0x0',
                    blockHash: '0x0',
                    blockNumber: '0x0',
                    from: this.entryPointAddress,
                    to: userOpData.sender,
                    cumulativeGasUsed: userOpData.gas_used || '0x0',
                    gasUsed: userOpData.gas_used || '0x0',
                    logs: [],
                    logsBloom: '0x',
                    status: userOpData.status === 'confirmed' ? '0x1' : '0x0',
                    effectiveGasPrice: '0x0'
                }
            };

            return {
                jsonrpc: '2.0',
                result: receipt,
                id
            };
            
        } catch (error: any) {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal error while fetching receipt',
                    data: error.message
                },
                id
            };
        }
    }

    private handleSupportedEntryPoints(id: any): RPCResponse {
        return {
            jsonrpc: '2.0',
            result: [this.entryPointAddress],
            id
        };
    }

    private handleChainId(id: any): RPCResponse {
        return {
            jsonrpc: '2.0',
            result: '0x3919', // 14601 in hex for Sonic Testnet
            id
        };
    }

    start(): void {
        this.app.listen(this.port, () => {
            console.log(`🚀 Sonic Bundler RPC Server started on port ${this.port}`);
            console.log(`📡 RPC Endpoint: http://localhost:${this.port}/`);
            console.log(`🏥 Health Check: http://localhost:${this.port}/health`);
            console.log(`🔗 EntryPoint: ${this.entryPointAddress}`);
            console.log(`⛓️  Chain ID: 14601 (Sonic Testnet)`);
        });
    }
}
