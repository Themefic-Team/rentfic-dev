export default function HelpPage() {
  return (
    <s-page fullWidth  heading="Help & Documentation">
      <s-section heading="Quick Start Guide">
        <s-paragraph>
          Welcome to Rentfic! To get started:
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            <strong>Configure your apartments:</strong> Go to the <s-link href="/app/apartments">Apartments Settings</s-link> tab to set up pricing, availability, and synchronization.
          </s-list-item>
          <s-list-item>
            <strong>Set up notifications:</strong> Visit the <s-link href="/app/notifications">Notifications</s-link> page to customize emails sent to guests and owners.
          </s-list-item>
          <s-list-item>
            <strong>Manage bookings:</strong> The <s-link href="/app/booking">Booking</s-link> dashboard allows you to track, edit, and confirm reservations.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Frequently Asked Questions (FAQ)">
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>How do I sync my Google Calendar?</div>
          <s-paragraph>
            Navigate to <strong>Apartments Settings</strong>, select an apartment, and paste your iCal URL under the "Calendar Sync" section.
          </s-paragraph>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Can I export my booking data?</div>
          <s-paragraph>
            Yes! Go to the <strong>Booking</strong> page and click the "Export CSV" button to download all booking records.
          </s-paragraph>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>How do I contact support?</div>
          <s-paragraph>
            If you are on the Business Plan, you can use the chat widget in the bottom right corner for priority support. Otherwise, email us at <a href="mailto:support@rentfic.com">support@rentfic.com</a>.
          </s-paragraph>
        </div>
      </s-section>

      <s-section slot="aside" heading="Additional Resources">
        <s-unordered-list>
          <s-list-item>
            <s-link href="https://rentfic.com/docs" target="_blank">
              Full Documentation
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="https://rentfic.com/video-tutorials" target="_blank">
              Video Tutorials
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
