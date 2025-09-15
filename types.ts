/**
 * Portugal 2026 World Cup Prediction Market Types
 * Built with Nitrolite SDK and ERC-7824 State Channels
 */

export interface PredictionMarketState {
  /** YES shares outstanding (scaled by 1e18) */
  qYes: bigint;
  
  /** NO shares outstanding (scaled by 1e18) */
  qNo: bigint;
  
  /** Total trading volume (scaled by 1e18) */
  totalVolume: bigint;
  
  /** Number of transactions */
  txCount: bigint;
  
  /** Current LMSR liquidity parameter (scaled by 1e18) */
  b: bigint;
  
  /** Market resolution status */
  resolved: boolean;
  
  /** Final outcome (true = Portugal wins, false = Portugal loses) */
  yesWins: boolean;
  
  /** State sequence number for ordering */
  sequence: bigint;
  
  /** Timestamp of last update */
  lastUpdated: bigint;
  
  /** Fee rate in basis points (50 = 0.5%) */
  feeRate: bigint;
  
  /** Accumulated fees */
  feesCollected: bigint;
}

export interface TradeIntent {
  /** Trader address */
  trader: string;
  
  /** Outcome being purchased */
  outcome: 'yes' | 'no';
  
  /** Payment amount (scaled by 1e18) */
  amount: bigint;
  
  /** Minimum shares expected (slippage protection) */
  minShares: bigint;
  
  /** Trade timestamp */
  timestamp: bigint;
  
  /** Nonce for replay protection */
  nonce: bigint;
}

export interface UserPosition {
  /** User address */
  address: string;
  
  /** YES shares held */
  yesShares: bigint;
  
  /** NO shares held */
  noShares: bigint;
  
  /** Total amount invested */
  totalInvested: bigint;
  
  /** Last activity timestamp */
  lastActivity: bigint;
}

export interface MarketStats {
  /** Current YES price (0-1, scaled by 1e18) */
  priceYes: bigint;
  
  /** Current NO price (0-1, scaled by 1e18) */
  priceNo: bigint;
  
  /** Total market volume */
  totalVolume: bigint;
  
  /** Number of unique traders */
  uniqueTraders: number;
  
  /** Total transactions */
  totalTxs: bigint;
  
  /** Current liquidity parameter */
  currentB: bigint;
  
  /** Market status */
  status: 'active' | 'resolved' | 'paused';
}

export interface TradePreview {
  /** Expected shares to receive */
  expectedShares: bigint;
  
  /** New price after trade */
  newPrice: bigint;
  
  /** Price impact percentage (scaled by 1e18) */
  priceImpact: bigint;
  
  /** Average price per share */
  avgPrice: bigint;
  
  /** Fee amount */
  fee: bigint;
  
  /** Net amount after fees */
  netAmount: bigint;
}

export interface ChannelConfig {
  /** Channel ID from apps.yellow.com */
  channelId: string;
  
  /** Custody contract address */
  custodyContract: string;
  
  /** Adjudicator contract address */
  adjudicatorContract: string;
  
  /** Supported tokens */
  supportedTokens: string[];
  
  /** Chain ID */
  chainId: number;
  
  /** ClearNode WebSocket URL */
  clearNodeUrl: string;
}

export interface ResolutionProposal {
  /** Proposed outcome */
  yesWins: boolean;
  
  /** Proposer address */
  proposer: string;
  
  /** Proposal timestamp */
  proposedAt: bigint;
  
  /** Challenge period end time */
  challengePeriodEnd: bigint;
  
  /** Resolution data/proof */
  resolutionData: string;
  
  /** Proposal status */
  status: 'pending' | 'finalized' | 'challenged';
}

export type MessageType = 
  | 'trade_intent'
  | 'state_update'
  | 'price_update'
  | 'resolution_proposal'
  | 'challenge'
  | 'settlement';

export interface ChannelMessage {
  /** Message type */
  type: MessageType;
  
  /** Message payload */
  payload: any;
  
  /** Sender address */
  from: string;
  
  /** Timestamp */
  timestamp: bigint;
  
  /** Message signature */
  signature: string;
  
  /** Sequence number */
  sequence: bigint;
}

export interface LMSRParams {
  /** Base liquidity parameter */
  b0: bigint;
  
  /** Volume scaling factor (alpha) */
  alpha: bigint;
  
  /** Transaction count scaling factor (beta) */
  beta: bigint;
  
  /** Reference volume for normalization */
  V0: bigint;
}

export const DEFAULT_LMSR_PARAMS: LMSRParams = {
  b0: BigInt(100) * BigInt(10**18), // 100 tokens
  alpha: BigInt(5) * BigInt(10**16), // 0.05
  beta: BigInt(2) * BigInt(10**16),  // 0.02
  V0: BigInt(1000000) * BigInt(10**18) // 1M tokens
};

export const DEFAULT_FEE_RATE = BigInt(50); // 0.5% in basis points

export const CHALLENGE_PERIOD = 48 * 60 * 60; // 48 hours in seconds

