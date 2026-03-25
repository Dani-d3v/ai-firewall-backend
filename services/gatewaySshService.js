const fs = require("fs");
const { Client } = require("ssh2");
const env = require("../config/env");

const PEER_DROP_DIR = "/etc/wireguard/new_peers";

const getPrivateKey = () => {
  if (env.GATEWAY_PRIVATE_KEY?.trim()) {
    return env.GATEWAY_PRIVATE_KEY.replace(/\\n/g, "\n");
  }

  if (env.GATEWAY_PRIVATE_KEY_PATH?.trim()) {
    return fs.readFileSync(env.GATEWAY_PRIVATE_KEY_PATH, "utf8");
  }

  throw new Error(
    "Gateway SSH key is not configured. Set GATEWAY_PRIVATE_KEY or GATEWAY_PRIVATE_KEY_PATH."
  );
};

const escapeForSingleQuotes = (value) => String(value).replace(/'/g, "'\\''");

const runRemoteCommand = (command) =>
  new Promise((resolve, reject) => {
    const client = new Client();

    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            reject(error);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code) => {
              client.end();

              if (code === 0) {
                resolve({ stdout, stderr });
                return;
              }

              reject(
                new Error(
                  stderr.trim() ||
                    `Remote command failed with exit code ${code}`
                )
              );
            })
            .on("data", (data) => {
              stdout += data.toString();
            });

          stream.stderr.on("data", (data) => {
            stderr += data.toString();
          });
        });
      })
      .on("error", reject)
      .connect({
        host: env.GATEWAY_HOST,
        port: env.GATEWAY_PORT,
        username: env.GATEWAY_USERNAME,
        privateKey: getPrivateKey(),
        readyTimeout: 15000,
      });
  });

const createPeerProvisioningRequest = async ({ userId, publicKey, assignedIp }) => {
  const payload = JSON.stringify({
    public_key: publicKey,
    assigned_ip: assignedIp,
  });

  const remotePath = `${PEER_DROP_DIR}/user_${userId}.json`;

  await runRemoteCommand(
    `mkdir -p ${PEER_DROP_DIR} && cat <<'EOF' > ${remotePath}\n${payload}\nEOF`
  );

  return remotePath;
};

const removeWireGuardPeer = async (publicKey) => {
  const escapedKey = escapeForSingleQuotes(publicKey);
  return runRemoteCommand(
    `sudo wg set ${env.WIREGUARD_INTERFACE} peer '${escapedKey}' remove`
  );
};

module.exports = {
  createPeerProvisioningRequest,
  removeWireGuardPeer,
  runRemoteCommand,
};
