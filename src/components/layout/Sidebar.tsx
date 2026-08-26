"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Car,
  Package,
  Flame,
  Wallet,
  Bell,
  Settings,
  LogOut,
  X,
  ChevronRight,
} from "lucide-react";
import { MapPin, Headphones, Tag, ClipboardList } from "lucide-react";

const links = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/drivers", icon: UserCheck, label: "Drivers" },
  { href: "/passengers", icon: Users, label: "Passengers" },
  { href: "/trips", icon: Car, label: "Trips" },
  { href: "/deliveries", icon: Package, label: "Deliveries" },
  { href: "/gas-orders", icon: Flame, label: "Gas Orders" },
  { href: "/withdrawals", icon: Wallet, label: "Withdrawals" },
  { href: "/notifications", icon: Bell, label: "Notifications" },
  { href: "/live-map", icon: MapPin, label: "Live Map" },
  { href: "/support", icon: Headphones, label: "Support" },
  { href: "/promotions", icon: Tag, label: "Promotions" },
  { href: "/audit-log", icon: ClipboardList, label: "Audit Log" },
  { href: "/settings", icon: Settings, label: "Settings" },
  { href: "/ledger", icon: Wallet, label: "Ledger" },
];

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { admin, signOut } = useAuth();
  const router = useRouter();
  const [pendingDrivers, setPendingDrivers] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { collection, getDocs, query, where } =
          await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const snap = await getDocs(
          query(collection(db, "drivers"), where("isApproved", "==", false)),
        );
        const pending = snap.docs.filter((d) => {
          const data = d.data();
          return (
            data.signupStep !== "suspended" &&
            Object.keys(data.documents || {}).length > 0
          );
        }).length;
        setPendingDrivers(pending);
      } catch {}
    };
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <div
      style={{
        width: "240px",
        height: "100vh",
        background: "#070d0f",
        borderRight: "1px solid #1e293b",
        display: "flex",
        flexDirection: "column",
        padding: "20px 12px",
        flexShrink: 0,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "12px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#64748b",
          }}
        >
          <X size={18} />
        </button>
      )}

      {/* Logo / Brand */}
      <div
        style={{
          padding: "0 8px 24px",
          borderBottom: "1px solid #0f1923",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {/* Company Logo */}
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
              boxShadow: "0 0 16px rgba(22, 163, 74, 0.15)",
            }}
          >
            <img
              src="/logo.png"
              alt="Company Logo"
              style={{
                width: "32px",
                height: "32px",
                objectFit: "contain",
              }}
            />
          </div>

          {/* Brand Text */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "0.02em",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              CTS ADMIN
            </div>

            <div
              style={{
                marginTop: "4px",
                fontSize: "10px",
                color: "#4ade80",
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              Admin Panel
            </div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: "#64748b",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "0 12px",
            marginBottom: "8px",
          }}
        >
          Main Menu
        </div>
        {links.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="sidebar-link"
              style={{
                background: active ? "rgba(22,163,74,0.12)" : "transparent",
                color: active ? "#4ade80" : "var(--text-secondary)",
              }}
            >
              <Icon
                size={16}
                style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }}
              />
              {label}
              {label === "Drivers" && pendingDrivers > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: "#ef4444",
                    color: "#fff",
                    borderRadius: "10px",
                    padding: "1px 6px",
                    fontSize: "10px",
                    fontWeight: 700,
                    minWidth: "18px",
                    textAlign: "center",
                  }}
                >
                  {pendingDrivers}
                </span>
              )}
              {active && label !== "Drivers" && (
                <ChevronRight
                  size={14}
                  style={{ marginLeft: "auto", opacity: 0.6 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div
        style={{
          borderTop: "1px solid #0f1923",
          paddingTop: "16px",
          marginTop: "8px",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "10px",
            marginBottom: "4px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#f1f5f9",
              marginBottom: "2px",
            }}
          >
            {admin?.fullName || "Admin"}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#4ade80",
                display: "inline-block",
              }}
            />
            {admin?.role === "super_admin" ? "Super Admin" : "Admin"}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="sidebar-link"
          style={{
            width: "100%",
            border: "none",
            color: "#ef4444",
            background: "none",
          }}
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
