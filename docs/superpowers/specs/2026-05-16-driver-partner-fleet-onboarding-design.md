# Driver Partner Fleet Onboarding Design

## Purpose

A2B LIFT Driver needs to support two approved operator types inside the driver app:

- **Driver**: an approved person who can physically drive, own/manage multiple vehicles, select one approved vehicle, and go online with that vehicle.
- **Partner**: an approved company/fleet operator who cannot drive from the app, but can add vehicles, link approved A2B drivers, assign drivers to vehicles, and monitor fleet activity.

The current system registers a chauffeur and one vehicle together. This design separates driver identity, partner approval, vehicle approval, and vehicle-driver assignment while keeping the existing ride dispatch stable during rollout.

## Product Rules

After a user registers or logs into the driver app and has no operator profile yet, the app shows an onboarding choice screen with two options:

- **Register as a Driver**
  - For a person who will drive on A2B LIFT.
  - The driver submits personal driver details and driver documents first.
  - After A2B approval, the driver can add multiple vehicles.
  - The driver selects one approved assigned vehicle before going online.
  - Referral program remains visible for driver accounts.

- **Register as a Partner**
  - For a company or fleet operator.
  - The partner submits company/operator documents first.
  - After A2B approval, the partner can add multiple vehicles.
  - The partner can search approved A2B drivers and assign them to vehicles.
  - The partner cannot go online as a driver.
  - Referral program is hidden for partner accounts.

Only A2B-approved drivers can be assigned to vehicles. Partners cannot create unapproved driver records or bypass driver approval.

## Required Documents

### Driver Application

The driver application keeps the existing driver-focused documents:

- Valid driver license
- Criminal background check
- Driver profile photo
- Any currently optional driver documents remain optional unless A2B decides otherwise

Vehicle documents move out of initial driver registration and into vehicle approval.

### Partner Application

All partner documents are required:

- Company registration document
- Owner/director ID
- Proof of address
- Operating permit or transport/business compliance document
- Bank/account details for payouts

Partner onboarding is for formal company/fleet operators.

### Vehicle Approval

Each vehicle has its own approval record and documents:

- Vehicle make, model, year, plate number, category, color
- Passenger and luggage capacity
- Double license disk
- Passenger liability insurance
- Dekra report or roadworthy/inspection report

Vehicles cannot be used for live rides until approved.

## Recommended Architecture

Use a hybrid migration.

Keep the current `chauffeurs` table and existing ride dispatch paths for active drivers during the first rollout. Add new fleet tables around it so the app can support partners, multiple vehicles, and assignments without breaking current ride matching.

New concepts:

- **operator_profiles**: one row per driver-app user, with `type = driver | partner`, approval status, and shared account metadata.
- **partner_profiles**: company-specific fields for partner operators.
- **vehicles**: every car belongs to an owner operator profile, not directly to the old chauffeur record.
- **vehicle_assignments**: approved driver profile linked to an approved vehicle.
- **active_vehicle_id on chauffeur/driver state**: the selected vehicle for a driver’s current online session.

During the transition, the existing `chauffeurs` row remains the ride-dispatch identity for physical drivers. New vehicle fields gradually become the source of truth for car data shown to clients, partners, and admin.

## Data Model

### operator_profiles

Represents the driver-app account mode and approval lifecycle.

Fields:

- `id`
- `user_id`
- `type`: `driver` or `partner`
- `status`: `draft`, `pending`, `approved`, `rejected`
- `submitted_at`
- `reviewed_at`
- `reviewer_admin_id`
- `rejection_reason`
- `created_at`
- `updated_at`

Rules:

- A driver-app user can have one active operator profile.
- A `driver` operator can have a linked `chauffeur` record.
- A `partner` operator does not get an online driver/chauffeur session.

### partner_profiles

Stores partner/company information.

Fields:

- `id`
- `operator_profile_id`
- `company_name`
- `registration_number`
- `contact_person_name`
- `contact_phone`
- `contact_email`
- `bank_name`
- `account_holder`
- `account_number`
- `created_at`
- `updated_at`

### vehicles

Stores each car independently.

Fields:

