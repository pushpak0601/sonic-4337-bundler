import express, { Express, Request, Response } from 'express';
import client from 'prom-client';

export class MetricsCollector {
    // Core metrics
    private userOpsReceived: client.Counter;
    private userOpsValidated: client.Counter;
    private bundlesSubmitted: client.Counter;
    private gasUsed: client.Gauge;
    private gasCost: client.Gauge;
    private mempoolSize: client.Gauge;
    private bundleExecutionTime: client.Histogram;
    private rpcRequests: client.Counter;
    private rpcRequestDuration: client.Histogram;
    private errors: client.Counter;
    private databaseOperations: client.Counter;
    
    // Advanced metrics
    private userOpLatency: client.Histogram;
    private gasPrices: client.Gauge;
    private chainBlockHeight: client.Gauge;
    private bundlerBalance: client.Gauge;
    
    // Custom metrics registry
    private registry: client.Registry;

    constructor() {
        // Create a custom registry
        this.registry = new client.Registry();
        
        // Enable default metrics (CPU, memory, etc.)
        client.collectDefaultMetrics({ register: this.registry });
        
        this.initializeMetrics();
    }

    private initializeMetrics(): void {
        // 1. UserOperation metrics
        this.userOpsReceived = new client.Counter({
            name: 'bundler_userops_received_total',
            help: 'Total number of UserOperations received',
            labelNames: ['status', 'sender_prefix', 'has_paymaster'],
            registers: [this.registry]
        });

        this.userOpsValidated = new client.Counter({
            name: 'bundler_userops_validated_total',
            help: 'Total number of UserOperations validated',
            labelNames: ['validation_result'],
            registers: [this.registry]
        });

        this.userOpLatency = new client.Histogram({
            name: 'bundler_userop_processing_latency_seconds',
            help: 'Time taken to process a UserOperation',
            buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
            labelNames: ['operation'],
            registers: [this.registry]
        });

        // 2. Bundle metrics
        this.bundlesSubmitted = new client.Counter({
            name: 'bundler_bundles_submitted_total',
            help: 'Total number of bundles submitted to blockchain',
            labelNames: ['status', 'size'],
            registers: [this.registry]
        });

        this.bundleExecutionTime = new client.Histogram({
            name: 'bundler_bundle_execution_time_seconds',
            help: 'Time taken to execute a bundle',
            buckets: [1, 2, 5, 10, 30, 60],
            registers: [this.registry]
        });

        // 3. Gas metrics
        this.gasUsed = new client.Gauge({
            name: 'bundler_gas_used',
            help: 'Gas used in the last bundle',
            registers: [this.registry]
        });

        this.gasCost = new client.Gauge({
            name: 'bundler_gas_cost_wei',
            help: 'Gas cost in wei for the last bundle',
            registers: [this.registry]
        });

        this.gasPrices = new client.Gauge({
            name: 'bundler_gas_prices',
            help: 'Current gas prices',
            labelNames: ['type'],
            registers: [this.registry]
        });

        // 4. Mempool metrics
        this.mempoolSize = new client.Gauge({
            name: 'bundler_mempool_size',
            help: 'Current number of UserOperations in mempool',
            registers: [this.registry]
        });

        // 5. RPC metrics
        this.rpcRequests = new client.Counter({
            name: 'bundler_rpc_requests_total',
            help: 'Total number of RPC requests',
            labelNames: ['method', 'status_code'],
            registers: [this.registry]
        });

        this.rpcRequestDuration = new client.Histogram({
            name: 'bundler_rpc_request_duration_seconds',
            help: 'Duration of RPC requests',
            buckets: [0.1, 0.5, 1, 2, 5],
            labelNames: ['method'],
            registers: [this.registry]
        });

        // 6. Error metrics
        this.errors = new client.Counter({
            name: 'bundler_errors_total',
            help: 'Total number of errors',
            labelNames: ['type', 'component'],
            registers: [this.registry]
        });

        // 7. Database metrics
        this.databaseOperations = new client.Counter({
            name: 'bundler_database_operations_total',
            help: 'Total number of database operations',
            labelNames: ['operation', 'table'],
            registers: [this.registry]
        });

        // 8. Blockchain metrics
        this.chainBlockHeight = new client.Gauge({
            name: 'bundler_chain_block_height',
            help: 'Current blockchain block height',
            registers: [this.registry]
        });

        this.bundlerBalance = new client.Gauge({
            name: 'bundler_wallet_balance_wei',
            help: 'Bundler wallet balance in wei',
            registers: [this.registry]
        });
    }

