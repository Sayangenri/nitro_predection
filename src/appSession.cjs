const { createAppSessionMessage } = require('@erc7824/nitrolite');
const { ethers } = require('ethers');

/**
 * Create an app session
 * @param {string} participantA - First participant's address
 * @param {string} participantB - Second participant's address
 * @param {WebSocket} ws - WebSocket connection (already authenticated)
 * @param {object} wallet - ethers.Wallet for signing
 * @returns {Promise<string>} The app session ID
 */
async function createAppSession(participantA, participantB, ws, wallet) {
  console.log(`Creating app session between ${participantA} and ${participantB}`);

  // Ethers v5-compatible signer
  const messageSigner = async (payload) => {
    const message = JSON.stringify(payload);
    const digestHex = ethers.utils.id(message); // keccak256
    const sigObj = wallet._signingKey().signDigest(digestHex);
    return ethers.utils.joinSignature(sigObj);
  };

  const appDefinition = {
    protocol: "nitroliterpc",
    participants: [participantA, participantB],
    weights: [100, 0],
    quorum: 100,
    challenge: 0,
    nonce: Date.now(),
  };

  const amount = "1000000"; // 1 USDC (6 decimals)
  const allocations = [
    { participant: participantA, asset: "usdc", amount },
    { participant: participantB, asset: "usdc", amount: "0" },
  ];

  const signedMessage = await createAppSessionMessage(messageSigner, [
    { definition: appDefinition, allocations },
  ]);

  return new Promise((resolve, reject) => {
    const handleResponse = (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        console.log("<<< INCOMING (app session):", msg);

        if (msg.res && (msg.res[1] === "create_app_session" || msg.res[1] === "app_session_created")) {
          ws.removeListener("message", handleResponse);
          const id = msg.res[2]?.[0]?.app_session_id;
          if (!id) return reject(new Error("No app_session_id in response"));
          resolve(id);
        }

        if (msg.err) {
          ws.removeListener("message", handleResponse);
          reject(new Error(`Error ${msg.err[1]}: ${msg.err[2]}`));
        }
      } catch (err) {
        console.error("Error parsing app session response:", err);
      }
    };

    ws.on("message", handleResponse);

    setTimeout(() => {
      ws.removeListener("message", handleResponse);
      reject(new Error("App session creation timeout"));
    }, 10000);

    ws.send(typeof signedMessage === "string" ? signedMessage : JSON.stringify(signedMessage));
  });
}

module.exports = { createAppSession };
