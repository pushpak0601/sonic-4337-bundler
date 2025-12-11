#!/usr/bin/env node

const { ethers } = require('ethers');
require('dotenv').config();

async function fundBundler() {
  console.log('💰 Funding Bundler Wallet');
  console.log('=========================');
  
  // Sonic Testnet configuration
  const RPC_URL = process.env.SONIC_RPC_URL || 'https://rpc.testnet.soniclabs.com';
  const CHAIN_ID = parseInt(process.env.SONIC_CHAIN_ID || '14601');
  const FAUCET_URL = process.env.SONIC_FAUCET_URL || 'https://testnet.soniclabs.com/account';
  
  // Check if private key is set
  const privateKey = process.env.BUNDLER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ BUNDLER_PRIVATE_KEY not found in .env file');
    console.log('Generate one with: openssl rand -hex 32');
    process.exit(1);
  }
  
  // Create wallet and provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = wallet.address;
  
  console.log(`📡 Network: Sonic Testnet (Chain ID: ${CHAIN_ID})`);
  console.log(`👛 Bundler Address: ${address}`);
  console.log('');
  
  // Check current balance
  try {
    const balance = await provider.getBalance(address);
    const balanceInSonic = ethers.formatEther(balance);
    
    console.log(`💼 Current Balance: ${balanceInSonic} S`);
    
    const minBalance = ethers.parseEther('0.1'); // 0.1 S minimum
    if (balance < minBalance) {
      console.log('⚠️  Balance is low. Need at least 0.1 S to operate');
      console.log('');
      console.log('🚰 Getting SONIC from faucet...');
      console.log(`   Visit: ${FAUCET_URL}`);
      console.log('   Paste your address:', address);
      console.log('');
      console.log('⏳ Waiting for funds...');
      
      // Wait for funds with timeout
      let funded = false;
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const newBalance = await provider.getBalance(address);
        
        if (newBalance > balance) {
          const newBalanceInSonic = ethers.formatEther(newBalance);
          console.log(`✅ Received funds! New balance: ${newBalanceInSonic} S`);
          funded = true;
          break;
        }
        
        process.stdout.write('.');
      }
      
      if (!funded) {
        console.log('');
        console.log('❌ No funds received from faucet');
        console.log('   Please manually request SONIC from the faucet');
      }
    } else {
      console.log('✅ Sufficient balance for operation');
    }
    
  } catch (error) {
    console.error('❌ Error checking balance:', error.message);
    process.exit(1);
  }
}

fundBundler().catch(console.error);
