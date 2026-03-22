const User = require("../models/user");

const syncSubscriptionStatus = async (req, res, next) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no user context",
      });
    }

    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.subscription?.endDate && new Date() > user.subscription.endDate) {
      user.subscription.status = "inactive";
      await user.save();
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = { syncSubscriptionStatus };
