export const PLAN_LIMITS = {
  free:     { apartments: 1,        analytics: false },
  pro:      { apartments: Infinity, analytics: false },
  business: { apartments: Infinity, analytics: true  },
};

export const BILLING_PLANS = {
  pro: {
    name: "Pro",
    amount: 19,
    currencyCode: "USD",
    trialDays: 7,
  },
  business: {
    name: "Business",
    amount: 49,
    currencyCode: "USD",
    trialDays: 7,
  },
};

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan?.toLowerCase()] ?? PLAN_LIMITS.free;
}

export function planKeyFromName(name) {
  if (!name) return "free";
  const lower = name.toLowerCase();
  if (lower.includes("business")) return "business";
  if (lower.includes("pro"))      return "pro";
  return "free";
}
