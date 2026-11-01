// Admin navigation, grouped by area. One list drives the sidebar, the page
// title and the breadcrumb in the shell. Routes and access are unchanged:
// every page still sits behind the shell's active-admin check, and actions
// keep their own server-side checks.
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Users, UserCheck, Car, Package, Flame, Factory, Truck, Scale,
  Wallet, BookOpen, Tag, Bell, MapPin, Headphones, ClipboardList, Settings, Gauge, SlidersHorizontal,
} from 'lucide-react'

export interface NavLink { href: string; icon: LucideIcon; label: string }
export interface NavGroup { label: string; links: NavLink[] }

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', links: [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/live-map', icon: MapPin, label: 'Live Map' },
  ] },
  { label: 'People', links: [
    { href: '/drivers', icon: UserCheck, label: 'Drivers' },
    { href: '/passengers', icon: Users, label: 'Passengers' },
  ] },
  { label: 'Operations', links: [
    { href: '/trips', icon: Car, label: 'Trips' },
    { href: '/deliveries', icon: Package, label: 'Deliveries' },
    { href: '/support', icon: Headphones, label: 'Support' },
  ] },
  // Governance first, then supplier orders (the main operational flow), the
  // older direct Gas orders, money, and platform configuration.
  { label: 'Gas', links: [
    { href: '/gas', icon: Gauge, label: 'Gas Overview' },
    { href: '/gas-suppliers', icon: Factory, label: 'Suppliers' },
    { href: '/gas-supplier-orders', icon: Truck, label: 'Supplier Gas Orders' },
    { href: '/gas-orders', icon: Flame, label: 'Direct Gas Orders' },
    { href: '/gas-settlement', icon: Scale, label: 'Gas Settlement' },
    { href: '/gas-supplier-payouts', icon: Wallet, label: 'Supplier Payouts' },
    { href: '/gas-configuration', icon: SlidersHorizontal, label: 'Gas Configuration' },
  ] },
  { label: 'Finance', links: [
    { href: '/withdrawals', icon: Wallet, label: 'Withdrawals' },
    { href: '/ledger', icon: BookOpen, label: 'Ledger' },
    { href: '/promotions', icon: Tag, label: 'Promotions' },
  ] },
  { label: 'System', links: [
    { href: '/notifications', icon: Bell, label: 'Notifications' },
    { href: '/audit-log', icon: ClipboardList, label: 'Audit Log' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ] },
]

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/')

/** The section a path belongs to, and whether it is a record inside it (e.g. /gas-suppliers/{id}). */
export function navContext(pathname: string): { group: string; link: NavLink | null; detail: boolean } {
  for (const g of NAV_GROUPS) {
    for (const l of g.links) {
      if (isActive(pathname, l.href)) return { group: g.label, link: l, detail: pathname !== l.href }
    }
  }
  return { group: '', link: null, detail: false }
}
