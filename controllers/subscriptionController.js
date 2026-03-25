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

const buildVpnStatus = (user) => ({
  isActive: Boolean(user.subscription?.isActive),
  validUntil: user.subscription?.validUntil || null,
  assignedIp: user.vpn?.assignedIp || null,
  publicKey: user.vpn?.publicKey || null,
  status: user.vpn?.status || "unassigned",
});

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
    "# Add your client private key locally before importing this config.",
    "PrivateKey = <YOUR_PRIVATE_KEY>",
    `Address = ${user.vpn.assignedIp}`,
    `DNS = ${env.WIREGUARD_DNS}`,
    "",
    "[Peer]",
    `PublicKey = ${env.GATEWAY_WIREGUARD_PUBLIC_KEY}`,
    `Endpoint = ${endpoint}`,
    `AllowedIPs = ${env.WIREGUARD_ALLOWED_IPS}`,
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

exports.getPlans = asyncHandler(async (req, res) => {
  const plans = await Subscription.find({
    duration: { $in: ALLOWED_PLAN_DURATIONS },
  }).sort({ duration: 1 });

  return sendSuccess(res, plans);
});

exports.buyPlan = asyncHandler(async (req, res) => {
  const { planId, paymentId, wireguardPublicKey } = req.body;

  if (!mongoose.isValidObjectId(planId)) {
    throw buildError("Invalid plan ID", 400);
  }

  if (!mongoose.isValidObjectId(paymentId)) {
    throw buildError(
      "A valid paymentId is required. Complete simulated payment first.",
      400
    );
  }

  if (!isValidWireGuardPublicKey(wireguardPublicKey)) {
    throw buildError("A valid WireGuard public key is required.", 400);
  }

  const [plan, user] = await Promise.all([
    Subscription.findById(planId),
    User.findById(req.user._id),
  ]);

  if (!plan) {
    throw buildError("Plan not found", 404);
  }

  ensureAllowedDuration(plan.duration);

  if (!user) {
    throw buildError("User not found", 404);
  }

  markExpiredSubscriptionForUser(user);
  ensureNoActiveSubscription(user);

  const payment = await Payment.findOne({
    _id: paymentId,
    userId: user._id,
    planId: plan._id,
    status: "completed",
    simulated: true,
  });

  if (!payment) {
    throw buildError("Simulated payment not found or already used for this plan", 400);
  }

  const startDate = new Date();
  const validUntil = new Date(startDate.getTime());
  validUntil.setDate(validUntil.getDate() + plan.duration);

  const normalizedPublicKey = normalizeWireGuardPublicKey(wireguardPublicKey);
  const assignedIp = await findNextAvailableVpnIp();

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
    features: plan.features,
    status: "active",
    startedAt: startDate,
    endedAt: validUntil,
    paymentId: payment._id,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.status,
    transactionId: payment.transactionId,
    validUntil,
    isActive: true,
  };

  user.subscription = {
    planId: plan._id,
    plan: plan.name,
    price: plan.price,
    status: "active",
    startDate,
    endDate: validUntil,
    cancelledAt: undefined,
    paymentId: payment._id,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.status,
    transactionId: payment.transactionId,
    validUntil,
    isActive: true,
  };
  user.subscriptionHistory.push(historyEntry);
  user.vpn = {
    publicKey: normalizedPublicKey,
    assignedIp,
    status: "active",
    lastProvisionedAt: startDate,
    lastDeprovisionedAt: undefined,
  };

  payment.status = "used";

  await Promise.all([payment.save(), user.save()]);

  return sendSuccess(
    res,
    {
      subscription: user.subscription,
      vpn: buildVpnStatus(user),
    },
    {
      message: "Subscription activated and WireGuard peer queued for provisioning",
    }
  );
});

exports.getMyPlan = asyncHandler(async (req, res) =>
  sendSuccess(res, req.user.subscription)
);

exports.getSubscriptionHistory = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("subscriptionHistory");

  if (!user) {
    throw buildError("User not found", 404);
  }

  return sendSuccess(res, [...user.subscriptionHistory].reverse());
});

exports.simulatePayment = asyncHandler(async (req, res) => {
  const { planId, paymentMethod } = req.body;

  if (!mongoose.isValidObjectId(planId)) {
    throw buildError("Invalid plan ID", 400);
  }

  const normalizedPaymentMethod =
    typeof paymentMethod === "string" ? paymentMethod.trim() : "";

  if (!normalizedPaymentMethod) {
    throw buildError("paymentMethod is required", 400);
  }

  const [plan, user] = await Promise.all([
    Subscription.findById(planId),
    User.findById(req.user._id),
  ]);

  if (!plan) {
    throw buildError("Plan not found", 404);
  }

  ensureAllowedDuration(plan.duration);

  if (!user) {
    throw buildError("User not found", 404);
  }

  markExpiredSubscriptionForUser(user);
  ensureNoActiveSubscription(user);
  await user.save();

  const payment = await Payment.create({
    userId: user._id,
    planId: plan._id,
    amount: plan.price,
    paymentMethod: normalizedPaymentMethod,
    status: "completed",
    simulated: true,
    transactionId: generateTransactionId(),
  });

  return sendSuccess(
    res,
    {
      paymentId: payment._id,
      transactionId: payment.transactionId,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      simulated: payment.simulated,
      paidAt: payment.paidAt,
      plan: {
        _id: plan._id,
        name: plan.name,
        price: plan.price,
        duration: plan.duration,
      },
    },
    {
      statusCode: 201,
      message: "Simulated payment completed",
    }
  );
});

