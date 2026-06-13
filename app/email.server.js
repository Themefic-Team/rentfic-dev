import nodemailer from "nodemailer";
import prisma from "./db.server";
import { DEFAULT_TEMPLATES } from "./notification-defaults";

// ─── Placeholder resolver ─────────────────────────────────────────────────────

function fill(text, vars) {
  return (text || "").replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? "");
}

function buildHtml(bodyText) {
  return `<div style="font-family:sans-serif;line-height:1.6;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
    ${bodyText.split("\n").map(l => l ? `<p style="margin:6px 0">${l}</p>` : "<br>").join("")}
  </div>`;
}

// ─── Transport factory ────────────────────────────────────────────────────────

function makeTransport(host, port, user, pass, encryption) {
  return nodemailer.createTransport({
    host,
    port:       parseInt(port || "587"),
    secure:     encryption === "ssl",
    requireTLS: encryption === "tls",
    auth:       user ? { user, pass: pass || "" } : undefined,
    tls:        { rejectUnauthorized: false },
  });
}

// Cache Ethereal account so we don't create a new one on every call
let _ethereal = null;
async function getEtherealTransport() {
  if (!_ethereal) {
    const acct = await nodemailer.createTestAccount();
    _ethereal = {
      transport: nodemailer.createTransport({
        host: "smtp.ethereal.email", port: 587, secure: false,
        auth: { user: acct.user, pass: acct.pass },
      }),
      from: `"Rentfic" <${acct.user}>`,
    };
    console.log(
      "\n[Rentfic] No SMTP configured — using Ethereal test inbox (dev only).",
      `\n  View messages → https://ethereal.email/messages`,
      `\n  Login: ${acct.user} / ${acct.pass}\n`
    );
  }
  return _ethereal;
}

async function resolveTransport(config) {
  // Merchant's own SMTP
  if (config?.emailProvider === "smtp" && config?.smtpHost) {
    return {
      transport: makeTransport(config.smtpHost, config.smtpPort, config.smtpUser, config.smtpPass, config.smtpEncryption),
      from: `"${config.smtpFromName || "Rentfic"}" <${config.smtpFromEmail || config.smtpUser}>`,
    };
  }

  // App-level SMTP from env vars (production default)
  if (process.env.SMTP_HOST) {
    return {
      transport: makeTransport(
        process.env.SMTP_HOST,
        process.env.SMTP_PORT,
        process.env.SMTP_USER,
        process.env.SMTP_PASS,
        process.env.SMTP_ENCRYPTION || "tls"
      ),
      from: `"${process.env.SMTP_FROM_NAME || "Rentfic"}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || ""}>`,
    };
  }

  // No SMTP anywhere — fall back to Ethereal test inbox
  return getEtherealTransport();
}

// ─── Main send function ───────────────────────────────────────────────────────

export async function sendNotification(shop, type, vars, { to } = {}) {
  const recipient = to || vars["_to"];
  if (!recipient) return { skipped: true, reason: "no_recipient" };

  const config    = await prisma.notificationConfig.findUnique({ where: { shop } });
  const savedTpls = config?.templates ?? {};
  const tpl       = { ...DEFAULT_TEMPLATES[type], ...(savedTpls[type] ?? {}) };

  if (!tpl?.enabled) return { skipped: true, reason: "disabled" };

  const { transport, from } = await resolveTransport(config);

  const subject  = fill(tpl.subject, vars);
  const bodyText = fill(tpl.body,    vars);
  const bodyHtml = buildHtml(bodyText);

  try {
    const info    = await transport.sendMail({ from, to: recipient, subject, text: bodyText, html: bodyHtml });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log(`[Rentfic email] Ethereal preview → ${preview}`);
    return { sent: true, ...(preview ? { preview } : {}) };
  } catch (err) {
    console.error(`[Rentfic email] ${type} → ${recipient}:`, err.message);
    return { skipped: true, reason: err.message };
  }
}

// ─── Dummy vars for test emails ───────────────────────────────────────────────

export const DUMMY_VARS = {
  "date":               "June 15, 2025",
  "start":              "June 15, 2025 · 3:00 PM",
  "end":                "June 20, 2025 · 11:00 AM",
  "product.name":       "Ocean View Suite",
  "product.url":        "https://yourstore.myshopify.com/products/ocean-view-suite",
  "order.name":         "#1001",
  "order.note":         "",
  "customer.firstName": "Jane",
  "customer.lastName":  "Smith",
};
