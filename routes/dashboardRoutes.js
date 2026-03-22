const express = require("express");

const { getDashboardSummary } = require("../controllers/dashboardController");
const { protect } = require("../middleware/authMiddleware");
const { syncSubscriptionStatus } = require("../middleware/subscriptionMiddleware");

const router = express.Router();

router.get("/", protect, syncSubscriptionStatus, getDashboardSummary);

module.exports = router;
