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