    // ========== UserOperation Metrics ==========
    
    public recordUserOpReceived(userOp: any): void {
        const senderPrefix = userOp.sender?.slice(0, 8) || 'unknown';
        const hasPaymaster = userOp.paymasterAndData && userOp.paymasterAndData !== '0x' ? 'true' : 'false';
        
        this.userOpsReceived.inc({
            status: 'received',
            sender_prefix: senderPrefix,
            has_paymaster: hasPaymaster
        });
        
        console.log(`📥 UserOperation received from ${senderPrefix}... (paymaster: ${hasPaymaster})`);
    }

    public recordUserOpValidation(result: 'success' | 'failed', errorType?: string): void {
        this.userOpsValidated.inc({
            validation_result: result
        });
        
        if (result === 'failed' && errorType) {
            this.recordError(errorType, 'validation');
        }
        
        console.log(`🔍 UserOperation validation: ${result}${errorType ? ` (${errorType})` : ''}`);
    }

    public startUserOpTimer(operation: string): () => void {
        const startTime = process.hrtime();
        
        return () => {
            const duration = process.hrtime(startTime);
            const seconds = duration[0] + duration[1] / 1e9;
            this.userOpLatency.observe({ operation }, seconds);
            
            console.log(`⏱️ ${operation} completed in ${seconds.toFixed(3)}s`);
        };
    }

    // ========== Bundle Metrics ==========
    
    public recordBundleSubmitted(bundleSize: number, status: 'success' | 'failed', error?: string): void {
        this.bundlesSubmitted.inc({
            status: status,
            size: bundleSize.toString()
        });
        
        if (status === 'failed' && error) {
            this.recordError(error, 'bundle_execution');
        }
        
        console.log(`📦 Bundle submitted (size: ${bundleSize}, status: ${status})`);
    }

    public startBundleTimer(): () => void {
        const startTime = process.hrtime();
        
        return () => {
            const duration = process.hrtime(startTime);
            const seconds = duration[0] + duration[1] / 1e9;
            this.bundleExecutionTime.observe(seconds);
            
            console.log(`⏱️ Bundle execution completed in ${seconds.toFixed(3)}s`);
        };
    }

    // ========== Gas Metrics ==========
    
    public recordGasUsage(gasUsed: bigint, gasCost: bigint, effectiveGasPrice?: bigint): void {
        this.gasUsed.set(Number(gasUsed));
        this.gasCost.set(Number(gasCost));
        
        console.log(`⛽ Gas used: ${gasUsed.toString()}, Cost: ${this.formatWei(gasCost)} SONIC`);
    }

    public updateGasPrices(maxFeePerGas: bigint, maxPriorityFeePerGas: bigint, baseFee?: bigint): void {
        this.gasPrices.set({ type: 'max_fee_per_gas' }, Number(maxFeePerGas));
        this.gasPrices.set({ type: 'max_priority_fee_per_gas' }, Number(maxPriorityFeePerGas));
        
        if (baseFee) {
            this.gasPrices.set({ type: 'base_fee' }, Number(baseFee));
        }
        
        console.log(`💰 Gas prices - Max: ${this.formatGwei(maxFeePerGas)} gwei, Priority: ${this.formatGwei(maxPriorityFeePerGas)} gwei`);
    }

