# Restaurant Operations App Overview

## 1. App Purpose

The app is an **internal operations app** for restaurants using my online ordering system.

The website is for **customers** (placing orders).  
The app is for **staff** (managing and fulfilling those orders).

The app connects to the same backend/Supabase DB as the website and lets restaurant staff:

- See new orders in real time
- Accept/decline and update status (kitchen)
- Assign and track deliveries (drivers)
- Configure basic restaurant settings and view stats (manager)

---

## 2. User Roles & Permissions

### 1) Delivery Role (Driver)

**Goal:** Deliver orders efficiently and update statuses.

**Main capabilities:**

- **Login** (via code, email, or manager-created account)
- See a list of **assigned orders**:
  - Order ID / short code
  - Customer name
  - Address
  - Items summary
  - Payment info (paid online / pay on delivery)
- View **order details** on a map:
  - Customer address
  - Route using external Maps app
- Update order status:
  - `"enroute"` → `"completed"` (or `"failed"` / `"undeliverable"`)
- Optional:
  - Share **live GPS location** to backend for customer tracking
  - See **history** of recent deliveries

### 2) Cook Role (Kitchen)

**Goal:** Manage the **order queue** in the kitchen.

**Main capabilities:**

- See **incoming orders** in real time:
  - New orders with status `"received"`
  - Order type: **pickup** vs **delivery**
  - Time placed & scheduled time (if scheduled order)
- For each order:
  - View full list of items + modifiers (without UI noise)
  - Optionally print or show a “kitchen ticket” style view
- Change order status:
  - `received → preparing → ready`
- For delivery orders:
  - Notify manager / system that order is **ready to assign** to a driver

### 3) Manager Role

**Goal:** Configure the restaurant + manage the team + view performance.

**Main capabilities:**

1. **User management**
   - Create **cook** accounts
   - Create **delivery** accounts
   - Activate/deactivate users
   - Reset passwords or regenerate simple login codes

2. **Restaurant settings**
   - Toggle **ordering enabled/disabled**
   - Set min order amount
   - Edit some basic info:
     - restaurant name (maybe),
     - phone,
     - service types (delivery/pickup)
   - Quickly switch **“we’re closed”** / “only pickup” in emergencies

3. **Monitoring & operations**
   - See **current order queue** with statuses:
     - how many `received`, `preparing`, `ready`, `enroute`
   - See list of active drivers and whether they are “On delivery” or “Available”

4. **Statistics / reports** (even if it’s basic at first)
   - Orders per day / week
   - Revenue (total, per service type)
   - Top-selling items

---

## 3. Order Lifecycle in the App

1. **Customer** orders on the website  
   → `orders.status = 'received'`

2. **Cook (Kitchen view)**:
   - Sees order in “New orders”
   - Presses **“Accept / Start preparing”**  
   → `status = 'preparing'`

3. When food is ready:
   - Cook taps **“Ready”**  
   → `status = 'ready'`

4. **Manager or auto-assignment**:
   - Assigns a driver (or driver self-assigns from “Unassigned deliveries”)  
   → `order.driver_id = ...`

5. **Delivery app (Driver)**:
   - Driver sees assigned order, taps **“Start delivery”**  
   → `status = 'enroute'`
   - GPS position is optionally updated to backend for tracking.

6. When delivered:
   - Driver taps **“Delivered”**  
   → `status = 'completed'`

7. If cancelled:
   - `status = 'cancelled'`

---

## 4. Tech / Architecture (high-level)

- **Mobile app**: React Native / Expo
- One **login screen**, then:
  - fetch `role` from backend (`cook`, `delivery`, `manager`)
  - switch UI based on role
- **State**:
  - Polling or Supabase Realtime on `orders` table
  - Small local store (Zustand, Redux, or React Context)

---

## 5. Why this design is a good idea

- **One app, three roles** = easier maintenance & deployment
- Avoids syncing logic across 3 separate apps
- Staff can switch roles if needed
- Matches your **database and backend design** well
