# Driver Partner Fleet Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build driver/partner onboarding, multi-vehicle ownership, approved-driver assignment, role-specific dashboards, and notifications for all approval and assignment events.

**Architecture:** Use the approved hybrid migration. Keep existing `chauffeurs` dispatch and ride acceptance stable, then add operator profiles, partner profiles, vehicles, assignments, and `rides.vehicle_id` around it. Driver accounts can drive with a selected approved vehicle; partner accounts manage fleet vehicles and approved driver assignments only.

**Tech Stack:** Expo Router + React Native app screens, Express routes, Drizzle/Postgres schema, existing storage abstraction, existing notification table and Expo push helper, existing admin HTML dashboard.

---

## File Structure

- Modify `shared/schema.ts`: add operator, partner, vehicle, and assignment tables; add `activeVehicleId` to `chauffeurs`; add `vehicleId` to `rides`; add `vehicleId` to `documents`; export insert schemas and types.
- Modify `server/index.ts`: add startup migrations for new columns and tables using `pool.query`.
- Modify `server/storage.ts`: add CRUD/query methods for operator profiles, partner profiles, vehicles, vehicle documents, assignments, fleet overview, and active vehicle selection.
- Modify `server/routes.ts`: add authenticated operator, vehicle, fleet, and admin routes; update chauffeur online gate and ride acceptance to use active vehicle; centralize notification creation.
- Modify `server/templates/admin.html`: add admin menus and tables for driver applications, partner applications, and vehicle approvals.
- Modify `app/chauffeur-register.tsx`: convert current combined chauffeur+car registration into driver-only onboarding and add role-choice routing support.
- Create `app/partner-register.tsx`: partner onboarding with required company/operator documents and autosave.
- Create `app/chauffeur/vehicles.tsx`: shared vehicle management for approved drivers and partners.
- Create `app/chauffeur/fleet.tsx`: partner fleet overview, driver search, and assignment UI.
- Modify `app/chauffeur/index.tsx`: branch dashboard by operator type, hide referrals for partners, require active approved vehicle before a driver can go online.
- Modify `app/chauffeur/_layout.tsx`: register new `vehicles` and `fleet` screens.
- Modify `app/chauffeur/referrals.tsx` and the dashboard referral entry point: block partner accounts from referral screen.
- Modify `app/chauffeur/notifications.tsx`: ensure new notification types render with sensible icons and text.
- Modify `server_dist/index.js`: run `npm run server:build` after server changes.

