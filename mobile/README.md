# Madak OMS – Mobile Login Prototype

This Expo project bootstraps the internal operations app (cook, delivery, manager) with a themed login screen hooked up to Supabase Auth.

## Prerequisites

- Node.js 18+
- `npm` (ships with Node) or `pnpm`/`yarn`
- Expo Go app on a mobile device (optional but convenient for local testing)

## Setup

1. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```
2. Configure Supabase credentials by editing `app.json`:
   ```json
   {
     "expo": {
       "extra": {
         "supabaseUrl": "https://YOUR_PROJECT.supabase.co",
         "supabaseAnonKey": "YOUR_SUPABASE_ANON_KEY"
       }
     }
   }
   ```
   > These values power the client defined in `src/lib/supabase.ts`. They can be rotated without rebuilding the app.

3. (Optional) Configure restaurant restriction by adding `restaurantId` to `app.json`:
   ```json
   {
     "expo": {
       "extra": {
         "supabaseUrl": "https://YOUR_PROJECT.supabase.co",
         "supabaseAnonKey": "YOUR_SUPABASE_ANON_KEY",
         "restaurantId": "your-restaurant-uuid-here"
       }
     }
   }
   ```
   > **Restaurant Restriction**: If `restaurantId` is set, only staff accounts associated with that specific restaurant will be able to log in. This is useful when deploying the app to a specific restaurant location. If `restaurantId` is `null` or omitted, the restriction is disabled and any valid staff account can log in.

## Running the app

```bash
cd mobile
npm run start        # opens Expo CLI
```

From the CLI you can press:

- `a` to launch Android emulator / Expo Go on Android
- `w` to open the web build

## How auth works

- The login button uses `supabase.auth.signInWithPassword`.
- AsyncStorage keeps the session between launches.
- Role selector (`Cuisine`, `Livraison`, `Gestion`) determines the UI context; once authenticated, query Supabase for the staff record tied to the session's `auth_user_id` to enforce permissions.
- **Restaurant validation**: If `restaurantId` is configured in `app.json`, the app verifies that the authenticated staff member's `restaurant_id` matches the configured value. If it doesn't match, the user is automatically signed out and shown an error message. This check happens both during login and when restoring an existing session.

## Provisioning staff without real emails

- The app builds a pseudo email by appending `@madak.internal` to the username before calling Supabase (e.g. `chef-cuisine@madak.internal`).
- When creating a staff member, insert a user via the Supabase dashboard (Auth → Users) using that pseudo email and your chosen password, then store the returned `auth.users.id` inside `staff_users.auth_user_id`.
- Keep `staff_users.username` unique per restaurant; the pseudo email mapping is deterministic so no extra lookup is necessary at login.
- Enable RLS on `staff_users`/`orders` and add policies that join on `auth_user_id` so each authenticated user only sees permitted records.

## Kitchen UI

### Commandes (live queue)

- Pulls `orders` with statuses `received`, `preparing`, `ready` for the cook’s `restaurant_id`.
- Filters (Nouvelles / En préparation / Prêtes) show counts plus the relevant list. Tap a card to open details with all items + modifiers.
- Action buttons inside the modal map to Supabase updates:
  - **Accepter et préparer** → `status = 'preparing'`
  - **Marquer prêt** → `status = 'ready'`
  - **Annuler** → `status = 'cancelled'`
- Data refreshes automatically every 15 seconds and also supports pull-to-refresh.

### Historique

- Lets cooks find completed, cancelled, or recently modified orders for the last day or 7 days.
- Provides a numeric search to jump directly to `order_number` (e.g., `1048`).
- Each row displays fulfillment type, placement time, and whether it was completed, cancelled, or simply updated. Tap a row to open the full order breakdown (items + client info).
- Pull-to-refresh supported; limited to the latest 100 changes within the selected range.

### Réglages

- App-level switches only (no menu editing): enable/disable sound notifications, pick light/dark mode, view app version, and sign out safely before handing the tablet to the next shift.

## Next steps

- Wire the post-login navigation for each role.
- Add alternative login flows (one-time codes, magic links) if needed.
- Introduce Supabase Realtime subscriptions once the order feed views are ready.

