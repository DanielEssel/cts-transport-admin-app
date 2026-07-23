"use client";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import {
  Save,
  Settings,
  Percent,
  Car,
  Package,
  Flame,
  Info,
} from "lucide-react";

interface RidePricing {
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minimumFare: number;
  cancellationFee: number;
  surgeMutiplier: number;
  surgeEnabled: boolean;
}

interface VehicleRate {
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
}

interface DeliveryPricing {
  okada: VehicleRate;
  aboboya: VehicleRate;
  miniTruck: VehicleRate;
  weightSurchargeSmall: number; // < 5kg
  weightSurchargeMedium: number; // 5-20kg
  weightSurchargeLarge: number; // 20kg+
  fragileItemSurcharge: number;
  helperSurcharge: number;
  cancellationFee: number;
}

interface GasPricing {
  // Refill prices (gas only) — Exchange, Pickup & Return
  refill3kg: number;
  refill6kg: number;
  refill12kg: number;
  refill14kg: number;
  refill19kg: number;
  refill45kg: number;
  // Full cylinder (hardware + first fill) — New Cylinder
  full3kg: number;
  full6kg: number;
  full12kg: number;
  full14kg: number;
  full19kg: number;
  full45kg: number;
  // Distance-based delivery
  baseFare: number;
  perKm: number;
  minDeliveryFee: number;
  // Pickup & Return surcharge + Commercial multiplier
  roundTripFee: number;
  commercialRate: number;
  minimumOrder: number;
}

interface PlatformSettings {
  platformFeePercent: number;
  driverCommissionPercent: number;

  // Ride pricing per service type
  okada: RidePricing;
  taxi: RidePricing;

  // Delivery
  delivery: DeliveryPricing;

  // Gas
  gas: GasPricing;

  // Service toggles
  rideEnabled: boolean;
  deliveryEnabled: boolean;
  gasEnabled: boolean;
  maintenanceMode: boolean;

  // Payout settings
  minWithdrawalAmount: number;
  maxWithdrawalAmount: number;
  withdrawalProcessingDays: number;
}

