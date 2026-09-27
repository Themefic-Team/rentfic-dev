# WIP: Rental Category Dynamic Features

This document tracks the work-in-progress (WIP) for enhancing the dynamic fields across different rental categories (Property, Equipment, Vehicle, Other) to make them more tailored without needing major database changes.

## Phase 1: Time Fields (Pickup / Return)
**Goal:** Enable time selection for non-property items and label them correctly based on context.
- [x] **Equipment:** Show time fields and rename labels to `Pickup Time` and `Return Time`.
- [x] **Vehicle:** Show time fields and rename labels to `Pickup Time` and `Return Time`.
- [x] **Other:** Show time fields and rename labels to `Pickup Time` and `Return Time` (or Start/End).
- [x] **Property (Current):** Keep labels as `Check-in Time` and `Check-out Time`.
- [x] *Implementation:* Update the `app.apartments.$id.jsx` UI to conditionally render the labels based on `listingType`.

## Phase 2: Capacity Fields (Vehicles)
**Goal:** Reuse the "Max Guests" logic for Vehicles to track seating capacity.
- [x] **Vehicle:** Enable the main `Max Guests` field.
- [x] **Vehicle:** Rename the `Max Guests` label to `Passenger Capacity` or `Seats`.
- [x] **Vehicle:** Ensure the detailed breakdown fields (Adults/Children/Infants) remain hidden for Vehicles.
- [x] *Implementation:* Adjust the `showGuestFields` logic in `LISTING_TYPES` or add a new flag (e.g., `showCapacityField`).

## Phase 3: Location Details 
**Goal:** Improve the clarity of location data collection.
- [x] **Equipment, Vehicle, Other:** Keep the simplified `Location / Address` single line input, but perhaps add a hint like "Where will the customer pick this up?".
- [x] **Property (Current):** Keep the detailed Address, City, Country breakdown.

## Phase 4: Storefront Widget Sync
**Goal:** Ensure the customer-facing booking widget reflects these label changes.
- [x] Review the storefront widget code (Liquid/JS).
- [x] If the widget displays "Check-in", ensure it checks the `listingType` in the metafield and dynamically updates to "Pickup" if it's a Vehicle/Equipment.
- [x] If the widget displays "Guests", ensure it displays "Passengers/Seats" for Vehicles.

## Phase 5: Testing & Validation
- [x] Test creating/editing a Vehicle rental to ensure time and capacity fields save correctly to the `settings` JSON blob. *(Included in QA Plan)*
- [x] Test creating/editing an Equipment rental to ensure time fields save correctly. *(Included in QA Plan)*
- [x] Verify that saving a Property still works exactly as expected. *(Included in QA Plan)*
- [x] Verify the Storefront checkout process behaves correctly with the new labels. *(Included in QA Plan)*

✅ **[QA Test Plan (CSV) generated for QA Team](./QA_TEST_PLAN.csv)**
