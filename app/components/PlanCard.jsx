import { useRouteLoaderData } from "react-router";
import { Icon } from "@shopify/polaris";
import { AlertTriangleIcon } from "@shopify/polaris-icons";
import { ClipboardCheckFilledIcon, ChevronRightIcon  } from "@shopify/polaris-icons";

const PLAN_STYLE = {
  free:     { bg: "#f6f6f7", border: "#e1e3e5", badge: "#8c9196", bar: "#8c9196" },
  pro:      { bg: "#f0faf6", border: "#b5e4d8", badge: "var(--p-color-primary, #FD4A52)", bar: "var(--p-color-primary, #008060)" },
  business: { bg: "#f4f0ff", border: "#d3bfff", badge: "#6514d2", bar: "#6514d2" },
};

export function PlanCard({ data: dataProp }) {
  const routeData = useRouteLoaderData("routes/app");
  const data = dataProp ?? routeData;
  if (!data) return null; 

  const { appPlan, apartmentCount, apartmentLimit, renewalDate } = data;
  const planKey  = (appPlan ?? "free").toLowerCase();
  const style    = PLAN_STYLE[planKey] ?? PLAN_STYLE.free;
  const planName = planKey === "pro" ? "Pro" : planKey === "business" ? "Business" : "Free";
  const isPaid   = planKey !== "free";

  const limit    = (apartmentLimit === Infinity || apartmentLimit === null) ? null : apartmentLimit;
  const usedPct  = limit ? Math.min(100, (apartmentCount / limit) * 100) : 0;
  const atLimit  = limit !== null && apartmentCount >= limit;

  let renewalText = null;
  if (isPaid && renewalDate) {
    try {
      renewalText = new Date(renewalDate).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      });
    } catch (_) {}
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 10,
        marginBottom: 16,
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Plan badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 12px",
            background: style.badge,
            color: "#fff",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {appPlan === "free" ? (
            <Icon source={AlertTriangleIcon} tone="inherit" />
          ) : (
            <Icon source={ClipboardCheckFilledIcon} tone="inherit" />
          )}
          {planName} Plan
        </div>

        {/* Usage (free plan) */}
        {limit !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                color: atLimit ? "#d82c0d" : "#6d7175",
                fontWeight: atLimit ? 600 : 400,
              }}
            >
              {apartmentCount} of {limit} apartment{limit === 1 ? "" : "s"} used
            </span>
            <div
              style={{
                width: 80,
                height: 6,
                borderRadius: 4,
                background: "#e1e3e5",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: `${usedPct}%`,
                  height: "100%",
                  background: atLimit ? "#d82c0d" : style.bar,
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        )}

        {/* Unlimited note (paid plan) */}
        {limit === null && (
          <span style={{ fontSize: 13, color: "#6d7175" }}>
            {apartmentCount} apartment{apartmentCount !== 1 ? "s" : ""} · Unlimited
          </span>
        )}

        {/* Renewal date */}
        {renewalText && (
          <span style={{ fontSize: 13, color: "#6d7175" }}>
            Renews {renewalText}
          </span>
        )}
      </div>

      {/* Right: link */}
      <a
        href="/app/subscribtion"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          fontWeight: 600,
          color: style.badge,
          textDecoration: "none",
          padding: "4px 12px",
          border: `1px solid ${style.border}`,
          borderRadius: 6,
          background: "#fff",
          whiteSpace: "nowrap",
        }}
      >
        {isPaid ? <>Manage <Icon source={ChevronRightIcon } tone="inherit" /></> : atLimit ? <>Upgrade to add more <Icon source={ChevronRightIcon } tone="inherit" /></> : <>Upgrade plan <Icon source={ChevronRightIcon } tone="inherit" /></>}
      </a>
    </div>
  );
}
