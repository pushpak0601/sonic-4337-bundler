import chainsConfig from '../../config/chains.json';

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerApiUrl: string;
  currencySymbol: string;
  faucetUrl: string;
  blockTime: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  bundler: {
    minBalance: string;
    maxBundleGas: number;
    maxUserOpsPerBundle: number;
    bundleInterval: number;
  };
}

export class ChainManager {
  private static instance: ChainManager;
  private chains: Map<number, ChainConfig>;

  private constructor() {
    this.chains = new Map();
    this.loadChains();
  }

  public static getInstance(): ChainManager {
    if (!ChainManager.instance) {
      ChainManager.instance = new ChainManager();
    }
    return ChainManager.instance;
  }

  private loadChains(): void {
    Object.entries(chainsConfig).forEach(([chainName, config]) => {
      this.chains.set(config.chainId, config as ChainConfig);
    });
  }

  public getChain(chainId: number): ChainConfig {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain with ID ${chainId} not configured`);
    }
    return chain;
  }

  public getSonicTestnet(): ChainConfig {
    return this.getChain(14601);
  }

  public getAllChains(): ChainConfig[] {
    return Array.from(this.chains.values());
  }

  public isChainSupported(chainId: number): boolean {
    return this.chains.has(chainId);
  }
}
