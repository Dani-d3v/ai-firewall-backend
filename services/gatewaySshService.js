const fs = require("fs");
const { Client } = require("ssh2");
const env = require("../config/env");

const PEER_DROP_DIR = "/etc/wireguard/new_peers";
const WG_INTERFACE = "wg0"; // Matches your Gateway setup

/**
 * Decodes and formats the Private Key for the ssh2 library.
 * Handles Base64, flattened strings, and file paths.
 */
const getPrivateKey = () => {
  let rawKey = (env.GATEWAY_PRIVATE_KEY || "").trim();

  if (!rawKey) {
    throw new Error("GATEWAY_PRIVATE_KEY is missing in Environment variables.");
  }

  // 1. Clean up common copy-paste errors
  // This removes literal "\n" strings, actual newlines, and extra spaces
  let cleanBody = rawKey
    .replace(/\\n/g, "")           // Removes literal "\n"
    .replace(/\n/g, "")             // Removes actual newlines
    .replace(/\s/g, "")             // Removes all spaces
    .replace("-----BEGINOPENSSHPRIVATEKEY-----", "")
    .replace("-----ENDOPENSSHPRIVATEKEY-----", "");

  // 2. Reconstruct the key with the exact format ssh2 requires
  // The header and footer MUST be on their own lines
  const formattedKey = [
    "-----BEGIN OPENSSH PRIVATE KEY-----",
    cleanBody,
    "-----END OPENSSH PRIVATE KEY-----"
  ].join("\n");

  return formattedKey;
};

/**
 * Executes a command on the Remote Gateway VM via SSH
 */
const runRemoteCommand = (command) =>
  new Promise((resolve, reject) => {
    const client = new Client();
    
    // Use the variable names exactly as defined in your env config
    const connectionConfig = {
      host: env.GATEWAY_HOST,
      port: parseInt(env.GATEWAY_PORT) || 22,
      username: env.GATEWAY_USERNAME || "abrahamasrat44",
      privateKey: getPrivateKey(),
      readyTimeout: 20000,
    };

    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            return reject(error);
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code) => {
              client.end();
              if (code === 0) {
                resolve({ stdout, stderr });
              } else {
                reject(new Error(stderr.trim() || `Remote command failed (code ${code})`));
              }
            })
            .on("data", (data) => {
              stdout += data.toString();
            });

          stream.stderr.on("data", (data) => {
            stderr += data.toString();
          });
        });
      })
      .on("error", (err) => {
        console.error("❌ SSH Connection Error:", err.message);
        reject(err);
      })
      .connect(connectionConfig);
  });

/**
 * Provisions a new WireGuard peer by writing a JSON file to the Gateway
 */
const createPeerProvisioningRequest = async ({ userId, publicKey, assignedIp }) => {
  const payload = JSON.stringify({
    public_key: publicKey,
    assigned_ip: assignedIp,
  });

  const remotePath = `${PEER_DROP_DIR}/user_${userId}.json`;

  // Ensures directory exists and writes the file atomically using a heredoc (cat <<'EOF')
  const command = `mkdir -p ${PEER_DROP_DIR} && cat <<'EOF' > ${remotePath}\n${payload}\nEOF`;

  console.log(`📡 Sending provisioning request for User ${userId} to Gateway...`);
  await runRemoteCommand(command);
  
  return remotePath;
};

/**
 * Removes a WireGuard peer from the live interface
 */
const removeWireGuardPeer = async (publicKey) => {
  // Escaping the key to prevent command injection
  const escapedKey = String(publicKey).replace(/'/g, "'\\''");
  const command = `sudo wg set ${WG_INTERFACE} peer '${escapedKey}' remove`;
  
  console.log(`🗑️ Removing expired peer from Gateway: ${publicKey}`);
  return runRemoteCommand(command);
};

module.exports = {
  createPeerProvisioningRequest,
  removeWireGuardPeer,
  runRemoteCommand,
};