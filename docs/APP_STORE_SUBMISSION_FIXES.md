# Shopify App Store Submission Fixes

This document outlines the required fixes identified for the `rentfic-dev` Shopify App before it can be successfully submitted and approved on the Shopify App Store.

## 1. Missing Mandatory GDPR Webhooks (Critical)

Shopify strictly requires all public apps to implement three specific privacy webhooks. The app is currently missing these configurations in `shopify.app.toml` and lacks the corresponding endpoint handlers in the `app/routes/` directory.

**Required Action:**
Add the following block to your `shopify.app.toml`. The URLs must point to a production-ready domain and endpoint (e.g., `/api/webhooks/privacy`):

```toml
[webhooks.privacy_compliance]
customer_deletion_url = "https://your-production-url.com/api/webhooks/privacy"
customer_data_request_url = "https://your-production-url.com/api/webhooks/privacy"
shop_deletion_url = "https://your-production-url.com/api/webhooks/privacy"
```

Next, implement the actual route logic in Remix (e.g., in `app/routes/webhooks.privacy.jsx`) to handle the incoming requests securely via App Bridge and verify the HMAC signature.

## 2. Placeholder URLs in App Config

Several configurations in `shopify.app.toml` are currently set to the default placeholder `https://example.com`. Before submission, these must be updated to match the actual production domain where the app will be hosted.

**Required Action:**
Update the following fields in `shopify.app.toml`:
- `application_url = "https://your-production-url.com"`
- `redirect_urls = [ "https://your-production-url.com/api/auth" ]`
- Under `[app_proxy]`, update the url: `url = "https://your-production-url.com/api/proxy"`

## 3. App Name

The app name defined in `shopify.app.toml` is currently `rentfic-dev`. While acceptable for local development or testing environments, this name should be polished for production.

**Required Action:**
Rename the application in `shopify.app.toml` to remove the `-dev` suffix (e.g., `Rentfic`). Ensure this name consistently aligns with what you input in the Shopify Partner Dashboard listing.

## 4. Billing Implementation (If Applicable)

If you plan to charge merchants for installing or using the app (via subscription plans, free trials, or one-time charges), you must use the official **Shopify Billing API**. 

**Required Action:**
Review the authentication flow (e.g., inside `app/routes/app.jsx`) to verify that proper billing checks are implemented via `@shopify/shopify-app-remix` (or react-router). The App Store review team actively tests these flows; failing to implement Shopify Billing correctly will result in automatic rejection.

## 5. Environment & Client ID

The `client_id` referenced in `shopify.app.toml` is currently set to a specific application ID (`c8f1c29e6603af52c05cd741a1be756f`). 

**Required Action:**
Prior to release, ensure this `client_id` accurately matches the production app created in your Shopify Partner Dashboard. Ensure `.env` variables for production are accurately populated with the production client secret and scopes.
