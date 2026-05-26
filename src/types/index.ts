export interface Admin {
  uid: string
  role: 'super_admin' | 'admin'
  fullName: string
  email: string
  active: boolean
}

export interface Driver {
  uid: string
  displayName: string
  phone: string
  email?: string
  serviceType: string
  vehicleType?: string
  vehicleModel?: string
  vehiclePlate?: string
  isApproved: boolean
  isOnline: boolean
  isAvailable: boolean
  signupStep: string
  rating: number
  totalTrips: number
  totalEarnings: number
  todayEarnings: number
  completedTrips: number
  photoUrl?: string
  documents?: Record<string, { status: string; url?: string; expiryDate?: any }>
  createdAt?: any
  fcmToken?: string
}

export interface Passenger {
  uid: string
  firstName?: string
  lastName?: string
  displayName?: string
  phoneNumber?: string
  email?: string
  photoURL?: string
  createdAt?: any
  lastLoginAt?: any
}

export interface Trip {
  id: string
  passengerId: string
  driverId?: string
  passengerName?: string
  driverName?: string
  status: string
  serviceType: string
  pickupAddress: string
  dropoffAddress: string
  estimatedFare: number
  actualFare?: number
  createdAt?: any
  completedAt?: any
  driverRating?: number
  passengerRating?: number
}

export interface Delivery {
  id: string
  passengerId: string
  driverId?: string
  driverName?: string
  status: string
  pickupAddress: string
  dropoffAddress: string
  parcelType: string
  weightTier: string
  estimatedFare: number
  actualFare?: number
  createdAt?: any
}

export interface GasOrder {
  id: string
  passengerId: string
  driverId?: string
  status: string
  cylinderSize: string
  quantity: number
  totalPrice: number
  deliveryAddress: string
  pickupAddress: string
  createdAt?: any
}

export interface Withdrawal {
  id: string
  userId: string
  role: 'driver' | 'passenger'
  amount: number
  currency: string
  method: string
  phoneNumber?: string
  status: 'pending' | 'approved' | 'rejected' | 'paid'
  createdAt?: any
  txId?: string
}

export interface Wallet {
  userId: string
  balance: number
  currency: string
}

export interface PlatformSettings {
  platformFeePercent: number
  minFareRide: number
  minFareDelivery: number
  minFareGas: number
  rideEnabled: boolean
  deliveryEnabled: boolean
  gasEnabled: boolean
  maintenanceMode: boolean
}
