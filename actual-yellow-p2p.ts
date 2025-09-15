#!/usr/bin/env node

/**
 * ACTUAL Yellow Network P2P Trading Implementation
 * 
 * This uses the REAL Yellow Network infrastructure:
 * 1. Connect to actual ClearNode WebSocket
 * 2. Create real application sessions
 * 3. Execute P2P trades via state channel updates
 * 4. Settle on blockchain when needed
 */

import { ethers, parseUnits, formatUnits, Wallet } from 'ethers';
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { NitroliteClient } from '@erc7824/nitrolite';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Yellow Network Configuration
const YELLOW_CONFIG = {
  clearNodeUrl: 'wss://clearnet-sandbox.yellow.com/ws',
  // These are the addresses from your deployment
  custodyContract: '0x019B65A265EB3363822f2752141b3dF16131b262',
  adjudicatorContract: '0x7c7ccbc98469190849BCC6c926307794fDfB11F2',
  balanceCheckerContract: '0x86700f6bc63a42ee645e204b361d7c0f643c111b',
  // Your prediction market contracts
  predictionMarketContract: '0x9666405EB1cb094bC0E1b83D2be3BD884eD39169',
  mockWETHContract: '0x31443288B8457C6fea1960F7B84CC97DE12e80B6',
};

const BROKERS = {
  alice: {
    name: 'alice',
    address: '0x808d00293b88419ab2Fa0462E1235802768F5f97',
    privateKey: process.env.ALICE_PRIVATE_KEY || ''
  },
  bob: {
    name: 'bob', 
    address: '0xDF1672746762219EA45769263E35C07E6d82c679',
    privateKey: process.env.BOB_PRIVATE_KEY || ''
  }
};

interface P2PTrade {
  id: string;
  from: string;
  to: string;
  tradeType: 'YES' | 'NO';
  amount: string;
  timestamp: number;
  stateVersion: number;
  settled: boolean;
}

class ActualYellowP2P {
  private provider: ethers.JsonRpcProvider;
  private aliceWallet: Wallet;
  private bobWallet: Wallet;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private currentSession: string | null = null;
  private trades: P2PTrade[] = [];
  private stateVersion = 1;
  
  constructor() {
    this.provider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
    );
    