    // ========== Mempool Metrics ==========
    
    public updateMempoolSize(size: number): void {
        this.mempoolSize.set(size);
        
        if (size > 0 && size % 10 === 0) {
            console.log(`📊 Mempool size: ${size} UserOperations`);
        }
    }

    // ========== RPC Metrics ==========
    
    public recordRpcRequest(method: string, statusCode: number = 200, startTime?: [number, number]): () => void {
        this.rpcRequests.inc({
            method: method,
            status_code: statusCode.toString()
        });
        
        const timerStart = startTime || process.hrtime();
        
        return () => {
            const duration = process.hrtime(timerStart);
            const seconds = duration[0] + duration[1] / 1e9;
            this.rpcRequestDuration.observe({ method: method }, seconds);
            
            if (seconds > 1) {
                console.log(`⚠️ Slow RPC ${method}: ${seconds.toFixed(3)}s`);
            }
        };
    }

    // ========== Error Metrics ==========
    
    public recordError(type: string, component: string = 'unknown', details?: any): void {
        this.errors.inc({
            type: type,
            component: component
        });
        
        console.error(`❌ Error [${component}.${type}]:`, details || 'No details');
        
        // Alert on critical errors
        if (this.isCriticalError(type)) {
            this.triggerAlert(type, component, details);
        }
    }

    // ========== Database Metrics ==========
    
    public recordDatabaseOperation(operation: string, table: string): void {
        this.databaseOperations.inc({
            operation: operation,
            table: table
        });
        
        // Log only heavy operations
        if (['insert', 'update', 'delete'].includes(operation)) {
            console.log(`💾 Database ${operation} on ${table}`);
        }
    }

    // ========== Blockchain Metrics ==========
    
    public updateBlockHeight(blockNumber: number): void {
        this.chainBlockHeight.set(blockNumber);
        
        if (blockNumber % 100 === 0) {
            console.log(`⛓️ Current block: ${blockNumber}`);
        }
    }

    public updateBundlerBalance(balanceWei: bigint): void {
        this.bundlerBalance.set(Number(balanceWei));
        
        const balanceEth = Number(balanceWei) / 1e18;
        if (balanceEth < 0.1) {
            console.warn(`⚠️ Low bundler balance: ${balanceEth.toFixed(4)} SONIC`);
        }
    }

    // ========== Utility Methods ==========
    
    private formatWei(wei: bigint): string {
        const eth = Number(wei) / 1e18;
        return eth.toFixed(6);
    }

    private formatGwei(gwei: bigint): string {
        return (Number(gwei) / 1e9).toFixed(2);
    }

    private isCriticalError(type: string): boolean {
        const criticalErrors = [
            'out_of_gas',
            'insufficient_balance',
            'database_corruption',
            'rpc_connection_lost'
        ];
        return criticalErrors.includes(type);
    }

    private triggerAlert(type: string, component: string, details?: any): void {
        console.error(`🚨 CRITICAL ALERT: ${type} in ${component}`);
        console.error('Details:', details);
        
        // In production, you would send to Slack/Email/PagerDuty here
        // For now, just log to console
    }

    // ========== Public API ==========
    
    public getMetricsApp(): Express {
        const app = express();
        
        // Metrics endpoint
        app.get('/metrics', async (_req: Request, res: Response) => {
            try {
                res.set('Content-Type', this.registry.contentType);
                res.end(await this.registry.metrics());
            } catch (error: any) {
                console.error('Metrics endpoint error:', error);
                res.status(500).end(error.toString());
            }
        });

        // Health endpoint with metrics
        app.get('/health', async (_req: Request, res: Response) => {
            try {
                const metrics = await this.registry.getMetricsAsJSON();
                const health = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    metrics_summary: {
                        userops_received: this.getMetricValue(metrics, 'bundler_userops_received_total'),
                        bundles_submitted: this.getMetricValue(metrics, 'bundler_bundles_submitted_total'),
                        mempool_size: this.getMetricValue(metrics, 'bundler_mempool_size'),
                        errors_total: this.getMetricValue(metrics, 'bundler_errors_total')
                    }
                };
                
                res.json(health);
            } catch (error: any) {
                res.status(500).json({
                    status: 'unhealthy',
                    error: error.message
                });
            }
        });

