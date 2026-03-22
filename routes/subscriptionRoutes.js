const express = require("express");
const router = express.Router();

const {
  getPlans,
  buyPlan,
  getMyPlan,
  createPlan,
} = require("../controllers/subscriptionController");

const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");
const { syncSubscriptionStatus } = require("../middleware/subscriptionMiddleware");

// Public route
router.get("/", getPlans);

// Protected routes
router.post("/buy", protect, buyPlan);
router.get("/my-plan", protect, syncSubscriptionStatus, getMyPlan);
router.post("/create", protect, admin, createPlan);

module.exports = router;
