const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");

exports.getUserProfile = asyncHandler(async (req, res) => sendSuccess(res, req.user));
