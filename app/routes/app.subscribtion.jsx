import { useState } from "react";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { redirect } from "react-router";
import { Icon } from "@shopify/polaris";
import { StarIcon, CheckSmallIcon, XSmallIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPlanLimits, planKeyFromName } from "../plans.server";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: 0,
    period: "forever",
    badge: null,
    description: "Get started with basic rental management.",
    features: [
      { text: "1 apartment",                   included: true  },
      { text: "Booking calendar",               included: true  },
      { text: "Email notifications",            included: true  },
      { text: "Custom notification templates",  included: true  },
      { text: "SMTP email delivery",            included: true  },
      { text: "Analytics & reports",            included: false },
      { text: "Priority support",               included: false },
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 19,
    period: "month",
    badge: "Most Popular",
    description: "Everything you need to run a professional rental business.",
    features: [
      { text: "Unlimited apartments",           included: true  },
      { text: "Booking calendar",               included: true  },
      { text: "Email notifications",            included: true  },
      { text: "Custom notification templates",  included: true  },
      { text: "SMTP email delivery",            included: true  },
      { text: "Analytics & reports",            included: false },
      { text: "Priority support",               included: false },
    ],
  },
  {
    key: "business",
    name: "Business",
    price: 49,
    period: "month",
    badge: null,
    description: "Advanced features for high-volume rental operations.",
    features: [
      { text: "Unlimited apartments",           included: true  },
      { text: "Booking calendar",               included: true  },
      { text: "Email notifications",            included: true  },
      { text: "Custom notification templates",  included: true  },
      { text: "SMTP email delivery",            included: true  },
      { text: "Analytics & reports",            included: true  },
      { text: "Priority support",               included: true  },
    ],
  },
];

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session, billing, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // Get current plan from DB
  const shopRecord = await prisma.shop.findUnique({ where: { shop } });
  const currentPlan = shopRecord?.plan ?? "free";

  // Count apartments
  const apartmentCount = await prisma.apartment.count({ where: { shop } });

  // Check active Shopify subscription
  let shopifyPlan = null;
  try {
    const { appSubscriptions } = await billing.check({
      plans: ["Pro", "Pro Yearly", "Business", "Business Yearly"],
      isTest: true,
    });
    if (appSubscriptions?.length > 0) {
      shopifyPlan = planKeyFromName(appSubscriptions[0].name);
    }
  } catch (_) {
    // billing.check throws when no active subscription — that's fine
  }

  // Fetch real billing history from Shopify
  let invoices = [];
  try {
    const res  = await admin.graphql(`
      query {
        currentAppInstallation {
          allSubscriptions(first: 20) {
            edges {
              node {
                id
                name
                status
                createdAt
                currentPeriodEnd
                lineItems {
                  plan {
                    pricingDetails {
                      ... on AppRecurringPricing {
                        price { amount currencyCode }
                        interval
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);
    const json = await res.json();
    const edges = json?.data?.currentAppInstallation?.allSubscriptions?.edges ?? [];
    invoices = edges.map(({ node }) => {
      const pricing = node.lineItems?.[0]?.plan?.pricingDetails ?? {};
      return {
        id:          node.id?.split("/").pop() ?? node.id,
        fullId:      node.id,
        name:        node.name,
        status:      node.status,           // ACTIVE | CANCELLED | DECLINED | EXPIRED | FROZEN | PENDING
        createdAt:   node.createdAt,
        periodEnd:   node.currentPeriodEnd,
        amount:      pricing.price?.amount ?? null,
        currency:    pricing.price?.currencyCode ?? "USD",
        interval:    pricing.interval ?? null,           // EVERY_30_DAYS | ANNUAL
      };
    });
  } catch (e) {
    console.error("[Rentfic] Failed to fetch billing history:", e?.message ?? e);
  }

  const limits = getPlanLimits(currentPlan);

  return {
    currentPlan,
    shopifyPlan,
    apartmentCount,
    apartmentLimit: limits.apartments,
    invoices,
  };
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan           = formData.get("plan");           // "pro" | "business"
  const billing_period = formData.get("billing_period"); // "monthly" | "yearly"
  const intent         = formData.get("intent");

  if (intent === "cancel") {
    try {
      await billing.cancel({
        isTest: true,
        prorate: false,
      });
    } catch (_) {}
    return redirect("/app/subscribtion");
  }

  // Map plan key + billing period to the Shopify plan name
  const planMap = {
    pro:      { monthly: "Pro",      yearly: "Pro Yearly"      },
    business: { monthly: "Business", yearly: "Business Yearly" },
  };

  const planKey        = (plan ?? "").toLowerCase();
  const period         = billing_period === "yearly" ? "yearly" : "monthly";
  const shopifyPlanName = planMap[planKey]?.[period];

  if (!shopifyPlanName) {
    return { error: "Invalid plan" };
  }

  const url             = new URL(request.url);
  const returnUrl       = `${url.origin}/app/subscribtion`;
  const { confirmationUrl } = await billing.request({
    plan:   shopifyPlanName,
    isTest: true,
    returnUrl,
  });
  return redirect(confirmationUrl);
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubscriptionPage() {
  const { currentPlan, apartmentCount, apartmentLimit, invoices } = useLoaderData();
  const submit      = useSubmit();
  const navigation  = useNavigation();
  const [billing, setBilling] = useState("monthly");

  const isSubmitting = navigation.state === "submitting";

  function handleUpgrade(planKey) {
    const fd = new FormData();
    fd.append("plan", planKey);           // e.g. "pro" | "business"
    fd.append("billing_period", billing); // "monthly" | "yearly"
    submit(fd, { method: "POST" });
  }

  const limits = apartmentLimit === Infinity ? "Unlimited" : apartmentLimit;
  const usedPct = apartmentLimit === Infinity ? 0 : Math.min(100, (apartmentCount / apartmentLimit) * 100);
  const planLabel = PLANS.find(p => p.key === currentPlan)?.name ?? "Free";

  return (
    <s-page heading="Subscription">

      {/* Current plan banner */}
      <s-section heading="Current Plan">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            background: "#f0faf6",
            border: "1px solid #b5e4d8",
            borderRadius: 8,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#008060",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <Icon source={StarIcon} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#202223" }}>
                {planLabel} Plan
              </div>
              <div style={{ fontSize: 13, color: "#6d7175", marginTop: 2 }}>
                {apartmentCount} of {limits} apartment{limits !== 1 ? "s" : ""} used
              </div>
            </div>
          </div>
          {apartmentLimit !== Infinity && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  height: 8,
                  width: 120,
                  borderRadius: 4,
                  background: "#e1e3e5",
                  overflow: "hidden",
                }}
              >
                <div style={{ width: `${usedPct}%`, height: "100%", background: usedPct >= 100 ? "#d82c0d" : "#008060", borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, color: "#6d7175" }}>{apartmentCount} / {limits}</span>
            </div>
          )}
        </div>
      </s-section>

      {/* Plans */}
      <s-section heading="Choose a Plan">
        <s-paragraph>
          Upgrade at any time. All paid plans include a 7-day free trial — no
          credit card required to start.
        </s-paragraph>

        {/* Billing toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "#f6f6f7",
            border: "1px solid #e1e3e5",
            borderRadius: 8,
            padding: 4,
            width: "fit-content",
            marginBottom: 24,
            marginTop: 12,
          }}
        >
          {["monthly", "yearly"].map((b) => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              style={{
                padding: "6px 20px",
                fontSize: 13,
                fontWeight: billing === b ? 600 : 400,
                color: billing === b ? "#202223" : "#6d7175",
                background: billing === b ? "#fff" : "transparent",
                border: billing === b ? "1px solid #e1e3e5" : "1px solid transparent",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {b === "monthly" ? "Monthly" : "Yearly"}
              {b === "yearly" && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 8,
                    background: "#008060",
                    color: "#fff",
                  }}
                >
                  -20%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {PLANS.map((plan) => {
            const isCurrent = plan.key === currentPlan;
            const price = billing === "yearly" && plan.price > 0
              ? Math.round(plan.price * 0.8)
              : plan.price;
            const planKey = plan.key; // "pro" | "business" — action resolves yearly variant

            return (
              <div
                key={plan.key}
                style={{
                  border: `2px solid ${isCurrent ? "#008060" : plan.badge ? "#2c6ecb" : "#e1e3e5"}`,
                  borderRadius: 10,
                  padding: "20px 20px 24px",
                  position: "relative",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {plan.badge && !isCurrent && (
                  <div
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: "2px 14px",
                      background: "#2c6ecb",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {plan.badge}
                  </div>
                )}
                {isCurrent && (
                  <div
                    style={{
                      position: "absolute",
                      top: -12,
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: "2px 14px",
                      background: "#008060",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Current Plan
                  </div>
                )}

                <div style={{ fontSize: 16, fontWeight: 700, color: "#202223", marginBottom: 4 }}>
                  {plan.name}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: "#202223" }}>
                    {price === 0 ? "Free" : `$${price}`}
                  </span>
                  {price > 0 && (
                    <span style={{ fontSize: 13, color: "#6d7175" }}>
                      / {billing === "yearly" ? "mo, billed yearly" : "month"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#6d7175", marginBottom: 16 }}>
                  {plan.description}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, marginBottom: 20 }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: f.included ? "#008060" : "#c9cccf", flexShrink: 0, display: "flex" }}>
                        <Icon source={f.included ? CheckSmallIcon : XSmallIcon} />
                      </span>
                      <span style={{ fontSize: 13, color: f.included ? "#202223" : "#c9cccf" }}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: 13,
                      color: "#008060",
                      fontWeight: 600,
                      padding: "9px",
                      border: "1px solid #008060",
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Icon source={CheckSmallIcon} /> Active
                    </span>
                  </div>
                ) : (
                  <button
                    disabled={isSubmitting}
                    onClick={() => plan.price > 0 ? handleUpgrade(planKey) : undefined}
                    style={{
                      padding: "10px",
                      background: plan.badge ? "#2c6ecb" : "#202223",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      opacity: isSubmitting ? 0.7 : 1,
                      width: "100%",
                    }}
                  >
                    {isSubmitting
                      ? "Redirecting…"
                      : plan.price === 0
                        ? "Downgrade to Free"
                        : `Upgrade to ${plan.name}${billing === "yearly" ? " (Yearly)" : ""}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: "#6d7175", textAlign: "center" }}>
          All paid plans include a 7-day free trial. Cancel any time. No hidden fees.
        </div>
      </s-section>

      {/* Feature comparison */}
      <s-section heading="Full Feature Comparison">
        <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ ...thStyle, textAlign: "left" }}>Feature</th>
                {PLANS.map((p) => (
                  <th key={p.key} style={{ ...thStyle, textAlign: "center", color: p.key === currentPlan ? "#008060" : "#202223" }}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Apartments",             values: ["1",   "Unlimited", "Unlimited"] },
                { label: "Booking calendar",        values: [true,  true,       true        ] },
                { label: "Email notifications",     values: [true,  true,       true        ] },
                { label: "Notification templates",  values: [true,  true,       true        ] },
                { label: "SMTP delivery",           values: [true,  true,       true        ] },
                { label: "Analytics & reports",     values: [false, false,      true        ] },
                { label: "Priority support",        values: [false, false,      true        ] },
                { label: "Monthly price",           values: ["Free", "$19/mo", "$49/mo"    ] },
              ].map((row, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: i < 7 ? "1px solid #e1e3e5" : "none", background: i % 2 === 0 ? "#fff" : "#fafafa" }}
                >
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{row.label}</td>
                  {row.values.map((v, j) => (
                    <td key={j} style={{ ...tdStyle, textAlign: "center" }}>
                      {typeof v === "boolean" ? (
                        <span style={{ color: v ? "#008060" : "#c9cccf", display: "inline-flex", justifyContent: "center" }}>
                          <Icon source={v ? CheckSmallIcon : XSmallIcon} />
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </s-section>

      {/* Billing History */}
      <s-section heading="Billing History">
        {invoices.length === 0 ? (
          <>
            <s-paragraph>
              Your invoices and payment history will appear here once you upgrade to a paid plan.
            </s-paragraph>
            <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                    <th style={{ ...thStyle, textAlign: "left" }}>Invoice</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Plan</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdStyle} colSpan={5}>
                      <div style={{ textAlign: "center", padding: "24px 0", color: "#6d7175", fontSize: 14 }}>
                        No invoices yet — upgrade to a paid plan to see billing history.
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                  <th style={{ ...thStyle, textAlign: "left" }}>Invoice #</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Plan</th>
                  <th style={thStyle}>Billing</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const date = inv.createdAt
                    ? new Date(inv.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
                    : "—";
                  const amount = inv.amount != null
                    ? new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency }).format(inv.amount)
                    : "—";
                  const interval = inv.interval === "ANNUAL" ? "Yearly" : inv.interval === "EVERY_30_DAYS" ? "Monthly" : "—";
                  const statusCfg = INV_STATUS[inv.status] ?? INV_STATUS.PENDING;
                  return (
                    <tr key={inv.id} style={{ borderBottom: i < invoices.length - 1 ? "1px solid #f1f2f3" : "none" }}>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 13 }}>
                          🧾 {inv.id.slice(-8).toUpperCase()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#6d7175" }}>{date}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{inv.name}</td>
                      <td style={{ ...tdStyle, color: "#6d7175" }}>{interval}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: inv.amount > 0 ? "#202223" : "#8c9196" }}>{amount}</td>
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 600,
                          background: statusCfg.bg,
                          color: statusCfg.color,
                        }}>
                          {statusCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      {/* FAQ */}
      <s-section heading="Frequently Asked Questions">
        {[
          {
            q: "Can I cancel my subscription at any time?",
            a: "Yes. You can cancel your subscription at any time from this page. Your access will continue until the end of the current billing period.",
          },
          {
            q: "Is there a free trial on paid plans?",
            a: "All paid plans include a 7-day free trial. No credit card is required to start the trial.",
          },
          {
            q: "What happens if I exceed my apartment limit on the free plan?",
            a: "You will not be able to create new apartments until you either upgrade your plan or remove an existing apartment.",
          },
          {
            q: "Can I switch between monthly and yearly billing?",
            a: "Yes. You can switch billing periods at any time. When switching to yearly, the saving is applied from your next billing cycle.",
          },
        ].map((item, i) => (
          <div key={i} style={{ padding: "14px 0", borderBottom: i < 3 ? "1px solid #e1e3e5" : "none" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#202223", marginBottom: 4 }}>
              {item.q}
            </div>
            <div style={{ fontSize: 14, color: "#6d7175", lineHeight: 1.6 }}>
              {item.a}
            </div>
          </div>
        ))}
      </s-section>
    </s-page>
  );
}

const thStyle = {
  padding: "10px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6d7175",
  textAlign: "left",
};

const tdStyle = {
  padding: "12px 16px",
  fontSize: "14px",
  color: "#202223",
  verticalAlign: "middle",
};

// Shopify AppSubscription status → display config
const INV_STATUS = {
  ACTIVE:    { label: "Active",    bg: "#d4edda", color: "#155724" },
  CANCELLED: { label: "Cancelled", bg: "#f8d7da", color: "#721c24" },
  DECLINED:  { label: "Declined",  bg: "#f8d7da", color: "#721c24" },
  EXPIRED:   { label: "Expired",   bg: "#e2e3e5", color: "#383d41" },
  FROZEN:    { label: "Frozen",    bg: "#fff3cd", color: "#856404" },
  PENDING:   { label: "Pending",   bg: "#fff3cd", color: "#856404" },
};
