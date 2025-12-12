import { ethers } from 'ethers';
import 'dotenv/config';
import { BlockchainService } from './blockchain/BlockchainService';
import { DatabaseManager } from './database/DatabaseManager';
import { UserOperationValidator } from './validation/UserOperationValidator';
import { MempoolManager } from './mempool/MempoolManager';
import { BundleExecutor } from './executor/BundleExecutor';
import { RPCServer } from './rpc/RPCServer';

// Configuration from environment variables
const RPC_URL = process.env.SONIC_RPC_URL || 'https://rpc.testnet.soniclabs.com';
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS || '0xD8d429fe93230Ac840C1eE3ddE76F15C6A265538';
const PRIVATE_KEY = process.env.BUNDLER_PRIVATE_KEY || '';
const BENEFICIARY = process.env.BENEFICIARY || (PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY).address : '0x0000000000000000000000000000000000000000');
const PORT = parseInt(process.env.PORT || '4337');
const BUNDLE_INTERVAL_MS = parseInt(process.env.BUNDLE_INTERVAL_MS || '15000');
const DATABASE_PATH = process.env.DATABASE_PATH || './bundler.db';

// Validate configuration
if (!PRIVATE_KEY) {
    console.error('❌ ERROR: BUNDLER_PRIVATE_KEY environment variable is required');
    console.error('   The bundler needs a private key to submit transactions');
    console.error('   Generate one with: openssl rand -hex 32');
    process.exit(1);
}

if (!ENTRY_POINT_ADDRESS || !ENTRY_POINT_ADDRESS.startsWith('0x')) {
    console.error('❌ ERROR: Invalid ENTRY_POINT_ADDRESS');
    process.exit(1);
}

async function main() {
    console.log('🚀 Starting Sonic Bundler - Real Implementation');
    console.log('===============================================');
    console.log(`⛓️  Network: Sonic Testnet`);
    console.log(`📡 RPC URL: ${RPC_URL}`);
    console.log(`🔗 EntryPoint: ${ENTRY_POINT_ADDRESS}`);
    console.log(`👛 Beneficiary: ${BENEFICIARY}`);
    console.log(`🌐 Port: ${PORT}`);
    console.log(`⏱️  Bundle Interval: ${BUNDLE_INTERVAL_MS}ms`);
    console.log(`💾 Database: ${DATABASE_PATH}`);
    console.log('');

    try {
        // Initialize services
        console.log('🔄 Initializing services...');
        
        const blockchainService = new BlockchainService(
            RPC_URL,
            ENTRY_POINT_ADDRESS,
            PRIVATE_KEY
        );

        const databaseManager = new DatabaseManager(DATABASE_PATH);
        
        const mempoolManager = new MempoolManager(databaseManager);
        
        const validator = new UserOperationValidator(
            blockchainService,
            ENTRY_POINT_ADDRESS
        );

        const bundleExecutor = new BundleExecutor(
            blockchainService,
            databaseManager,
            mempoolManager,
            BENEFICIARY
        );

        const rpcServer = new RPCServer(
            PORT,
            validator,
            mempoolManager,
            databaseManager,
            ENTRY_POINT_ADDRESS
        );

        // Start services
        console.log('🟢 Starting RPC server...');
        rpcServer.start();

        console.log('🟢 Starting auto-bundling...');
        bundleExecutor.startAutoExecution(BUNDLE_INTERVAL_MS);

        console.log('\n✅ Sonic Bundler is running!');
        console.log('📊 To check status:');
        console.log(`   curl http://localhost:${PORT}/health`);
        console.log(`   curl http://localhost:${PORT}/mempool`);

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Received SIGINT - Shutting down gracefully...');
            bundleExecutor.stopAutoExecution();
            console.log('✅ Bundler stopped');
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\n🛑 Received SIGTERM - Shutting down gracefully...');
            bundleExecutor.stopAutoExecution();
            console.log('✅ Bundler stopped');
            process.exit(0);
        });

    } catch (error: any) {
        console.error('❌ Failed to start bundler:', error);
        process.exit(1);
    }
}

main().catch(console.error);
