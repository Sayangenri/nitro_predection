/**
 * Portugal 2026 World Cup Prediction Market
 * Main entry point for the Nitrolite-based prediction market
 */

export { PredictionMarketNitroliteClient } from './nitrolite-client.js';
export { LMSRPricer } from './lmsr.js';
export * from './types.js';
export * from './config.js';

// Re-export for easy imports
import { PredictionMarketNitroliteClient } from './nitrolite-client.js';
import { PREDICTION_MARKET_CONFIG, ENV, validateConfig } from './config.js';

/**
 * Quick start function for developers
 */
export async function createPredictionMarket(privateKey: string): Promise<PredictionMarketNitroliteClient> {
  // Validate configuration
  validateConfig();
  
  // Create client
  const client = new PredictionMarketNitroliteClient(PREDICTION_MARKET_CONFIG);
  
  // Initialize
  await client.initialize(privateKey);
  
  // Connect to ClearNode
  await client.connect();
  
  // Create application session
  await client.createApplicationSession();
  
  return client;
}

/**
 * Example usage function
 */
export async function exampleUsage(): Promise<void> {
  try {
    console.log('🇵🇹 Portugal 2026 Prediction Market Example');
    console.log('=============================================');
    
    // Create client
    const client = await createPredictionMarket(ENV.PRIVATE_KEY);
    
    // Show initial prices
    console.log('📊 Initial Market State:');
    const initialPrices = await client.getCurrentPrices();
    console.log(`   YES: ${(initialPrices.yes * 100).toFixed(1)}%`);
    console.log(`   NO:  ${(initialPrices.no * 100).toFixed(1)}%`);
    
    // Execute a sample trade
    console.log('\n🎲 Executing sample trade...');
    await client.executeTrade('yes', BigInt('1000000000000000000'), BigInt('900000000000000000')); // 1 USDC, min 0.9 shares
    
    // Show updated prices
    console.log('\n📊 Updated Market State:');
    const updatedPrices = await client.getCurrentPrices();
    console.log(`   YES: ${(updatedPrices.yes * 100).toFixed(1)}%`);
    console.log(`   NO:  ${(updatedPrices.no * 100).toFixed(1)}%`);
    
    // Show market stats
    const stats = await client.getMarketStats();
    console.log('\n📈 Market Statistics:');
    console.log(`   Volume: ${stats.volume} USDC`);
    console.log(`   Transactions: ${stats.transactions}`);
    console.log(`   Liquidity: ${stats.liquidity} USDC`);
    
    // Clean up
    client.disconnect();
    console.log('\n✅ Example completed successfully!');
    
  } catch (error) {
    console.error('❌ Example failed:', error);
    throw error;
  }
}

// Run example if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exampleUsage().catch(console.error);
}

