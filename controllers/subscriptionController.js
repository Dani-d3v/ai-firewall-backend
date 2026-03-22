const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");

const sanitizeFeatures = (features) => {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .filter((feature) => typeof feature === "string")
    .map((feature) => feature.trim())
    .filter(Boolean);
};

// GET ALL PLANS
exports.getPlans = asyncHandler(async (req, res) => {
  const plans = await Subscription.find().sort({ price: 1, duration: 1 });
  return sendSuccess(res, plans);
});

// BUY PLAN
exports.buyPlan = asyncHandler(async (req, res) => {
  const { planId } = req.body;

  if (!mongoose.isValidObjectId(planId)) {
    const error = new Error("Invalid plan ID");
    error.statusCode = 400;
    throw error;
  }

  const plan = await Subscription.findById(planId);

  if (!plan) {
    const error = new Error("Plan not found");
    error.statusCode = 404;
    throw error;
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + plan.duration);

  const user = await User.findById(req.user._id);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  user.subscription = {
    plan: plan.name,
    status: "active",
    startDate,
    endDate,
  };

  await user.save();

  return sendSuccess(res, user.subscription, {
    message: "Subscription activated",
  });
});

// GET MY PLAN
exports.getMyPlan = asyncHandler(async (req, res) =>
  sendSuccess(res, req.user.subscription)
);

// ADMIN - CREATE PLAN
exports.createPlan = asyncHandler(async (req, res) => {
  const { name, price, duration, features } = req.body;
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedPrice = Number(price);
  const normalizedDuration = Number(duration);

  if (
    !normalizedName ||
    !Number.isFinite(normalizedPrice) ||
    !Number.isFinite(normalizedDuration)
  ) {
    const error = new Error("name, price (number), and duration (number) are required");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedPrice < 0 || normalizedDuration <= 0) {
    const error = new Error(
      "price must be 0 or greater and duration must be greater than 0"
    );
    error.statusCode = 400;
    throw error;
  }

  const plan = await Subscription.create({
    name: normalizedName,
    price: normalizedPrice,
    duration: normalizedDuration,
    features: sanitizeFeatures(features),
  });

  return sendSuccess(res, plan, {
    statusCode: 201,
    message: "Plan created",
  });
});
