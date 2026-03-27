const mongoose = require("mongoose");

const Subscription = require("../models/Subscription");
const User = require("../models/user");
const Payment = require("../models/Payment");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const {
  normalizePlanInput,
  escapeRegex,
  isValidWireGuardPublicKey,
  normalizeWireGuardPublicKey,
} = require("../utils/validation");
const { markExpiredSubscriptionForUser } = require("../utils/subscriptionState");
const { createPeerProvisioningRequest } = require("../services/gatewaySshService");
const env = require("../config/env");

const ALLOWED_PLAN_DURATIONS = [30, 180, 365];

const buildError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const generateTransactionId = () =>
  `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const ensureNoActiveSubscription = (user) => {
  if (user.subscription?.isActive) {
    throw buildError(
      "You already have an active subscription. Cancel it or wait until it expires before buying another plan.",
      409
    );
  }
};

const ensureAllowedDuration = (duration) => {
  if (!ALLOWED_PLAN_DURATIONS.includes(duration)) {
    throw buildError(
      "Only the 1 Month, 6 Months, and 12 Months BRADSafe tiers are supported.",
      400
    );
  }
};

/**
 * Enhanced VPN Status builder providing Gateway (Server) details 
 * so the customer knows where to connect.
 */
const buildVpnStatus = (user) => {
  const endpoint = `${env.GATEWAY_PUBLIC_IP}:${env.GATEWAY_WIREGUARD_PORT}`;

  return {
    isActive: Boolean(user.subscription?.isActive),
    status: user.vpn?.status || "unassigned",
    validUntil: user.subscription?.validUntil || null,
    
    // Details the user needs for their [Interface] section
    clientConfiguration: {
      address: user.vpn?.assignedIp || null,
      dns: env.WIREGUARD_DNS || "1.1.1.1",
      userPublicKey: user.vpn?.publicKey || null,
    },

    // Details the user needs for their [Peer] section (Our Server)
    gatewayConfiguration: {
      serverPublicKey: env.GATEWAY_WIREGUARD_PUBLIC_KEY,
      endpoint: endpoint,
      allowedIps: env.WIREGUARD_ALLOWED_IPS || "0.0.0.0/0",
      persistentKeepalive: 25,
    }
  };
};

const buildConfigText = (user) => {
  if (!user.vpn?.assignedIp || !user.vpn?.publicKey) {
    throw buildError("WireGuard peer details are not available for this user yet.", 400);
  }

  if (!env.GATEWAY_WIREGUARD_PUBLIC_KEY) {
    throw buildError(
      "Gateway WireGuard public key is not configured on the backend.",
      500
    );
  }

  const endpoint = `${env.GATEWAY_PUBLIC_IP}:${env.GATEWAY_WIREGUARD_PORT}`;

  return [
    "[Interface]",
    "# Copy your private key here (the one corresponding to the public key you provided)",
    "PrivateKey = <YOUR_PRIVATE_KEY>",
    `Address = ${user.vpn.assignedIp}`,
    `DNS = ${env.WIREGUARD_DNS || "1.1.1.1"}`,
    "",
    "[Peer]",
    `PublicKey = ${env.GATEWAY_WIREGUARD_PUBLIC_KEY}`,
    `Endpoint = ${endpoint}`,
    `AllowedIPs = ${env.WIREGUARD_ALLOWED_IPS || "0.0.0.0/0"}`,
    "PersistentKeepalive = 25",
    "",
  ].join("\n");
};

const findNextAvailableVpnIp = async () => {
  const users = await User.find(
    { "vpn.assignedIp": { $exists: true, $ne: null } },
    "vpn.assignedIp"
  ).lean();

  const assignedHosts = new Set(
    users
      .map((user) => user.vpn?.assignedIp)
      .filter(Boolean)
      .map((ip) => {
        const [address] = ip.split("/");
        const parts = address.split(".");
        return Number(parts[3]);
      })
      .filter(Number.isInteger)
  );

  for (let host = env.WIREGUARD_START_HOST; host <= env.WIREGUARD_END_HOST; host += 1) {
    if (!assignedHosts.has(host)) {
      return `${env.WIREGUARD_NETWORK_PREFIX}.${host}/32`;
    }
  }

  throw buildError("No WireGuard IPs are available for provisioning.", 503);
};

// --- Controller Actions ---

exports.getPlans = asyncHandler(async (req, res) => {
  const plans = await Subscription.find({
    duration: { $in: ALLOWED_PLAN_DURATIONS },
  }).sort({ duration: 1 });

  return sendSuccess(res, plans);
});

exports.buyPlan = asyncHandler(async (req, res) => {
  const { planId, paymentId, wireguardPublicKey } = req.body;

  if (!mongoose.isValidObjectId(planId)) throw buildError("Invalid plan ID", 400);
  if (!mongoose.isValidObjectId(paymentId)) throw buildError("A valid paymentId is required.", 400);
  if (!isValidWireGuardPublicKey(wireguardPublicKey)) throw buildError("A valid WireGuard public key is required.", 400);

  const [plan, user] = await Promise.all([
    Subscription.findById(planId),
    User.findById(req.user._id),
  ]);

  if (!plan) throw buildError("Plan not found", 404);
  ensureAllowedDuration(plan.duration);
  if (!user) throw buildError("User not found", 404);

  markExpiredSubscriptionForUser(user);
  ensureNoActiveSubscription(user);

  const payment = await Payment.findOne({
    _id: paymentId,
    userId: user._id,
    planId: plan._id,
    status: "completed",
    simulated: true,
  });

  if (!payment) throw buildError("Simulated payment not found or already used.", 400);

  const startDate = new Date();
  const validUntil = new Date(startDate.getTime());
  validUntil.setDate(validUntil.getDate() + plan.duration);

  const normalizedPublicKey = normalizeWireGuardPublicKey(wireguardPublicKey);
  const assignedIp = await findNextAvailableVpnIp();

  // Trigger SSH Provisioning on the VM
  await createPeerProvisioningRequest({
    userId: user._id,
    publicKey: normalizedPublicKey,
    assignedIp,
  });

  const historyEntry = {
    planId: plan._id,
    planName: plan.name,
    price: plan.price,
    duration: plan.duration,
    status: "active",
    startedAt: startDate,
    endedAt: validUntil,
    paymentId: payment._id,
    transactionId: payment.transactionId,
    isActive: true,
  };

  user.subscription = {
    planId: plan._id,
    plan: plan.name,
    price: plan.price,
    status: "active",
    startDate,
    endDate: validUntil,
    transactionId: payment.transactionId,
    isActive: true,
  };
  
  user.subscriptionHistory.push(historyEntry);
  
  user.vpn = {
    publicKey: normalizedPublicKey,
    assignedIp,
    status: "active",
    lastProvisionedAt: startDate,
  };

  payment.status = "used";

  await Promise.all([payment.save(), user.save()]);

  return sendSuccess(
    res,
    {
      subscription: user.subscription,
      vpn: buildVpnStatus(user), // Now includes Gateway details
    },
    {
      message: "Subscription activated and WireGuard peer provisioned.",
    }
  );
});

exports.getVpnAccess = asyncHandler(async (req, res) =>
  sendSuccess(res, buildVpnStatus(req.user))
);

exports.downloadVpnConfig = asyncHandler(async (req, res) => {
  const configText = buildConfigText(req.user);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="bradsafe-vpn.conf"`);
  res.status(200).send(configText);
});

// ... rest of the CRUD operations (getHistory, cancel, createPlan, etc.)