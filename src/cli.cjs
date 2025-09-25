// src/cli.cjs
require('dotenv').config();
const { ethers } = require('ethers');
const ClearNodeConnection = require('./index.cjs');

(async function main(){
  const { WS_URL, PRIVATE_KEY, PARTICIPANT_A, PARTICIPANT_B, APPLICATION_ADDR, APP_NAME } = process.env;

  if (!WS_URL || !PRIVATE_KEY || !APPLICATION_ADDR) {
    console.error('Please set WS_URL, PRIVATE_KEY and APPLICATION_ADDR in .env');
    process.exit(1);
  }

  const wallet = new ethers.Wallet(PRIVATE_KEY);

  const clearNode = new ClearNodeConnection(WS_URL, wallet, {
    debug: true,
    appName: APP_NAME || 'MyApp',
    applicationAddr: APPLICATION_ADDR,
    participantAddr: process.env.PARTICIPANT_ADDR || wallet.address,
    scope: process.env.SCOPE || 'console'
  });

  clearNode.on('connecting', () => console.log('[event] connecting'));
  clearNode.on('connected', () => console.log('[event] connected'));
  clearNode.on('authenticated', () => console.log('[event] authenticated'));
  clearNode.on('disconnected', (i) => console.log('[event] disconnected', i));
  clearNode.on('reconnecting', (i) => console.log('[event] reconnecting', i));
  clearNode.on('message', (m) => {}); // debug prints incoming
  clearNode.on('jwt', (t) => console.log('[event] jwt saved', t));
  clearNode.on('error', (e) => console.error('[event] error', e));

  try {
    await clearNode.connect();
    console.log('✔ Authenticated, stored JWT (if returned):', clearNode.getJwt());

    // getConfig example
    try {
      const cfg = await clearNode.getConfig();
      console.log('getConfig:', JSON.stringify(cfg, null, 2));
    } catch (e) { console.error('getConfig error', e); }

    // createAppSession example using PARTICIPANT_A and PARTICIPANT_B env vars
    if (PARTICIPANT_A && PARTICIPANT_B && ethers.utils.isAddress(PARTICIPANT_A) && ethers.utils.isAddress(PARTICIPANT_B)) {
      const appDefinition = {
        protocol: 'nitroliterpc',
        participants: [PARTICIPANT_A, PARTICIPANT_B],
        weights: [100, 0],
        quorum: 100,
        challenge: 0,
        nonce: Date.now()
      };
      const allocations = [
        { participant: PARTICIPANT_A, asset: 'usdc', amount: '1000000' },
        { participant: PARTICIPANT_B, asset: 'usdc', amount: '0' }
      ];

      try {
        const resp = await clearNode.createAppSession([{ definition: appDefinition, allocations }]);
        console.log('createAppSession response:', JSON.stringify(resp, null, 2));
      } catch (err) {
        console.error('createAppSession failed:', err);
      }
    } else {
      console.log('Skipping createAppSession (set PARTICIPANT_A & PARTICIPANT_B in .env)');
    }

  } catch (err) {
    console.error('Startup/auth error:', err);
  } finally {
    clearNode.disconnect();
  }
})();
