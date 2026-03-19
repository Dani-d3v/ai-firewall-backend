const Subscription = require("../models/Subscription");
const User = require("../models/user");

// GET ALL PLANS
exports.getPlans = async (req, res) => {
  try {
    const plans = await Subscription.find();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// BUY PLAN
exports.buyPlan = async (req, res) => {
  try {
    const { planId } = req.body;

    const plan = await Subscription.findById(planId);

    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.duration);

    // Update user subscription
    const user = await User.findById(req.user._id);

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
    res.status(500).json({ message: error.message });
  }
};

// GET MY PLAN
exports.getMyPlan = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.json(user.subscription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};