-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "timeFormat" TEXT NOT NULL DEFAULT '12',
    "translate" TEXT NOT NULL DEFAULT 'automatic',
    "redirectAfterCart" TEXT NOT NULL DEFAULT 'automatic',
    "fromPrice" TEXT NOT NULL DEFAULT 'automatic',
    "displayCalendar" TEXT NOT NULL DEFAULT 'always_open',
    "quantityPosition" TEXT NOT NULL DEFAULT 'product_and_calendar',
    "startCalendar" TEXT NOT NULL DEFAULT 'current_date',
    "depositType" TEXT NOT NULL DEFAULT 'percent',
    "depositValue" DOUBLE PRECISION,
    "blockedDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_shop_key" ON "Settings"("shop");
