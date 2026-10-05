---
name: update-dev-docs
description: >
  Use this skill whenever you finish implementing a new feature, fixing a bug with a notable implementation detail, or making a significant change to any existing feature in the Rentfic app.
  This skill tells you exactly how to update the development documentation in `development-docs/` so it stays accurate and up to date.
  Activate with: "update the dev docs for [feature name]"
---

# Update Dev Docs — Skill

## Your Role

You are a technical writer embedded in the development workflow. Every time a feature is created or significantly changed, you must update the correct documentation file in `development-docs/` to reflect the new state of the code.

---

## Step 1 — Identify the Correct Doc File

Use this mapping to find which file to update:

| Feature Area | File to Update |
|---|---|
| Dashboard | `development-docs/04-dashboard.md` |
| Rentals list or Rental edit page | `development-docs/05-rentals.md` |
| Global Settings | `development-docs/06-global-settings.md` |
| Booking list, calendar, detail, new | `development-docs/07-booking.md` |
| Notifications, SMTP, email templates | `development-docs/08-notifications.md` |
| Subscription, plans, billing | `development-docs/09-subscription.md` AND `development-docs/03-plans-billing.md` |
| Storefront widget, App Proxy APIs | `development-docs/10-frontend-storefront.md` |
| Webhooks or internal API routes | `development-docs/11-webhooks-api.md` |
| Database schema change (new model or field) | `development-docs/02-database-schema.md` |
| Architecture-level change | `development-docs/01-architecture.md` |

If the change touches multiple areas, update multiple files.

---

## Step 2 — Read the Existing Doc

Before writing anything, **read the relevant doc file** to understand what is already documented and where your new section fits best.

---

## Step 3 — Add the Feature Entry

Add a new section (or update the existing section) using this exact format:

```markdown
## Feature Name
**Added:** YYYY-MM-DD

Short one-paragraph description of what this feature does and why it exists.

### Fields / Options (if applicable)
| Field | Key | Type | Default | Description |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

### Implementation Notes
- Where the logic lives (file path + function/component name).
- Any non-obvious decisions made during implementation.
- Any plan restrictions or gating.
```

Use today's date for `**Added:**`.

---

## Step 4 — Update the "Last Updated" Date

At the top of every file you modify, update the line:
```
**Last Updated:** YYYY-MM-DD
```
to today's date.

---

## Step 5 — Verify

After editing, re-read the section you added or changed and confirm:
- [ ] The description matches what the code actually does (not what was planned).
- [ ] File paths are correct relative to the project root.
- [ ] No placeholder text was left behind.

---

## Rules

- **Only document what exists in the code.** Do not document planned features.
- **Be concise.** One short paragraph per feature. Use tables for fields.
- **Do not rewrite other sections** unless they are directly related to the change.
- If you are unsure which file to update, use `development-docs/README.md` as your map.
