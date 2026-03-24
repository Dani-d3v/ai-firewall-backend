const mongoose = require("mongoose");

const Subscription = require("../models/Subscription");
const User = require("../models/user");
const Payment = require("../models/Payment");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { normalizePlanInput, escapeRegex } = require("../utils/validation");
const { markExpiredSubscriptionForUser } = require("../utils/subscriptionState");

const buildError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const generateTransactionId = () =>
  `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const ensureNoActiveSubscription = (user) => {
  if (user.subscription?.status === "active") {
    throw buildError(
      "You already have an active subscription. Cancel it or wait until it expires before buying another plan.",
      409
    );
  }
};

exports.getPlans = asyncHandler(async (req, res) => {
  const plans = await Subscription.find().sort({ price: 1, duration: 1 });
  return sendSuccess(res, plans);
});

exports.buyPlan = asyncHandler(async (req, res) => {
  const { planId, paymentId } = req.body;

  if (!mongoose.isValidObjectId(planId)) {
    throw buildError("Invalid plan ID", 400);
  }

  if (!mongoose.isValidObjectId(paymentId)) {
    throw buildError(
      "A valid paymentId is required. Complete simulated payment first.",
      400
    );
  }

  const [plan, user] = await Promise.all([
    Subscription.findById(planId),
    User.findById(req.user._id),
  ]);

  if (!plan) {
    throw buildError("Plan not found", 404);
  }

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
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + plan.duration);

  const historyEntry = {
    planId: plan._id,
    planName: plan.name,
    price: plan.price,
    duration: plan.duration,
    features: plan.features,
    status: "active",
    startedAt: startDate,
    endedAt: endDate,
    paymentId: payment._id,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.status,
    transactionId: payment.transactionId,
  };

  user.subscription = {
    planId: plan._id,
    plan: plan.name,
    price: plan.price,
    status: "active",
    startDate,
    endDate,
    cancelledAt: undefined,
    paymentId: payment._id,
    paymentMethod: payment.paymentMethod,
    paymentStatus: payment.status,
    transactionId: payment.transactionId,
  };
  user.subscriptionHistory.push(historyEntry);

  payment.status = "used";

  await Promise.all([payment.save(), user.save()]);

  return sendSuccess(res, user.subscription, {
    message: "Subscription activated",
  });
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

  if (user.subscription?.status !== "active") {
    throw buildError("You do not have an active subscription to cancel", 400);
  }

  const cancelledAt = new Date();
  user.subscription.status = "cancelled";
  user.subscription.cancelledAt = cancelledAt;
  user.subscription.endDate = cancelledAt;

  const activeHistory = [...user.subscriptionHistory]
    .reverse()
    .find((entry) => entry.status === "active");

  if (activeHistory) {
    activeHistory.status = "cancelled";
    activeHistory.cancelledAt = cancelledAt;
    activeHistory.endedAt = cancelledAt;
  }

  await user.save();

  return sendSuccess(res, user.subscription, {
    message: "Subscription cancelled",
  });
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
