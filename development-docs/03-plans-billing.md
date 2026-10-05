# 03 — Plans & Billing
**Last Updated:** 2026-10-05

> Source: `app/plans.server.js`, `app/routes/app.subscribtion.jsx`

## Plan Limits

Defined in `PLAN_LIMITS` in `app/plans.server.js`:

| Limit Key | Free | Pro | Business |
|---|---|---|---|
| `listings` | 1 | Unlimited | Unlimited |
| `analytics` | ❌ | ❌ | ✅ |
| `customEmail` | ✅ | ✅ | ✅ |

The `getPlanLimits(plan)` function returns the limits object for any plan key string.

## Billing Plans (Shopify)

| Key | Shopify Plan Name | Price | Interval | Trial |
|---|---|---|---|---|
| `pro` | `"Pro"` | $19/mo | `EVERY_30_DAYS` | 7 days |
| `pro_yearly` | `"Pro Yearly"` | $182/yr (~$15.20/mo) | `ANNUAL` | 7 days |
| `business` | `"Business"` | $49/mo | `EVERY_30_DAYS` | 7 days |
| `business_yearly` | `"Business Yearly"` | $470/yr (~$39.20/mo) | `ANNUAL` | 7 days |

Yearly plans apply a 20% discount: `Math.round(price * 0.8 * 12)`.

## Upgrade Flow

1. Merchant clicks "Upgrade to Pro/Business" on the Subscription page.
2. The form posts `plan` + `billing_period` to the route action.
3. `billing.request({ plan: shopifyPlanName, isTest: true, returnUrl })` is called.
4. Shopify throws a redirect Response to the billing confirmation URL.
5. Merchant approves → Shopify redirects back to `returnUrl` (`/app/subscribtion`).
6. The `webhooks.app_subscriptions.update` webhook fires and updates `Shop.plan` in DB.

## Downgrade Flow (to Free)

1. Merchant clicks "Downgrade to Free".
2. The form posts `intent=cancel`.
3. The action calls `billing.check()` to get the active subscription ID.
4. `billing.cancel({ subscriptionId })` is called.
5. **Optimistic UI**: `Shop.plan` is immediately set to `"free"` in DB so the UI reflects the change before the webhook arrives.
6. Redirects to `/app/subscribtion`.

## Plan Enforcement

- **Listing limit**: Checked server-side in `app.apartments.$id.jsx` loader (on `new`) and action (`duplicate`). Returns `{ limitReached: true }` — the UI renders a `PlanCard` upgrade prompt instead of the form.
- **Analytics gate**: `app.analytics.jsx` loader redirects to `/app/subscribtion` if `!limits.analytics`.
- **Plan stored in DB**: `Shop.plan` is the source of truth. The root `app.jsx` loader reads it and passes `appPlan` to all child routes via `useRouteLoaderData("routes/app")`.

## `PlanCard` Component

`app/components/PlanCard.jsx` — a reusable banner shown at the top of most pages.

- Reads data from the `routes/app` route loader data.
- Shows current plan badge, rental bookings used / limit, usage progress bar.
- Links to `/app/subscribtion`.
- For unlimited plans, shows rental count + "Unlimited".
