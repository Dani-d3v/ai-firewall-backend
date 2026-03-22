const express = require("express");
const router = express.Router();

const { getUserProfile, deleteMyAccount } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

// Protected route
router.get("/profile", protect, getUserProfile);
router.delete("/delete", protect, deleteMyAccount);

module.exports = router;
