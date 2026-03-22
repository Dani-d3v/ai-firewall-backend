const Payment = require("../models/Payment");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const User = require("../models/user");

exports.getUserProfile = asyncHandler(async (req, res) => sendSuccess(res, req.user));

exports.deleteMyAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  await Payment.deleteMany({ userId: user._id });
  await user.deleteOne();

  return sendSuccess(res, {
    deleted: true,
    userId: req.user._id,
  }, {
    message: "User account deleted",
  });
});
