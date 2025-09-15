# 🇵🇹 Portugal 2026 World Cup Prediction Market

A binary prediction market built with **Nitrolite SDK** and **ERC-7824 state channels** asking: **"Will Portugal win the 2026 World Cup?"**

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Your channel created at [apps.yellow.com](https://apps.yellow.com)
- Private key with some USDC on Polygon

### Installation

```bash
cd nitrolite-prediction-market
npm install
```

### Configuration

1. **Copy environment file:**
```bash
cp env.example .env
```

2. **Fill in your details in `.env`:**
```env
PRIVATE_KEY=your_private_key_without_0x
CHANNEL_ID=0xcf7186f44534  # Your channel ID from apps.yellow.com
CUSTODY_CONTRACT=0x...     # Get from apps.yellow.com dashboard
ADJUDICATOR_CONTRACT=0x... # Get from apps.yellow.com dashboard
```

3. **Get contract addresses:**
   - Go to [apps.yellow.com](https://apps.yellow.com)
   - Click on your channel: `0xcf7186...f44534`
   - Copy the custody and adjudicator contract addresses
   - Paste them into your `.env` file

### Usage

#### CLI Interface (Recommended for Testing)

```bash
npm run dev:cli
```

This starts an interactive CLI where you can:
- Check market status and prices
- Buy YES/NO shares
- View detailed statistics
- Resolve the market (admin only)

#### Programmatic Usage

```typescript
import { createPredictionMarket } from './src/index.js';

// Create client
const client = await createPredictionMarket(process.env.PRIVATE_KEY);

// Check prices
const prices = await client.getCurrentPrices();
console.log(`YES: ${prices.yes * 100}%, NO: ${prices.no * 100}%`);

// Buy YES shares
await client.executeTrade('yes', BigInt('1000000000000000000'), BigInt(0)); // 1 USDC

// Get market stats
const stats = await client.getMarketStats();
console.log('Volume:', stats.volume, 'USDC');
```

## 🏗️ Architecture

### State Channel Design

This prediction market runs entirely in **state channels** using the Nitrolite SDK:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Your Client   │◄──►│   ClearNode      │◄──►│  Other Traders  │
│                 │    │  (Yellow Network)│    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Off-Chain State Channel                       │
│  • Instant trades (no gas fees)                                │
│  • LMSR pricing calculated locally                             │
│  • State updates broadcast to participants                     │
│  • Settlement happens on Polygon when needed                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **`nitrolite-client.ts`** - Main client connecting to ClearNode
2. **`lmsr.ts`** - Off-chain LMSR pricing engine
3. **`types.ts`** - TypeScript interfaces for state management
4. **`config.ts`** - Configuration for your channel
5. **`cli.ts`** - Interactive command-line interface

## 📊 LMSR Economics

### Cost Function
```
C(q_yes, q_no) = b * ln(e^(q_yes/b) + e^(q_no/b))
```

### Dynamic Liquidity
```
b = b0 * (1 + α*√(volume/V0) + β*ln(1+tx_count))
```

Where:
- `b0 = 100 USDC` (base liquidity)
- `α = 0.05` (volume scaling)
- `β = 0.02` (transaction scaling)
- `V0 = 1M USDC` (reference volume)

### Pricing
- **Initial**: YES 50%, NO 50%
- **Updates**: Based on LMSR as trades occur
- **Fee**: 0.5% on each purchase

## 🎯 Trading Examples

### Buy YES Shares
```bash
> buy yes 10.5 2.0
🎲 Buying YES shares for 10.5 USDC...
✅ Trade executed successfully!
📈 Shares received: 10.245
💸 Fee paid: 0.0525 USDC
📊 New prices: YES 52.3%, NO 47.7%
```

### Check Market Status
```bash
> status
📊 Market Status:
   Question: Will Portugal win the 2026 World Cup?
   Status: ACTIVE 🟢
   YES Price: 52.3%
   NO Price: 47.7%
   Volume: 45.7 USDC
   Transactions: 12
```

## 🔧 Development

### Build
```bash
npm run build
```

### Run CLI
```bash
npm run dev:cli
```

### Run Example
```bash
npm run dev
```

### Test Connection
```bash
# Test WebSocket connection to ClearNode
node -e "
const ws = require('ws');
const socket = new WebSocket('wss://clearnet.yellow.com/ws');
socket.on('open', () => console.log('✅ Connected to ClearNode'));
socket.on('error', (err) => console.error('❌ Connection failed:', err));
"
```

## 📋 Channel Setup Checklist

- [ ] ✅ Created channel at [apps.yellow.com](https://apps.yellow.com)
- [ ] ✅ Channel ID: `0xcf7186...f44534`
- [ ] ✅ Status: Open
- [ ] ✅ Asset: USDC on Polygon
- [ ] ⏳ Get custody contract address from dashboard
- [ ] ⏳ Get adjudicator contract address from dashboard
- [ ] ⏳ Update `.env` file with contract addresses
- [ ] ⏳ Test connection to ClearNode
- [ ] ⏳ Create application session
- [ ] ⏳ Execute first trade

## 🚨 Troubleshooting

### Common Issues

1. **"Client not initialized"**
   - Make sure you set `PRIVATE_KEY` in `.env`
   - Check that your private key is valid (no 0x prefix)

2. **"WebSocket connection failed"**
   - Verify ClearNode URL: `wss://clearnet.yellow.com/ws`
   - Check your internet connection
   - Try running: `curl -I https://clearnet.yellow.com`

3. **"Missing contract addresses"**
   - Go to [apps.yellow.com](https://apps.yellow.com)
   - Click on your channel
   - Copy custody and adjudicator addresses to `.env`

4. **"Authentication failed"**
   - Ensure your wallet has USDC on Polygon
   - Check that your channel is "Open" status
   - Verify you're using the correct channel ID

### Debug Mode
```bash
NODE_ENV=development npm run dev:cli
```

## 🔗 Links

- **Channel Dashboard**: [apps.yellow.com](https://apps.yellow.com)
- **Nitrolite Docs**: [erc7824.org](https://erc7824.org)
- **Yellow Network**: [yellow.org](https://yellow.org)
- **Polygon Explorer**: [polygonscan.com](https://polygonscan.com)

## 📝 License

MIT License - see LICENSE file for details.

---

**Ready to trade on Portugal's World Cup chances?** 🏆

Start with: `npm run dev:cli`

