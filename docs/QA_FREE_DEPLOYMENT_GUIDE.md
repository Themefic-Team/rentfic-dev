# Free QA Deployment Guide for Rentfic

To allow a QA tester to use the Rentfic app without relying on your local `npm run dev` tunnel, you need to deploy the application to a cloud server.

Because you want to do this **completely for free**, we will use a combination of **Neon** (for the free PostgreSQL database) and **Render** (for free Node.js hosting).

---

## Step 1: Push Your Code to GitHub

Render pulls your code directly from a Git repository to deploy it automatically.

1. Create a free account on [GitHub](https://github.com/).
2. Create a new **Private** repository.
3. Push your local `rentfic-dev` folder to this new GitHub repository.

---

## Step 2: Set Up a Free PostgreSQL Database (Neon)

Rentfic uses Prisma with PostgreSQL. You need a live database to store shops, apartments, and bookings.

1. Go to [Neon.tech](https://neon.tech/) and create a free account.
2. Click **Create a project**. 
3. Give it a name (e.g., `rentfic-db`) and select the region closest to you, then click **Create project**.
4. Once created, a dashboard will appear showing your connection details.
5. In the **Connection Details** box, ensure the standard `postgres` connection string is selected (you can click the copy icon).
6. The connection string will look something like this:
   `postgresql://[user]:[password]@[endpoint].neon.tech/neondb?sslmode=require`

---

## Step 3: Deploy the App to Render (Free Web Hosting)

1. Go to [Render](https://render.com/) and create a free account.
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your `rentfic-dev` repository.
4. Configure the Web Service with the following details:
   - **Name**: `rentfic-qa` (or whatever you prefer)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npx prisma generate && npx prisma db push && npm run build`
   - **Start Command**: `npm run start`
   - **Instance Type**: Select the **Free** tier.

---

## Step 4: Add Environment Variables

Before clicking "Create Web Service" in Render, scroll down to the **Environment Variables** section and add the following keys. (You can find your API keys in your Shopify Partner Dashboard or your local `.env` file).

| Key                  | Value                                                                                       |
| :------------------- | :------------------------------------------------------------------------------------------ |
| `SHOPIFY_API_KEY`    | _(Your Shopify App Client ID - found in Partner Dashboard > Apps > Client credentials)_     |
| `SHOPIFY_API_SECRET` | _(Your Shopify App Client Secret - found in Partner Dashboard > Apps > Client credentials)_ |
| `SCOPES`             | `write_products,read_orders,write_draft_orders` _(Match whatever is in your local .env)_    |
| `DATABASE_URL`       | _(The Neon connection string you copied in Step 2)_                                         |
| `SHOPIFY_APP_URL`    | `https://rentfic-qa.onrender.com` _(Replace `rentfic-qa` with your actual Render app name)_ |
| `NODE_ENV`           | `production`                                                                                |

Once these are added, click **Create Web Service**.
_Render will now build and deploy your app. This can take 5-10 minutes._

---

## Step 5: Migrate the Database (Automated)

Because it's a brand new Neon database, you need to push your Prisma schema to it to create the tables. 

We already automated this in **Step 3** by adding `npx prisma db push` to the Render Build Command! Every time Render builds your app, it will automatically ensure your database tables (Shop, Apartment, Booking, etc.) are up to date.

---

## Step 6: Update Shopify App URLs

Shopify currently thinks your app lives on your local Cloudflare/ngrok tunnel. You need to update this.

1. Log into your [Shopify Partner Dashboard](https://partners.shopify.com/).
2. On the left menu, go to **Apps** > **Rentfic**.
3. On the inner left menu, click **Configuration**.
4. Scroll down to the **URLs** section.
5. Change the **App URL** to your Render URL:
   `https://rentfic-qa.onrender.com`
6. Change the **Allowed redirection URI(s)** to:
   - `https://rentfic-qa.onrender.com/auth/callback`
   - `https://rentfic-qa.onrender.com/auth/shopify/callback`
   - `https://rentfic-qa.onrender.com/api/auth/callback`
7. Scroll to the bottom and click **Save**.

---

## Step 7: Give the QA Tester Access

Your app is now live on the internet! Let's get the QA tester in.

1. In your Shopify Partner Dashboard, go to **Stores** and click **Add store** > **Create development store**.
2. Create a store for testing (e.g., "Rentfic QA Sandbox").
3. Go back to your App in the Partner dashboard, click **Select store** (or "Test on development store"), and install Rentfic onto this new sandbox store.
4. Finally, go to the Shopify Admin of that sandbox store.
5. Navigate to **Settings** > **Users and permissions**.
6. Add your QA Tester's email address as a **Staff Member**.

**You are done!**
The QA Tester can now log into that Shopify store, click on the "Apps" tab, open Rentfic, and begin following the Excel QA Testing Plan you provided them.
