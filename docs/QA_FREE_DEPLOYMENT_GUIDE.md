# Free QA Deployment Guide for Rentfic

To allow a QA tester to use the Rentfic app without relying on your local `npm run dev` tunnel, you need to deploy the application to a cloud server. 

Because you want to do this **completely for free**, we will use a combination of **Supabase** (for the free PostgreSQL database) and **Render** (for free Node.js hosting).

---

## Step 1: Push Your Code to GitHub
Render pulls your code directly from a Git repository to deploy it automatically.
1. Create a free account on [GitHub](https://github.com/).
2. Create a new **Private** repository.
3. Push your local `rentfic-dev` folder to this new GitHub repository.

---

## Step 2: Set Up a Free PostgreSQL Database (Supabase)
Rentfic uses Prisma with PostgreSQL. You need a live database to store shops, apartments, and bookings.
1. Go to [Supabase](https://supabase.com/) and create a free account.
2. Click **New Project** and select the Free Tier.
3. Set a strong database password (save this password somewhere).
4. Once the project is provisioned, go to **Project Settings** (gear icon) > **Database**.
5. Scroll down to **Connection string** > **URI**.
6. Copy the connection string. It will look like this:
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres`
   *(Make sure to replace `[YOUR-PASSWORD]` with the password you created in step 3).*

---

## Step 3: Deploy the App to Render (Free Web Hosting)
1. Go to [Render](https://render.com/) and create a free account.
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your `rentfic-dev` repository.
4. Configure the Web Service with the following details:
   - **Name**: `rentfic-qa` (or whatever you prefer)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npm run start`
   - **Instance Type**: Select the **Free** tier.

---

## Step 4: Add Environment Variables
Before clicking "Create Web Service" in Render, scroll down to the **Environment Variables** section and add the following keys. (You can find your API keys in your Shopify Partner Dashboard or your local `.env` file).

| Key | Value |
| :--- | :--- |
| `SHOPIFY_API_KEY` | *(Your Shopify App Client ID)* |
| `SHOPIFY_API_SECRET` | *(Your Shopify App Client Secret)* |
| `SCOPES` | `write_products,read_orders,write_draft_orders` *(Match whatever is in your local .env)* |
| `DATABASE_URL` | *(The Supabase connection string you copied in Step 2)* |
| `SHOPIFY_APP_URL` | `https://rentfic-qa.onrender.com` *(Replace `rentfic-qa` with your actual Render app name)* |
| `NODE_ENV` | `production` |

Once these are added, click **Create Web Service**. 
*Render will now build and deploy your app. This can take 5-10 minutes.*

---

## Step 5: Migrate the Database
Because it's a brand new Supabase database, you need to push your Prisma schema to it.
1. Once the Render app is successfully deployed, go to the Render dashboard for your app.
2. Click on the **Shell** tab (this gives you a terminal inside your live server).
3. Type the following command and hit Enter:
   ```bash
   npx prisma db push
   ```
4. This will create all the necessary tables (Shop, Apartment, Booking, etc.) in your live database.

---

## Step 6: Update Shopify App URLs
Shopify currently thinks your app lives on your local Cloudflare/ngrok tunnel. You need to update this.
1. Log into your [Shopify Partner Dashboard](https://partners.shopify.com/).
2. Go to **Apps** > **Rentfic** > **App setup**.
3. Change the **App URL** to your Render URL: 
   `https://rentfic-qa.onrender.com`
4. Change the **Allowed redirection URI(s)** to:
   - `https://rentfic-qa.onrender.com/auth/callback`
   - `https://rentfic-qa.onrender.com/auth/shopify/callback`
   - `https://rentfic-qa.onrender.com/api/auth/callback`
5. Click **Save**.

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
