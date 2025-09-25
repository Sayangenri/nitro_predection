// src/index.cjs
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { ethers } = require('ethers'); // v5
const EventEmitter = require('events');

const {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAuthVerifyMessageFromChallenge,
  createAuthVerifyMessageWithJWT,
  createEIP712AuthMessageSigner,
  createGetLedgerBalancesMessage,
  createGetConfigMessage,
  createGetChannelsMessage,
  createAppSessionMessage,
  parseRPCResponse,
  RPCMethod
} = require('@erc7824/nitrolite');

const JWT_FILE = path.resolve(process.cwd(), '.clearnode_jwt.json');

function saveJwtToDisk(token, expiry) {
  try { fs.writeFileSync(JWT_FILE, JSON.stringify({ token, expiry }, null, 2)); } catch (_) {}
}
function loadJwtFromDisk() {
  try { return JSON.parse(fs.readFileSync(JWT_FILE, 'utf8')) || {}; } catch (_) { return {}; }
}

class ClearNodeConnection extends EventEmitter {
  /**
   * url: ws url
   * wallet: ethers.Wallet (v5)
   * opts: { debug, appName, applicationAddr, participantAddr, scope, expireSeconds, allowances, reconnectInterval, maxReconnectAttempts }
   */
  constructor(url, wallet, opts = {}) {
    super();
    this.url = url;
    this.stateWallet = wallet;
    this.ws = null;

    this.debug = !!(opts.debug || process.env.DEBUG === 'true');
    this.appName = opts.appName ?? process.env.APP_NAME ?? 'Clearsdk';
    this.applicationAddr = opts.applicationAddr ?? process.env.APPLICATION_ADDR ?? null;
    this.participantAddr = opts.participantAddr ?? process.env.PARTICIPANT_ADDR ?? wallet.address;
    this.scope = opts.scope ?? process.env.SCOPE ?? 'console';
    this.expireSeconds = opts.expireSeconds ?? parseInt(process.env.EXPIRE_SECONDS || '3600', 10);
    this.allowances = Array.isArray(opts.allowances) ? opts.allowances : [];

    this.reconnectInterval = opts.reconnectInterval ?? (parseInt(process.env.RECONNECT_INTERVAL_MS) || 3000);
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? (parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 5);
    this.pingIntervalMs = opts.pingIntervalMs ?? (parseInt(process.env.PING_INTERVAL_MS) || 20000);
    this.requestTimeoutMs = opts.requestTimeoutMs ?? (parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000);

    if (!this.applicationAddr || !ethers.utils.isAddress(this.applicationAddr)) {
      throw new Error('APPLICATION_ADDR must be set to a valid address (set in .env)');
    }
    if (!this.participantAddr || !ethers.utils.isAddress(this.participantAddr)) {
      throw new Error('PARTICIPANT_ADDR (or wallet.address) must be a valid address');
    }

    this.requestMap = new Map();
    this._pingTimer = null;

    const persisted = loadJwtFromDisk();
    this.jwt = persisted.token || null;
    this.jwtExpiry = persisted.expiry || null;

    this._lastAuthParams = null;
    this.reconnectAttempts = 0;
    this.isConnected = false;
    this.isAuthenticated = false;
  }

  _dbg(...args) { if (this.debug) console.log(...args); }

  // Sign plain JSON payload (non EIP-191)
  async messageSigner(payload) {
    const message = JSON.stringify(payload);
    const digestHex = ethers.utils.id(message);
    const sigObj = this.stateWallet._signingKey().signDigest(digestHex);
    return ethers.utils.joinSignature(sigObj);
  }

  // canonical signed request for general RPC
  async createSignedRequest(method, params = {}, requestId) {
    const id = requestId ?? Date.now();
    const timestamp = Math.floor(Date.now());
    const requestData = [id, method, params, timestamp];
    const request = { req: requestData };
    const digestHex = ethers.utils.id(JSON.stringify(request));
    const sigObj = this.stateWallet._signingKey().signDigest(digestHex);
    request.sig = [ethers.utils.joinSignature(sigObj)];
    return { request, requestId: id };
  }

  _buildAuthParams() {
    const now = Math.floor(Date.now() / 1000);
    return {
      wallet: this.stateWallet.address,
      participant: this.participantAddr,
      app_name: this.appName,
      scope: this.scope,
      application: this.applicationAddr,
      expire: now + this.expireSeconds,
      allowances: this.allowances
    };
  }

  async connect() {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        try { this.ws.terminate(); } catch (_) {}
        this.ws = null;
      }

      this.emit('connecting');
      this.ws = new WebSocket(this.url);

