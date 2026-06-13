# Email / SMTP Configuration

Rentfic sends booking notifications via email. There are two ways to configure delivery.

---

## Option 1 — Default Provider (app-level SMTP)

Set environment variables on your server. These apply to **all** merchants who choose
"Default" in the Notifications page. If `SMTP_HOST` is empty, emails are silently skipped
(no errors shown to merchants).

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_ENCRYPTION=tls          # tls | ssl | none
SMTP_USER=you@example.com
SMTP_PASS=your-app-password
SMTP_FROM_NAME=Rentfic
SMTP_FROM_EMAIL=noreply@yourdomain.com
```

---

## Option 2 — Merchant SMTP (per-shop)

Each merchant can enter their own SMTP credentials in **App → Notifications → Email Delivery**.
Their settings override the app-level defaults for their shop.

| Field              | Example                  | Notes                                      |
|--------------------|--------------------------|-------------------------------------------|
| SMTP Host          | `smtp.gmail.com`         | Your email provider's outgoing mail server |
| Port               | `587`                    | 587 = TLS · 465 = SSL · 25 = plain        |
| Encryption         | `TLS`                    | Use TLS or SSL; avoid "None" in production |
| Username           | `you@gmail.com`          | Full email address for most providers      |
| Password           | `xxxx xxxx xxxx xxxx`    | Use an **App Password** (see below)        |
| From Name          | `My Rentals`             | Displayed in the "From" field              |
| From Email         | `noreply@mybusiness.com` | Must match or be authorised by the account |

---

## Provider-specific Settings

### Gmail
1. Enable **2-Step Verification** in your Google Account → Security.
2. Go to **Security → App passwords** and create one for "Mail".
3. Use the 16-character app password (spaces don't matter) as the SMTP password.

| Field      | Value            |
|------------|------------------|
| Host       | `smtp.gmail.com` |
| Port       | `587`            |
| Encryption | `TLS`            |
| Username   | `you@gmail.com`  |
| Password   | App Password     |

### Outlook / Hotmail / Microsoft 365
| Field      | Value                        |
|------------|------------------------------|
| Host       | `smtp.office365.com`         |
| Port       | `587`                        |
| Encryption | `TLS`                        |
| Username   | `you@outlook.com`            |
| Password   | Account password or App PW   |

### Yahoo Mail
Enable "Allow apps that use less secure sign in" or generate an App Password.

| Field      | Value               |
|------------|---------------------|
| Host       | `smtp.mail.yahoo.com` |
| Port       | `587`               |
| Encryption | `TLS`               |

### SendGrid (recommended for high volume)
| Field      | Value                  |
|------------|------------------------|
| Host       | `smtp.sendgrid.net`    |
| Port       | `587`                  |
| Encryption | `TLS`                  |
| Username   | `apikey`               |
| Password   | Your SendGrid API key  |

### Mailgun
| Field      | Value                         |
|------------|-------------------------------|
| Host       | `smtp.mailgun.org`            |
| Port       | `587`                         |
| Encryption | `TLS`                         |
| Username   | `postmaster@mg.yourdomain.com`|
| Password   | Mailgun SMTP password         |

---

## Scheduled Reminders (Cron Job)

Rentfic sends time-based emails (check-in day, check-out reminder, booking reminder, review
request) via a daily cron endpoint.

**Endpoint:** `POST /api/reminders`

**Required header:**
```
x-cron-secret: <your CRON_SECRET env var>
```

Set `CRON_SECRET` in your `.env` to any random string, then schedule the endpoint to be
called once per day (preferably in the morning, e.g. 08:00 shop timezone).

### Cron service examples

**cURL (test manually):**
```bash
curl -X POST https://yourapp.fly.dev/api/reminders \
  -H "x-cron-secret: YOUR_SECRET"
```

**cron-job.org (free):**
1. Create account at https://cron-job.org
2. Add job → URL: `https://yourapp.fly.dev/api/reminders`
3. Method: POST · Header: `x-cron-secret: YOUR_SECRET`
4. Schedule: daily at 08:00

**GitHub Actions:**
```yaml
on:
  schedule:
    - cron: '0 8 * * *'   # 08:00 UTC daily
jobs:
  reminders:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST ${{ secrets.APP_URL }}/api/reminders \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}"
```

---

## Email types and when they fire

| Template            | Trigger                                    | Recipient |
|---------------------|--------------------------------------------|-----------|
| Booking Confirmation| Immediately when Shopify order is placed   | Guest     |
| New Booking Alert   | Same as above                              | Owner     |
| Booking Reminder    | X days before check-in (set per template)  | Guest     |
| Check-in Day        | On the day of check-in                     | Guest     |
| Check-out Reminder  | Day before check-out                       | Guest     |
| Review Request      | X days after check-out                     | Guest     |
| Cancellation        | When booking status is set to cancelled    | Guest     |

> **Cancellation emails** must be triggered manually from your booking management
> code by calling `sendNotification(shop, "bookingCancelled", vars, { to: email })`.