const defaults: PlatformSettings = {
  platformFeePercent: 15,
  driverCommissionPercent: 85,

  okada: {
    baseFare: 3,
    perKmRate: 1.5,
    perMinRate: 0.2,
    minimumFare: 5,
    cancellationFee: 2,
    surgeMutiplier: 1.5,
    surgeEnabled: false,
  },
  taxi: {
    baseFare: 5,
    perKmRate: 2.5,
    perMinRate: 0.3,
    minimumFare: 10,
    cancellationFee: 3,
    surgeMutiplier: 1.5,
    surgeEnabled: false,
  },
  delivery: {
    okada: { baseFare: 5, perKmRate: 2.5, minimumFare: 10 },
    aboboya: { baseFare: 15, perKmRate: 4, minimumFare: 20 },
    miniTruck: { baseFare: 40, perKmRate: 7, minimumFare: 50 },
    weightSurchargeSmall: 0,
    weightSurchargeMedium: 5,
    weightSurchargeLarge: 15,
    fragileItemSurcharge: 5,
    helperSurcharge: 10,
    cancellationFee: 3,
  },
  gas: {
    refill3kg: 40,
    refill6kg: 75,
    refill12kg: 150,
    refill14kg: 177,
    refill19kg: 230,
    refill45kg: 540,
    full3kg: 180,
    full6kg: 280,
    full12kg: 480,
    full14kg: 520,
    full19kg: 620,
    full45kg: 1150,
    baseFare: 8,
    perKm: 2,
    minDeliveryFee: 12,
    roundTripFee: 30,
    commercialRate: 1.0,
    minimumOrder: 1,
  },

  rideEnabled: true,
  deliveryEnabled: true,
  gasEnabled: true,
  maintenanceMode: false,

  minWithdrawalAmount: 10,
  maxWithdrawalAmount: 5000,
  withdrawalProcessingDays: 1,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSection, setOpenSection] = useState<string>("platform");

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "platform"));
        if (snap.exists()) {
          const data = snap.data() as any;
          setSettings({
            ...defaults,
            ...data,
            delivery: {
              ...defaults.delivery,
              ...(data.delivery ?? {}),
              okada: {
                ...defaults.delivery.okada,
                ...(data.delivery?.okada ?? {}),
              },
              aboboya: {
                ...defaults.delivery.aboboya,
                ...(data.delivery?.aboboya ?? {}),
              },
              miniTruck: {
                ...defaults.delivery.miniTruck,
                ...(data.delivery?.miniTruck ?? {}),
              },
            },
          });
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "platform"), settings, { merge: true });
      toast.success("Settings saved successfully");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (path: string, value: any) => {
    setSettings((prev) => {
      const next = { ...prev };
      const keys = path.split(".");
      let obj: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] };
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  // Tab definitions (order = tab bar order)
  const TABS = [
    { id: "platform", icon: <Percent size={16} />, label: "Platform" },
    { id: "okada", icon: <Car size={16} />, label: "Okada" },
    { id: "taxi", icon: <Car size={16} />, label: "Taxi" },
    { id: "delivery", icon: <Package size={16} />, label: "Delivery" },
    { id: "gas", icon: <Flame size={16} />, label: "Gas" },
    { id: "services", icon: <Settings size={16} />, label: "Services" },
  ];

  // Panel — only renders when it's the active tab.
  const Section = ({
    id,
    icon,
    title,
    children,
  }: {
    id: string;
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
  }) => {
    if (openSection !== id) return null;
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ color: "#16a34a" }}>{icon}</div>
          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {title}
          </span>
        </div>
        <div style={{ padding: "20px" }}>{children}</div>
      </div>
    );
  };

  // Horizontal tab bar.
  const TabBar = () => (
    <div
      style={{
        display: "flex",
        gap: "6px",
        overflowX: "auto",
        padding: "4px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
      }}
    >
      {TABS.map((t) => {
        const active = openSection === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setOpenSection(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 16px",
              borderRadius: "10px",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: active
                ? "linear-gradient(135deg, #16a34a, #15803d)"
                : "transparent",
              color: active ? "#fff" : "var(--text-tertiary)",
              fontWeight: 700,
              fontSize: "13px",
              fontFamily: "'Syne', sans-serif",
              transition: "all 0.15s",
            }}
          >
            <span
              style={{ display: "flex", color: active ? "#fff" : "#16a34a" }}
            >
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );

  const Field = ({
    label,
    value,
    onChange,
    unit,
    hint,
    min = 0,
    step = 0.5,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    unit?: string;
    hint?: string;
    min?: number;
    step?: number;
  }) => (
    <div>
      <label
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          display: "block",
          marginBottom: "6px",
        }}
      >
        {label}
        {hint && (
          <span
            style={{
              fontSize: "10px",
              fontWeight: 400,
              color: "var(--text-tertiary)",
              marginLeft: "6px",
              textTransform: "none",
            }}
          >
            ({hint})
          </span>
        )}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {unit && (
          <span
            style={{
              fontSize: "13px",
              color: "var(--text-tertiary)",
              fontWeight: 600,
              minWidth: "30px",
            }}
          >
            {unit}
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          style={{
            padding: "9px 12px",
            borderRadius: "8px",
            background: "var(--surface-alt)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            fontSize: "14px",
            fontWeight: 600,
            outline: "none",
            width: "120px",
          }}
        />
      </div>
    </div>
  );

  const Toggle = ({
    label,
    desc,
    value,
    onChange,
  }: {
    label: string;
    desc: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: "2px",
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          {desc}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          width: "44px",
          height: "24px",
          borderRadius: "12px",
          border: "none",
          cursor: "pointer",
          background: value ? "#16a34a" : "var(--border)",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: "3px",
            left: value ? "23px" : "3px",
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );

  const Grid = ({ children }: { children: React.ReactNode }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "16px",
      }}
    >
      {children}
    </div>
  );

  const Divider = ({ label }: { label: string }) => (
    <div
      style={{
        gridColumn: "1/-1",
        borderTop: "1px solid var(--border)",
        paddingTop: "16px",
        marginTop: "4px",
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
    </div>
  );

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
          color: "var(--text-tertiary)",
        }}
      >
        Loading settings...
      </div>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        maxWidth: "800px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "22px",
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            Platform Settings
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
            Configure pricing, fees and platform behaviour
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            borderRadius: "10px",
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            background: "linear-gradient(135deg, #16a34a, #15803d)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "14px",
            boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
            opacity: saving ? 0.8 : 1,
          }}
        >
          <Save size={15} />
          {saving ? "Saving..." : "Save All Settings"}
        </button>
      </div>

      <TabBar />

      {/* Info banner */}
      <div
        style={{
          background: "rgba(96,165,250,0.08)",
          border: "1px solid rgba(96,165,250,0.2)",
          borderRadius: "10px",
          padding: "12px 16px",
          display: "flex",
          gap: "10px",
          alignItems: "flex-start",
        }}
      >
        <Info
          size={14}
          style={{ color: "#60a5fa", flexShrink: 0, marginTop: "1px" }}
        />
        <p style={{ fontSize: "12px", color: "#60a5fa", lineHeight: 1.6 }}>
          Changes take effect immediately for new bookings. Existing trips are
          not affected. The driver app reads these settings on each booking
          request.
        </p>
      </div>

      {/* Platform fees */}
      <Section
        id="platform"
        icon={<Percent size={18} />}
        title="Platform Fees & Payouts"
      >
        <Grid>
          <Field
            label="Platform Fee"
            value={settings.platformFeePercent}
            unit="%"
            hint="of each trip"
            onChange={(v) => {
              set("platformFeePercent", v);
              set("driverCommissionPercent", 100 - v);
            }}
          />
          <Field
            label="Driver Commission"
            value={settings.driverCommissionPercent}
            unit="%"
            hint="auto-calculated"
            onChange={() => {}}
            min={0}
          />
          <Divider label="Withdrawal Limits" />
          <Field
            label="Min Withdrawal"
            value={settings.minWithdrawalAmount}
            unit="GH₵"
            onChange={(v) => set("minWithdrawalAmount", v)}
          />
          <Field
            label="Max Withdrawal"
            value={settings.maxWithdrawalAmount}
            unit="GH₵"
            onChange={(v) => set("maxWithdrawalAmount", v)}
          />
          <Field
            label="Processing Days"
            value={settings.withdrawalProcessingDays}
            unit="days"
            step={1}
            onChange={(v) => set("withdrawalProcessingDays", v)}
          />
        </Grid>
      </Section>

      {/* Okada pricing */}
      <Section
        id="okada"
        icon={<Car size={18} />}
        title="Okada (Motorcycle) Pricing"
      >
        <Grid>
          <Field
            label="Base Fare"
            value={settings.okada.baseFare}
            unit="GH₵"
            hint="starting fare"
            onChange={(v) => set("okada.baseFare", v)}
          />
          <Field
            label="Per KM Rate"
            value={settings.okada.perKmRate}
            unit="GH₵"
            hint="per kilometre"
            onChange={(v) => set("okada.perKmRate", v)}
            step={0.1}
          />
          <Field
            label="Per Minute Rate"
            value={settings.okada.perMinRate}
            unit="GH₵"
            hint="waiting/slow traffic"
            onChange={(v) => set("okada.perMinRate", v)}
            step={0.05}
          />
          <Field
            label="Minimum Fare"
            value={settings.okada.minimumFare}
            unit="GH₵"
            hint="floor price"
            onChange={(v) => set("okada.minimumFare", v)}
          />
          <Field
            label="Cancellation Fee"
            value={settings.okada.cancellationFee}
            unit="GH₵"
            hint="after driver assigns"
            onChange={(v) => set("okada.cancellationFee", v)}
          />
          <Divider label="Surge Pricing" />
          <Field
            label="Surge Multiplier"
            value={settings.okada.surgeMutiplier}
            unit="×"
            hint="e.g. 1.5 = 50% more"
            onChange={(v) => set("okada.surgeMutiplier", v)}
            step={0.1}
          />
          <div style={{ gridColumn: "1/-1" }}>
            <Toggle
              label="Enable Surge Pricing"
              desc="Automatically increase fares during peak hours"
              value={settings.okada.surgeEnabled}
              onChange={(v) => set("okada.surgeEnabled", v)}
            />
          </div>
        </Grid>
      </Section>

      {/* Taxi pricing */}
      <Section id="taxi" icon={<Car size={18} />} title="Taxi Pricing">
        <Grid>
          <Field
            label="Base Fare"
            value={settings.taxi.baseFare}
            unit="GH₵"
            onChange={(v) => set("taxi.baseFare", v)}
          />
          <Field
            label="Per KM Rate"
            value={settings.taxi.perKmRate}
            unit="GH₵"
            onChange={(v) => set("taxi.perKmRate", v)}
            step={0.1}
          />
          <Field
            label="Per Minute Rate"
            value={settings.taxi.perMinRate}
            unit="GH₵"
            onChange={(v) => set("taxi.perMinRate", v)}
            step={0.05}
          />
          <Field
            label="Minimum Fare"
            value={settings.taxi.minimumFare}
            unit="GH₵"
            onChange={(v) => set("taxi.minimumFare", v)}
          />
          <Field
            label="Cancellation Fee"
            value={settings.taxi.cancellationFee}
            unit="GH₵"
            onChange={(v) => set("taxi.cancellationFee", v)}
          />
          <Divider label="Surge Pricing" />
          <Field
            label="Surge Multiplier"
            value={settings.taxi.surgeMutiplier}
            unit="×"
            onChange={(v) => set("taxi.surgeMutiplier", v)}
            step={0.1}
          />
          <div style={{ gridColumn: "1/-1" }}>
            <Toggle
              label="Enable Surge Pricing"
              desc="Automatically increase fares during peak hours"
              value={settings.taxi.surgeEnabled}
              onChange={(v) => set("taxi.surgeEnabled", v)}
            />
          </div>
        </Grid>
      </Section>

      <Section
        id="delivery"
        icon={<Package size={18} />}
        title="Delivery Pricing"
      >
        <Grid>
          <Divider label="Okada — small parcels" />
          <Field
            label="Base Fare"
            value={settings.delivery.okada.baseFare}
            unit="GH₵"
            hint="starting fare"
            onChange={(v) => set("delivery.okada.baseFare", v)}
          />
          <Field
            label="Per KM Rate"
            value={settings.delivery.okada.perKmRate}
            unit="GH₵"
            step={0.1}
            onChange={(v) => set("delivery.okada.perKmRate", v)}
          />
          <Field
            label="Minimum Fare"
            value={settings.delivery.okada.minimumFare}
            unit="GH₵"
            hint="floor price"
            onChange={(v) => set("delivery.okada.minimumFare", v)}
          />

          <Divider label="Aboboya — medium loads" />
          <Field
            label="Base Fare"
            value={settings.delivery.aboboya.baseFare}
            unit="GH₵"
            hint="starting fare"
            onChange={(v) => set("delivery.aboboya.baseFare", v)}
          />
          <Field
            label="Per KM Rate"
            value={settings.delivery.aboboya.perKmRate}
            unit="GH₵"
            step={0.1}
            onChange={(v) => set("delivery.aboboya.perKmRate", v)}
          />
          <Field
            label="Minimum Fare"
            value={settings.delivery.aboboya.minimumFare}
            unit="GH₵"
            hint="floor price"
            onChange={(v) => set("delivery.aboboya.minimumFare", v)}
          />

          <Divider label="Mini Truck — bulk" />
          <Field
            label="Base Fare"
            value={settings.delivery.miniTruck.baseFare}
            unit="GH₵"
            hint="starting fare"
            onChange={(v) => set("delivery.miniTruck.baseFare", v)}
          />
          <Field
            label="Per KM Rate"
            value={settings.delivery.miniTruck.perKmRate}
            unit="GH₵"
            step={0.1}
            onChange={(v) => set("delivery.miniTruck.perKmRate", v)}
          />
          <Field
            label="Minimum Fare"
            value={settings.delivery.miniTruck.minimumFare}
            unit="GH₵"
            hint="floor price"
            onChange={(v) => set("delivery.miniTruck.minimumFare", v)}
          />

          <Divider label="Surcharges — all vehicles" />
          <Field
            label="Small Package"
            value={settings.delivery.weightSurchargeSmall}
            unit="GH₵"
            hint="under 5kg"
            onChange={(v) => set("delivery.weightSurchargeSmall", v)}
          />
          <Field
            label="Medium Package"
            value={settings.delivery.weightSurchargeMedium}
            unit="GH₵"
            hint="5–20kg"
            onChange={(v) => set("delivery.weightSurchargeMedium", v)}
          />
          <Field
            label="Large Package"
            value={settings.delivery.weightSurchargeLarge}
            unit="GH₵"
            hint="over 20kg"
            onChange={(v) => set("delivery.weightSurchargeLarge", v)}
          />
          <Field
            label="Fragile Item"
            value={settings.delivery.fragileItemSurcharge}
            unit="GH₵"
            hint="extra care"
            onChange={(v) => set("delivery.fragileItemSurcharge", v)}
          />
          <Field
            label="Loading Helpers"
            value={settings.delivery.helperSurcharge}
            unit="GH₵"
            hint="per delivery"
            onChange={(v) => set("delivery.helperSurcharge", v)}
          />
          <Field
            label="Cancellation Fee"
            value={settings.delivery.cancellationFee}
            unit="GH₵"
            hint="after assign"
            onChange={(v) => set("delivery.cancellationFee", v)}
          />
        </Grid>
      </Section>

      {/* Gas pricing */}
      <Section id="gas" icon={<Flame size={18} />} title="Gas Cylinder Pricing">
        <Grid>
          <Divider label="Refill prices — gas only (Exchange, Pickup & Return)" />
          <Field
            label="3kg Refill"
            value={settings.gas.refill3kg}
            unit="GH₵"
            onChange={(v) => set("gas.refill3kg", v)}
          />
          <Field
            label="6kg Refill"
            value={settings.gas.refill6kg}
            unit="GH₵"
            onChange={(v) => set("gas.refill6kg", v)}
          />
          <Field
            label="12.5kg Refill"
            value={settings.gas.refill12kg}
            unit="GH₵"
            onChange={(v) => set("gas.refill12kg", v)}
          />
          <Field
            label="14.5kg Refill"
            value={settings.gas.refill14kg}
            unit="GH₵"
            onChange={(v) => set("gas.refill14kg", v)}
          />
          <Field
            label="19kg Refill"
            value={settings.gas.refill19kg}
            unit="GH₵"
            onChange={(v) => set("gas.refill19kg", v)}
          />
          <Field
            label="45kg Refill"
            value={settings.gas.refill45kg}
            unit="GH₵"
            onChange={(v) => set("gas.refill45kg", v)}
          />

          <Divider label="Full cylinder — hardware + first fill (New Cylinder)" />
          <Field
            label="3kg Full"
            value={settings.gas.full3kg}
            unit="GH₵"
            onChange={(v) => set("gas.full3kg", v)}
          />
          <Field
            label="6kg Full"
            value={settings.gas.full6kg}
            unit="GH₵"
            onChange={(v) => set("gas.full6kg", v)}
          />
          <Field
            label="12.5kg Full"
            value={settings.gas.full12kg}
            unit="GH₵"
            onChange={(v) => set("gas.full12kg", v)}
          />
          <Field
            label="14.5kg Full"
            value={settings.gas.full14kg}
            unit="GH₵"
            onChange={(v) => set("gas.full14kg", v)}
          />
          <Field
            label="19kg Full"
            value={settings.gas.full19kg}
            unit="GH₵"
            onChange={(v) => set("gas.full19kg", v)}
          />
          <Field
            label="45kg Full"
            value={settings.gas.full45kg}
            unit="GH₵"
            onChange={(v) => set("gas.full45kg", v)}
          />

          <Divider label="Delivery — distance-based" />
          <Field
            label="Base Fare"
            value={settings.gas.baseFare}
            unit="GH₵"
            hint="starting fee"
            onChange={(v) => set("gas.baseFare", v)}
          />
          <Field
            label="Per KM Rate"
            value={settings.gas.perKm}
            unit="GH₵"
            hint="per kilometre"
            step={0.1}
            onChange={(v) => set("gas.perKm", v)}
          />
          <Field
            label="Min Delivery Fee"
            value={settings.gas.minDeliveryFee}
            unit="GH₵"
            hint="floor price"
            onChange={(v) => set("gas.minDeliveryFee", v)}
          />

          <Divider label="Surcharges" />
          <Field
            label="Round-trip Fee"
            value={settings.gas.roundTripFee}
            unit="GH₵"
            hint="Pickup & Return"
            onChange={(v) => set("gas.roundTripFee", v)}
          />
          <Field
            label="Commercial Rate"
            value={settings.gas.commercialRate}
            unit="×"
            hint="Bulk multiplier"
            step={0.1}
            onChange={(v) => set("gas.commercialRate", v)}
          />
          <Field
            label="Minimum Order"
            value={settings.gas.minimumOrder}
            unit="qty"
            step={1}
            hint="cylinders"
            onChange={(v) => set("gas.minimumOrder", v)}
          />
        </Grid>
      </Section>

      {/* Service toggles */}
      <Section
        id="services"
        icon={<Settings size={18} />}
        title="Services & Platform Controls"
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Toggle
            label="Ride Hailing"
            desc="Okada and Taxi bookings via the passenger app"
            value={settings.rideEnabled}
            onChange={(v) => set("rideEnabled", v)}
          />
          <Toggle
            label="Parcel Delivery"
            desc="Parcel and package delivery service"
            value={settings.deliveryEnabled}
            onChange={(v) => set("deliveryEnabled", v)}
          />
          <Toggle
            label="Gas Delivery"
            desc="Gas cylinder refill and delivery service"
            value={settings.gasEnabled}
            onChange={(v) => set("gasEnabled", v)}
          />
          <Toggle
            label="Maintenance Mode"
            desc="Show maintenance screen to all app users — use with caution"
            value={settings.maintenanceMode}
            onChange={(v) => set("maintenanceMode", v)}
          />
        </div>
      </Section>

      {/* Save button at bottom too */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: "14px",
          borderRadius: "12px",
          border: "none",
          cursor: saving ? "not-allowed" : "pointer",
          background: "linear-gradient(135deg, #16a34a, #15803d)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "14px",
          boxShadow: "0 4px 16px rgba(22,163,74,0.3)",
          opacity: saving ? 0.8 : 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        <Save size={15} />
        {saving ? "Saving..." : "Save All Settings"}
      </button>
    </div>
  );
}
