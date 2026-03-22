const User = require("../models/user");
const { markExpiredSubscriptionForUser } = require("../utils/subscriptionState");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const expireSubscriptions = async () => {
  const users = await User.find({
    "subscription.status": "active",
    "subscription.endDate": { $lt: new Date() },
  });

  let expiredCount = 0;

  for (const user of users) {
    const changed = markExpiredSubscriptionForUser(user);

    if (changed) {
      await user.save();
      expiredCount += 1;
    }
  }

  if (expiredCount > 0) {
    console.log(`Subscription expiry job updated ${expiredCount} user(s).`);
  }

  return expiredCount;
};

const startSubscriptionExpiryJob = () => {
  expireSubscriptions().catch((error) => {
    console.error("Initial subscription expiry job failed:", error.message);
  });

  const timer = setInterval(() => {
    expireSubscriptions().catch((error) => {
      console.error("Scheduled subscription expiry job failed:", error.message);
    });
  }, ONE_DAY_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
};

module.exports = {
  expireSubscriptions,
  startSubscriptionExpiryJob,
};
