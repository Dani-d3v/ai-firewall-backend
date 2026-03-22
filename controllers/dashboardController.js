const User = require("../models/user");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");

exports.getDashboardSummary = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [user, availablePlansCount, recentPayments] = await Promise.all([
    User.findById(userId).select("-password"),
    Subscription.countDocuments(),
    Payment.find({ userId }).sort({ createdAt: -1 }).limit(5),
  ]);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const completedPayments = recentPayments.filter(
    (payment) => payment.status === "completed" || payment.status === "used"
  );
  const failedPayments = recentPayments.filter(
    (payment) => payment.status === "failed"
  );

  return sendSuccess(res, {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    subscription: user.subscription,
    metrics: {
      availablePlans: availablePlansCount,
      historyCount: user.subscriptionHistory.length,
      activeSubscription: user.subscription?.status === "active",
      recentPaymentsCount: recentPayments.length,
      successfulPaymentsCount: completedPayments.length,
      failedPaymentsCount: failedPayments.length,
    },
    recentHistory: [...user.subscriptionHistory].reverse().slice(0, 5),
    recentPayments,
  });
});
