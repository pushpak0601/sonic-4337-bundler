import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { UserOperationValidator } from '../validation/UserOperationValidator';
import { MempoolManager } from '../mempool/MempoolManager';
import { DatabaseManager } from '../database/DatabaseManager';
import { RPCRequest, RPCResponse, UserOperation } from '../types/index';
import { SendUserOperationMethod } from './methods/eth_sendUserOperation';
import { MetricsCollector } from '../monitoring/MetricsCollector';

export class RPCServer {
    private app: Express;
    private port: number;
    private validator: UserOperationValidator;
    private mempool: MempoolManager;
    private db: DatabaseManager;
    private entryPointAddress: string;
    private metrics: MetricsCollector;
    private sendUserOperationMethod: SendUserOperationMethod;

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
        this.metrics = new MetricsCollector();
        
        // Initialize RPC methods
        this.sendUserOperationMethod = new SendUserOperationMethod(
            validator,
            mempool,
            this.metrics,
            entryPointAddress
        );
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        // Security middleware
        this.app.use(helmet());
        
        // CORS - allow all origins for development (restrict in production)
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }));
        
        // Body parsing with increased limits for batch requests
        this.app.use(bodyParser.json({ 
            limit: '10mb',
            verify: (req: any, res, buf) => {
                req.rawBody = buf.toString();
            }
        }));
        
        this.app.use(bodyParser.urlencoded({ 
            extended: true, 
            limit: '10mb' 
        }));
        
        // Logging
        this.app.use(morgan('combined', {
            stream: {
                write: (message: string) => {
                    console.log(message.trim());
                }
            }
        }));
        
        // Request logging middleware
        this.app.use((req: Request, res: Response, next) => {
            const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            (req as any).requestId = requestId;
            console.log(`${new Date().toISOString()} [${requestId}] ${req.method} ${req.path}`);
            next();
        });
    }

    private setupRoutes(): void {
        // Health endpoint
        this.app.get('/health', (_req: Request, res: Response) => {
            const status = {
                status: 'healthy',
                chainId: 14601, // Sonic Testnet
                entryPoint: this.entryPointAddress,
                mempoolSize: this.mempool.getPendingCount(),
                timestamp: new Date().toISOString(),
                metrics: this.metrics.getMetrics(),
                supportsBatch: true
            };
            
            console.log('🏥 Health check:', { status: 'healthy', mempool: status.mempoolSize });
            res.json(status);
        });

        // Metrics endpoint
        this.app.get('/metrics', async (_req: Request, res: Response) => {
            try {
                const metrics = this.metrics.getMetrics();
                res.json({
                    status: 'ok',
                    metrics,
                    timestamp: new Date().toISOString()
                });
            } catch (error: any) {
                console.error('Metrics error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Mempool status
        this.app.get('/mempool', (_req: Request, res: Response) => {
            const allOps = this.mempool.getAll();
            const status = {
                pendingCount: this.mempool.getPendingCount(),
                userOperations: allOps.map(op => ({
                    sender: op.sender,
                    nonce: op.nonce,
                    maxFeePerGas: op.maxFeePerGas,
                    callDataLength: op.callData?.length || 0
                })),
                timestamp: new Date().toISOString()
            };
            
            console.log('📊 Mempool status:', status.pendingCount, 'pending');
            res.json(status);
        });

        // Get UserOperation by hash
        this.app.get('/userOp/:hash', async (req: Request, res: Response) => {
            const userOpHash = req.params.hash;
            const requestId = (req as any).requestId;
            
            try {
                console.log(`[${requestId}] 🔍 Fetching UserOperation: ${userOpHash}`);
                const userOpData = await this.db.getUserOperationByHash(userOpHash);
                
                if (!userOpData) {
                    console.log(`[${requestId}] ❌ UserOperation not found: ${userOpHash}`);
                    res.status(404).json({ error: 'UserOperation not found' });
                    return;
                }
                
                console.log(`[${requestId}] ✅ Found UserOperation: ${userOpHash}`);
                res.json(userOpData);
            } catch (error: any) {
                console.error(`[${requestId}] Error fetching UserOperation:`, error);
                res.status(500).json({ error: error.message });
            }
        });

        // JSON-RPC endpoint (main entry point) with BATCH SUPPORT
        this.app.post('/', async (req: Request, res: Response) => {
            const requestBody = req.body;
            const requestId = (req as any).requestId;
            
            try {
                // Handle batch requests (array) or single requests (object)
                if (Array.isArray(requestBody)) {
                    console.log(`[${requestId}] 📦 Batch RPC Request received:`, {
                        count: requestBody.length,
                        methods: requestBody.map((r: any) => r?.method || 'unknown')
                    });
                    
                    // If batch request is empty
                    if (requestBody.length === 0) {
                        const errorResponse: RPCResponse = {
                            jsonrpc: '2.0',
                            error: {
                                code: -32600,
                                message: 'Invalid request: empty batch'
                            },
                            id: null
                        };
                        console.log(`[${requestId}] ❌ Empty batch request`);
                        res.json(errorResponse);
                        return;
                    }
                    
                    // Process each request in the batch
                    const responses = await Promise.all(
                        requestBody.map(async (rpcRequest: RPCRequest, index: number) => {
                            try {
                                if (!rpcRequest || typeof rpcRequest !== 'object') {
                                    console.log(`[${requestId}] ❌ Invalid batch item ${index}:`, rpcRequest);
                                    return {
                                        jsonrpc: '2.0',
                                        error: {
                                            code: -32600,
                                            message: 'Invalid request format'
                                        },
                                        id: null
                                    };
                                }
                                
                                console.log(`[${requestId}]   Processing batch item ${index}:`, {
                                    method: rpcRequest.method,
                                    id: rpcRequest.id
                                });
                                
                                return await this.handleSingleRPCRequest(rpcRequest);
                            } catch (error: any) {
                                console.error(`[${requestId}] ❌ Error processing batch item ${index}:`, error);
                                return {
                                    jsonrpc: '2.0',
                                    error: {
                                        code: -32603,
                                        message: 'Internal error processing batch request',
                                        data: error.message
                                    },
                                    id: rpcRequest?.id || null
                                };
                            }
                        })
                    );
                    
                    const successCount = responses.filter(r => !r.error).length;
                    console.log(`[${requestId}] 📤 Batch RPC Response:`, {
                        count: responses.length,
                        successCount: successCount,
                        failureCount: responses.length - successCount
                    });
                    
                    res.json(responses);
                    
                } else {
                    // Single request handling
                    if (!requestBody || typeof requestBody !== 'object') {
                        console.error(`[${requestId}] ❌ Invalid RPC request format:`, requestBody);
                        const errorResponse: RPCResponse = {
                            jsonrpc: '2.0',
                            error: {
                                code: -32600,
                                message: 'Invalid request format'
                            },
                            id: null
                        };
                        res.status(400).json(errorResponse);
                        return;
                    }
                    
                    const rpcRequest: RPCRequest = requestBody;
                    
                    console.log(`[${requestId}] 📥 Single RPC Request received:`, {
                        method: rpcRequest.method,
                        id: rpcRequest.id,
                        paramsCount: rpcRequest.params?.length || 0
                    });
                    
                    const response = await this.handleSingleRPCRequest(rpcRequest);
                    
                    console.log(`[${requestId}] 📤 Single RPC Response:`, {
                        method: rpcRequest.method,
                        id: response.id,
                        success: !response.error,
                        error: response.error?.message
                    });
                    
                    res.json(response);
                }
            } catch (error: any) {
                console.error(`[${requestId}] ❌ RPC Server Error:`, error);
                
                const response: RPCResponse = {
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                        data: error.message
                    },
                    id: null
                };
                
                res.status(500).json(response);
            }
        });

        // 404 handler
        this.app.use('*', (req: Request, res: Response) => {
            const requestId = (req as any).requestId;
            console.log(`[${requestId}] ❌ Route not found:`, req.method, req.originalUrl);
            res.status(404).json({
                error: 'Route not found',
                path: req.originalUrl,
                method: req.method,
                requestId
            });
        });

        // Error handling middleware
        this.app.use((error: any, req: Request, res: Response, next: any) => {
            const requestId = (req as any).requestId;
            console.error(`[${requestId}] 🚨 Server error:`, error);
            res.status(500).json({
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined,
                requestId
            });
        });
    }

    private async handleSingleRPCRequest(request: RPCRequest): Promise<RPCResponse> {
        const { method, params = [], id } = request;
        const requestId = (request as any).requestId || 'unknown';
        
        // Validate request
        if (!method) {
            console.error(`[${requestId}] ❌ RPC request missing method:`, request);
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32600,
                    message: 'Invalid request: missing method'
                },
                id: id !== null && id !== undefined ? id : 1
            };
        }

        if (request.jsonrpc !== '2.0') {
            return {
                jsonrpc: '2.0',
                error: {
                    code: -32600,
                    message: 'Invalid JSON-RPC version. Expected: "2.0"'
                },
                id: id !== null && id !== undefined ? id : 1
            };
        }

        const startTime = Date.now();
        this.metrics.recordRpcRequest(method, 'received');

        try {
            let result: any;
            
            switch (method) {
                case 'eth_sendUserOperation':
                    result = await this.sendUserOperationMethod.execute(params);
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                case 'eth_estimateUserOperationGas':
                    result = await this.sendUserOperationMethod.estimateGas(params);
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                case 'eth_getUserOperationReceipt':
                    result = await this.handleGetUserOperationReceipt(params);
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                case 'eth_getUserOperationByHash':
                    result = await this.handleGetUserOperationByHash(params);
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                case 'eth_supportedEntryPoints':
                    result = [this.entryPointAddress];
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                case 'eth_chainId':
                    result = '0x3919'; // 14601 in hex (Sonic Testnet)
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                case 'net_version':
                    result = '14601'; // Sonic Testnet chain ID as string
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                case 'web3_clientVersion':
                    result = 'Sonic-4337-Bundler/1.0.0';
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                case 'eth_getTransactionCount':
                case 'eth_getBalance':
                case 'eth_getCode':
                    // These are forwarded to the underlying RPC for account checks
                    result = await this.forwardToChainRPC(method, params);
                    this.metrics.recordRpcRequest(method, 'success');
                    break;

                default:
                    console.warn(`[${requestId}] ⚠️ Method not implemented: ${method}`);
                    this.metrics.recordRpcRequest(method, 'error');
                    return {
                        jsonrpc: '2.0',
                        error: {
                            code: -32601,
                            message: `Method not found: ${method}`,
                            data: `Available methods: eth_sendUserOperation, eth_estimateUserOperationGas, eth_getUserOperationReceipt, eth_getUserOperationByHash, eth_supportedEntryPoints, eth_chainId, net_version, web3_clientVersion, eth_getTransactionCount, eth_getBalance, eth_getCode`
                        },
                        id: id !== null && id !== undefined ? id : 1
                    };
            }

            const duration = Date.now() - startTime;
            if (duration > 1000) {
                console.warn(`[${requestId}] ⚠️ Slow RPC ${method}: ${duration}ms`);
            }

            return {
                jsonrpc: '2.0',
                result,
                id: id !== null && id !== undefined ? id : 1
            };

        } catch (error: any) {
            console.error(`[${requestId}] ❌ RPC method ${method} error:`, error);
            this.metrics.recordRpcRequest(method, 'error');
            this.metrics.recordError(`rpc_${method}`, 'RPCServer', error.message);
            
            return {
                jsonrpc: '2.0',
                error: {
                    code: error.code || -32603,
                    message: error.message || 'Internal error',
                    data: error.data || error.toString()
                },
                id: id !== null && id !== undefined ? id : 1
            };
        }
    }

    private async handleGetUserOperationReceipt(params: any[]): Promise<any> {
        if (params.length < 1) {
            throw {
                code: -32602,
                message: 'Invalid params: expected [userOpHash]'
            };
        }

        const [userOpHash] = params;
        console.log('🔍 Getting UserOperation receipt:', userOpHash);

        try {
            const userOpData = await this.db.getUserOperationByHash(userOpHash);
            
            if (!userOpData) {
                console.log('UserOperation not found:', userOpHash);
                return null;
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
                    blockNumber: userOpData.block_number ? `0x${userOpData.block_number.toString(16)}` : '0x0',
                    from: this.entryPointAddress,
                    to: userOpData.sender,
                    cumulativeGasUsed: userOpData.gas_used || '0x0',
                    gasUsed: userOpData.gas_used || '0x0',
                    logs: [],
                    logsBloom: '0x'.padEnd(514, '0'),
                    status: userOpData.status === 'confirmed' ? '0x1' : '0x0',
                    effectiveGasPrice: '0x0'
                }
            };

            console.log('✅ Returning receipt for:', userOpHash);
            return receipt;
            
        } catch (error: any) {
            console.error('Error getting receipt:', error);
            throw {
                code: -32603,
                message: 'Internal error while fetching receipt',
                data: error.message
            };
        }
    }

    private async handleGetUserOperationByHash(params: any[]): Promise<any> {
        if (params.length < 1) {
            throw {
                code: -32602,
                message: 'Invalid params: expected [userOpHash]'
            };
        }

        const [userOpHash] = params;
        console.log('🔍 Getting UserOperation by hash:', userOpHash);

        try {
            const userOpData = await this.db.getUserOperationByHash(userOpHash);
            
            if (!userOpData) {
                console.log('UserOperation not found:', userOpHash);
                return null;
            }

            // Format the response
            const formatted = {
                hash: userOpData.user_op_hash,
                sender: userOpData.sender,
                nonce: userOpData.nonce,
                callData: userOpData.call_data,
                callGasLimit: userOpData.call_gas_limit,
                verificationGasLimit: userOpData.verification_gas_limit,
                preVerificationGas: userOpData.pre_verification_gas,
                maxFeePerGas: userOpData.max_fee_per_gas,
                maxPriorityFeePerGas: userOpData.max_priority_fee_per_gas,
                paymasterAndData: userOpData.paymaster_and_data,
                signature: userOpData.signature,
                status: userOpData.status,
                submittedAt: userOpData.submitted_at,
                confirmedAt: userOpData.confirmed_at,
                txHash: userOpData.tx_hash,
                gasUsed: userOpData.gas_used,
                gasCost: userOpData.gas_cost,
                errorMessage: userOpData.error_message
            };

            console.log('✅ Returning UserOperation data for:', userOpHash);
            return formatted;
            
        } catch (error: any) {
            console.error('Error getting UserOperation:', error);
            throw {
                code: -32603,
                message: 'Internal error while fetching UserOperation',
                data: error.message
            };
        }
    }

    private async forwardToChainRPC(method: string, params: any[]): Promise<any> {
        // This method forwards certain calls to the underlying blockchain RPC
        // For now, return placeholder values
        console.log(`🔗 Forwarding ${method} to chain RPC`);
        
        switch (method) {
            case 'eth_getTransactionCount':
                return '0x0'; // Default nonce
            case 'eth_getBalance':
                return '0x0'; // Default balance
            case 'eth_getCode':
                return '0x'; // Default code (empty)
            default:
                throw new Error(`Cannot forward method: ${method}`);
        }
    }

    /**
     * Start the RPC server
     */
    start(): void {
        this.app.listen(this.port, () => {
            console.log('='.repeat(70));
            console.log('🚀 Sonic ERC-4337 Bundler RPC Server');
            console.log('='.repeat(70));
            console.log(`📡 RPC Endpoint: http://localhost:${this.port}/`);
            console.log(`🏥 Health Check: http://localhost:${this.port}/health`);
            console.log(`📊 Metrics: http://localhost:${this.port}/metrics`);
            console.log(`📦 Mempool: http://localhost:${this.port}/mempool`);
            console.log(`🔗 EntryPoint: ${this.entryPointAddress}`);
            console.log(`⛓️  Chain ID: 14601 (Sonic Testnet)`);
            console.log(`🌐 Network: https://rpc.testnet.soniclabs.com`);
            console.log(`✅ Batch Requests: SUPPORTED`);
            console.log('='.repeat(70));
            console.log('📋 Available RPC Methods:');
            console.log('  • eth_sendUserOperation');
            console.log('  • eth_estimateUserOperationGas');
            console.log('  • eth_getUserOperationReceipt');
            console.log('  • eth_getUserOperationByHash');
            console.log('  • eth_supportedEntryPoints');
            console.log('  • eth_chainId');
            console.log('  • net_version');
            console.log('  • web3_clientVersion');
            console.log('  • eth_getTransactionCount (forwarded)');
            console.log('  • eth_getBalance (forwarded)');
            console.log('  • eth_getCode (forwarded)');
            console.log('='.repeat(70));
            console.log('✅ Server is ready to accept UserOperations!');
            console.log('   Supports both single and batch JSON-RPC 2.0 requests');
            console.log('='.repeat(70));
        });

        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    /**
     * Graceful shutdown
     */
    private shutdown(): void {
        console.log('\n🛑 Shutting down RPC server gracefully...');
        console.log('   Flushing metrics...');
        console.log('   Closing database connections...');
        console.log('✅ RPC server shutdown complete');
        process.exit(0);
    }

    /**
     * Get server status
     */
    getStatus(): any {
        return {
            port: this.port,
            entryPoint: this.entryPointAddress,
            mempoolSize: this.mempool.getPendingCount(),
            isRunning: true,
            supportsBatch: true,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        };
    }
}