    this.aliceWallet = new Wallet(BROKERS.alice.privateKey, this.provider);
    this.bobWallet = new Wallet(BROKERS.bob.privateKey, this.provider);
  }

  // Connect to actual Yellow Network ClearNode
  async connectToClearNode(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      console.log(`🌐 Connecting to Yellow Network ClearNode...`);
      console.log(`📍 URL: ${YELLOW_CONFIG.clearNodeUrl}`);
      
      this.ws = new WebSocket(YELLOW_CONFIG.clearNodeUrl);
      
      this.ws.onopen = () => {
        console.log(`✅ Connected to Yellow Network ClearNode`);
        this.isConnected = true;
        resolve(true);
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log(`📨 Received from ClearNode:`, message);
          
          // Handle different message types
          if (message.type === 'session_created') {
            this.currentSession = message.sessionId;
            console.log(`🆔 Session created: ${this.currentSession}`);
          }
          
        } catch (error) {
          console.error('❌ Message parsing error:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('❌ ClearNode connection error:', error);
        reject(error);
      };
      
      this.ws.onclose = () => {
        console.log(`🔌 ClearNode connection closed`);
        this.isConnected = false;
      };
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('ClearNode connection timeout'));
        }
      }, 10000);
    });
  }

  // Create application session for P2P trading
  async createApplicationSession(): Promise<string | null> {
    if (!this.ws || !this.isConnected) {
      console.log(`❌ Not connected to ClearNode`);
      return null;
    }
    
    console.log(`🔧 Creating application session...`);
    
    const sessionRequest = {
      type: 'create_session',
      appDefinition: YELLOW_CONFIG.predictionMarketContract,
      participants: [BROKERS.alice.address, BROKERS.bob.address],
      challengeDuration: 600, // 10 minutes
      initialState: {
        version: this.stateVersion,
        balances: {
          [BROKERS.alice.address]: { usdc: '1000', yesShares: '0', noShares: '0' },
          [BROKERS.bob.address]: { usdc: '1000', yesShares: '0', noShares: '0' }
        }
      },
      timestamp: Date.now()
    };
    
    return new Promise((resolve) => {
      const messageHandler = (event: any) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'session_created') {
            this.ws!.removeEventListener('message', messageHandler);
            this.currentSession = message.sessionId;
            console.log(`✅ Application session created: ${this.currentSession}`);
            resolve(this.currentSession);
          }
        } catch (error) {
          console.error('Session creation error:', error);
        }
      };
      
      this.ws!.addEventListener('message', messageHandler);
      this.ws!.send(JSON.stringify(sessionRequest));
      
      // Timeout after 15 seconds
      setTimeout(() => {
        this.ws!.removeEventListener('message', messageHandler);
        console.log(`⏰ Session creation timeout`);
        resolve(null);
      }, 15000);
    });
  }

  // Execute P2P trade via state channel update
  async executeP2PTrade(
    from: 'alice' | 'bob',
    tradeType: 'YES' | 'NO',
    amount: string
  ): Promise<boolean> {
    if (!this.ws || !this.isConnected || !this.currentSession) {
      console.log(`❌ No active session for P2P trade`);
      return false;
    }
    
    console.log(`\n🔄 EXECUTING REAL P2P TRADE`);
    console.log(`📍 Session: ${this.currentSession}`);
    console.log(`👤 From: ${from}`);
    console.log(`📊 Type: ${tradeType} shares`);
    console.log(`💰 Amount: ${amount} USDC`);
    
    const trade: P2PTrade = {
      id: ethers.keccak256(ethers.toUtf8Bytes(`${this.currentSession}-${Date.now()}`)),
      from: from === 'alice' ? BROKERS.alice.address : BROKERS.bob.address,
      to: from === 'alice' ? BROKERS.bob.address : BROKERS.alice.address,
      tradeType,
      amount,
      timestamp: Date.now(),
      stateVersion: ++this.stateVersion,
      settled: false
    };
    
    // Create state update for the trade
    const stateUpdate = {
      type: 'state_update',
      sessionId: this.currentSession,
      version: this.stateVersion,
      trade: {
        id: trade.id,
        from: trade.from,
        to: trade.to,
        type: tradeType,
        amount: amount
      },
      timestamp: Date.now(),
      signature: await this.signStateUpdate(trade)
    };
    
    return new Promise((resolve) => {
      const messageHandler = (event: any) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'state_updated' && message.tradeId === trade.id) {
            this.ws!.removeEventListener('message', messageHandler);
            this.trades.push(trade);
            console.log(`✅ P2P trade executed via Yellow Network`);
            console.log(`🆔 Trade ID: ${trade.id}`);
            console.log(`📊 State Version: ${trade.stateVersion}`);
            resolve(true);
          }
        } catch (error) {
          console.error('Trade execution error:', error);
        }
      };
      
      this.ws!.addEventListener('message', messageHandler);
      this.ws!.send(JSON.stringify(stateUpdate));
      
      // Timeout after 10 seconds
      setTimeout(() => {
        this.ws!.removeEventListener('message', messageHandler);
        console.log(`⏰ Trade execution timeout`);
        resolve(false);
      }, 10000);
    });
  }

  // Sign state update with wallet
  private async signStateUpdate(trade: P2PTrade): Promise<string> {
    const wallet = trade.from === BROKERS.alice.address ? this.aliceWallet : this.bobWallet;
    const message = JSON.stringify({
      sessionId: this.currentSession,
      tradeId: trade.id,
      version: trade.stateVersion,
      timestamp: trade.timestamp
    });
    
    return await wallet.signMessage(message);
  }

  // Display current session state
  displaySessionState(): void {
    console.log(`\n📊 YELLOW NETWORK SESSION STATE`);
    console.log(`🆔 Session ID: ${this.currentSession || 'None'}`);
    console.log(`📊 State Version: ${this.stateVersion}`);
    console.log(`🔢 Total Trades: ${this.trades.length}`);
    console.log(`🔗 ClearNode Connected: ${this.isConnected ? 'Yes' : 'No'}`);
    
    if (this.trades.length > 0) {
      console.log(`\n📋 P2P TRADE HISTORY:`);
      this.trades.forEach((trade, index) => {
        const fromName = trade.from === BROKERS.alice.address ? 'Alice' : 'Bob';
        const toName = trade.to === BROKERS.alice.address ? 'Alice' : 'Bob';
        console.log(`${index + 1}. ${fromName} → ${toName}: ${trade.tradeType} shares (${trade.amount} USDC) - v${trade.stateVersion} ${trade.settled ? '✅' : '⏳'}`);
      });
    }
  }

  // Close session and settle on blockchain
  async closeSessionAndSettle(): Promise<boolean> {
    if (!this.ws || !this.isConnected || !this.currentSession) {
      console.log(`❌ No active session to close`);
      return false;
    }
    
    console.log(`\n🏛️ CLOSING SESSION AND SETTLING ON BLOCKCHAIN`);
    console.log(`🆔 Session: ${this.currentSession}`);
    console.log(`📊 Settling ${this.trades.length} P2P trades`);
    
    // Calculate final state
    let aliceYesShares = 0;
    let aliceNoShares = 0;
    let bobYesShares = 0;
    let bobNoShares = 0;
    
    for (const trade of this.trades) {
      const shares = parseFloat(trade.amount) * 0.95; // 95% conversion rate
      
      if (trade.from === BROKERS.alice.address) {
        if (trade.tradeType === 'YES') {
          aliceYesShares += shares;
        } else {
          aliceNoShares += shares;
        }
      } else {
        if (trade.tradeType === 'YES') {
          bobYesShares += shares;
        } else {
          bobNoShares += shares;
        }
      }
    }
    
    console.log(`💰 Final Alice: ${aliceYesShares} YES, ${aliceNoShares} NO`);
    console.log(`💰 Final Bob: ${bobYesShares} YES, ${bobNoShares} NO`);
    
    // Send close session request
    const closeRequest = {
      type: 'close_session',
      sessionId: this.currentSession,
      finalState: {
        version: this.stateVersion,
        participants: {
          [BROKERS.alice.address]: { yesShares: aliceYesShares, noShares: aliceNoShares },
          [BROKERS.bob.address]: { yesShares: bobYesShares, noShares: bobNoShares }
        }
      },
      timestamp: Date.now()
    };
    
    return new Promise(async (resolve) => {
      const messageHandler = (event: any) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'session_closed') {
            this.ws!.removeEventListener('message', messageHandler);
            console.log(`✅ Session closed on Yellow Network`);
            
            // Execute blockchain settlement
            this.executeBlockchainSettlement(aliceYesShares + bobYesShares, aliceNoShares + bobNoShares)
              .then(() => {
                this.trades.forEach(trade => trade.settled = true);
                resolve(true);
              })
              .catch(() => resolve(false));
          }
        } catch (error) {
          console.error('Session close error:', error);
        }
      };
      
      this.ws!.addEventListener('message', messageHandler);
      this.ws!.send(JSON.stringify(closeRequest));
      
      // Timeout after 15 seconds
      setTimeout(() => {
        this.ws!.removeEventListener('message', messageHandler);
        console.log(`⏰ Session close timeout`);
        resolve(false);
      }, 15000);
    });
  }

  // Execute final blockchain settlement
  private async executeBlockchainSettlement(totalYesShares: number, totalNoShares: number): Promise<void> {
    console.log(`🏛️ Executing blockchain settlement...`);
    
    if (totalYesShares === 0 && totalNoShares === 0) {
      console.log(`⚠️ No shares to settle`);
      return;
    }
    
    try {
      const mockWETHAbi = [
        'function mint(address to, uint256 amount) external',
        'function approve(address spender, uint256 amount) external returns (bool)'
      ];
      
      const predictionMarketAbi = [
        'function buyYes(uint256 amount, uint256 minShares) external returns (uint256)',
        'function buyNo(uint256 amount, uint256 minShares) external returns (uint256)'
      ];
      
      const mockWETH = new ethers.Contract(YELLOW_CONFIG.mockWETHContract, mockWETHAbi, this.aliceWallet);
      const predictionMarket = new ethers.Contract(YELLOW_CONFIG.predictionMarketContract, predictionMarketAbi, this.aliceWallet);
      
      const totalAmount = totalYesShares + totalNoShares;
      const settlementAmount = parseUnits(totalAmount.toString(), 18);
      
      console.log(`💰 Settlement amount: ${totalAmount} WETH`);
      
      // Mint and approve
      const mintTx = await mockWETH.mint(this.aliceWallet.address, settlementAmount);
      await mintTx.wait();
      console.log(`✅ Minted WETH: ${mintTx.hash}`);
      
      const approveTx = await mockWETH.approve(YELLOW_CONFIG.predictionMarketContract, settlementAmount);
      await approveTx.wait();
      console.log(`✅ Approved WETH: ${approveTx.hash}`);
      
      // Execute settlement trades
      if (totalYesShares > 0) {
        const yesTx = await predictionMarket.buyYes(parseUnits(totalYesShares.toString(), 18), 0);
        await yesTx.wait();
        console.log(`✅ YES settlement: ${yesTx.hash}`);
      }
      
      if (totalNoShares > 0) {
        const noTx = await predictionMarket.buyNo(parseUnits(totalNoShares.toString(), 18), 0);
        await noTx.wait();
        console.log(`✅ NO settlement: ${noTx.hash}`);
      }
      
      console.log(`✅ Blockchain settlement complete`);
      
    } catch (error) {
      console.error('❌ Blockchain settlement error:', error);
      throw error;
    }
  }

  // Run the complete actual Yellow Network P2P flow
  async runActualP2P(): Promise<void> {
    console.log(`\n🚀 ACTUAL YELLOW NETWORK P2P TRADING`);
    console.log(`===================================`);
    console.log(`Using Real Yellow Network Infrastructure`);
    
    try {
      // Step 1: Connect to ClearNode
      await this.connectToClearNode();
      
      // Step 2: Create application session
      const sessionId = await this.createApplicationSession();
      if (!sessionId) {
        console.log(`❌ Failed to create application session`);
        return;
      }
      
      // Step 3: Execute P2P trades
      console.log(`\n🔄 Executing P2P trades via Yellow Network...`);
      
      const trade1 = await this.executeP2PTrade('alice', 'YES', '100');
      const trade2 = await this.executeP2PTrade('bob', 'NO', '75');
      const trade3 = await this.executeP2PTrade('alice', 'YES', '50');
      
      if (trade1 && trade2 && trade3) {
        console.log(`✅ All P2P trades executed successfully`);
      } else {
        console.log(`⚠️ Some P2P trades failed`);
      }
      
      // Step 4: Display session state
      this.displaySessionState();
      
      // Step 5: Close session and settle
      const settled = await this.closeSessionAndSettle();
      
      if (settled) {
        console.log(`\n✅ ACTUAL YELLOW NETWORK P2P COMPLETE!`);
        console.log(`🌐 Trades executed via real Yellow Network ClearNode`);
        console.log(`🏛️ Final settlement on Sepolia blockchain`);
        
        // Final state display
        this.displaySessionState();
      } else {
        console.log(`❌ Settlement failed`);
      }
      
      // Step 6: Close connection
      if (this.ws) {
        this.ws.close();
      }
      
    } catch (error) {
      console.error('❌ Actual P2P error:', error);
    }
  }
}

// Main execution
async function main() {
  const actualP2P = new ActualYellowP2P();
  await actualP2P.runActualP2P();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
