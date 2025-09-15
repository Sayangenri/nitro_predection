#!/usr/bin/env node

/**
 * CLI Interface for Portugal 2026 Prediction Market
 * Test your Nitrolite implementation from command line
 */

import { PredictionMarketNitroliteClient } from './nitrolite-client.js';
import { PREDICTION_MARKET_CONFIG, ENV, validateConfig, MARKET_CONFIG } from './config.js';
import { ethers } from 'ethers';
import readline from 'readline';

class PredictionMarketCLI {
  private client: PredictionMarketNitroliteClient;
  private rl: readline.Interface;

  constructor() {
    this.client = new PredictionMarketNitroliteClient(PREDICTION_MARKET_CONFIG);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start(): Promise<void> {
    console.log('🇵🇹 Portugal 2026 World Cup Prediction Market');
    console.log('================================================');
    console.log(`📊 Question: ${MARKET_CONFIG.QUESTION}`);
    console.log(`🏆 World Cup: ${MARKET_CONFIG.WORLD_CUP_START_DATE.getFullYear()}`);
    console.log('');

    try {
      // Validate configuration
      validateConfig();
      
      // Initialize client
      await this.client.initialize(ENV.PRIVATE_KEY);
      
      // Connect to ClearNode
      await this.client.connect();
      
      // Create application session
      await this.client.createApplicationSession();
      
      console.log('');
      console.log('🚀 Ready to trade! Type "help" for commands.');
      console.log('');
      
      // Start interactive mode
      await this.interactive();
      
    } catch (error) {
      console.error('❌ Failed to start:', error);
      process.exit(1);
    }
  }

  private async interactive(): Promise<void> {
    while (true) {
      const command = await this.prompt('> ');
      
      try {
        if (await this.handleCommand(command.trim())) {
          break; // Exit requested
        }
      } catch (error) {
        console.error('❌ Error:', (error as Error).message);
      }
    }
  }

  private async handleCommand(command: string): Promise<boolean> {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;

      case 'status':
        await this.showStatus();
        break;

      case 'prices':
        await this.showPrices();
        break;

      case 'stats':
        await this.showStats();
        break;

      case 'buy':
        await this.handleBuy(parts);
        break;

      case 'resolve':
        await this.handleResolve(parts);
        break;

      case 'close':
        await this.handleClose();
        break;

      case 'exit':
      case 'quit':
        await this.cleanup();
        return true;

      case '':
        // Empty command, do nothing
        break;

      default:
        console.log(`❓ Unknown command: ${cmd}. Type "help" for available commands.`);
        break;
    }

    return false;
  }

  private showHelp(): void {
    console.log('📚 Available Commands:');
    console.log('');
    console.log('  status          - Show current market status');
    console.log('  prices          - Show current YES/NO prices');
    console.log('  stats           - Show detailed market statistics');
    console.log('  buy <yes|no> <amount> [slippage]  - Buy shares');
    console.log('                    Example: buy yes 10.5 2.0');
    console.log('  resolve <yes|no> - Resolve market (admin only)');
    console.log('  close           - Close application session');
    console.log('  help            - Show this help');
    console.log('  exit            - Exit the CLI');
    console.log('');
  }

  private async showStatus(): Promise<void> {
    const state = await this.client.getCurrentState();
    const prices = await this.client.getCurrentPrices();
    
    console.log('📊 Market Status:');
    console.log(`   Question: ${MARKET_CONFIG.QUESTION}`);
    console.log(`   Status: ${state.resolved ? (state.yesWins ? 'RESOLVED - Portugal Wins! 🏆' : 'RESOLVED - Portugal Loses 😞') : 'ACTIVE 🟢'}`);
    console.log(`   YES Price: ${(prices.yes * 100).toFixed(1)}%`);
    console.log(`   NO Price: ${(prices.no * 100).toFixed(1)}%`);
    console.log(`   Volume: ${ethers.formatEther(state.totalVolume)} USDC`);
    console.log(`   Transactions: ${state.txCount.toString()}`);
    console.log('');
  }

