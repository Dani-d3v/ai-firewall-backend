const express = require("express");
const router = express.Router();

const {
  getPlans,
  buyPlan,
  getMyPlan,
} = require("../controllers/subscriptionController");

const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");
const { createPlan } = require("../controllers/subscriptionController");
// Public route
router.get("/", getPlans);

// Protected routes
router.post("/buy", protect, buyPlan);
router.get("/my-plan", protect, getMyPlan);
router.post("/create", protect, admin, createPlan);
module.exports = router;