      const connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          try { this.ws.terminate(); } catch (_) {}
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.ws.on('open', async () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._startPing();
        this.emit('connected');
        this._dbg('[debug] ws open');

        try {
          // If persisted JWT exists, attempt resume using helper
          if (this.jwt) {
            const authVerifyMsg = await createAuthVerifyMessageWithJWT(this.jwt);
            this._dbg('>>> OUTGOING auth_verify (JWT resume):', typeof authVerifyMsg === 'string' ? authVerifyMsg : JSON.stringify(authVerifyMsg, null, 2));
            this.ws.send(typeof authVerifyMsg === 'string' ? authVerifyMsg : JSON.stringify(authVerifyMsg));
            return;
          }

          // Build auth params (include app_name per docs)
          const authParams = this._buildAuthParams();
          this._lastAuthParams = authParams;

          // Try helper createAuthRequestMessage (may return string)
          let helperMsg = null;
          try { helperMsg = await createAuthRequestMessage(authParams); } catch (e) { this._dbg('createAuthRequestMessage helper threw:', e?.message || e); helperMsg = null; }

          if (helperMsg) {
            this._dbg('>>> OUTGOING auth_request (helper):', typeof helperMsg === 'string' ? helperMsg : JSON.stringify(helperMsg, null, 2));
            this.ws.send(typeof helperMsg === 'string' ? helperMsg : JSON.stringify(helperMsg));
          } else {
            // fallback: canonical signed request
            const { request } = await this.createSignedRequest('auth_request', authParams);
            this._dbg('>>> OUTGOING auth_request (signed canonical):', JSON.stringify(request, null, 2));
            this.ws.send(JSON.stringify(request));
          }
        } catch (err) {
          clearTimeout(connectionTimeout);
          this.emit('error', 'Auth request creation failed: ' + (err.message || err));
          reject(err);
        }
      });

      this.ws.on('message', async (raw) => {
        let parsed;
        try {
          parsed = parseRPCResponse(raw.toString());
        } catch (e) {
          try { parsed = JSON.parse(raw.toString()); } catch (err) { this._dbg('Failed to parse incoming'); return; }
        }

        this._dbg('<<< INCOMING:', JSON.stringify(parsed, null, 2));
        this.emit('message', parsed);

        try {
          // RPC-style object with method
          if (parsed && parsed.method) {
            switch (parsed.method) {
              case RPCMethod.AuthChallenge: {
                this._dbg('AuthChallenge (RPC) received');

                const base = this._lastAuthParams || {
                  scope: parsed.params?.scope,
                  application: parsed.params?.application,
                  participant: parsed.params?.participant,
                  expire: parsed.params?.expire,
                  allowances: parsed.params?.allowances || []
                };

                const eip712Signer = createEIP712AuthMessageSigner(
                  this.stateWallet,
                  {
                    scope: base.scope,
                    application: base.application,
                    participant: base.participant,
                    expire: base.expire,
                    allowances: base.allowances || []
                  },
                  { name: this.appName }
                );

                let authVerifyMsg;
                if (parsed.params?.challengeMessage && typeof createAuthVerifyMessageFromChallenge === 'function') {
                  authVerifyMsg = await createAuthVerifyMessageFromChallenge(eip712Signer, parsed.params.challengeMessage);
                } else {
                  authVerifyMsg = await createAuthVerifyMessage(eip712Signer, parsed);
                }

                this._dbg('>>> OUTGOING auth_verify (RPC/EIP-712):', typeof authVerifyMsg === 'string' ? authVerifyMsg : JSON.stringify(authVerifyMsg, null, 2));
                this.ws.send(typeof authVerifyMsg === 'string' ? authVerifyMsg : JSON.stringify(authVerifyMsg));
                return;
              }

              case RPCMethod.AuthVerify: {
                this._dbg('AuthVerify (RPC) response:', JSON.stringify(parsed.params || parsed, null, 2));
                const ok = parsed.params && (parsed.params.success === true || parsed.params.authenticated === true);
                if (!ok) {
                  this.emit('error', 'Authentication failed (AuthVerify RPC)');
                  return reject(new Error('Authentication failed'));
                }
                const jwt = parsed.params?.jwtToken || parsed.params?.token || parsed.params?.session_key || null;
                if (jwt) {
                  this.jwt = jwt;
                  this.jwtExpiry = parsed.params?.expires_at || null;
                  saveJwtToDisk(this.jwt, this.jwtExpiry);
                  this.emit('jwt', { token: this.jwt, expiry: this.jwtExpiry });
                }
                this.isAuthenticated = true;
                this.emit('authenticated');
                return resolve();
              }

              case RPCMethod.Error: {
                this._dbg('RPC Error:', parsed.params);
                this.emit('error', parsed.params);
                return;
              }
            }
          }

          // Legacy array format
          if (parsed && parsed.res) {
            const t = parsed.res[1];

            if (t === 'auth_challenge') {
              this._dbg('AuthChallenge (legacy) received');
              const base = this._lastAuthParams || {};
              const eip712Signer = createEIP712AuthMessageSigner(
                this.stateWallet,
                {
                  scope: base.scope,
                  application: base.application,
                  participant: base.participant,
                  expire: base.expire,
                  allowances: base.allowances || []
                },
                { name: this.appName }
              );

              const authVerifyMsg = await createAuthVerifyMessage(eip712Signer, parsed, this.stateWallet.address);
              this._dbg('>>> OUTGOING auth_verify (legacy):', typeof authVerifyMsg === 'string' ? authVerifyMsg : JSON.stringify(authVerifyMsg, null, 2));
              this.ws.send(typeof authVerifyMsg === 'string' ? authVerifyMsg : JSON.stringify(authVerifyMsg));
              return;
            }

            if (t === 'auth_success' || t === 'auth_verify') {
              this._dbg('auth success/verify (legacy) received');
              try {
                const payload = parsed.res[2];
                const tok = (Array.isArray(payload) && payload[0] && (payload[0].jwt || payload[0].token || payload[0].session_key))
                  || (payload && (payload.jwt || payload.token || payload.session_key));
                if (tok) {
                  this.jwt = tok;
                  this.jwtExpiry = payload?.[0]?.expires_at || payload?.expires_at || null;
                  saveJwtToDisk(this.jwt, this.jwtExpiry);
                  this.emit('jwt', { token: this.jwt, expiry: this.jwtExpiry });
                }
              } catch (_) {}
              this.isAuthenticated = true;
              this.emit('authenticated');
              return resolve();
            }

            if (t === 'auth_failure') {
              this.emit('error', `Authentication failed: ${JSON.stringify(parsed.res[2])}`);
              return reject(new Error('Authentication failed'));
            }

            // route by request id
            if (parsed.res?.[0]) {
              const rid = parsed.res[0];
              const handler = this.requestMap.get(rid);
              if (handler) { handler.resolve(parsed); this.requestMap.delete(rid); }
            }
          }
        } catch (err) {
          console.error('Error handling incoming message:', err);
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(connectionTimeout);
        this.emit('error', 'WebSocket error: ' + (err && err.message ? err.message : err));
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        clearTimeout(connectionTimeout);
        this.isConnected = false;
        this.isAuthenticated = false;
        const r = reason && Buffer.isBuffer(reason) ? reason.toString('utf8') : reason;
        this.emit('disconnected', { code, reason: r || '' });
        this._stopPing();
        this.attemptReconnect();
      });
    });
  }

  // send already-built nitrolite messages (they include req id)
  async _sendPrebuiltMessage(message, label = '') {
    if (!this.isConnected || !this.isAuthenticated) throw new Error('Not connected or authenticated');
    return new Promise((resolve, reject) => {
      try {
        const parsed = typeof message === 'string' ? JSON.parse(message) : message;
        const requestId = parsed.req[0];
        const timeout = setTimeout(() => { this.requestMap.delete(requestId); reject(new Error(`Request timeout: ${label}`)); }, this.requestTimeoutMs);
        this.requestMap.set(requestId, { resolve: (res) => { clearTimeout(timeout); resolve(res); }, reject, timeout });
        this._dbg(`>>> OUTGOING ${label}:`, typeof message === 'string' ? message : JSON.stringify(message, null, 2));
        this.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
      } catch (err) { reject(err); }
    });
  }

  async getChannels() {
    const msg = await createGetChannelsMessage((p) => this.messageSigner(p), this.stateWallet.address);
    return this._sendPrebuiltMessage(msg, 'getChannels');
  }
  async getLedgerBalances(channelId) {
    const msg = await createGetLedgerBalancesMessage((p) => this.messageSigner(p), channelId);
    return this._sendPrebuiltMessage(msg, 'getLedgerBalances');
  }
  async getConfig() {
    const msg = await createGetConfigMessage((p) => this.messageSigner(p), this.stateWallet.address);
    return this._sendPrebuiltMessage(msg, 'getConfig');
  }

  async createAppSession(appDefs) {
    if (!this.isConnected || !this.isAuthenticated) throw new Error('Not connected or authenticated');
    const msg = await createAppSessionMessage((p) => this.messageSigner(p), appDefs);
    return this._sendPrebuiltMessage(msg, 'createAppSession');
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) { this.emit('error', 'Max reconnect reached'); return; }
    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    setTimeout(() => { this.connect().catch(e => this._dbg('reconnect failed', e)); }, delay);
  }

  disconnect() {
    if (this.ws) {
      for (const [id, handler] of this.requestMap.entries()) { clearTimeout(handler.timeout); try { handler.reject(new Error('Connection closed')); } catch (_) {} this.requestMap.delete(id); }
      try { this.ws.close(1000, 'User disconnect'); } catch (_) { try { this.ws.terminate(); } catch (_) {} }
      this.ws = null;
    }
    this._stopPing();
  }

  _startPing() {
    this._stopPing();
    if (!this.pingIntervalMs || !this.ws) return;
    this._pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { if (typeof this.ws.ping === 'function') this.ws.ping(); else this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (_) {}
      }
    }, this.pingIntervalMs);
  }
  _stopPing() { if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; } }

  getJwt() { return { token: this.jwt, expiry: this.jwtExpiry }; }
}

module.exports = ClearNodeConnection;
