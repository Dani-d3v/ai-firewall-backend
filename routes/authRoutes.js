const express = require("express");
const router = express.Router();

const {
  requestRegistrationOtp,
  registerUser,
  loginUser,
} = require("../controllers/authController");

router.post("/register/request-otp", requestRegistrationOtp);
router.post("/register", registerUser);
router.post("/login", loginUser);

module.exports = router;
