# Shopify App Development & Submission Guide

This document serves as a comprehensive guide for developing a public Shopify app and successfully passing the Shopify App Store review process.

## 1. Core Development Requirements

Before you even consider submitting your app, ensure it meets Shopify's strict technical and design requirements.

### 1.1 Authentication and Security
- **OAuth 2.0:** Your app must authenticate via Shopify's OAuth flow.
- **Session Tokens:** For embedded apps, you must use Shopify App Bridge and Session Tokens instead of third-party cookies.
- **HMAC Validation:** All webhooks and incoming requests from Shopify must be verified using HMAC to ensure they are genuinely from Shopify.
- **Mandatory Webhooks:** You MUST subscribe to and properly handle the three mandatory privacy webhooks (GDPR):
  - `customers/data_request`
  - `customers/redact`
  - `shop/redact`

### 1.2 User Interface & Experience
- **Embedded Apps:** If your app is embedded in the Shopify admin, it must load quickly and seamlessly.
- **Polaris Design System:** It is highly recommended (and sometimes required for a seamless experience) to use Shopify's Polaris design system for all admin-facing UI.
- **Onboarding:** The app must be functional immediately after installation, or it must clearly guide the user through a frictionless setup process.

### 1.3 Storefront Impact (Theme App Extensions)
- **App Embed Blocks:** If your app modifies the storefront (like Rentfic's booking widget), you must use Theme App Extensions (App Blocks / App Embeds) instead of injecting `ScriptTags` or modifying liquid files directly.
- **Performance:** Storefront code must not block page rendering (use `defer` or `async` for JavaScript) and must not degrade the merchant's Lighthouse scores.

### 1.4 Billing API
- **Shopify Billing:** If you charge merchants for your app, you **must** use the Shopify Billing API. You cannot use Stripe, PayPal, or other external gateways to collect subscription fees or one-time charges for the app itself.

---

## 2. App Store Submission Preparation

The Shopify review team will meticulously check both your app's functionality and its App Store listing. 

### 2.1 The App Listing
You will need to prepare the following marketing assets and copy:
- **App Name:** Must be unique, not contain the word "Shopify", and not infringe on trademarks.
- **Tagline:** A short, punchy sentence explaining what the app does.
- **Detailed Description:** Clearly explain the problem the app solves and how it benefits the merchant.
- **App Icon:** 1200 x 1200px. Must not contain text or screenshots. Keep it clean and scalable.
- **Screenshots:** High-resolution screenshots showing the app in action.
- **Key Benefits:** Up to 3 key benefits with a short description and an optional image for each.
- **Pricing Details:** Clear and transparent pricing tiers.

### 2.2 Support and Documentation
- **Support Contact:** You must provide a valid support email address.
- **Privacy Policy:** A publicly accessible URL to your app's privacy policy.
- **FAQ / Help Center:** Provide a link where merchants can find documentation or instructions on how to use the app.

---

## 3. The Testing Process (Pre-Submission)

Before hitting "Submit", you must thoroughly test your app in a **Development Store**.

1. **Install Flow:** Install the app on a fresh development store. Does it authenticate smoothly?
2. **Functional Testing:** Test all core features. For Rentfic, this means creating a booking, verifying the storefront widget, and checking that webhooks (like order creation) fire correctly.
3. **Uninstall Flow:** Uninstall the app. Ensure that you listen for the `app/uninstalled` webhook and properly clean up merchant data and pause any active billing subscriptions.
4. **Reinstall Flow:** Reinstall the app. Does it resume gracefully?

---

## 4. The Submission and Review Process

1. **Submit via Partner Dashboard:** Navigate to your Partner Dashboard > Apps > [Your App] > Distribution > Shopify App Store. Fill out the listing and submit.
2. **Review Timeline:** The review process typically takes **1 to 2 weeks**. 
3. **Communication:** The Shopify review team will communicate with you via the Partner Dashboard and email. They may ask for a screencast, a test account, or point out specific issues that need fixing.
4. **Revisions:** It is very common to be rejected on the first attempt due to minor UI/UX issues or missing webhooks. Fix the requested issues and resubmit. 

## 5. Helpful Resources & Official Documentation
*   [Shopify App Review Requirements](https://shopify.dev/docs/apps/store/requirements)
*   [Design Guidelines (Polaris)](https://polaris.shopify.com/)
*   [Getting Started with App Bridge](https://shopify.dev/docs/api/app-bridge)
*   [Implementing the Billing API](https://shopify.dev/docs/apps/billing)
*   [Mandatory Privacy Webhooks](https://shopify.dev/docs/apps/webhooks/mandatory)