        // Stats endpoint
        app.get('/stats', async (_req: Request, res: Response) => {
            try {
                const metrics = await this.registry.getMetricsAsJSON();
                
                const stats = {
                    userops: {
                        total_received: this.getMetricValue(metrics, 'bundler_userops_received_total'),
                        total_validated: this.getMetricValue(metrics, 'bundler_userops_validated_total'),
                        avg_processing_time: this.getMetricValue(metrics, 'bundler_userop_processing_latency_seconds_sum') / 
                                            (this.getMetricValue(metrics, 'bundler_userop_processing_latency_seconds_count') || 1)
                    },
                    bundles: {
                        total_submitted: this.getMetricValue(metrics, 'bundler_bundles_submitted_total'),
                        avg_execution_time: this.getMetricValue(metrics, 'bundler_bundle_execution_time_seconds_sum') / 
                                          (this.getMetricValue(metrics, 'bundler_bundle_execution_time_seconds_count') || 1)
                    },
                    gas: {
                        last_used: this.getMetricValue(metrics, 'bundler_gas_used'),
                        last_cost: this.getMetricValue(metrics, 'bundler_gas_cost_wei'),
                        current_max_fee: this.getMetricValue(metrics, 'bundler_gas_prices', 'max_fee_per_gas')
                    },
                    performance: {
                        rpc_requests: this.getMetricValue(metrics, 'bundler_rpc_requests_total'),
                        avg_rpc_duration: this.getMetricValue(metrics, 'bundler_rpc_request_duration_seconds_sum') / 
                                         (this.getMetricValue(metrics, 'bundler_rpc_request_duration_seconds_count') || 1)
                    },
                    system: {
                        block_height: this.getMetricValue(metrics, 'bundler_chain_block_height'),
                        bundler_balance: this.getMetricValue(metrics, 'bundler_wallet_balance_wei'),
                        mempool_size: this.getMetricValue(metrics, 'bundler_mempool_size')
                    }
                };
                
                res.json(stats);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        return app;
    }

    public startMetricsServer(port: number = 9091): void {
        const app = this.getMetricsApp();
        app.listen(port, () => {
            console.log(`📊 Metrics server listening on port ${port}`);
            console.log(`   Metrics: http://localhost:${port}/metrics`);
            console.log(`   Health: http://localhost:${port}/health`);
            console.log(`   Stats: http://localhost:${port}/stats`);
        });
    }

    public getRegistry(): client.Registry {
        return this.registry;
    }

    public async getMetricsAsJSON(): Promise<any[]> {
        return await this.registry.getMetricsAsJSON();
    }

    public resetMetrics(): void {
        this.registry.resetMetrics();
        console.log('🔄 All metrics have been reset');
    }

    private getMetricValue(metrics: any[], name: string, labelValue?: string): number {
        for (const metric of metrics) {
            if (metric.name === name) {
                if (metric.values && metric.values.length > 0) {
                    if (labelValue) {
                        const value = metric.values.find((v: any) => 
                            v.labels && v.labels.type === labelValue
                        );
                        return value ? value.value : 0;
                    }
                    return metric.values[0].value || 0;
                }
                return metric.value || 0;
            }
        }
        return 0;
    }

    // ========== Status Reporting ==========
    
    public getStatus(): any {
        return {
            metrics_enabled: true,
            registry_type: this.registry.contentType,
            timestamp: new Date().toISOString()
        };
    }
}
