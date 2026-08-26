"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Subtle grid background */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          opacity: 0.03,
          backgroundImage:
            "linear-gradient(#16a34a 1px, transparent 1px), linear-gradient(to right, #16a34a 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "#ffffff",
              marginBottom: "16px",
              boxShadow: "0 0 32px rgba(22,163,74,0.15)",
              overflow: "hidden",
            }}
          >
            <img
              src="/logo.png"
              alt="Company Logo"
              style={{
                width: "42px",
                height: "42px",
                objectFit: "contain",
              }}
            />
          </div>

          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "28px",
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.5px",
              marginBottom: "6px",
            }}
          >
            CTSGo Admin
          </h1>

          <p
            style={{
              color: "var(--text-tertiary)",
              fontSize: "14px",
            }}
          >
            Secure administrative access
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            padding: "32px",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@ctstransport.com"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "var(--surface-alt)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#16a34a")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  background: "var(--surface-alt)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#16a34a")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "8px",
                padding: "13px",
                background: "linear-gradient(135deg, #16a34a, #15803d)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "14px",
                border: "none",
                borderRadius: "10px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.8 : 1,
                boxShadow: "0 4px 16px rgba(22,163,74,0.3)",
              }}
            >
              {loading ? "Signing in..." : "Sign In to Dashboard"}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: "20px",
            fontSize: "12px",
            color: "var(--text-tertiary)",
          }}
        >
          CTSGo Admin Panel v1.0 · Restricted Access
        </p>
      </div>
    </div>
  );
}
