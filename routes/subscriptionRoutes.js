const express = require("express");

const {
  getPlans,
  buyPlan,
  getMyPlan,
  getSubscriptionHistory,
  simulatePayment,
  cancelMySubscription,
  createPlan,
  updatePlan,
  deletePlan,
} = require("../controllers/subscriptionController");
const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");
const { syncSubscriptionStatus } = require("../middleware/subscriptionMiddleware");

const router = express.Router();

router.get("/", getPlans);

router.post("/simulate-payment", protect, syncSubscriptionStatus, simulatePayment);
router.post("/buy", protect, syncSubscriptionStatus, buyPlan);
router.patch("/cancel", protect, syncSubscriptionStatus, cancelMySubscription);
router.get("/my-plan", protect, syncSubscriptionStatus, getMyPlan);
router.get("/history", protect, syncSubscriptionStatus, getSubscriptionHistory);
router.post("/create", protect, admin, createPlan);
router.patch("/:planId", protect, admin, updatePlan);
router.delete("/:planId", protect, admin, deletePlan);

module.exports = router;
