import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { PlanCard } from "../components/PlanCard";
import prisma from "../db.server";
import { getPlanLimits } from "../plans.server";
import { Banner } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [
    shopRecord,
    totalBookings,
    activeApartments,
    apartmentCount,
    revenueAgg,
    newBookingsThisMonth,
    cancellationsThisMonth,
    recentBookings,
  ] = await Promise.all([
    prisma.shop.findUnique({ where: { shop } }),
    prisma.booking.count({ where: { shop } }),
    prisma.apartment.count({ where: { shop, status: "active" } }),
    prisma.apartment.count({ where: { shop } }),
    prisma.booking.aggregate({
      where: { shop, status: { in: ["confirmed", "completed"] }, createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { totalPrice: true },
    }),
    prisma.booking.count({ where: { shop, createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.booking.count({ where: { shop, status: "cancelled", createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.booking.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerEmail: true,
        productTitle: true,
        startDate: true,
        endDate: true,
        totalPrice: true,
        nights: true,
        status: true,
      },
    }),
  ]);

  const appPlan = shopRecord?.plan ?? "free";
  const limits  = getPlanLimits(appPlan);
  const listingLimit = limits.listings === Infinity ? null : limits.listings;
  const revenueThisMonth = revenueAgg._sum.totalPrice ?? 0;

  const avgNights = recentBookings.length
    ? (recentBookings.reduce((sum, b) => sum + (b.nights ?? 0), 0) / recentBookings.length).toFixed(1)
    : "0";

  // ── Check if Rentfic App Embed block is enabled in the active theme ──────────
  let isEmbedEnabled = false;
  let embedCheckError = null;
  try {
    // Use the GraphQL Admin API via the authenticated admin client
    // (avoids raw REST token issues on stores that installed before read_themes scope)
    const themesRes = await admin.graphql(`
      query {
        themes(first: 20) {
          nodes {
            id
            name
            role
          }
        }
      }
    `);
    const themesJson = await themesRes.json();
    const themes = themesJson?.data?.themes?.nodes ?? [];
    const mainTheme = themes.find((t) => t.role === "MAIN");

    if (mainTheme) {
      // Extract numeric theme ID from GID (e.g. "gid://shopify/Theme/123456789")
      const themeNumericId = mainTheme.id.split("/").pop();

      // Fetch the settings_data.json asset via REST (requires read_themes scope)
      // If the store hasn't granted this scope yet, we skip silently
      const assetRes = await fetch(
        `https://${shop}/admin/api/2024-10/themes/${themeNumericId}/assets.json?asset[key]=config/settings_data.json`,
        { headers: { "X-Shopify-Access-Token": session.accessToken } }
      );

      if (assetRes.status === 403) {
        // Store hasn't granted read_themes scope yet — hide the banner gracefully
        embedCheckError = null;
        isEmbedEnabled = true; // treat as enabled so the warning banner doesn't show
      } else if (assetRes.ok) {
        const assetJson = await assetRes.json();
        const raw = assetJson?.asset?.value;
        if (raw) {
          const settingsData = JSON.parse(raw);
          // app-embed blocks live under current.blocks (object keyed by UUID)
          const blocks = settingsData?.current?.blocks ?? {};
          isEmbedEnabled = Object.values(blocks).some(
            (b) => typeof b.type === "string" && b.type.includes("app_embed") && b.disabled !== true
          );
        }
      }
    }
  } catch (err) {
    console.error("[Dashboard] embed check error:", err.message);
    // On any unexpected error, hide the banner rather than showing a red error
    isEmbedEnabled = true;
    embedCheckError = null;
  }
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    appPlan,
    listingCount: apartmentCount,
    listingLimit,
    renewalDate: null,
    stats: {
      totalBookings,
      activeApartments,
      revenueThisMonth,
      newBookingsThisMonth,
      cancellationsThisMonth,
      avgNights,
    },
    recentBookings,
    isEmbedEnabled,
    embedCheckError,
    shopifyApiKey: process.env.SHOPIFY_API_KEY,
    shop,
  };
};

// No action needed — the button is just a link to the Theme Editor

const STATUS_STYLE = {
  confirmed: { background: "#d4edda", color: "#155724" },
  completed: { background: "#e2e3e5", color: "#383d41" },
  cancelled: { background: "#f8d7da", color: "#721c24" },
  pending:   { background: "#fff3cd", color: "#856404" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { stats, recentBookings, isEmbedEnabled, embedCheckError, shopifyApiKey, shop, ...planData } = useLoaderData();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();

  // After user opens the Theme Editor and clicks "Enable App Embed", 
  // poll the loader every 4s until isEmbedEnabled flips to true.
  const [isPolling, setIsPolling] = useState(false);

  // Start polling as soon as the user clicks the activate button
  const handleActivateClick = () => setIsPolling(true);

  useEffect(() => {
    if (!isPolling) return;
    if (isEmbedEnabled) {
      setIsPolling(false);
      return;
    }
    const id = setInterval(() => revalidate(), 4000);
    return () => clearInterval(id);
  }, [isPolling, isEmbedEnabled, revalidate]);

  const overviewStats = [
    { label: "Total Bookings",      value: stats.totalBookings },
    { label: "Active Rentals",       value: stats.activeApartments },
    { label: "Revenue This Month",   value: `$${Number(stats.revenueThisMonth || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
    { label: "Avg. Duration / Stay", value: `${stats.avgNights} nights` },
  ];

  // Deep-link that opens the Theme Editor directly on the App Embeds tab
  // and highlights the Rentfic embed block so the merchant can toggle it on.
  const themeEditorUrl = shopifyApiKey
    ? `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${shopifyApiKey}/app_embed`
    : `https://${shop}/admin/themes`;

  return (
    <s-page fullWidth  heading="Dashboard">

      {/* ── App Embed Status Banner ─────────────────────────────────────────── */}
      <div style={{ marginBottom: "20px" }}>
        {!isEmbedEnabled ? (
          <Banner
            title="Enable the Rentfic App Embed"
            tone="warning"
            action={{
              content: isPolling ? "Waiting for you to save…" : "Enable App Embed",
              url: themeEditorUrl,
              external: true,
              onAction: handleActivateClick,
            }}
          >
            <p>
              The Rentfic booking widget is not active on your storefront yet.
              Click <strong>Enable App Embed</strong> to open the Theme Editor,
              toggle the Rentfic switch ON, then hit <strong>Save</strong>.
              This notice will disappear automatically once it is enabled.
            </p>
            {embedCheckError && (
              <p style={{ marginTop: 8, color: "#d72c0d", fontSize: 13, fontWeight: 600 }}>
                Check error: {embedCheckError}
              </p>
            )}
          </Banner>
        ) : (
          <Banner
            title="Rentfic App Embed is enabled and active!"
            tone="success"
            action={{
              content: "Manage in Theme Editor",
              url: themeEditorUrl,
              external: true,
            }}
          />
        )}
      </div>

      <PlanCard data={planData} />

      {/* Stats */}
      <s-section heading="Overview">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
          {overviewStats.map((s) => (
            <div
              key={s.label}
              style={{
                padding: "16px",
                border: "1px solid #e1e3e5",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#6d7175", marginBottom: "6px" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#202223" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </s-section>

      {/* Recent bookings */}
      <s-section heading="Recent Bookings">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <s-paragraph>Latest bookings across all rentals.</s-paragraph>
          <a
            href="/app/booking"
            style={{ fontSize: 13, fontWeight: 600, color: "#005bd3", textDecoration: "none" }}
          >
            View All Bookings →
          </a>
        </div>
        <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden", marginTop: "4px" }}>
          {recentBookings.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#6d7175", fontSize: "14px" }}>
              No bookings yet.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                  {["Order", "Customer", "Rental", "Start Date", "End Date", "Total", "Status"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b, i) => (
                  <tr
                    key={b.id}
                    onClick={() => navigate(`/app/booking/${b.id}`)}
                    style={{
                      borderBottom: i < recentBookings.length - 1 ? "1px solid #e1e3e5" : "none",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    <td style={tdStyle}>{b.orderNumber ? `#${b.orderNumber}` : <span style={{ color: "#8c9196", fontSize: 12 }}>{b.id.slice(-6).toUpperCase()}</span>}</td>
                    <td style={tdStyle}>{b.customerName ?? b.customerEmail ?? <span style={{ color: "#8c9196" }}>-</span>}</td>
                    <td style={{ ...tdStyle, color: "#6d7175" }}>{b.productTitle}</td>
                    <td style={tdStyle}>{b.startDate}</td>
                    <td style={tdStyle}>{b.endDate ?? "-"}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {b.totalPrice != null ? `$${Number(b.totalPrice).toFixed(2)}` : "-"}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: "2px 10px",
                        borderRadius: "10px",
                        ...(STATUS_STYLE[b.status] ?? STATUS_STYLE.pending),
                      }}>
                        {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </s-section>

    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

const thStyle = {
  padding: "10px 14px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6d7175",
  textAlign: "left",
};

const tdStyle = {
  padding: "12px 14px",
  fontSize: "14px",
  color: "#202223",
  verticalAlign: "middle",
};