## Task 1: Schema and Migration Foundation

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/index.ts`
- Test: `npm run server:build`

- [ ] **Step 1: Add schema tables and fields**

In `shared/schema.ts`, add `operatorProfiles`, `partnerProfiles`, `vehicles`, and `vehicleAssignments` after `driverApplications`. Add `activeVehicleId` to `chauffeurs`, `vehicleId` to `rides`, and `vehicleId` to `documents`.

```ts
export const operatorProfiles = pgTable("operator_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  type: text("type").notNull(), // driver|partner
  status: text("status").notNull().default("draft"), // draft|pending|approved|rejected
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewerAdminId: varchar("reviewer_admin_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const partnerProfiles = pgTable("partner_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  operatorProfileId: varchar("operator_profile_id").notNull().unique().references(() => operatorProfiles.id),
  companyName: text("company_name").notNull(),
  registrationNumber: text("registration_number").notNull(),
  contactPersonName: text("contact_person_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email").notNull(),
  bankName: text("bank_name").notNull(),
  accountHolder: text("account_holder").notNull(),
  accountNumber: text("account_number").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerOperatorProfileId: varchar("owner_operator_profile_id").notNull().references(() => operatorProfiles.id),
  status: text("status").notNull().default("draft"), // draft|pending|approved|rejected|suspended
  carMake: text("car_make").notNull(),
  vehicleModel: text("vehicle_model").notNull(),
  vehicleYear: integer("vehicle_year").notNull(),
  plateNumber: text("plate_number").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  carColor: text("car_color").notNull(),
  passengerCapacity: integer("passenger_capacity").default(4),
  luggageCapacity: integer("luggage_capacity").default(2),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewerAdminId: varchar("reviewer_admin_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vehicleAssignments = pgTable("vehicle_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id").notNull().references(() => vehicles.id),
  driverOperatorProfileId: varchar("driver_operator_profile_id").notNull().references(() => operatorProfiles.id),
  assignedByOperatorProfileId: varchar("assigned_by_operator_profile_id").notNull().references(() => operatorProfiles.id),
  status: text("status").notNull().default("active"), // active|removed
  createdAt: timestamp("created_at").defaultNow(),
  removedAt: timestamp("removed_at"),
});
```

Add these fields to existing tables:

```ts
// chauffeurs
activeVehicleId: varchar("active_vehicle_id").references(() => vehicles.id),

// rides
vehicleId: varchar("vehicle_id").references(() => vehicles.id),

// documents
vehicleId: varchar("vehicle_id").references(() => vehicles.id),
```

Also add exports:

```ts
export type OperatorProfile = typeof operatorProfiles.$inferSelect;
export type PartnerProfile = typeof partnerProfiles.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type VehicleAssignment = typeof vehicleAssignments.$inferSelect;
```

- [ ] **Step 2: Add startup migrations**

In `server/index.ts`, locate the existing startup migration section around the `ALTER TABLE chauffeurs` calls and add:

```ts
await pool.query(`ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS active_vehicle_id varchar`);
await pool.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS vehicle_id varchar`);
await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS vehicle_id varchar`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS operator_profiles (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id varchar NOT NULL UNIQUE REFERENCES users(id),
    type text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    rejection_reason text,
    submitted_at timestamp,
    reviewed_at timestamp,
    reviewer_admin_id varchar REFERENCES users(id),
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS partner_profiles (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_profile_id varchar NOT NULL UNIQUE REFERENCES operator_profiles(id),
    company_name text NOT NULL,
    registration_number text NOT NULL,
    contact_person_name text NOT NULL,
    contact_phone text NOT NULL,
    contact_email text NOT NULL,
    bank_name text NOT NULL,
    account_holder text NOT NULL,
    account_number text NOT NULL,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )
`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
    status text NOT NULL DEFAULT 'draft',
    car_make text NOT NULL,
    vehicle_model text NOT NULL,
    vehicle_year integer NOT NULL,
    plate_number text NOT NULL,
    vehicle_type text NOT NULL,
    car_color text NOT NULL,
    passenger_capacity integer DEFAULT 4,
    luggage_capacity integer DEFAULT 2,
    rejection_reason text,
    submitted_at timestamp,
    reviewed_at timestamp,
    reviewer_admin_id varchar REFERENCES users(id),
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
  )
`);
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS vehicles_active_plate_unique ON vehicles (upper(plate_number)) WHERE status <> 'rejected'`);
await pool.query(`
  CREATE TABLE IF NOT EXISTS vehicle_assignments (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id varchar NOT NULL REFERENCES vehicles(id),
    driver_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
    assigned_by_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
    status text NOT NULL DEFAULT 'active',
    created_at timestamp DEFAULT now(),
    removed_at timestamp
  )
`);
```

- [ ] **Step 3: Build**

Run:

```bash
npm run server:build
```

Expected: esbuild completes and updates `server_dist/index.js`.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/index.ts server_dist/index.js
git commit -m "feat: add fleet onboarding schema"
```

## Task 2: Storage API for Operators, Vehicles, Assignments

**Files:**
- Modify: `server/storage.ts`
- Test: `npm run server:build`

- [ ] **Step 1: Import new schema objects and types**

Add the new tables and types to the existing imports from `../shared/schema`:

```ts
operatorProfiles,
partnerProfiles,
vehicles,
vehicleAssignments,
type OperatorProfile,
type PartnerProfile,
type Vehicle,
type VehicleAssignment,
```

- [ ] **Step 2: Extend `IStorage`**

Add these methods below the existing driver application methods:

```ts
getOperatorProfile(id: string): Promise<OperatorProfile | undefined>;
getOperatorProfileByUserId(userId: string): Promise<OperatorProfile | undefined>;
getOperatorProfiles(filters?: { type?: string; status?: string }): Promise<OperatorProfile[]>;
createOperatorProfile(data: any): Promise<OperatorProfile>;
updateOperatorProfile(id: string, data: Partial<OperatorProfile>): Promise<OperatorProfile | undefined>;

getPartnerProfileByOperatorId(operatorProfileId: string): Promise<PartnerProfile | undefined>;
createPartnerProfile(data: any): Promise<PartnerProfile>;
updatePartnerProfile(id: string, data: Partial<PartnerProfile>): Promise<PartnerProfile | undefined>;

getVehicle(id: string): Promise<Vehicle | undefined>;
getVehiclesByOwnerOperator(ownerOperatorProfileId: string): Promise<Vehicle[]>;
getVehicles(filters?: { status?: string; ownerOperatorProfileId?: string }): Promise<Vehicle[]>;
createVehicle(data: any): Promise<Vehicle>;
updateVehicle(id: string, data: Partial<Vehicle>): Promise<Vehicle | undefined>;

getActiveVehicleAssignment(vehicleId: string, driverOperatorProfileId: string): Promise<VehicleAssignment | undefined>;
getVehicleAssignments(filters?: { vehicleId?: string; driverOperatorProfileId?: string; assignedByOperatorProfileId?: string; status?: string }): Promise<VehicleAssignment[]>;
createVehicleAssignment(data: any): Promise<VehicleAssignment>;
updateVehicleAssignment(id: string, data: Partial<VehicleAssignment>): Promise<VehicleAssignment | undefined>;
```

- [ ] **Step 3: Implement methods**

Add implementations inside `DatabaseStorage`. Use the same Drizzle patterns already used for chauffeurs and documents.

```ts
async getOperatorProfileByUserId(userId: string) {
  const [profile] = await db.select().from(operatorProfiles).where(eq(operatorProfiles.userId, userId));
  return profile;
}

async createOperatorProfile(data: any) {
  const [profile] = await db.insert(operatorProfiles).values(data).returning();
  return profile;
}

async updateOperatorProfile(id: string, data: Partial<OperatorProfile>) {
  const [profile] = await db.update(operatorProfiles).set({ ...data, updatedAt: new Date() }).where(eq(operatorProfiles.id, id)).returning();
  return profile;
}

async createVehicle(data: any) {
  const [vehicle] = await db.insert(vehicles).values(data).returning();
  return vehicle;
}

async updateVehicle(id: string, data: Partial<Vehicle>) {
  const [vehicle] = await db.update(vehicles).set({ ...data, updatedAt: new Date() }).where(eq(vehicles.id, id)).returning();
  return vehicle;
}

async createVehicleAssignment(data: any) {
  const [assignment] = await db.insert(vehicleAssignments).values(data).returning();
  return assignment;
}
```

Complete the filter methods with `and(...)` conditions. Use `desc(createdAt)` or `desc(submittedAt)` for list ordering.

- [ ] **Step 4: Build**

Run:

```bash
npm run server:build
```

Expected: TypeScript bundling succeeds.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server_dist/index.js
git commit -m "feat: add fleet storage methods"
```

## Task 3: Notification Helper for Fleet Events

**Files:**
- Modify: `server/routes.ts`
- Test: `npm run server:build`

- [ ] **Step 1: Add helper near `sendExpoPushNotification`**

Create a helper that always writes an in-app notification and sends push when possible:

```ts
async function notifyUserEvent(options: {
  userId: string;
  type: string;
  title: string;
  body: string;
}) {
  await storage.createNotification({
    userId: options.userId,
    type: options.type,
    title: options.title,
    body: options.body,
    isRead: false,
  });

  const user = await storage.getUser(options.userId).catch(() => undefined);
  const pushToken = user?.pushToken;
  if (pushToken) {
    sendExpoPushNotification([pushToken], options.title, options.body);
  }
}
```

If driver push tokens currently live on `chauffeurs.pushToken`, add a fallback:

```ts
const chauffeur = await storage.getChauffeurByUserId(options.userId).catch(() => undefined);
const pushToken = user?.pushToken || chauffeur?.pushToken;
```

- [ ] **Step 2: Replace direct approval notification blocks where practical**

For existing chauffeur approval/rejection, use `notifyUserEvent` so old and new flows share behavior. Keep the existing notification titles but update driver approval copy to mention vehicles:

```ts
await notifyUserEvent({
  userId: chauffeur.userId,
  type: "approval",
  title: "Application approved",
  body: "Your driver profile has been approved. Add or select an approved vehicle before going online.",
});
```

- [ ] **Step 3: Build**

Run:

```bash
npm run server:build
```

Expected: build passes.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts server_dist/index.js
git commit -m "feat: centralize fleet notifications"
```

## Task 4: Operator Profile Routes

**Files:**
- Modify: `server/routes.ts`
- Test: `npm run server:build`

- [ ] **Step 1: Add operator constants and validators**

Near the chauffeur routes, add:

```ts
const PARTNER_REQUIRED_DOCS = new Set([
  "company_registration",
  "director_id",
  "proof_of_address",
  "operating_permit",
  "bank_account_details",
]);

function requireStringField(body: any, field: string) {
  const value = String(body?.[field] || "").trim();
  if (!value) throw new Error(`${field} is required`);
  return value;
}
```

- [ ] **Step 2: Add `GET /api/operator-profile/me`**

Use `requireAuth`. Return the operator profile plus partner/chauffeur details when present. If there is an existing chauffeur and no operator profile, create a compatible driver operator record.

```ts
app.get("/api/operator-profile/me", requireAuth, async (req: AuthedRequest, res: Response) => {
  let profile = await storage.getOperatorProfileByUserId(req.auth!.sub);
  const chauffeur = await storage.getChauffeurByUserId(req.auth!.sub).catch(() => undefined);
  if (!profile && chauffeur) {
    profile = await storage.createOperatorProfile({
      userId: req.auth!.sub,
      type: "driver",
      status: chauffeur.isApproved ? "approved" : "pending",
      submittedAt: chauffeur.createdAt || new Date(),
    });
  }
  if (!profile) return res.status(404).json({ message: "Operator profile not found" });
  const partnerProfile = profile.type === "partner"
    ? await storage.getPartnerProfileByOperatorId(profile.id)
    : null;
  return res.json({ profile, partnerProfile, chauffeur: chauffeur || null });
});
```

- [ ] **Step 3: Add driver operator creation route**

`POST /api/operator-profile/driver` must create/update `operator_profiles(type=driver,status=pending)`, create/ensure a `chauffeurs` row without requiring vehicle fields, create/ensure `driver_applications`, and store driver docs through existing document route.

The body fields are:

```ts
{
  phone: string,
  profilePhoto?: string
}
```

The route returns `{ profile, chauffeur, application }`.

- [ ] **Step 4: Add partner operator creation route**

`POST /api/operator-profile/partner` must validate all partner fields and ensure all `PARTNER_REQUIRED_DOCS` were uploaded either in the request or through document records.

Body fields:

```ts
{
  companyName: string,
  registrationNumber: string,
  contactPersonName: string,
  contactPhone: string,
  contactEmail: string,
  bankName: string,
  accountHolder: string,
  accountNumber: string
}
```

Create `operator_profiles(type=partner,status=pending,submittedAt=new Date())`, then `partner_profiles`.

- [ ] **Step 5: Add operator document route**

Add `POST /api/operator-profile/documents` with `requireAuth`. It writes to existing `documents` with:

```ts
{
  userId: req.auth!.sub,
  applicationId: null,
  chauffeurId: null,
  type,
  url,
  status: "pending"
}
```

Use type prefixes `partner:` and `driver:` in the client for clarity, for example `partner:company_registration`.

- [ ] **Step 6: Build and commit**

```bash
npm run server:build
git add server/routes.ts server_dist/index.js
git commit -m "feat: add operator profile routes"
```

## Task 5: Vehicle Routes and Active Vehicle Gate

**Files:**
- Modify: `server/routes.ts`
- Test: `npm run server:build`

- [ ] **Step 1: Add vehicle CRUD routes**

Add authenticated routes:

```ts
GET /api/vehicles
POST /api/vehicles
GET /api/vehicles/:id
PUT /api/vehicles/:id
POST /api/vehicles/:id/documents
POST /api/vehicles/:id/submit
POST /api/vehicles/:id/select-active
```

Validation for `POST /api/vehicles`:

- Authenticated user must have approved operator profile.
- Required fields: `carMake`, `vehicleModel`, `vehicleYear`, `plateNumber`, `vehicleType`, `carColor`.
- `vehicleYear` must be between 2015 and current year + 1.
- Initial status is `draft` unless submitted immediately.

- [ ] **Step 2: Add vehicle document mapping**

For vehicle documents, write to `documents` using `type` values:

```ts
vehicle:double_license_disk
vehicle:passenger_liability_insurance
vehicle:dekra_report
```

Store the vehicle id in `documents.vehicleId`. Do not encode vehicle ids inside the document type.

- [ ] **Step 3: Select active vehicle**

`POST /api/vehicles/:id/select-active` must:

- Require approved driver operator profile.
- Require approved vehicle.
- Require active assignment between driver operator and vehicle.
- Update the driver’s `chauffeurs.activeVehicleId`.
- Return `{ activeVehicleId }`.

- [ ] **Step 4: Gate online toggle**

Update `PUT /api/chauffeurs/:id/toggle-online`:

- If turning online, require approved driver operator profile.
- Require `chauffeurs.activeVehicleId`.
- Require active assignment for that vehicle.
- Require vehicle status `approved`.
- Reject partner accounts with `403`.

Use response messages:

```ts
"Select an approved vehicle before going online."
"Partners cannot go online as drivers."
"This vehicle is no longer approved or assigned to you."
```

- [ ] **Step 5: Store vehicle on ride acceptance**

In all ride accept routes that set `chauffeurId`, also set `vehicleId: chauffeur.activeVehicleId || null`.

- [ ] **Step 6: Build and commit**

```bash
npm run server:build
git add server/routes.ts server_dist/index.js
git commit -m "feat: add vehicle selection and online gate"
```

## Task 6: Fleet Assignment Routes and Notifications

**Files:**
- Modify: `server/routes.ts`
- Test: `npm run server:build`

- [ ] **Step 1: Add approved driver search**

Add `GET /api/fleet/drivers/search?q=...`:

- Require approved partner or approved driver operator.
- Return only approved driver operator profiles.
- Include driver name, phone, email, chauffeur id, rating, and profile photo.
- Never return partner profiles.

- [ ] **Step 2: Add assignment creation**

Add `POST /api/fleet/assignments` with body:

```ts
{
  vehicleId: string,
  driverOperatorProfileId: string
}
```

Rules:

- Caller must be the owner operator for the vehicle.
- Vehicle must be approved.
- Driver operator must be approved and type `driver`.
- Create assignment with status `active`.
- Notify assigned driver:

```ts
await notifyUserEvent({
  userId: driverProfile.userId,
  type: "vehicle_assignment",
  title: "Vehicle assigned",
  body: `You have been assigned to ${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}).`,
});
```

- Notify owner if owner is a different user:

```ts
await notifyUserEvent({
  userId: ownerProfile.userId,
  type: "vehicle_assignment",
  title: "Driver assigned",
  body: `${driverUser.name} was assigned to ${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}).`,
});
```

- [ ] **Step 3: Add assignment removal**

Add `DELETE /api/fleet/assignments/:id`:

- Caller must own the vehicle or be admin.
- Set assignment `status = removed` and `removedAt = new Date()`.
- If removed driver has this vehicle selected as active, clear `chauffeurs.activeVehicleId` and set `isOnline=false`.
- Notify driver and owner.

- [ ] **Step 4: Add fleet overview/trips**

Add:

```ts
GET /api/fleet/overview
GET /api/fleet/trips
```

For partners, return owned vehicles, active assignments, assigned drivers, and rides for owned vehicle ids. For drivers, return owned vehicles and rides for their selected/assigned vehicles.

- [ ] **Step 5: Build and commit**

```bash
npm run server:build
git add server/routes.ts server_dist/index.js
git commit -m "feat: add fleet driver assignments"
```

## Task 7: Admin Approval Menus and Notifications

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/templates/admin.html`
- Test: `npm run server:build`

- [ ] **Step 1: Add admin operator approval routes**

Add:

```ts
GET /api/admin/operator-profiles
POST /api/admin/operator-profiles/:id/approve
POST /api/admin/operator-profiles/:id/reject
```

Approval behavior:

- Driver approval sets operator status approved, updates linked driver application approved, and updates `chauffeurs.isApproved = true`.
- Partner approval sets operator status approved.
- Rejection requires `reason`, sets `status=rejected`, and stores `rejectionReason`.
- All approval/rejection actions call `notifyUserEvent`.

- [ ] **Step 2: Add admin vehicle approval routes**

Add:

```ts
GET /api/admin/vehicles
POST /api/admin/vehicles/:id/approve
POST /api/admin/vehicles/:id/reject
```

Approval/rejection actions notify the vehicle owner.

- [ ] **Step 3: Add admin menus**

In `server/templates/admin.html`, add nav items:

```html
<div class="nav-item" onclick="go('driver-applications',this);closeSidebar()">Driver Applications</div>
<div class="nav-item" onclick="go('partner-applications',this);closeSidebar()">Partner Applications</div>
<div class="nav-item" onclick="go('vehicle-approvals',this);closeSidebar()">Vehicle Approvals</div>
```

Add matching views with table containers:

```html
<div class="view" id="view-driver-applications"><div class="table-card" id="driver-applications-table"></div></div>
<div class="view" id="view-partner-applications"><div class="table-card" id="partner-applications-table"></div></div>
<div class="view" id="view-vehicle-approvals"><div class="table-card" id="vehicle-approvals-table"></div></div>
```

- [ ] **Step 4: Add admin JS loaders**

Add `loadDriverApplications`, `loadPartnerApplications`, and `loadVehicleApprovals`. Each loader must render approve/reject buttons that call the new admin routes and refresh the table.

- [ ] **Step 5: Build and commit**

```bash
npm run server:build
git add server/routes.ts server/templates/admin.html server_dist/index.js
git commit -m "feat: add fleet admin approvals"
```

## Task 8: Driver App Role Choice and Driver-Only Onboarding

**Files:**
- Modify: `app/chauffeur-register.tsx`
- Modify: `app/chauffeur/index.tsx`
- Test: `npm run mobile:driver:config`

- [ ] **Step 1: Add onboarding role choice**

At the start of `app/chauffeur-register.tsx`, load `/api/operator-profile/me`. If 404, show two pressable options:

- Register as Driver
- Register as Partner

Driver option moves into driver onboarding steps. Partner option routes to `/partner-register`.

- [ ] **Step 2: Refactor driver onboarding**

Remove vehicle fields from initial driver registration:

- Keep phone.
- Keep driver documents.
- Keep driver profile photo.
- Submit to `/api/operator-profile/driver`.

Driver document list remains:

```ts
const DRIVER_DOCS = [
  { id: "drivers_license", label: "Valid Driver's License" },
  { id: "criminal_background_check", label: "Criminal Background Check" },
  { id: "pdrp_certificate", label: "PDRP Certificate" },
  { id: "driver_evaluation", label: "Driver Evaluation" },
];
```

Keep `driver_evaluation` optional as already requested earlier. Keep autosave with a new draft version.

- [ ] **Step 3: Update pending screen copy**

Driver pending copy:

```txt
Your driver profile is under review. Once approved, you can add vehicles, select one, and go online.
```

- [ ] **Step 4: Config check and commit**

```bash
npm run mobile:driver:config
git add app/chauffeur-register.tsx app/chauffeur/index.tsx
git commit -m "feat: split driver onboarding from vehicles"
```

## Task 9: Partner Onboarding Screen

**Files:**
- Create: `app/partner-register.tsx`
- Modify: `app/_layout.tsx`
- Modify: `apps/driver-mobile/app/_layout.tsx` if routes are explicitly mirrored there
- Test: `npm run mobile:driver:config`

- [ ] **Step 1: Create partner registration screen**

Use the styling patterns from `app/chauffeur-register.tsx`. Required fields:

```ts
companyName
registrationNumber
contactPersonName
contactPhone
contactEmail
bankName
accountHolder
accountNumber
```

Required documents:

```ts
const PARTNER_DOCS = [
  { id: "company_registration", label: "Company Registration Document" },
  { id: "director_id", label: "Owner/Director ID" },
  { id: "proof_of_address", label: "Proof of Address" },
  { id: "operating_permit", label: "Operating Permit / Compliance Document" },
  { id: "bank_account_details", label: "Bank Account Details" },
];
```

Autosave key:

```ts
`a2b_partner_registration_draft_${user.id}`
```

Submit documents through `/api/operator-profile/documents`, then profile through `/api/operator-profile/partner`.

- [ ] **Step 2: Add route registration**

Add `partner-register` to app stack screens.

- [ ] **Step 3: Config check and commit**

```bash
npm run mobile:driver:config
git add app/partner-register.tsx app/_layout.tsx apps/driver-mobile/app/_layout.tsx
git commit -m "feat: add partner onboarding"
```

## Task 10: Vehicle Management Screen

**Files:**
- Create: `app/chauffeur/vehicles.tsx`
- Modify: `app/chauffeur/_layout.tsx`
- Modify: `app/chauffeur/index.tsx`
- Test: `npm run mobile:driver:config`

- [ ] **Step 1: Create vehicle list and add flow**

`app/chauffeur/vehicles.tsx` must:

- Load `/api/vehicles`.
- Show status chips for `draft`, `pending`, `approved`, `rejected`, `suspended`.
- Let approved drivers and approved partners add a vehicle.
- Upload vehicle docs and submit vehicle for approval.
- For approved drivers, show “Select for driving” on approved assigned vehicles.
- For partners, show “Assign driver” on approved vehicles.

- [ ] **Step 2: Add active vehicle selector on driver dashboard**

In `app/chauffeur/index.tsx`, before the go-online menu item or main online button, show selected vehicle details. If no selected vehicle:

```txt
Select an approved vehicle before going online.
```

The online action must call `/api/vehicles/:id/select-active` before toggling online when a new vehicle is selected.

- [ ] **Step 3: Config check and commit**

```bash
npm run mobile:driver:config
git add app/chauffeur/vehicles.tsx app/chauffeur/_layout.tsx app/chauffeur/index.tsx
git commit -m "feat: add driver vehicle management"
```

## Task 11: Partner Fleet Dashboard and Assignment UI

**Files:**
- Create: `app/chauffeur/fleet.tsx`
- Modify: `app/chauffeur/index.tsx`
- Modify: `app/chauffeur/_layout.tsx`
- Test: `npm run mobile:driver:config`

- [ ] **Step 1: Branch partner dashboard**

In `app/chauffeur/index.tsx`, if operator profile type is `partner`:

- Hide go-online controls.
- Hide incoming ride card.
- Hide long-distance publishing.
- Hide referrals.
- Show fleet overview cards: vehicles, assigned drivers, active trips, pending approvals.
- Show actions for Vehicles, Drivers, Trips, Notifications, Settings.

- [ ] **Step 2: Create fleet screen**

`app/chauffeur/fleet.tsx` must:

- Load `/api/fleet/overview`.
- Search approved drivers via `/api/fleet/drivers/search?q=`.
- Show driver phone as a tappable call action with `Linking.openURL("tel:" + phone)`.
- Assign a selected driver to a selected vehicle via `/api/fleet/assignments`.
- Remove assignments via `DELETE /api/fleet/assignments/:id`.

- [ ] **Step 3: Config check and commit**

```bash
npm run mobile:driver:config
git add app/chauffeur/fleet.tsx app/chauffeur/index.tsx app/chauffeur/_layout.tsx
git commit -m "feat: add partner fleet dashboard"
```

## Task 12: Referral Visibility and Notifications UI

**Files:**
- Modify: `app/chauffeur/index.tsx`
- Modify: `app/chauffeur/referrals.tsx`
- Modify: `app/chauffeur/notifications.tsx`
- Test: `npm run mobile:driver:config`

- [ ] **Step 1: Hide referral entry points for partners**

In chauffeur dashboard menu construction, include referrals only when `operatorProfile.type === "driver"`.

- [ ] **Step 2: Guard referral screen**

In `app/chauffeur/referrals.tsx`, load operator profile. If partner:

```tsx
return (
  <View style={styles.container}>
    <Text style={styles.title}>Referrals are for drivers</Text>
    <Text style={styles.subtitle}>Partner accounts manage fleet operations and do not have referral links.</Text>
  </View>
);
```

- [ ] **Step 3: Add notification icons**

In `app/chauffeur/notifications.tsx`, map new types:

```ts
vehicle_approved: "car-sport-outline"
vehicle_rejected: "alert-circle-outline"
vehicle_assignment: "git-compare-outline"
vehicle_assignment_removed: "remove-circle-outline"
partner_approval: "business-outline"
partner_rejection: "business-outline"
```

- [ ] **Step 4: Config check and commit**

```bash
npm run mobile:driver:config
git add app/chauffeur/index.tsx app/chauffeur/referrals.tsx app/chauffeur/notifications.tsx
git commit -m "feat: update referrals and fleet notifications"
```

## Task 13: Compatibility Migration for Existing Chauffeurs

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/storage.ts`
- Test: `npm run server:build`

- [ ] **Step 1: Add compatibility helper**

In `server/routes.ts`, add:

```ts
async function ensureDriverOperatorForChauffeur(userId: string) {
  let profile = await storage.getOperatorProfileByUserId(userId);
  if (profile) return profile;
  const chauffeur = await storage.getChauffeurByUserId(userId);
  if (!chauffeur) return null;
  profile = await storage.createOperatorProfile({
    userId,
    type: "driver",
    status: chauffeur.isApproved ? "approved" : "pending",
    submittedAt: chauffeur.createdAt || new Date(),
  });
  return profile;
}
```

- [ ] **Step 2: Seed initial vehicle**

When compatibility profile is created, if the chauffeur has no vehicles yet, create one vehicle from `chauffeurs.carMake`, `vehicleModel`, `vehicleYear`, `plateNumber`, `vehicleType`, `carColor`. Use status `approved` when `chauffeur.isApproved` is true, else `pending`.

- [ ] **Step 3: Auto-assign driver-owner to seeded vehicle**

Create active assignment from driver profile to seeded vehicle. If the chauffeur is approved, set `chauffeurs.activeVehicleId` to the seeded vehicle id.

- [ ] **Step 4: Build and commit**

```bash
npm run server:build
git add server/routes.ts server/storage.ts server_dist/index.js
git commit -m "feat: migrate existing chauffeurs to fleet model"
```

## Task 14: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Server build**

Run:

```bash
npm run server:build
```

Expected: build succeeds.

- [ ] **Step 2: Driver app config**

Run:

```bash
npm run mobile:driver:config
```

Expected: Expo config resolves for the driver app.

- [ ] **Step 3: Manual API smoke with auth**

With a valid admin token and driver token, smoke these routes:

```bash
curl -s "$API/api/operator-profile/me" -H "Authorization: Bearer $DRIVER_TOKEN"
curl -s "$API/api/vehicles" -H "Authorization: Bearer $DRIVER_TOKEN"
curl -s "$API/api/admin/operator-profiles?type=partner&status=pending" -H "Authorization: Bearer $ADMIN_TOKEN"
curl -s "$API/api/admin/vehicles?status=pending" -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected: each returns JSON and not HTML/error text.

- [ ] **Step 4: Manual app flow**

Run the driver app and verify:

- New user sees Driver/Partner choice.
- Driver can submit driver-only application.
- Partner can submit all required documents and cannot skip any.
- Admin can approve driver, partner, and vehicle.
- Driver can add/select vehicle and go online.
- Partner can assign approved driver to approved vehicle.
- Driver and partner receive assignment notifications.
- Partner cannot see referral links.

- [ ] **Step 5: Commit final fixes**

If final verification required fixes:

```bash
git status --short
git add path/to/verified-file.ts path/to/verified-file.tsx
git commit -m "fix: complete fleet onboarding verification"
```

Replace the example paths with the exact files changed during verification. If no fixes were needed, do not create an empty commit.
