const express = require("express");
const router = express.Router();

const {
  getPlans,
  buyPlan,
  getMyPlan,
} = require("../controllers/subscriptionController");

const { protect } = require("../middleware/authMiddleware");

// Public route
router.get("/", getPlans);

// Protected routes
router.post("/buy", protect, buyPlan);
router.get("/my-plan", protect, getMyPlan);

module.exports = router;