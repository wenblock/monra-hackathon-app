import {
  createRateLimit,
  getAuthenticatedUserRateLimitKey,
  getIpRateLimitKey,
} from "../lib/rateLimit.js";

export const authSessionRateLimit = createRateLimit({
  keyGenerator: getIpRateLimitKey,
  max: 30,
  name: "auth.session",
  windowMs: 5 * 60 * 1000,
});

export const userMutationRateLimit = createRateLimit({
  keyGenerator: getAuthenticatedUserRateLimitKey,
  max: 20,
  name: "user.mutation",
  windowMs: 5 * 60 * 1000,
});

export const highCostUserActionRateLimit = createRateLimit({
  keyGenerator: getAuthenticatedUserRateLimitKey,
  max: 10,
  name: "user.high_cost_action",
  windowMs: 60 * 1000,
});
