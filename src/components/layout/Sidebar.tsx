"use client";
// Grouped admin navigation (nav.ts). The pending-driver count is the same
// query as before: unapproved drivers with documents, not suspended.
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LogOut, X } from "lucide-react";
import { NAV_GROUPS, isActive } from "./nav";

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const router = useRouter();
  const [pendingDrivers, setPendingDrivers] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { collection, getDocs, query, where } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const snap = await getDocs(query(collection(db, "drivers"), where("isApproved", "==", false)));
        setPendingDrivers(snap.docs.filter((d) => {
          const data = d.data();
          return data.signupStep !== "suspended" && Object.keys(data.documents || {}).length > 0;
        }).length);
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
    <aside
      style={{
        width: "248px", height: "100vh", background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column",
        flexShrink: 0, overflowY: "auto", overflowX: "hidden", position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "18px 18px 16px", borderBottom: "1px solid var(--border-light)" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px", background: "#ffffff", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden",
        }}>
          <img src="/logo.png" alt="" style={{ width: "28px", height: "28px", objectFit: "contain" }} />
        </div>
        <div style={{ minWidth: 0, lineHeight: 1.2 }}>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>CTSGo</div>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent-text)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Admin</div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close navigation" className="btn btn-secondary" style={{ marginLeft: "auto", padding: "0 8px", minHeight: "32px" }}>
            <X size={16} />
          </button>
        )}
      </div>

      <nav aria-label="Main" style={{ flex: 1, padding: "8px 12px 12px" }}>
        {NAV_GROUPS.map((g) => (
          <div key={g.label} style={{ marginTop: "12px" }}>
            <div style={{
              fontSize: "11px", fontWeight: 700, color: "var(--sidebar-heading)", letterSpacing: "0.08em",
              textTransform: "uppercase", padding: "0 12px", marginBottom: "4px",
            }}>{g.label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {g.links.map(({ href, icon: Icon, label }) => {
                const active = isActive(pathname, href);
                return (
                  <Link key={href} href={href} onClick={onClose} aria-current={active ? "page" : undefined}
                    className={`sidebar-link${active ? " active" : ""}`}>
                    <Icon size={17} aria-hidden style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {href === "/drivers" && pendingDrivers > 0 && (
                      <span title={`${pendingDrivers} driver applications to review`} style={{
                        background: active ? "rgba(255,255,255,0.22)" : "var(--tone-warning-bg)",
                        color: active ? "#fff" : "var(--tone-warning-fg)",
                        borderRadius: "999px", padding: "1px 7px", fontSize: "11px", fontWeight: 700,
                      }}>{pendingDrivers}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div style={{ borderTop: "1px solid var(--border-light)", padding: "12px" }}>
        <button onClick={handleSignOut} className="sidebar-link" style={{ width: "100%", border: "none", background: "none", color: "var(--danger)" }}>
          <LogOut size={17} aria-hidden />
          Sign out
        </button>
      </div>
    </aside>
  );
}
