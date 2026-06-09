import { useState, useEffect, useRef } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { useAppBridge, SaveBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "bookingConfirmation", label: "Booking Confirmation" },
  { key: "bookingReminder",     label: "Booking Reminder"     },
  { key: "checkinDay",          label: "Check-in Day"         },
  { key: "checkoutReminder",    label: "Check-out Reminder"   },
  { key: "bookingCancelled",    label: "Cancellation"         },
  { key: "ownerNewBooking",     label: "New Booking Alert"    },
  { key: "reviewRequest",       label: "Review Request"       },
];

const TAB_META = {
  bookingConfirmation: { recipient: "Guest",  hasTiming: false },
  bookingReminder:     { recipient: "Guest",  hasTiming: true,  timingLabel: "Days before check-in"  },
  checkinDay:          { recipient: "Guest",  hasTiming: false },
  checkoutReminder:    { recipient: "Guest",  hasTiming: false },
  bookingCancelled:    { recipient: "Guest",  hasTiming: false },
  ownerNewBooking:     { recipient: "Owner",  hasTiming: false },
  reviewRequest:       { recipient: "Guest",  hasTiming: true,  timingLabel: "Days after check-out"  },
};

const PARAMS = [
  { var: "{{date}}",                label: "Booking Date"    },
  { var: "{{start}}",               label: "Booking Start"   },
  { var: "{{end}}",                 label: "Booking End"     },
  { var: "{{product.name}}",        label: "Product Name"    },
  { var: "{{product.url}}",         label: "Product URL"     },
  { var: "{{order.name}}",          label: "Order Name"      },
  { var: "{{order.note}}",          label: "Order Note"      },
  { var: "{{customer.firstName}}",  label: "First Name"      },
  { var: "{{customer.lastName}}",   label: "Last Name"       },
];

const DEFAULT_TEMPLATES = {
  bookingConfirmation: {
    enabled: true,
    subject: "{{order.name}} - Your booking of {{product.name}}",
    body: "Hi {{customer.firstName}},\n\nWe got your booking of <strong>{{product.name}}</strong> for <strong>{{date}}</strong>.\n\nCheck-in:  {{start}}\nCheck-out: {{end}}\n\nThanks.",
    timing: null,
    groupMails: false,
    whenToRemind: "disabled",
  },
  bookingReminder: {
    enabled: true,
    subject: "Reminder: Your stay at {{product.name}} starts soon",
    body: "Hi {{customer.firstName}},\n\nThis is a reminder that your booking of <strong>{{product.name}}</strong> starts on <strong>{{start}}</strong>.\n\nCheck-out: {{end}}\n\nSee you soon!",
    timing: 2,
    groupMails: false,
    whenToRemind: "disabled",
  },
  checkinDay: {
    enabled: true,
    subject: "Today is your check-in day – {{product.name}}",
    body: "Hi {{customer.firstName}},\n\nToday is your check-in day at <strong>{{product.name}}</strong>.\n\nWe hope you have a wonderful stay!",
    timing: null,
    groupMails: false,
    whenToRemind: "disabled",
  },
  checkoutReminder: {
    enabled: true,
    subject: "Check-out reminder – {{product.name}}",
    body: "Hi {{customer.firstName}},\n\nJust a reminder that your check-out from <strong>{{product.name}}</strong> is tomorrow.\n\nSafe travels!",
    timing: null,
    groupMails: false,
    whenToRemind: "disabled",
  },
  bookingCancelled: {
    enabled: true,
    subject: "Your booking at {{product.name}} has been cancelled",
    body: "Hi {{customer.firstName}},\n\nYour booking of <strong>{{product.name}}</strong> ({{start}} – {{end}}) has been cancelled.\n\nIf you have any questions please contact us.",
    timing: null,
    groupMails: false,
    whenToRemind: "disabled",
  },
  ownerNewBooking: {
    enabled: true,
    subject: "New booking – {{product.name}} by {{customer.firstName}} {{customer.lastName}}",
    body: "A new booking has been received.\n\nProduct: {{product.name}}\nOrder:   {{order.name}}\nGuest:   {{customer.firstName}} {{customer.lastName}}\nStart:   {{start}}\nEnd:     {{end}}",
    timing: null,
    groupMails: false,
    whenToRemind: "disabled",
  },
  reviewRequest: {
    enabled: true,
    subject: "How was your stay at {{product.name}}?",
    body: "Hi {{customer.firstName}},\n\nThank you for staying at <strong>{{product.name}}</strong>!\n\nWe would love to hear your feedback.",
    timing: 1,
    groupMails: false,
    whenToRemind: "disabled",
  },
};