  private async showPrices(): Promise<void> {
    const prices = await this.client.getCurrentPrices();
    const state = await this.client.getCurrentState();
    
    console.log('💰 Current Prices:');
    console.log(`   🟢 YES (Portugal Wins): ${(prices.yes * 100).toFixed(1)}%`);
    console.log(`   🔴 NO (Portugal Loses):  ${(prices.no * 100).toFixed(1)}%`);
    console.log('');
    console.log('📈 Market Depth:');
    console.log(`   YES Shares: ${ethers.formatEther(state.qYes)}`);
    console.log(`   NO Shares:  ${ethers.formatEther(state.qNo)}`);
    console.log(`   Liquidity:  ${ethers.formatEther(state.b)} USDC`);
    console.log('');
  }

  private async showStats(): Promise<void> {
    const stats = await this.client.getMarketStats();
    
    console.log('📊 Detailed Statistics:');
    console.log(`   YES Price: ${(stats.prices.yes * 100).toFixed(2)}%`);
    console.log(`   NO Price:  ${(stats.prices.no * 100).toFixed(2)}%`);
    console.log(`   Total Volume: ${stats.volume} USDC`);
    console.log(`   Transactions: ${stats.transactions}`);
    console.log(`   Liquidity Parameter: ${stats.liquidity} USDC`);
    console.log(`   Market Status: ${stats.status}`);
    console.log(`   Final Outcome: ${stats.outcome}`);
    console.log('');
  }

  private async handleBuy(parts: string[]): Promise<void> {
    if (parts.length < 3) {
      console.log('❓ Usage: buy <yes|no> <amount> [slippage]');
      console.log('   Example: buy yes 10.5 2.0');
      return;
    }

    const outcome = parts[1].toLowerCase();
    const amount = parts[2];
    const slippage = parts[3] ? parseFloat(parts[3]) : MARKET_CONFIG.DEFAULT_SLIPPAGE;

    if (outcome !== 'yes' && outcome !== 'no') {
      console.log('❌ Outcome must be "yes" or "no"');
      return;
    }

    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      console.log('❌ Amount must be a positive number');
      return;
    }

    if (amountFloat < parseFloat(MARKET_CONFIG.MIN_TRADE_AMOUNT)) {
      console.log(`❌ Minimum trade amount is ${MARKET_CONFIG.MIN_TRADE_AMOUNT} USDC`);
      return;
    }

    if (amountFloat > parseFloat(MARKET_CONFIG.MAX_TRADE_AMOUNT)) {
      console.log(`❌ Maximum trade amount is ${MARKET_CONFIG.MAX_TRADE_AMOUNT} USDC`);
      return;
    }

    console.log(`🎲 Buying ${outcome.toUpperCase()} shares for ${amount} USDC...`);

    const payAmount = ethers.parseEther(amount);
    const minShares = payAmount * BigInt(Math.floor((100 - slippage) * 100)) / BigInt(10000);

    await this.client.executeTrade(outcome as 'yes' | 'no', payAmount, minShares);
  }

  private async handleResolve(parts: string[]): Promise<void> {
    if (parts.length < 2) {
      console.log('❓ Usage: resolve <yes|no>');
      console.log('   yes = Portugal wins, no = Portugal loses');
      return;
    }

    const outcome = parts[1].toLowerCase();
    
    if (outcome !== 'yes' && outcome !== 'no') {
      console.log('❌ Outcome must be "yes" or "no"');
      return;
    }

    const yesWins = outcome === 'yes';
    const confirm = await this.prompt(`⚠️  Resolve market as "${yesWins ? 'Portugal WINS' : 'Portugal LOSES'}"? (yes/no): `);
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Resolution cancelled');
      return;
    }

    await this.client.resolveMarket(yesWins);
  }

  private async handleClose(): Promise<void> {
    const confirm = await this.prompt('⚠️  Close application session? This will settle all positions. (yes/no): ');
    
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Close cancelled');
      return;
    }

    await this.client.closeSession();
    console.log('✅ Session closed successfully');
  }

  private async cleanup(): Promise<void> {
    console.log('👋 Goodbye!');
    this.client.disconnect();
    this.rl.close();
  }

  private prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// Start CLI if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new PredictionMarketCLI();
  cli.start().catch(console.error);
}

