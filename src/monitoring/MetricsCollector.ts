import client from 'prom-client';
import express from 'express';

export class MetricsCollector {
  private userOpsReceived: client.Counter;
  private bundlesSubmitted: client.Counter;
  private gasUsed: client.Gauge;
  private mempoolSize: client.Gauge;
  private bundleExecutionTime: client.Histogram;
  private rpcRequests: client.Counter;
  private errors: client.Counter;

  constructor() {
    // Enable default metrics
    client.collectDefaultMetrics();

    this.userOpsReceived = new client.Counter({
      name: 'bundler_userops_received_total',
      help: 'Total number of UserOperations received',
      labelNames: ['status']
    });

    this.bundlesSubmitted = new client.Counter({
      name: 'bundler_bundles_submitted_total',
      help: 'Total number of bundles submitted',
      labelNames: ['status']
    });

    this.gasUsed = new client.Gauge({
      name: 'bundler_gas_used',
      help: 'Gas used in the last bundle'
    });

    this.mempoolSize = new client.Gauge({
      name: 'bundler_mempool_size',
      help: 'Current number of UserOperations in mempool'
    });

    this.bundleExecutionTime = new client.Histogram({
      name: 'bundler_bundle_execution_time_seconds',
      help: 'Time taken to execute a bundle',
      buckets: [0.1, 0.5, 1, 2, 5, 10]
    });

    this.rpcRequests = new client.Counter({
      name: 'bundler_rpc_requests_total',
      help: 'Total number of RPC requests',
      labelNames: ['method', 'status']
    });

    this.errors = new client.Counter({
      name: 'bundler_errors_total',
      help: 'Total number of errors',
      labelNames: ['type']
    });
  }

  public recordUserOpReceived(status: 'accepted' | 'rejected'): void {
    this.userOpsReceived.inc({ status });
  }

  public recordBundleSubmitted(status: 'success' | 'failed'): void {
    this.bundlesSubmitted.inc({ status });
  }

  public recordGasUsed(gas: bigint): void {
    this.gasUsed.set(Number(gas));
  }

  public recordMempoolSize(size: number): void {
    this.mempoolSize.set(size);
  }

  public recordBundleExecutionTime(startTime: number): void {
    const duration = (Date.now() - startTime) / 1000;
    this.bundleExecutionTime.observe(duration);
  }

  public recordRpcRequest(method: string, status: 'success' | 'error'): void {
    this.rpcRequests.inc({ method, status });
  }

  public recordError(type: string): void {
    this.errors.inc({ type });
  }

  public getMetricsApp(): express.Application {
    const app = express();
    
    app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', client.register.contentType);
        res.end(await client.register.metrics());
      } catch (error) {
        res.status(500).end(error);
      }
    });

    return app;
  }

  public startMetricsServer(port: number = 9091): void {
    const app = this.getMetricsApp();
    app.listen(port, () => {
      console.log(`📊 Metrics server listening on port ${port}`);
    });
  }
}
