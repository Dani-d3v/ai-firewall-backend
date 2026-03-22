const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");
const { markExpiredSubscriptionForUser } = require("../utils/subscriptionState");

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

  if (markExpiredSubscriptionForUser(user)) {
    await user.save();
  }

  req.user = user;
  return next();
});

module.exports = { syncSubscriptionStatus };
