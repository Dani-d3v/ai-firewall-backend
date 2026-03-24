const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");

exports.getDashboardSummary = asyncHandler(async (req, res) => {
  const subscription = req.user?.subscription || {
    plan: "free",
    status: "inactive",
  };

  return sendSuccess(res, {
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
    subscription,
    subscriptionHistoryCount: Array.isArray(req.user.subscriptionHistory)
      ? req.user.subscriptionHistory.length
      : 0,
  });
});