exports.cancelMySubscription = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    throw buildError("User not found", 404);
  }

  markExpiredSubscriptionForUser(user);

  if (!user.subscription?.isActive) {
    throw buildError("You do not have an active subscription to cancel", 400);
  }

  const cancelledAt = new Date();
  user.subscription.status = "cancelled";
  user.subscription.cancelledAt = cancelledAt;
  user.subscription.endDate = cancelledAt;
  user.subscription.validUntil = cancelledAt;
  user.subscription.isActive = false;

  const activeHistory = [...user.subscriptionHistory]
    .reverse()
    .find((entry) => entry.isActive);

  if (activeHistory) {
    activeHistory.status = "cancelled";
    activeHistory.cancelledAt = cancelledAt;
    activeHistory.endedAt = cancelledAt;
    activeHistory.validUntil = cancelledAt;
    activeHistory.isActive = false;
  }

  if (user.vpn) {
    user.vpn.status = "revoked";
    user.vpn.lastDeprovisionedAt = cancelledAt;
  }

  await user.save();

  return sendSuccess(res, user.subscription, {
    message: "Subscription cancelled",
  });
});

exports.getVpnAccess = asyncHandler(async (req, res) =>
  sendSuccess(res, buildVpnStatus(req.user))
);

exports.downloadVpnConfig = asyncHandler(async (req, res) => {
  const configText = buildConfigText(req.user);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="bradsafe-user-${req.user._id}.conf"`
  );

  res.status(200).send(configText);
});

exports.createPlan = asyncHandler(async (req, res) => {
  const {
    normalizedName,
    normalizedPrice,
    normalizedDuration,
    normalizedFeatures,
  } = normalizePlanInput(req.body);

  if (
    !normalizedName ||
    !Number.isFinite(normalizedPrice) ||
    !Number.isFinite(normalizedDuration)
  ) {
    throw buildError("name, price (number), and duration (number) are required", 400);
  }

  ensureAllowedDuration(normalizedDuration);

  if (normalizedPrice < 0 || normalizedDuration <= 0) {
    throw buildError(
      "price must be 0 or greater and duration must be greater than 0",
      400
    );
  }

  const existingPlan = await Subscription.findOne({
    name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: "i" },
  });

  if (existingPlan) {
    throw buildError("A plan with this name already exists", 409);
  }

  const plan = await Subscription.create({
    name: normalizedName,
    price: normalizedPrice,
    duration: normalizedDuration,
    features: normalizedFeatures,
  });

  return sendSuccess(res, plan, {
    statusCode: 201,
    message: "Plan created",
  });
});

exports.updatePlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  if (!mongoose.isValidObjectId(planId)) {
    throw buildError("Invalid plan ID", 400);
  }

  const {
    normalizedName,
    normalizedPrice,
    normalizedDuration,
    normalizedFeatures,
  } = normalizePlanInput(req.body);

  if (
    !normalizedName ||
    !Number.isFinite(normalizedPrice) ||
    !Number.isFinite(normalizedDuration)
  ) {
    throw buildError("name, price (number), and duration (number) are required", 400);
  }

  ensureAllowedDuration(normalizedDuration);

  if (normalizedPrice < 0 || normalizedDuration <= 0) {
    throw buildError(
      "price must be 0 or greater and duration must be greater than 0",
      400
    );
  }

  const duplicatePlan = await Subscription.findOne({
    _id: { $ne: planId },
    name: { $regex: `^${escapeRegex(normalizedName)}$`, $options: "i" },
  });

  if (duplicatePlan) {
    throw buildError("A plan with this name already exists", 409);
  }

  const plan = await Subscription.findByIdAndUpdate(
    planId,
    {
      name: normalizedName,
      price: normalizedPrice,
      duration: normalizedDuration,
      features: normalizedFeatures,
    },
    { new: true, runValidators: true }
  );

  if (!plan) {
    throw buildError("Plan not found", 404);
  }

  return sendSuccess(res, plan, { message: "Plan updated" });
});

exports.deletePlan = asyncHandler(async (req, res) => {
  const { planId } = req.params;

  if (!mongoose.isValidObjectId(planId)) {
    throw buildError("Invalid plan ID", 400);
  }

  const plan = await Subscription.findByIdAndDelete(planId);

  if (!plan) {
    throw buildError("Plan not found", 404);
  }

  return sendSuccess(
    res,
    {
      _id: plan._id,
      name: plan.name,
    },
    {
      message: "Plan deleted",
    }
  );
});
