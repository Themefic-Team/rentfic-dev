import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateTokens() {
  const sessions = await prisma.session.findMany({
    where: {
      isOnline: false,
      expires: null
    }
  });

  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;

  console.log(`Found ${sessions.length} non-expiring offline sessions to migrate.`);

  for (const session of sessions) {
    console.log(`Migrating token for shop: ${session.shop}`);
    
    try {
      const response = await fetch(`https://${session.shop}/admin/oauth/access_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          client_id: clientId,
          client_secret: clientSecret,
          subject_token: session.accessToken,
          subject_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
          requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
          expiring: "1"
        })
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error(`Failed to parse JSON for ${session.shop}. Response:`, text);
        continue;
      }

      if (!response.ok) {
        console.error(`Failed to migrate ${session.shop}:`, data);
        continue;
      }

      // Calculate expiry date
      const expires = new Date(Date.now() + data.expires_in * 1000);
      const refreshTokenExpires = new Date(Date.now() + data.refresh_token_expires_in * 1000);

      await prisma.session.update({
        where: { id: session.id },
        data: {
          accessToken: data.access_token,
          expires: expires,
          refreshToken: data.refresh_token,
          refreshTokenExpires: refreshTokenExpires
        }
      });

      console.log(`Successfully migrated token for ${session.shop}`);
    } catch (err) {
      console.error(`Error migrating ${session.shop}:`, err.message);
    }
  }

  console.log("Migration complete.");
  await prisma.$disconnect();
}

migrateTokens().catch(console.error);
