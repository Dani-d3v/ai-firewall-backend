require("dotenv").config();

const requiredVars = ["MONGO_URI", "JWT_SECRET"];
const missingVars = requiredVars.filter((key) => !process.env[key]?.trim());

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(", ")}`
  );
}

const parsedPort = Number.parseInt(process.env.PORT, 10);

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number.isInteger(parsedPort) ? parsedPort : 5000,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE || "false",
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM,
};