// ─── Loader / Action ──────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const config = await prisma.notificationConfig.findUnique({
    where: { shop: session.shop },
  });
  return { config };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const data = {
    shop:          session.shop,
    emailProvider: formData.get("emailProvider") || "default",
    smtpHost:      formData.get("smtpHost")      || null,
    smtpPort:      formData.get("smtpPort")       ? parseInt(formData.get("smtpPort")) : null,
    smtpUser:      formData.get("smtpUser")      || null,
    smtpPass:      formData.get("smtpPass")      || null,
    smtpFromName:  formData.get("smtpFromName")  || null,
    smtpFromEmail: formData.get("smtpFromEmail") || null,
    smtpEncryption: formData.get("smtpEncryption") || "tls",
    templates:     JSON.parse(formData.get("templates") || "{}"),
  };

  await prisma.notificationConfig.upsert({
    where:  { shop: session.shop },
    update: data,
    create: data,
  });

  return { success: true };
};

// ─── Page component ───────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { config }   = useLoaderData();
  const actionData   = useActionData();
  const submit       = useSubmit();
  const navigation   = useNavigation();
  const shopify      = useAppBridge();

  const isSaving = navigation.state === "submitting";

  // Merge saved templates with defaults
  const savedTpls = config?.templates ?? {};
  const buildTemplates = () =>
    Object.fromEntries(
      TABS.map(({ key }) => [key, { ...DEFAULT_TEMPLATES[key], ...(savedTpls[key] ?? {}) }])
    );

  const [activeTab,      setActiveTab]      = useState(TABS[0].key);
  const [templates,      setTemplates]      = useState(buildTemplates);
  const [emailProvider,  setEmailProvider]  = useState(config?.emailProvider  ?? "default");
  const [smtpHost,       setSmtpHost]       = useState(config?.smtpHost       ?? "");
  const [smtpPort,       setSmtpPort]       = useState(config?.smtpPort?.toString() ?? "587");
  const [smtpUser,       setSmtpUser]       = useState(config?.smtpUser       ?? "");
  const [smtpPass,       setSmtpPass]       = useState(config?.smtpPass       ?? "");
  const [smtpFromName,   setSmtpFromName]   = useState(config?.smtpFromName   ?? "");
  const [smtpFromEmail,  setSmtpFromEmail]  = useState(config?.smtpFromEmail  ?? "");
  const [smtpEncryption, setSmtpEncryption] = useState(config?.smtpEncryption ?? "tls");
  const [testEmail,      setTestEmail]      = useState("");
  const [isDirty,        setIsDirty]        = useState(false);

  const subjectRef       = useRef(null);
  const bodyRef          = useRef(null);
  const lastFocusedField = useRef("body");

  // SaveBar
  useEffect(() => {
    isDirty
      ? shopify.saveBar.show("notifications-save-bar")
      : shopify.saveBar.hide("notifications-save-bar");
  }, [isDirty, shopify]);

  // Toast on success
  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("Notifications saved");
      setIsDirty(false);
    }
  }, [actionData, shopify]);

  const setTpl = (field, value) => {
    setTemplates((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }));
    setIsDirty(true);
  };

  const insertVar = (v) => {
    const isBody = lastFocusedField.current === "body";
    const ref    = isBody ? bodyRef : subjectRef;
    const field  = isBody ? "body"  : "subject";
    const el     = ref.current;
    if (!el) return;
    const s    = el.selectionStart ?? el.value.length;
    const e    = el.selectionEnd   ?? el.value.length;
    const cur  = templates[activeTab][field] ?? "";
    setTpl(field, cur.slice(0, s) + v + cur.slice(e));
    setTimeout(() => { el.focus(); el.setSelectionRange(s + v.length, s + v.length); }, 0);
  };

  const handleSave = () => {
    const fd = new FormData();
    fd.append("emailProvider",  emailProvider);
    fd.append("smtpHost",       smtpHost);
    fd.append("smtpPort",       smtpPort);
    fd.append("smtpUser",       smtpUser);
    fd.append("smtpPass",       smtpPass);
    fd.append("smtpFromName",   smtpFromName);
    fd.append("smtpFromEmail",  smtpFromEmail);
    fd.append("smtpEncryption", smtpEncryption);
    fd.append("templates",      JSON.stringify(templates));
    submit(fd, { method: "POST" });
  };

  const handleDiscard = () => {
    setTemplates(buildTemplates());
    setEmailProvider(config?.emailProvider   ?? "default");
    setSmtpHost(config?.smtpHost             ?? "");
    setSmtpPort(config?.smtpPort?.toString() ?? "587");
    setSmtpUser(config?.smtpUser             ?? "");
    setSmtpPass(config?.smtpPass             ?? "");
    setSmtpFromName(config?.smtpFromName     ?? "");
    setSmtpFromEmail(config?.smtpFromEmail   ?? "");
    setSmtpEncryption(config?.smtpEncryption ?? "tls");
    setIsDirty(false);
  };

  const tpl  = templates[activeTab];
  const meta = TAB_META[activeTab];

  return (
    <>
      <SaveBar id="notifications-save-bar">
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>

      <s-page heading="Notifications">
        <s-button slot="primary-action" onClick={handleSave} loading={isSaving}>
          Save
        </s-button>

        {/* ── Email templates ───────────────────────────────────────── */}
        <s-section heading="Reminders">
          <s-paragraph>
            Customise the emails sent to guests and yourself at each stage of a
            booking. Click a tab to edit that template.
          </s-paragraph>

          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              borderBottom: "2px solid #e1e3e5",
              marginBottom: 20,
              marginTop: 12,
            }}
          >
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: activeTab === key ? 600 : 400,
                  color: activeTab === key ? "#202223" : "#6d7175",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === key ? "2px solid #202223" : "2px solid transparent",
                  marginBottom: -2,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Parameters */}
          <div
            style={{
              border: "1px solid #e1e3e5",
              borderRadius: 8,
              marginBottom: 20,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                background: "#f6f6f7",
                borderBottom: "1px solid #e1e3e5",
                fontSize: 13,
                fontWeight: 600,
                color: "#202223",
              }}
            >
              <span>⚙</span> Parameters
              <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 400, color: "#6d7175" }}>
                Click any variable to insert at cursor · To: {meta.recipient}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                padding: "12px 16px",
                gap: "8px 0",
              }}
            >
              {PARAMS.map(({ var: v, label }) => (
                <div
                  key={v}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                >
                  <button
                    onClick={() => insertVar(v)}
                    title={`Insert ${v}`}
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: "1px solid #c9cccf",
                      background: "#fff",
                      fontSize: 12,
                      fontFamily: "monospace",
                      cursor: "pointer",
                      color: "#202223",
                    }}
                  >
                    {v}
                  </button>
                  <span style={{ color: "#6d7175" }}>: {label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Enabled + timing row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={tpl.enabled}
                onChange={(e) => setTpl("enabled", e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#008060", cursor: "pointer" }}
              />
              Enable this notification
            </label>

            {meta.hasTiming && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>
                  {meta.timingLabel}:
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={tpl.timing ?? 1}
                  onChange={(e) => setTpl("timing", parseInt(e.target.value) || 1)}
                  style={{
                    width: 64,
                    padding: "6px 10px",
                    border: "1px solid #c9cccf",
                    borderRadius: 8,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                />
                <span style={{ fontSize: 14, color: "#6d7175" }}>day(s)</span>
              </div>
            )}
          </div>

          {/* Subject */}
          <div style={{ ...fieldWrap, marginBottom: 14 }}>
            <label style={labelStyle}>Subject</label>
            <input
              ref={subjectRef}
              type="text"
              value={tpl.subject}
              onFocus={() => (lastFocusedField.current = "subject")}
              onChange={(e) => setTpl("subject", e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Body */}
          <div style={{ ...fieldWrap, marginBottom: 20 }}>
            <label style={labelStyle}>Body</label>
            <textarea
              ref={bodyRef}
              value={tpl.body}
              onFocus={() => (lastFocusedField.current = "body")}
              onChange={(e) => setTpl("body", e.target.value)}
              rows={8}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 13 }}
            />
          </div>

          {/* Group mails + when to remind */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label
              style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={tpl.groupMails}
                onChange={(e) => setTpl("groupMails", e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: "#008060", cursor: "pointer", flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Group emails for same order</div>
                <div style={{ fontSize: 13, color: "#6d7175", marginTop: 2 }}>
                  Combines multiple reminders for the same order and dates into one email.
                </div>
              </div>
            </label>

            <div style={fieldWrap}>
              <label style={labelStyle}>When to remind</label>
              <select
                value={tpl.whenToRemind}
                onChange={(e) => setTpl("whenToRemind", e.target.value)}
                style={{ ...inputStyle, maxWidth: 320 }}
              >
                <option value="disabled">Disabled</option>
                <option value="immediately">Immediately</option>
                <option value="1h">1 hour before</option>
                <option value="3h">3 hours before</option>
                <option value="12h">12 hours before</option>
                <option value="24h">24 hours before</option>
                <option value="48h">48 hours before</option>
              </select>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid #e1e3e5", margin: "20px 0" }} />

          {/* Test send */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#202223", marginBottom: 4 }}>
              Send a test email
            </div>
            <div style={{ fontSize: 13, color: "#6d7175", marginBottom: 10 }}>
              Preview how this notification looks in an inbox. Uses dummy data.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="address@mail.com"
                style={{ ...inputStyle, maxWidth: 280 }}
              />
              <s-button
                variant="secondary"
                onClick={() => {
                  if (!testEmail) return shopify.toast.show("Enter an email address first", { isError: true });
                  shopify.toast.show(`Test email sent to ${testEmail}`);
                }}
              >
                Send {TABS.find((t) => t.key === activeTab)?.label}
              </s-button>
            </div>
          </div>
        </s-section>

        {/* ── Email delivery ────────────────────────────────────────── */}
        <s-section heading="Email Delivery">
          <s-paragraph>
            Choose how notification emails are sent. SMTP gives you full control
            over deliverability and sender identity.
          </s-paragraph>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
              <input
                type="radio"
                name="emailProvider"
                value="smtp"
                checked={emailProvider === "smtp"}
                onChange={() => { setEmailProvider("smtp"); setIsDirty(true); }}
                style={{ accentColor: "#008060" }}
              />
              <div>
                <span style={{ fontWeight: 500 }}>SMTP</span>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "1px 8px",
                    borderRadius: 10,
                    background: "#008060",
                    color: "#fff",
                  }}
                >
                  Recommended
                </span>
              </div>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
              <input
                type="radio"
                name="emailProvider"
                value="default"
                checked={emailProvider === "default"}
                onChange={() => { setEmailProvider("default"); setIsDirty(true); }}
                style={{ accentColor: "#008060" }}
              />
              <div>
                <span style={{ fontWeight: 500 }}>Default</span>
                <span style={{ marginLeft: 8, fontSize: 13, color: "#6d7175" }}>
                  Sent via app shared mail service
                </span>
              </div>
            </label>
          </div>

          {/* SMTP fields */}
          {emailProvider === "smtp" && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={fieldWrap}>
                  <label style={labelStyle}>SMTP Host</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => { setSmtpHost(e.target.value); setIsDirty(true); }}
                    placeholder="smtp.gmail.com"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Port</label>
                    <input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => { setSmtpPort(e.target.value); setIsDirty(true); }}
                      placeholder="587"
                      style={inputStyle}
                    />
                  </div>
                  <div style={fieldWrap}>
                    <label style={labelStyle}>Encryption</label>
                    <select
                      value={smtpEncryption}
                      onChange={(e) => { setSmtpEncryption(e.target.value); setIsDirty(true); }}
                      style={inputStyle}
                    >
                      <option value="tls">TLS</option>
                      <option value="ssl">SSL</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Username</label>
                  <input
                    type="text"
                    value={smtpUser}
                    onChange={(e) => { setSmtpUser(e.target.value); setIsDirty(true); }}
                    placeholder="you@example.com"
                    style={inputStyle}
                  />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>Password / App Password</label>
                  <input
                    type="password"
                    value={smtpPass}
                    onChange={(e) => { setSmtpPass(e.target.value); setIsDirty(true); }}
                    placeholder="••••••••••••"
                    style={inputStyle}
                  />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>From Name</label>
                  <input
                    type="text"
                    value={smtpFromName}
                    onChange={(e) => { setSmtpFromName(e.target.value); setIsDirty(true); }}
                    placeholder="My Rentals"
                    style={inputStyle}
                  />
                </div>
                <div style={fieldWrap}>
                  <label style={labelStyle}>From Email Address</label>
                  <input
                    type="email"
                    value={smtpFromEmail}
                    onChange={(e) => { setSmtpFromEmail(e.target.value); setIsDirty(true); }}
                    placeholder="noreply@mybusiness.com"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  background: "#fff8e1",
                  border: "1px solid #ffd166",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#5c3d00",
                }}
              >
                <strong>Gmail tip:</strong> Use an App Password instead of your account
                password. Enable 2-step verification in your Google account, then generate
                an App Password under Security → App passwords.
              </div>
            </div>
          )}
        </s-section>
      </s-page>
    </>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const fieldWrap = { display: "flex", flexDirection: "column", gap: "4px" };
const labelStyle = { fontSize: "14px", fontWeight: 500 };
const inputStyle = {
  padding: "8px 12px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
  fontSize: "14px",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};
