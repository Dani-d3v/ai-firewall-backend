const markExpiredSubscriptionForUser = (user, now = new Date()) => {
  if (
    user.subscription?.status === "active" &&
    user.subscription?.endDate &&
    now > new Date(user.subscription.endDate)
  ) {
    user.subscription.status = "expired";

    const activeHistory = [...(user.subscriptionHistory || [])]
      .reverse()
      .find((entry) => entry.status === "active");

    if (activeHistory) {
      activeHistory.status = "expired";
      activeHistory.endedAt = user.subscription.endDate;
    }

    return true;
  }

  return false;
};

module.exports = { markExpiredSubscriptionForUser };
