# CTSRide Admin Dashboard

Production-grade Next.js 15 admin panel for the CTSRide platform.

## Tech Stack
- **Next.js 15** App Router
- **TypeScript**
- **Tailwind CSS**
- **Firebase** (Auth + Firestore + Functions)
- **Recharts** for analytics
- **Sonner** for toast notifications
- **Lucide React** for icons

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Firebase
Create`.env.local` and fill in your Firebase config:

### 3. Create admin user in Firestore
In your Firebase console, add a document to the `admins` collection:
```
admins/{your_firebase_uid}
{
  role: "super_admin",
  fullName: "Your Name",
  email: "admin@ctsride.com",
  active: true
}
```

### 4. Run development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Pages
| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Analytics overview |
| Drivers | `/drivers` | Driver management & approvals |
| Passengers | `/passengers` | Passenger management |
| Trips | `/trips` | Ride history & live trips |
| Deliveries | `/deliveries` | Parcel delivery orders |
| Gas Orders | `/gas-orders` | Gas cylinder orders |
| Withdrawals | `/withdrawals` | Driver/passenger payouts |
| Notifications | `/notifications` | Broadcast push notifications |
| Settings | `/settings` | Platform configuration |

## Deploy to Firebase Hosting
```bash
npm run build
firebase deploy --only hosting --project ctstransportapp
```

## Firestore Collections Used
- `admins` — Admin users
- `drivers` — Driver profiles
- `users` — Passenger profiles
- `trips` — Ride trips
- `deliveries` — Parcel deliveries
- `gas_orders` — Gas cylinder orders
- `wallets` — Passenger wallets
- `withdrawals` — Payout requests
- `transactions` — Transaction ledger
- `notifications/{uid}/items` — Passenger notifications
- `drivers/{uid}/notifications` — Driver notifications
- `settings/platform` — Platform settings
- `promotions` — Promo banners

## Local emulator demo

Runs the dashboard against local Firebase emulators instead of production.
Use it to demo or test without touching real data.

**How it stays separate from production**
- Off unless `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` is exactly `true`; any other
  value stops the app with an error. `npm run dev`, `build` and `start` are
  unaffected.
- In emulator mode the app ignores every `NEXT_PUBLIC_FIREBASE_*` value and
  uses the project `demo-ctsgo-admin`. Firebase treats `demo-` projects as
  having no real backend, so nothing can reach `ctstransportapp`.
- Auth, Firestore and Functions all point at `127.0.0.1`. There is no
  Functions emulator, so Functions calls fail locally rather than reaching
  production.
- The app refuses to run in emulator mode unless the page is served from
  localhost, and an orange "LOCAL EMULATOR MODE" banner shows on every page.

**Requirements:** Node 22+, firebase-tools, Java 21+, and the passenger repo
checked out beside this one (its `firestore.rules` is loaded).

**Start** (two terminals):

```bash
npm run emulators       # Auth :9099 + Firestore :8085, loads the rules, seeds demo admins
npm run dev:emulator    # http://localhost:3100
```

**Demo accounts** (password `demo-password-123`):
- `super.a@demo.local` and `super.b@demo.local`: super admins. Two are
  needed because a supplier's creator cannot approve it.
- `admin@demo.local`: an ordinary admin.

**Reset** between rehearsals: `npm run emulators:reset` clears all emulator
data and reseeds the admins. Data is in memory and is gone when the
emulators stop. No suppliers, prices, stock or payouts are seeded.

`dev:emulator` uses polling instead of file watchers, for machines that hit
the inotify watch limit (`ENOSPC`).
