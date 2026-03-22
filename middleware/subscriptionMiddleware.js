const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");

const syncSubscriptionStatus = asyncHandler(async (req, res, next) => {
  if (!req.user?._id) {
    const error = new Error("Not authorized, no user context");
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findById(req.user._id).select("-password");

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (
    user.subscription?.status === "active" &&
    user.subscription?.endDate &&
    new Date() > new Date(user.subscription.endDate)
  ) {
    user.subscription.status = "expired";

    const activeHistory = [...(user.subscriptionHistory || [])]
      .reverse()
      .find((entry) => entry.status === "active");

    if (activeHistory) {
      activeHistory.status = "expired";
      activeHistory.endedAt = user.subscription.endDate;
    }

    await user.save();
  }

  req.user = user;
  return next();
});

module.exports = { syncSubscriptionStatus };
