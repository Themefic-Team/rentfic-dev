export const PLAN_LIMITS = {
  free:     { listings: 1,        analytics: false },
  pro:      { listings: Infinity, analytics: false },
  business: { listings: Infinity, analytics: true  },
};

export const BILLING_PLANS = {
  pro:             { name: "Pro",              amount: 19,                           currencyCode: "USD", trialDays: 7, interval: "EVERY_30_DAYS" },
  pro_yearly:      { name: "Pro Yearly",       amount: Math.round(19 * 0.8 * 12),   currencyCode: "USD", trialDays: 7, interval: "ANNUAL"        },
  business:        { name: "Business",         amount: 49,                           currencyCode: "USD", trialDays: 7, interval: "EVERY_30_DAYS" },
  business_yearly: { name: "Business Yearly",  amount: Math.round(49 * 0.8 * 12),   currencyCode: "USD", trialDays: 7, interval: "ANNUAL"        },
};

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan?.toLowerCase()] ?? PLAN_LIMITS.free;
}

export function planKeyFromName(name) {
  if (!name) return "free";
  const lower = name.toLowerCase();
  // "Pro Yearly" and "Business Yearly" map to the same DB plan key as their
  // monthly counterparts - no schema change needed for yearly billing.
  if (lower.includes("business")) return "business";
  if (lower.includes("pro"))      return "pro";
  return "free";
}