- `id`
- `owner_operator_profile_id`
- `status`: `draft`, `pending`, `approved`, `rejected`, `suspended`
- `car_make`
- `vehicle_model`
- `vehicle_year`
- `plate_number`
- `vehicle_type`
- `car_color`
- `passenger_capacity`
- `luggage_capacity`
- `rejection_reason`
- `created_at`
- `updated_at`

Rules:

- A vehicle belongs to either an approved driver operator or an approved partner operator.
- A vehicle must be approved before a driver can go online with it.
- Plate number must be unique among active vehicles.

### vehicle_assignments

Links an approved driver to a vehicle.

Fields:

- `id`
- `vehicle_id`
- `driver_operator_profile_id`
- `assigned_by_operator_profile_id`
- `status`: `active`, `removed`
- `created_at`
- `removed_at`

Rules:

- The `driver_operator_profile_id` must be an approved driver operator.
- The `vehicle_id` must belong to an approved vehicle.
- A partner can assign approved drivers to partner-owned vehicles.
- A driver-owner can assign themselves to their own approved vehicles.
- A driver can only go online with one selected approved vehicle at a time.

### rides

Add `vehicle_id` to rides when the ride is accepted.

Rules:

- Ride dispatch can still use `chauffeur_id`.
- When a driver accepts a ride, the backend stores the active `vehicle_id`.
- Partner fleet views use `vehicle_id` and assignment ownership to show vehicle, driver, trip, and earnings history.

## Driver App Flow

### Entry Flow

When a driver-app user opens the app:

1. Load the authenticated user.
2. Check for an operator profile.
3. If none exists, show the role choice screen.
4. If profile is `driver`, route to driver onboarding or driver dashboard based on status.
5. If profile is `partner`, route to partner onboarding or partner dashboard based on status.

### Driver Onboarding

Driver onboarding becomes focused on the person first:

1. Personal phone/profile details.
2. Driver documents.
3. Profile photo.
4. Submit for A2B approval.
5. Pending approval screen.
6. After approval, show empty vehicle state: “Add your first vehicle.”

The existing local draft autosave remains and must be adapted to the new driver-only form.

### Partner Onboarding

Partner onboarding has:

1. Company/contact details.
2. Required partner documents.
3. Bank/account details.
4. Submit for A2B approval.
5. Pending approval screen.
6. After approval, show fleet dashboard with “Add vehicle” as the primary action.

Partner registration also uses local draft autosave.

### Vehicle Onboarding

Both approved drivers and approved partners can add vehicles.

Flow:

1. Vehicle details.
2. Vehicle documents.
3. Submit vehicle for approval.
4. Vehicle appears as pending.
5. After approval:
   - Driver-owner can select it before going online.
   - Partner can assign approved drivers to it.

### Driver Dashboard

Approved drivers see:

- Online/offline control
- Active vehicle selector
- Current/available rides
- My vehicles
- My rides
- Earnings
- Wallet
- Long distance, if still available for driver accounts
- Referrals
- Notifications
- Settings

Going online requires:

- Approved driver profile
- At least one approved vehicle assignment
- One active vehicle selected

### Partner Dashboard

Approved partners see:

- Fleet overview
- Vehicles list with approval/assignment status
- Add vehicle
- Driver search/linking
- Vehicle-driver assignments
- Trips by vehicle/driver
- Fleet earnings or payout reporting
- Notifications
- Settings

Partners do not see:

- Go online/offline control
- Incoming ride acceptance UI
- Long-distance driver publishing
- Referral program

## Driver Matching and Assignment

Partner flow:

1. Partner opens “Drivers.”
2. Partner searches approved A2B drivers by name, phone, or email.
3. Search results show driver approval status, rating, phone, and profile summary.
4. Partner can call the driver from their phone number.
5. Partner assigns the approved driver to one or more partner vehicles.

Driver-owner flow:

1. Driver opens “My vehicles.”
2. Driver sees approved vehicles they own.
3. Driver selects the car they want to drive.
4. Driver goes online with that selected car.

## Admin Dashboard

Keep one admin dashboard with separate menus:

- Driver Applications
- Partner / Fleet Operator Applications
- Vehicle Approvals
- Existing Chauffeurs / Active Drivers
- Rides
- Payments / Withdrawals
- Documents
- Users

Approval behavior:

