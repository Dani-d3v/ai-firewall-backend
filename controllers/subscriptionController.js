const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const User = require("../models/user");

// GET ALL PLANS
exports.getPlans = async (req, res) => {
  try {
    const plans = await Subscription.find();
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// BUY PLAN
exports.buyPlan = async (req, res) => {
  try {
    const { planId } = req.body;

    if (!mongoose.isValidObjectId(planId)) {
      return res.status(400).json({ success: false, message: "Invalid plan ID" });
    }

    const plan = await Subscription.findById(planId);

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.duration);

    // Update user subscription
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.subscription = {
      plan: plan.name,
      status: "active",
      startDate,
      endDate,
    };

    await user.save();

    res.json({
      success: true,
      data: user.subscription,
      message: "Subscription activated",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET MY PLAN
exports.getMyPlan = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check expiry
    if (
      user.subscription?.endDate &&
      new Date() > user.subscription.endDate
    ) {
      user.subscription.status = "inactive";
      await user.save();
    }

    res.json({
      success: true,
      data: user.subscription,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN - CREATE PLAN
exports.createPlan = async (req, res) => {
  try {
    const { name, price, duration, features } = req.body;

    const plan = await Subscription.create({
      name,
      price,
      duration,
      features,
    });

    res.status(201).json({
      success: true,
      data: plan,
      message: "Plan created",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
