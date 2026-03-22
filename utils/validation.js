const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (email) => EMAIL_REGEX.test(email);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sanitizeFeatures = (features) => {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .filter((feature) => typeof feature === "string")
    .map((feature) => feature.trim())
    .filter(Boolean);
};

const normalizePlanInput = ({ name, price, duration, features }) => ({
  normalizedName: typeof name === "string" ? name.trim() : "",
  normalizedPrice: Number(price),
  normalizedDuration: Number(duration),
  normalizedFeatures: sanitizeFeatures(features),
});

module.exports = {
  escapeRegex,
  isValidEmail,
  sanitizeFeatures,
  normalizePlanInput,
};