- Approving a driver application enables the user to drive, but not automatically use a vehicle unless a vehicle is approved and selected.
- Approving a partner application enables fleet management, not driving.
- Approving a vehicle makes it assignable/selectable.
- Rejecting any application stores a reason and notifies the user.

## API Surface

New backend routes must be added under clear namespaces:

- `GET /api/operator-profile/me`
- `POST /api/operator-profile/driver`
- `POST /api/operator-profile/partner`
- `GET /api/operator-profile/me/documents`
- `POST /api/operator-profile/documents`
- `GET /api/vehicles`
- `POST /api/vehicles`
- `GET /api/vehicles/:id`
- `PUT /api/vehicles/:id`
- `POST /api/vehicles/:id/documents`
- `POST /api/vehicles/:id/submit`
- `POST /api/vehicles/:id/select-active`
- `GET /api/fleet/drivers/search`
- `POST /api/fleet/assignments`
- `DELETE /api/fleet/assignments/:id`
- `GET /api/fleet/overview`
- `GET /api/fleet/trips`

Admin routes:

- `GET /api/admin/operator-profiles?type=driver|partner&status=pending|approved|rejected`
- `POST /api/admin/operator-profiles/:id/approve`
- `POST /api/admin/operator-profiles/:id/reject`
- `GET /api/admin/vehicles?status=pending|approved|rejected`
- `POST /api/admin/vehicles/:id/approve`
- `POST /api/admin/vehicles/:id/reject`

Existing chauffeur routes remain during migration.

## Compatibility Plan

Existing approved chauffeurs must continue working.

Migration behavior:

- On first load after deployment, an existing chauffeur user without an operator profile must be treated as a driver operator.
- Existing `chauffeurs` vehicle fields can seed an initial vehicle record.
- Existing `chauffeurs.isApproved` maps to driver operator approved status.
- Existing online/offline, location, and ride acceptance continue using `chauffeurs.id`.
- New rides accepted after vehicle selection store `vehicle_id`.

## Error Handling

Show clear blocking states:

- No operator profile: role choice screen.
- Driver pending approval: pending screen with refresh.
- Partner pending approval: pending screen with refresh.
- Driver approved but no approved vehicle: add/select vehicle screen.
- Driver selected vehicle lost approval or assignment: go offline and request a new approved vehicle selection.
- Partner approved but no vehicles: empty fleet state with add vehicle action.
- Partner tries to assign unapproved driver: block with “Only approved A2B drivers can be assigned.”
- Partner tries to assign unapproved vehicle: block with “Vehicle must be approved before assignment.”

## Testing Strategy

Server tests must cover:

- Driver operator creation and approval.
- Partner operator creation and approval.
- Required partner documents enforcement.
- Vehicle creation, document submission, approval, and rejection.
- Driver search only returns approved drivers.
- Partner assignment only accepts approved drivers and approved vehicles.
- Driver cannot go online without selected approved vehicle.
- Partner cannot toggle online.
- Ride acceptance stores active vehicle id.

Client testing must cover:

- Role choice appears for new driver-app users.
- Driver onboarding no longer requires vehicle details at first registration.
- Partner onboarding requires all partner documents.
- Driver dashboard shows referrals.
- Partner dashboard hides referrals and online controls.
- Driver vehicle selector blocks online until a vehicle is selected.
- Partner can search approved drivers and assign them to approved vehicles.

## Rollout Order

1. Add schema and storage APIs for operator profiles, partner profiles, vehicles, assignments, and ride vehicle id.
2. Add backend routes and validation.
3. Add admin menus for driver, partner, and vehicle approvals.
4. Refactor driver registration into driver-only onboarding.
5. Add partner onboarding.
6. Add vehicle onboarding for both driver and partner accounts.
7. Add driver active vehicle selector and online gating.
8. Add partner dashboard, driver search, and vehicle assignment.
9. Add fleet trip/vehicle tracking views.
10. Migrate existing chauffeurs into driver operator profiles and initial vehicles.

## Decisions Locked In

- Partners can only link already registered and A2B-approved drivers.
- Partners cannot drive or go online.
- Partners cannot see referral program features.
- Drivers can own multiple cars and select which approved car they are driving.
- Partner documents listed in this spec are all required.
- Admin remains one dashboard with separate approval menus.
- Implementation must use the hybrid migration so active ride dispatch is not rewritten in the first pass.
