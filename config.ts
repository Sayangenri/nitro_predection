/**
 * Configuration for Portugal 2026 Prediction Market
 * Based on your channel: 0xcf7186...f44534 on Polygon with USDC
 */

import { ChannelConfig } from './types.js';

export const PREDICTION_MARKET_CONFIG: ChannelConfig = {
  // Your channel ID from apps.yellow.com
  channelId: '0xcf7186f44534', // Replace with your full channel ID
  
  // Contract addresses (you'll get these from apps.yellow.com)
  custodyContract: '0x...', // TODO: Get from your channel dashboard
  adjudicatorContract: '0x...', // TODO: Get from your channel dashboard
  
  // Supported tokens (USDC on Polygon)
  supportedTokens: [
    '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' // USDC on Polygon
  ],
  
  // Polygon network
  chainId: 137,
  
  // ClearNode WebSocket URL
  clearNodeUrl: 'wss://clearnet.yellow.com/ws'
};

// Environment variables
export const ENV = {
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',
  CHANNEL_ID: process.env.CHANNEL_ID || PREDICTION_MARKET_CONFIG.channelId,
  CUSTODY_CONTRACT: process.env.CUSTODY_CONTRACT || PREDICTION_MARKET_CONFIG.custodyContract,
  ADJUDICATOR_CONTRACT: process.env.ADJUDICATOR_CONTRACT || PREDICTION_MARKET_CONFIG.adjudicatorContract,
  CLEARNODE_URL: process.env.CLEARNODE_URL || PREDICTION_MARKET_CONFIG.clearNodeUrl,
  NODE_ENV: process.env.NODE_ENV || 'development'
};

// Validation
export function validateConfig(): void {
  const required = [
    'PRIVATE_KEY',
    'CHANNEL_ID',
    'CUSTODY_CONTRACT',
    'ADJUDICATOR_CONTRACT'
  ];
  
  const missing = required.filter(key => !ENV[key as keyof typeof ENV]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log('✅ Configuration validated');
  console.log('📡 Channel ID:', ENV.CHANNEL_ID);
  console.log('🔗 Chain ID:', PREDICTION_MARKET_CONFIG.chainId);
  console.log('🌐 Environment:', ENV.NODE_ENV);
}

// Market-specific constants
export const MARKET_CONFIG = {
  QUESTION: 'Will Portugal win the 2026 World Cup?',
  DESCRIPTION: 'Binary prediction market for Portugal winning the FIFA World Cup 2026',
  WORLD_CUP_START_DATE: new Date('2026-06-11'), // Estimated start date
  WORLD_CUP_END_DATE: new Date('2026-07-19'), // Estimated end date
  RESOLUTION_DEADLINE: new Date('2026-07-31'), // Resolution deadline
  CHALLENGE_PERIOD_HOURS: 48,
  MIN_TRADE_AMOUNT: '0.01', // 0.01 USDC minimum
  MAX_TRADE_AMOUNT: '10000', // 10,000 USDC maximum
  DEFAULT_SLIPPAGE: 2.0, // 2% default slippage tolerance
};

// Display formatting
export const DISPLAY = {
  DECIMAL_PLACES: 4,
  PERCENTAGE_PLACES: 1,
  CURRENCY_SYMBOL: 'USDC',
  CHAIN_NAME: 'Polygon',
  EXPLORER_URL: 'https://polygonscan.com'
};

// Logging configuration
export const LOGGING = {
  LEVEL: ENV.NODE_ENV === 'production' ? 'info' : 'debug',
  ENABLE_WEBSOCKET_LOGS: ENV.NODE_ENV !== 'production',
  ENABLE_TRADE_LOGS: true,
  ENABLE_STATE_LOGS: true
};

