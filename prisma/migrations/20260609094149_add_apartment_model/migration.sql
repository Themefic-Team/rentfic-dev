-- CreateTable
CREATE TABLE "Apartment" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricePerNight" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "maxGuests" INTEGER,
    "amenities" TEXT[],
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "minNights" INTEGER DEFAULT 1,
    "maxNights" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apartment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Apartment_shop_idx" ON "Apartment"("shop");
