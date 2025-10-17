import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabaseClient";
console.log("🔎 Vercel environment:", process.env.NEXT_PUBLIC_VERCEL_ENV);

/* ============================================================================
   Persistent Device ID (owner key for Supabase row)
============================================================================ */
function getDeviceId() {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem("cs2-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cs2-device-id", id);
  }
  return id;
}

/* ============================================================================
   Time helpers (Lisbon / WEST)
============================================================================ */
const LISBON_TZ = "Europe/Lisbon";

function formatLisbonHM(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LISBON_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function todayKeyLisbon(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hasPassedLisbonHHMM(targetHHMM = "19:00") {
  const now = new Date();
  const [h, m] = targetHHMM.split(":").map(Number);
  const tzNow = new Date(now.toLocaleString("en-US", { timeZone: LISBON_TZ }));
  return (
    tzNow.getHours() > h ||
    (tzNow.getHours() === h && tzNow.getMinutes() >= m)
  );
}

/* ============================================================================
   UI helpers
============================================================================ */
const fmtMoney = (n) => (isFinite(n) ? Number(n).toFixed(2) : "0.00");

function hexToRgba(hex, alpha = 0.5) {
  if (!hex) return null;
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Handle mixed tab structures */
function getTabName(tab) {
  if (!tab) return "";
  return typeof tab === "string" ? tab : tab.name;
}

/* ============================================================================
   Watermark Component (SSR-safe + Reactive)
============================================================================ */
function Watermark() {
  const [unauth, setUnauth] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () =>
      setUnauth(localStorage.getItem("unauthorized_copy") === "true");
    update();
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  return (
    <a
      href="https://steamcommunity.com/id/itsBhx"
      target="_blank"
      rel="noopener noreferrer"
         className={`fixed bottom-2 right-3 z-[999] text-[11px] select-none opacity-0 animate-fadeIn transition-all ${
         unauth
          ? "text-red-400/70 hover:text-red-300"
          : "text-neutral-500/40 hover:text-orange-400/70"
      }`}
    >
      © 2025 CS2 Prices by Bhx
      {unauth && <span className="ml-1 text-xs">(Unverified Build)</span>}
    </a>
  );
}

/* ============================================================================
   Defaults
============================================================================ */
const DEFAULT_SETTINGS = {
  colors: [
    { name: "Red", hex: "#ea9999" },
    { name: "Pink", hex: "#d5a6bd" },
    { name: "Purple", hex: "#b4a7d6" },
    { name: "Blue", hex: "#a4c2f4" },
  ],
  snapshotTimeHHMM: "19:00",
  refreshMinutes: 60,
};

/* ============================================================================
   Component: Home (pages/index.js)
============================================================================ */
export default function Home() {
  /* ------------------------------- State ----------------------------------- */
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showSettings, setShowSettings] = useState(false);
  const [modal, setModal] = useState({ open: false, mode: null, initialData: null });
  const openModal = (mode, data = null, parentFolder = null) =>
  setModal({ open: true, mode, initialData: data, parentFolder });
  const closeModal = () => setModal({ open: false, mode: null, initialData: null });


  const [data, setData] = useState({});
  const [totals, setTotals] = useState({});
  const [snapshots, setSnapshots] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [apiStatus, setApiStatus] = useState("stable"); // "stable" | "429" | "down"
  const [isLoading, setIsLoading] = useState(false);

  const [colorMenu, setColorMenu] = useState({
    open: false,
    tab: null,
    index: null,
    x: 0,
    y: 0,
  });

  // refresh loop guards
  const refreshTimerRef = useRef({ running: false });
  const isRefreshingRef = useRef(false);

  /* --------------------------- Load / Save local --------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setTabs(JSON.parse(localStorage.getItem("cs2-tabs")) || ["Dashboard"]);
    setData(JSON.parse(localStorage.getItem("cs2-data")) || {});
    setSnapshots(JSON.parse(localStorage.getItem("cs2-snapshots")) || {});
    setSettings(
      JSON.parse(localStorage.getItem("cs2-settings")) || DEFAULT_SETTINGS
    );
    setLastUpdatedAt(localStorage.getItem("cs2-lastUpdatedAt") || null);
  }, []);

  useEffect(() => {
    localStorage.setItem("cs2-tabs", JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem("cs2-data", JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    localStorage.setItem("cs2-snapshots", JSON.stringify(snapshots));
  }, [snapshots]);

  useEffect(() => {
    localStorage.setItem("cs2-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (lastUpdatedAt) localStorage.setItem("cs2-lastUpdatedAt", lastUpdatedAt);
  }, [lastUpdatedAt]);

   /* ============================================================================
   Security & Verification System (SSR-safe)
============================================================================ */
useEffect(() => {
  if (typeof window === "undefined") return;

  const legitDomains = ["cs-2-prices.vercel.app", "www.cs-2-prices.vercel.app"];
  const currentHost = window.location.hostname;
  const isLegit = legitDomains.includes(currentHost);
  const signature = process.env.NEXT_PUBLIC_SIGNATURE || "unknown-signature";

  // Domain verification
  if (!isLegit) {
    console.warn("⚠️ Unauthorized domain detected:", currentHost);
    localStorage.setItem("unauthorized_copy", "true");
  } else {
    localStorage.removeItem("unauthorized_copy");
  }

  // Signature verification
  if (signature !== "Bhx-2025-release") {
    console.warn("⚠️ Build signature mismatch. Potential tampering detected.");
  }

  // Expose helper for Supabase
  window.verifyHost = () => {
    if (!isLegit) {
      alert("⚠️ Unauthorized deployment — Cloud Sync disabled for safety.");
      return false;
    }
    return true;
  };

  // Console testing helpers
  window.verifySim = (mode) => {
    if (mode === "unauthorized") {
      localStorage.setItem("unauthorized_copy", "true");
      console.log("🧪 Simulated unauthorized domain");
      location.reload();
    } else if (mode === "authorized") {
      localStorage.removeItem("unauthorized_copy");
      console.log("🧪 Simulated authorized domain");
      location.reload();
    } else if (mode === "tamper") {
      console.warn("🧪 Simulated signature mismatch");
      console.warn("⚠️ Build signature mismatch. Potential tampering detected.");
    } else {
      console.log("Usage: verifySim('unauthorized' | 'authorized' | 'tamper')");
    }
  };
}, []);

  /* ------------------------------ Supabase --------------------------------- */
  async function saveToCloud() {
    try {
// 🔒 Block cloud save on unauthorized domains
if (typeof window !== "undefined" && window.verifyHost && !window.verifyHost()) return;
      const deviceId = getDeviceId();
      if (!deviceId) throw new Error("No device id");

      const payload = {
        tabs,
        data,
        snapshots,
        settings,
        lastUpdatedAt,
      };

// 🧹 Automatically remove test data when running on non-production environments
// Detect environment via Vercel or fallback
const env = process.env.NEXT_PUBLIC_VERCEL_ENV || "production";
if (env !== "production") {
  console.log("🧹 Non-production deploy detected — cleaning old test data for this device_id");
  await supabase.from("user_data").delete().eq("device_id", deviceId);
}

const { error } = await supabase
  .from("user_data")
  .upsert(
    {
      device_id: deviceId,
      blob: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" }
  );

if (error) throw error;

      toast.success("Synced to cloud", {
        icon: <img src="/upload.svg" alt="" className="w-4 h-4" />,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #ff8c00",
          boxShadow: "0 0 15px rgba(255,140,0,0.3)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
      });
    } catch (e) {
      console.error(e);
      toast.error("Cloud save failed", {
        icon: <img src="/upload.svg" alt="" className="w-4 h-4 opacity-70" />,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #ff4d4d",
          boxShadow: "0 0 15px rgba(255,77,77,0.3)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
      });
    }
  }

  async function loadFromCloud() {
    try {
      const deviceId = getDeviceId();
      if (!deviceId) throw new Error("No device id");

      const { data: rows, error } = await supabase
        .from("user_data")
        .select("blob")
        .eq("device_id", deviceId)
        .limit(1);

      if (error) throw error;

      const row = rows?.[0];
      if (!row?.blob) {
        toast("No cloud data found", {
          icon: <img src="/download.svg" alt="" className="w-4 h-4" />,
          style: {
            background: "#141414",
            color: "#fff",
            border: "1px solid #888",
            boxShadow: "0 0 15px rgba(255,255,255,0.15)",
            fontWeight: 600,
            backdropFilter: "blur(8px)",
            opacity: 0.95,
          },
        });
        return;
      }

      const {
        tabs: T,
        data: D,
        snapshots: S,
        settings: ST,
        lastUpdatedAt: LU,
      } = row.blob;

      setTabs(T || []);
      setData(D || {});
      setSnapshots(S || {});
      setSettings(ST || settings);
      setLastUpdatedAt(LU || null);

      localStorage.setItem("cs2-tabs", JSON.stringify(T || []));
      localStorage.setItem("cs2-data", JSON.stringify(D || {}));
      localStorage.setItem("cs2-snapshots", JSON.stringify(S || {}));
      localStorage.setItem("cs2-settings", JSON.stringify(ST || settings));
      if (LU) localStorage.setItem("cs2-lastUpdatedAt", LU);

      toast.success("Loaded from cloud", {
        icon: <img src="/download.svg" alt="" className="w-4 h-4" />,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #ff8c00",
          boxShadow: "0 0 15px rgba(255,140,0,0.3)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
      });
    } catch (e) {
      console.error(e);
      toast.error("Cloud load failed", {
        icon: <img src="/download.svg" alt="" className="w-4 h-4 opacity-70" />,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #ff4d4d",
          boxShadow: "0 0 15px rgba(255,77,77,0.3)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
      });
    }
  }

  /* ------------------------------ Tabs & Rows ------------------------------- */
  const addTab = () => {
    openModal("addTab");
  };

  const removeTab = (tab) => {
    const tabName = getTabName(tab);
    if (tabName === "Dashboard") return;
    if (!confirm(`Delete tab "${tabName}"?`)) return;

    const nextTabs = tabs.filter((t) => getTabName(t) !== tabName);
    const nextData = { ...data };
    delete nextData[tabName];
    setTabs(nextTabs);
    setData(nextData);
    setActiveTab("Dashboard");
  };

  const addFolder = () => {
    openModal("addFolder");
    if (!name || tabs.find((t) => typeof t === "object" && t.folder === name))
      return;
    setTabs([...tabs, { folder: name, tabs: [], open: true }]);
  };

const addTabToFolder = (folderName) => {
  openModal("addTab", null, folderName);
};

  const toggleFolder = (folderName) =>
    setTabs((prev) =>
      prev.map((t) =>
        typeof t === "object"
          ? { ...t, open: t.folder === folderName ? !t.open : false }
          : t
      )
    );

  const removeSubTab = (folderName, subTab) => {
    const subName = getTabName(subTab);
    if (!confirm(`Delete tab "${subName}" from "${folderName}"?`)) return;

    setTabs((prev) =>
      prev.map((t) => {
        if (typeof t === "object" && t.folder === folderName) {
          return { ...t, tabs: t.tabs.filter((n) => getTabName(n) !== subName) };
        }
        return t;
      })
    );

    setData((prev) => {
      const next = { ...prev };
      delete next[subName];
      return next;
    });

    setActiveTab((curr) => (curr === subName ? "Dashboard" : curr));
  };

  const removeTabOrFolder = (target) => {
    if (typeof target === "string" || target.name) {
      removeTab(target);
      return;
    }

    if (target.tabs && target.tabs.length > 0) {
      alert(
        `⚠️ You must delete or move all tabs inside "${target.folder}" before deleting it.`
      );
      return;
    }

    if (!confirm(`Delete empty folder "${target.folder}"?`)) return;

    setTabs((prev) => prev.filter((t) => t.folder !== target.folder));
  };

  /* --------------------------- Totals per tab ------------------------------- */
  const allTabNames = useMemo(() => {
    const names = [];
    for (const t of tabs) {
      if (typeof t === "string") {
        if (t !== "Dashboard") names.push(t);
        continue;
      }
      if (t.folder) {
        for (const sub of t.tabs || []) names.push(getTabName(sub));
      } else {
        const nm = getTabName(t);
        if (nm && nm !== "Dashboard") names.push(nm);
      }
    }
    return names;
  }, [tabs]);

  useEffect(() => {
    const tmap = {};
    for (const name of allTabNames) {
      const rows = data[name] || [];
      tmap[name] = rows.reduce(
        (sum, r) => sum + Number(r.qty || 0) * Number(r.price || 0),
        0
      );
    }
    setTotals(tmap);
  }, [data, allTabNames]);

  const grandTotal = useMemo(
    () => Object.values(totals).reduce((a, b) => a + b, 0),
    [totals]
  );

  /* ---------------------------- Daily snapshots ----------------------------- */
  // We persist REAL snapshots as keys: "dashboard_YYYY-MM-DD"
  // UI ignores simulated snapshots (sim: true)
  useEffect(() => {
    const checkSnapshot = async () => {
      const key = todayKeyLisbon();
      const passed = hasPassedLisbonHHMM(settings.snapshotTimeHHMM);

      // prevent duplicate for TODAY
      const alreadyTaken = Boolean(snapshots[`dashboard_${key}`]);

      if (!passed || alreadyTaken) return;

      // wait for running refresh to finish
      while (isRefreshingRef.current) {
        await new Promise((r) => setTimeout(r, 3000));
      }

      const newSnaps = { ...snapshots };
      newSnaps[`dashboard_${key}`] = {
        value: grandTotal,
        dateKey: key,
        ts: Date.now(),
        sim: false,
      };

      // (Optional) per-tab snapshots could be added similarly:
      // for (const name of allTabNames) {
      //   newSnaps[`${name}_${key}`] = {
      //     value: totals[name] || 0,
      //     dateKey: key,
      //     ts: Date.now(),
      //     sim: false,
      //   };
      // }

      setSnapshots(newSnaps);
      localStorage.setItem("cs2-snapshots", JSON.stringify(newSnaps));

      toast.success(`Snapshot saved for ${key}`, {
        icon: null,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #ff8c00",
          boxShadow: "0 0 15px rgba(255,140,0,0.3)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
        duration: 4000,
      });
    };

    const interval = setInterval(checkSnapshot, 60 * 1000); // check once/minute
    return () => clearInterval(interval);
  }, [grandTotal, snapshots, settings.snapshotTimeHHMM /* deps ok */]);

  /* --------------------------- Auto refresh system -------------------------- */
  useEffect(() => {
    if (!tabs.length) return;
    if (refreshTimerRef.current?.running) {
      console.log("⚙️ Refresh loop already running, skipping new instance");
      return;
    }

    refreshTimerRef.current = { running: true };
    let stop = false;

    const spacingMs = 3000; // 3s between item requests
    const intervalMin = settings.refreshMinutes || 30;
    const intervalMs = intervalMin * 60 * 1000;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const namesFromSavedTabs = (savedTabs) => {
      const out = [];
      for (const t of savedTabs || []) {
        if (typeof t === "string") {
          if (t !== "Dashboard") out.push(t);
          continue;
        }
        if (t.folder) {
          for (const sub of t.tabs || []) out.push(getTabName(sub));
        } else {
          const nm = getTabName(t);
          if (nm && nm !== "Dashboard") out.push(nm);
        }
      }
      return out;
    };

    const runLoop = async () => {
      while (!stop) {
        const lastRun = Number(localStorage.getItem("cs2-lastFullRefreshAt") || 0);
        const sinceLast = Date.now() - lastRun;

        if (sinceLast < intervalMs) {
          const wait = intervalMs - sinceLast;
          const waitMin = (wait / 60000).toFixed(1);
          console.log(`⏸ Skipping refresh — ${waitMin} min until next cycle`);
          await sleep(60000); // recheck every minute
          continue;
        }

        isRefreshingRef.current = true;
        setIsLoading(true);
        setApiStatus("stable");
        console.log(`🔄 Starting full refresh cycle (${intervalMin} min interval)`);

        // Always get fresh state each loop iteration
        const liveTabs = JSON.parse(localStorage.getItem("cs2-tabs") || "[]");
        const liveData = JSON.parse(localStorage.getItem("cs2-data") || "{}");
        const names = namesFromSavedTabs(liveTabs);

        for (const tabName of names) {
          const rows = liveData[tabName] || [];
          if (!rows.length) continue;

          console.log(`▶ Fetching tab: ${tabName}`);
          const updated = [...rows];

          for (let i = 0; i < rows.length; i++) {
            if (stop) return;
            const row = rows[i];
            const name = row?.name?.trim();
            if (!name) continue;

            try {
              const res = await fetch(
                `/api/price?name=${encodeURIComponent(name)}`
              );

              if (res.status === 429) {
                console.warn("⚠️ Steam API rate limited (429)");
                setApiStatus("429");
                await sleep(30000); // 30s cooldown before retry
                continue;
              }

              if (!res.ok) {
                console.warn("❌ Steam API failed with status", res.status);
                setApiStatus("down");
                continue;
              }

              const json = await res.json();

              if (json.ok && json.lowest != null) {
                const newPrice = Number(json.lowest);
                const oldPrice = Number(row.price || 0);
                const base = row.prevPrice || oldPrice || newPrice;
                let fluctPct = 0;

                if (base > 0) {
                  fluctPct = ((newPrice - base) / base) * 100;
                  if (fluctPct > 300) fluctPct = 300;
                  if (fluctPct < -300) fluctPct = -300;
                }

                updated[i] = {
                  ...row,
                  prevPrice: base > 0 ? base : newPrice,
                  price: newPrice,
                  fluctPct,
                };
              }
            } catch (err) {
              console.warn("❌ Failed to fetch", name, err);
            }

            // eslint-disable-next-line no-await-in-loop
            await sleep(spacingMs);
          }

          // update both React and localStorage data in one go
          setData((prev) => {
            const next = { ...prev, [tabName]: updated };
            localStorage.setItem("cs2-data", JSON.stringify(next));
            return next;
          });

          console.log(`✅ Finished tab: ${tabName}`);
        }

        setLastUpdatedAt(formatLisbonHM());
        localStorage.setItem("cs2-lastFullRefreshAt", Date.now());
        console.log(`⏸ Waiting ${intervalMin} min before next refresh cycle…`);
        isRefreshingRef.current = false;
        setIsLoading(false);

        // Auto cloud save after each successful refresh
        await saveToCloud();

        if (apiStatus === "stable") console.log("✅ Steam API stable");
        await sleep(intervalMs);
      }
    };

    runLoop();

    return () => {
      stop = true;
      refreshTimerRef.current.running = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length, settings.refreshMinutes]);

  /* ---------------------------- Settings Panel ------------------------------ */
  function BehaviorSettings({ settings, setSettings }) {
    const [snapshotTime, setSnapshotTime] = useState(settings.snapshotTimeHHMM);
    const [refreshMinutes, setRefreshMinutes] = useState(
      settings.refreshMinutes
    );

    const handleSave = () => {
      setSettings((prev) => ({
        ...prev,
        snapshotTimeHHMM: snapshotTime,
        refreshMinutes: Number(refreshMinutes),
      }));

      toast.success("Settings saved successfully", {
        icon: <img src="/save.svg" alt="" className="w-4 h-4" />,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #ff8c00",
          boxShadow: "0 0 15px rgba(255,140,0,0.25)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
      });

      // Ensure the new refresh interval is applied immediately
      setTimeout(() => {
        location.reload();
      }, 1200);
    };

    useEffect(() => {
      // keep your toast test hooks
      window.toast = (msg) => {
        if (msg === "settingsSaved") {
          toast.success("Settings saved successfully", {
            icon: <img src="/save.svg" alt="" className="w-4 h-4" />,
            style: {
              background: "#141414",
              color: "#fff",
              border: "1px solid #ff8c00",
              boxShadow: "0 0 15px rgba(255,140,0,0.3)",
              fontWeight: 600,
              backdropFilter: "blur(8px)",
              opacity: 0.95,
            },
          });
        }
        if (msg === "cloudSaved") {
          toast.success("Synced to cloud", {
            icon: <img src="/upload.svg" alt="" className="w-4 h-4" />,
            style: {
              background: "#141414",
              color: "#fff",
              border: "1px solid #ff8c00",
              boxShadow: "0 0 15px rgba(255,140,0,0.3)",
              fontWeight: 600,
              backdropFilter: "blur(8px)",
              opacity: 0.95,
            },
          });
        }
        if (msg === "cloudLoaded") {
          toast.success("Loaded from cloud", {
            icon: <img src="/download.svg" alt="" className="w-4 h-4" />,
            style: {
              background: "#141414",
              color: "#fff",
              border: "1px solid #ff8c00",
              boxShadow: "0 0 15px rgba(255,140,0,0.3)",
              fontWeight: 600,
              backdropFilter: "blur(8px)",
              opacity: 0.95,
            },
          });
        }
        if (msg === "cloudError") {
          toast.error("Cloud sync failed", {
            icon: <img src="/upload.svg" alt="" className="w-4 h-4 opacity-70" />,
            style: {
              background: "#141414",
              color: "#fff",
              border: "1px solid #ff4d4d",
              boxShadow: "0 0 15px rgba(255,77,77,0.3)",
              fontWeight: 600,
              backdropFilter: "blur(8px)",
              opacity: 0.95,
            },
          });
        }
        if (msg === "apiStable") {
          toast.success("Steam API stable", {
            icon: null,
            style: {
              background: "#141414",
              color: "#fff",
              border: "1px solid #00cc66",
              boxShadow: "0 0 15px rgba(0,204,102,0.3)",
              fontWeight: 600,
              backdropFilter: "blur(8px)",
              opacity: 0.95,
            },
          });
        }
        if (msg === "api429") {
          toast("Steam API rate limited", {
            icon: null,
            style: {
              background: "#141414",
              color: "#fff",
              border: "1px solid #ffcc00",
              boxShadow: "0 0 15px rgba(255,204,0,0.3)",
              fontWeight: 600,
              backdropFilter: "blur(8px)",
              opacity: 0.95,
            },
          });
        }
        if (msg === "apiDown") {
          toast.error("Steam API offline", {
            icon: null,
            style: {
              background: "#141414",
              color: "#fff",
              border: "1px solid #ff4d4d",
              boxShadow: "0 0 15px rgba(255,77,77,0.3)",
              fontWeight: 600,
              backdropFilter: "blur(8px)",
              opacity: 0.95,
            },
          });
        }
      };
    }, []);

    return (
      <section className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
        <h2 className="text-xl font-semibold mb-4">Behavior</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Snapshot time (WEST)
            </label>
            <input
              type="time"
              value={snapshotTime}
              onChange={(e) => setSnapshotTime(e.target.value)}
              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Auto refresh (min)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={refreshMinutes}
              onChange={(e) => setRefreshMinutes(e.target.value)}
              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
            />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={handleSave}
            className="bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-orange-500/40 transition-all text-sm"
          >
            Save Changes
          </button>
        </div>
      </section>
    );
  }

/* ----------------------------- Snap simulator ----------------------------- */
// Visual simulator — temporarily overrides dashboard % display
useEffect(() => {
  window.snapSim = (mode = "positive") => {
    const dashEl = document.querySelector("#dash-diff");
    if (!dashEl) {
      console.warn("⚠️ Dashboard percentage element not found.");
      return;
    }

    let text = "";
    let colorClass = "";

    if (mode === "positive") {
      const fakePct = (Math.random() * 10 + 0.5).toFixed(2);
      text = `It went up by +${fakePct}%.`;
      colorClass = "text-green-400 drop-shadow-[0_0_6px_rgba(0,255,0,0.2)]";
      console.log(`📈 SnapSim → ${text}`);
    } else if (mode === "negative") {
      const fakePct = (Math.random() * 10 + 0.5).toFixed(2);
      text = `It went down by -${fakePct}%.`;
      colorClass = "text-red-400 drop-shadow-[0_0_6px_rgba(255,0,0,0.2)]";
      console.log(`📉 SnapSim → ${text}`);
    } else if (mode === "zero") {
      text = "It did not change.";
      colorClass = "text-neutral-300 drop-shadow-[0_0_6px_rgba(160,160,160,0.25)]";
      console.log("⏸ SnapSim → It did not change.");
    } else {
      console.warn("Usage: snapSim('positive' | 'negative' | 'zero')");
      return;
    }

    // Show unified toast message
    toast("Displaying random generated values", {
      icon: null,
      style: {
        background: "#141414",
        color: "#fff",
        border: "1px solid #ff8c00",
        boxShadow: "0 0 15px rgba(255,140,0,0.25)",
        fontWeight: 600,
        backdropFilter: "blur(8px)",
        opacity: 0.95,
      },
      duration: 5000,
    });

    // temporarily override the dashboard text
    const oldText = dashEl.textContent;
    const oldClass = dashEl.className;
    dashEl.textContent = text;
    dashEl.className = colorClass;

    // restore after 5 seconds
    setTimeout(() => {
      dashEl.textContent = oldText;
      dashEl.className = oldClass;
    }, 5000);
  };
}, []);

/* ----------------------------- API simulator ----------------------------- */
useEffect(() => {
  window.apiSim = (state) => {
    if (!["stable", "429", "down"].includes(state)) {
      console.warn("Usage: apiSim('stable' | '429' | 'down')");
      return;
    }

    // Update header display color
    setApiStatus(state);
    console.log(`🧪 Simulated API state: ${state}`);

    // Show visual toast feedback
    if (state === "stable") {
      toast.success("Steam API stable", {
        icon: null,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #00cc66",
          boxShadow: "0 0 15px rgba(0,204,102,0.3)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
      });
    } else if (state === "429") {
      toast("Steam API rate limited", {
        icon: null,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #ffcc00",
          boxShadow: "0 0 15px rgba(255,204,0,0.3)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
      });
    } else if (state === "down") {
      toast.error("Steam API offline", {
        icon: null,
        style: {
          background: "#141414",
          color: "#fff",
          border: "1px solid #ff4d4d",
          boxShadow: "0 0 15px rgba(255,77,77,0.3)",
          fontWeight: 600,
          backdropFilter: "blur(8px)",
          opacity: 0.95,
        },
      });
    }
  };
}, [setApiStatus]);

  /* --------------------------- Color menu helpers --------------------------- */
  const openColorMenuAtButton = (tab, i, e) => {
    const trigger = e.currentTarget.getBoundingClientRect();
    const gap = 4;

    setColorMenu({
      open: true,
      tab,
      index: i,
      x: trigger.left,
      y: trigger.bottom + gap,
      openAbove: false,
    });

    requestAnimationFrame(() => {
      const menuEl = document.getElementById("color-menu-portal");
      if (!menuEl) return;

      const menuHeight = menuEl.offsetHeight || 200;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - trigger.bottom;
      const spaceAbove = trigger.top;

      let y = trigger.bottom + gap;
      let openAbove = false;

      if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
        y = trigger.top - menuHeight - gap;
        openAbove = true;
      }

      setColorMenu((prev) => ({
        ...prev,
        y,
        openAbove,
      }));
    });
  };

  const closeColorMenu = () =>
    setColorMenu({ open: false, tab: null, index: null, x: 0, y: 0 });

  useEffect(() => {
    if (!colorMenu.open) return;

    const onBodyClick = (e) => {
      const menuEl = document.getElementById("color-menu-portal");
      if (!menuEl) return;
      if (menuEl.contains(e.target)) return;
      closeColorMenu();
    };

    const onScroll = () => closeColorMenu();
    const onResize = () => closeColorMenu();

    const t = setTimeout(() => {
      document.body.addEventListener("click", onBodyClick);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
    }, 50);

    return () => {
      clearTimeout(t);
      document.body.removeEventListener("click", onBodyClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [colorMenu.open]);

  /* ----------------------- Close folders on outside click ------------------- */
  useEffect(() => {
    const handleBodyClick = (e) => {
      if (e.target.closest("[data-folder]") || e.target.closest("[data-settings]"))
        return;

      setTabs((prev) =>
        prev.map((t) =>
          typeof t === "object" && t.open ? { ...t, open: false } : t
        )
      );
    };

    document.body.addEventListener("click", handleBodyClick);
    return () => document.body.removeEventListener("click", handleBodyClick);
  }, []);

  /* --------------------------- Snapshot % for UI ---------------------------- */
  // Collect only REAL dashboard snapshots (sim: false)
  const dashHistory = Object.entries(snapshots)
    .filter(
      ([key, s]) =>
        key.startsWith("dashboard_") &&
        s &&
        s.value != null &&
        s.dateKey &&
        !s.sim
    )
    .map(([_, s]) => s)
    .sort((a, b) => b.ts - a.ts); // newest first

  const currentSnap = dashHistory[0];
  const prevSnap = dashHistory[1];

  // Always show % relative to the previous real snapshot
  const dashPct =
    currentSnap && prevSnap && prevSnap.value > 0
      ? ((currentSnap.value - prevSnap.value) / prevSnap.value) * 100
      : 0;

  /* --------------------------------- Render -------------------------------- */
  return (
    <div className="min-h-screen text-orange-50 font-sans bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a]">
      {/* Header */}
      <header className="sticky top-0 z-50 px-6 pt-4 pb-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.25)] supports-[backdrop-filter]:backdrop-blur-md">
        <div className="grid grid-cols-3 items-center">
          {/* LEFT: Logo + info */}
          <div className="justify-self-start flex flex-col">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="CS2 Prices Logo"
                className="w-[40px] h-[40px] object-contain"
              />
              <h1 className="text-2xl font-extrabold text-orange-400 tracking-wide">
                CS2 Prices
              </h1>
            </div>

            <div className="mt-1 text-xs text-neutral-400">
              {lastUpdatedAt
                ? `Last updated at ${lastUpdatedAt} WEST`
                : "Waiting for first auto refresh…"}
            </div>

            <div className="h-[18px] flex items-center gap-2 mt-1 text-xs text-neutral-400 transition-all duration-500">
              {isLoading ? (
                <div className="flex items-center gap-1 text-orange-400">
                  <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Fetching prices…</span>
                </div>
              ) : (
                <div
                  className={`flex items-center gap-1 ${
                    apiStatus === "stable"
                      ? "text-green-400"
                      : apiStatus === "429"
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiStatus === "stable"
                        ? "bg-green-500"
                        : apiStatus === "429"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  ></div>
                  <span>
                    {apiStatus === "stable"
                      ? "Steam API stable"
                      : apiStatus === "429"
                      ? "Rate limited"
                      : "Steam offline"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Dashboard button */}
          <div className="justify-self-center">
            <button
              onClick={() => {
                setActiveTab("Dashboard");
                setShowSettings(false);
              }}
              className={`group relative px-8 py-2.5 text-base font-extrabold tracking-wide rounded-full transition-all duration-300
          ${
            activeTab === "Dashboard"
              ? "text-white bg-gradient-to-r from-orange-600 to-orange-500 shadow-[0_0_20px_rgba(255,165,0,0.4)] scale-[1.05]"
              : "text-neutral-300 bg-neutral-800 hover:bg-neutral-700 hover:text-orange-400 hover:scale-[1.03] hover:shadow-[0_0_12px_rgba(255,165,0,0.3)]"
          }`}
            >
              <span className="relative z-10">Dashboard</span>
              {activeTab === "Dashboard" && (
                <span className="absolute inset-0 rounded-full bg-orange-500/20 blur-xl animate-pulse" />
              )}
            </button>
          </div>

          {/* RIGHT: Add + Folder + Settings */}
          <div className="justify-self-end flex items-center gap-3">
            <button
              onClick={addTab}
              className="bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-orange-500/40 transition-all text-sm"
              title="Add Tab"
            >
              ＋ Add Tab
            </button>

            <button
              onClick={addFolder}
              className="bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-orange-500/40 transition-all text-sm"
              title="Add Folder"
            >
              ＋ Add Folder
            </button>

            <button
              onClick={() => {
                setShowSettings((s) => !s);
                setActiveTab("Dashboard");
              }}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-all border border-neutral-700 hover:border-orange-500 flex items-center justify-center"
              title="Settings"
            >
              <img
                src="/settings.svg"
                alt="Settings"
                className="w-5 h-5 opacity-80 hover:opacity-100 transition-all"
              />
            </button>
          </div>
        </div>
      </header>

      {/* Tab strip */}
      {!showSettings && (
        <nav className="sticky top-[112px] z-40 flex flex-wrap items-center gap-2 px-6 py-3 bg-neutral-900/75 border-b border-neutral-800 backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
{tabs.map((t, idx) => {
  // Folder
  if (typeof t === "object" && t.folder) {
    return (
      <div key={`folder-${t.folder}-${idx}`} className="relative" data-folder>
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (e.ctrlKey) {
              openModal("editFolder", { name: t.folder });
            } else {
              toggleFolder(t.folder);
            }
          }}
          className={`flex items-center px-3 py-2 rounded-lg cursor-pointer font-semibold tracking-wide transition-all duration-300 ${
            t.open
              ? "bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-[0_0_15px_rgba(255,140,0,0.4)] scale-[1.03]"
              : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-orange-400"
          }`}
        >
          <span className="mr-1 font-medium">{t.folder}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-3 w-3 transition-transform ${t.open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {t.open && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-full left-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-lg z-20 inline-block"
            style={{
              width: "max-content",
              whiteSpace: "nowrap",
              maxWidth: "95vw",
            }}
          >
            <div className="flex flex-col py-1">
              {(t.tabs || []).map((sub, i) => {
                const subName = getTabName(sub);
                const subImg = typeof sub === "object" ? sub.image : null;
                const active = activeTab === subName;

                return (
                  <div
                    key={`sub-${subName}-${i}`}
                    onClick={(e) => {
                      if (e.ctrlKey) {
                        openModal("editTab", { name: subName, image: sub.image || "" });
                      } else {
                        setActiveTab(subName);
                      }
                    }}
                    className={`flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer ${
                      active
                        ? "bg-gradient-to-r from-orange-600 to-orange-500 text-white"
                        : "text-neutral-300 hover:bg-neutral-800 hover:text-orange-400"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {subImg && (
                        <img
                          src={subImg}
                          alt=""
                          className="w-[28px] h-[28px] object-contain mr-2"
                        />
                      )}
                      <span
                        className="block break-words leading-tight"
                        style={{
                          whiteSpace: "normal",
                          lineClamp: 2,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {subName}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSubTab(t.folder, sub);
                      }}
                      className="ml-2 text-xs text-neutral-400 hover:text-red-400 transition hover:scale-110"
                      title="Delete tab"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  addTabToFolder(t.folder);
                }}
                className="text-left w-full px-3 py-1.5 text-sm text-orange-400 hover:bg-neutral-800 rounded-b-lg"
              >
                ＋ Add Tab
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeTabOrFolder(t);
                }}
                className="flex items-center gap-2 text-left w-full px-3 py-1.5 text-sm text-red-400 hover:bg-neutral-800 rounded-b-lg border-t border-neutral-800"
              >
                <img src="/trash.svg" alt="Delete" className="w-4 h-4" />
                <span>Delete Folder</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

            // Normal tab
            const name = getTabName(t);
            if (name === "Dashboard") return null;
            const img = typeof t === "object" ? t.image : null;
            const isActive = activeTab === name;

            return (
              <div
                key={`tab-${name}-${idx}`}
                onClick={(e) => {
  if (e.ctrlKey) {
    if (typeof t === "object" && t.folder)
      openModal("editFolder", { name: t.folder });
    else openModal("editTab", { name: getTabName(t), image: t.image || "" });
  } else {
    setActiveTab(name);
  }
}}
                className={`relative px-3 py-2 rounded-lg cursor-pointer flex items-center gap-2 font-semibold tracking-wide transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-[0_0_15px_rgba(255,140,0,0.4)] scale-[1.03]"
                    : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-orange-400"
                }`}
              >
                {img && (
                  <img
                    src={img}
                    alt=""
                    className="w-[28px] h-[28px] object-contain mr-2"
                  />
                )}
                <span>{name}</span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(t);
                  }}
                  className="ml-2 text-xs text-neutral-300 hover:text-red-400"
                  title="Delete tab"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </nav>
      )}

      {/* Main */}
      <main className="p-6">
        {/* Dashboard */}
        {activeTab === "Dashboard" && !showSettings && (
          <div className="space-y-6">
            <div className="bg-neutral-900/70 border border-orange-900/60 rounded-xl p-5 shadow-[0_0_25px_rgba(255,140,0,0.1)] transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm text-neutral-400">Inventory Value</div>
                  <div className="text-3xl font-extrabold text-orange-400">
                    {fmtMoney(grandTotal)}€
                  </div>
                </div>

                {/* Only the % text, slightly larger than base */}
                <div className="text-[22px] font-medium tracking-tight">
                  <span
                     id="dash-diff"  // 👈 this ID is required for snapSim()
                     className={
                      dashPct > 0
                        ? "text-green-400 drop-shadow-[0_0_6px_rgba(0,255,0,0.2)]"
                        : dashPct < 0
                        ? "text-red-400 drop-shadow-[0_0_6px_rgba(255,0,0,0.2)]"
                        : "text-neutral-300"
                    }
                  >
                     {dashPct > 0
                       ? `It went up by +${Math.abs(dashPct).toFixed(2)}%.`
                       : dashPct < 0
                       ? `It went down by -${Math.abs(dashPct).toFixed(2)}%.`
                       : "It did not change."}
                  </span>
                </div>
              </div>
            </div>

            {/* Totals by tab */}
            <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 shadow">
              {tabs.map((t, idx) => {
                // normal tab (string)
                if (typeof t === "string") {
                  if (t === "Dashboard") return null;
                  return (
                    <div
                      key={`total-${t}-${idx}`}
                      className="flex justify-between items-center py-2 border-b border-neutral-800 last:border-0"
                    >
                      <div className="flex items-center gap-2">
                        {t.image && (
                          <img
                            src={t.image}
                            alt=""
                            className="w-[28px] h-[28px] object-contain"
                          />
                        )}
                        <span>{t}</span>
                      </div>
                      <span className="text-green-400">
                        {fmtMoney(totals[t] || 0)}€
                      </span>
                    </div>
                  );
                }

                // folder type
                if (t.folder) {
                  return (
                    <div key={`total-folder-${t.folder}-${idx}`} className="mb-2">
                      <div className="text-neutral-300 font-semibold mb-1">
                        {t.folder}
                      </div>
                      {(t.tabs || []).map((sub, i) => {
                        const subName = getTabName(sub);
                        const subImg =
                          typeof sub === "object" ? sub.image : null;
                        return (
                          <div
                            key={`total-sub-${subName}-${i}`}
                            className="flex justify-between items-center py-1 pl-4 border-b border-neutral-800 last:border-0"
                          >
                            <div className="flex items-center gap-2">
                              {subImg && (
                                <img
                                  src={subImg}
                                  alt=""
                                  className="w-[28px] h-[28px] object-contain"
                                />
                              )}
                              <span>{subName}</span>
                            </div>
                            <span className="text-green-400">
                              {fmtMoney(totals[subName] || 0)}€
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                // fallback (object tab with image)
                const name = getTabName(t);
                const img = typeof t === "object" ? t.image : null;
                return (
                  <div
                    key={`total-${name}-${idx}`}
                    className="flex justify-between items-center py-2 border-b border-neutral-800 last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      {img && (
                        <img
                          src={img}
                          alt=""
                          className="w-[28px] h-[28px] object-contain"
                        />
                      )}
                      <span>{name}</span>
                    </div>
                    <span className="text-green-400">
                      {fmtMoney(totals[name] || 0)}€
                    </span>
                  </div>
                );
              })}

              <div className="flex justify-between mt-4 text-lg font-bold">
                <span>Total Inventory</span>
                <span className="text-orange-400">{fmtMoney(grandTotal)}€</span>
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        {showSettings && (
          <div className="max-w-3xl mx-auto space-y-6" data-settings>
            {/* Rarity Colors */}
            <section className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Rarity Colors</h2>
              <div className="space-y-3">
                {settings.colors.map((c, idx) => (
                  <div
                    key={idx}
                    className="grid md:grid-cols-[1fr,160px,80px,auto] gap-3 items-center bg-neutral-800/50 rounded-lg p-3"
                  >
                    <input
                      value={c.name}
                      onChange={(e) =>
                        setSettings((p) => {
                          const next = [...p.colors];
                          next[idx].name = e.target.value;
                          return { ...p, colors: next };
                        })
                      }
                      className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
                    />
                    <input
                      value={c.hex}
                      onChange={(e) =>
                        setSettings((p) => {
                          const next = [...p.colors];
                          next[idx].hex = e.target.value;
                          return { ...p, colors: next };
                        })
                      }
                      className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
                    />
                    <div
                      className="h-6 w-10 rounded border border-neutral-700"
                      style={{ backgroundColor: c.hex }}
                    />
                    <button
                      onClick={() =>
                        setSettings((p) => {
                          const next = [...p.colors];
                          next.splice(idx, 1);
                          return { ...p, colors: next };
                        })
                      }
                      className="text-red-400 hover:text-red-500 text-sm"
                    >
                      <img src="/trash.svg" alt="Delete" className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() =>
                  setSettings((p) => ({
                    ...p,
                    colors: [...p.colors, { name: "New", hex: "#ffffff" }],
                  }))
                }
                className="mt-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-orange-500/40 transition-all text-sm"
              >
                ＋ Add Color
              </button>
            </section>

            {/* Behavior Settings */}
            <BehaviorSettings settings={settings} setSettings={setSettings} />

            {/* Cloud Sync Controls */}
            <section className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Cloud Sync</h2>
              <p className="text-sm text-neutral-400 mb-3">
                Your data automatically saves to Supabase after every price
                refresh. You can also manually load or save your current data
                below.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={loadFromCloud}
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-orange-500 transition-all"
                >
                  Load Cloud
                </button>

                <button
                  onClick={saveToCloud}
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold shadow-md hover:shadow-orange-500/40 transition-all"
                >
                  Save Cloud
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Active Tab Table */}
        {!showSettings && activeTab !== "Dashboard" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">{activeTab}</h2>
              <button
                onClick={() => {
                  if (activeTab !== "Dashboard") {
                    const rows = data[activeTab] || [];
                    setData({
                      ...data,
                      [activeTab]: [
                        ...rows,
                        {
                          name: "",
                          qty: 1,
                          price: 0,
                          colorHex: "",
                          locked: false,
                        },
                      ],
                    });
                  }
                }}
                className="bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold px-4 py-2 rounded-lg shadow-md hover:shadow-orange-500/40 transition-all"
              >
                ＋ Add Item
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-900 text-orange-400 font-bold uppercase tracking-wide">
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-center">Price (€)</th>
                    <th className="p-2 text-center">Fluctuation %</th>
                    <th className="p-2 text-center">Total (€)</th>
                    <th className="p-2 text-center">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {(data[activeTab] || []).map((row, i) => {
                    const total = (row.price || 0) * (row.qty || 0);
                    const tint = hexToRgba(row.colorHex || "", 0.5);

                    let fluctDisplay = "—";
                    let color = "text-neutral-400";
                    if (typeof row.fluctPct === "number") {
                      color =
                        row.fluctPct > 0
                          ? "text-green-400"
                          : row.fluctPct < 0
                          ? "text-red-400"
                          : "text-neutral-300";
                      const signed =
                        row.fluctPct > 0
                          ? `+${row.fluctPct.toFixed(2)}`
                          : row.fluctPct.toFixed(2);
                      fluctDisplay = `${signed} %`;
                    }

                    return (
                      <tr
                        key={i}
                        style={tint ? { backgroundColor: tint } : {}}
                        className="border-b border-neutral-800 hover:bg-neutral-800/40 transition"
                      >
                        <td className="p-2 overflow-visible">
                          <div className="flex items-center gap-2 flex-nowrap overflow-visible">
                            {/* Color picker button */}
                            <button
                              type="button"
                              onClick={(e) =>
                                openColorMenuAtButton(activeTab, i, e)
                              }
                              className="h-4 w-4 rounded border border-neutral-700 shrink-0"
                              style={{
                                backgroundColor: row.colorHex || "transparent",
                              }}
                              title="Set color"
                            />

                            {/* Item name input */}
                            <input
                              value={row.name || ""}
                              disabled={row.locked}
                              onChange={(e) => {
                                const rows = [...(data[activeTab] || [])];
                                rows[i].name = e.target.value;
                                setData({ ...data, [activeTab]: rows });
                              }}
                              placeholder="Item name"
                              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-orange-500 outline-none flex-1"
                            />

                            {/* Steam Market icon (link) */}
                            {row.name && row.name.trim() !== "" && (
                              <a
                                href={`https://steamcommunity.com/market/listings/730/${encodeURIComponent(
                                  row.name.trim()
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center text-orange-400 hover:scale-110 transition-transform"
                                title="Open on Steam Market"
                              >
                                <img
                                  src="/link.svg"
                                  alt="Steam Market link"
                                  className="w-4 h-4 opacity-80 hover:opacity-100 hover:drop-shadow-[0_0_6px_#ff8c00] transition-all"
                                />
                              </a>
                            )}
                          </div>
                        </td>

                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => {
                                const rows = [...(data[activeTab] || [])];
                                rows[i].qty = Math.max(
                                  0,
                                  (rows[i].qty || 0) - 1
                                );
                                setData({ ...data, [activeTab]: rows });
                              }}
                              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
                            >
                              −
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={row.qty ?? 1}
                              onChange={(e) => {
                                if (row.locked) return;
                                const val = e.target.value.replace(/\D/g, "");
                                const rows = [...(data[activeTab] || [])];
                                rows[i].qty = Number(val);
                                setData({ ...data, [activeTab]: rows });
                              }}
                              className="w-12 text-center bg-neutral-800 text-gray-100 rounded border border-neutral-700 focus:border-blue-600 outline-none"
                            />
                            <button
                              onClick={() => {
                                const rows = [...(data[activeTab] || [])];
                                rows[i].qty = (rows[i].qty || 0) + 1;
                                setData({ ...data, [activeTab]: rows });
                              }}
                              className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Price (€) */}
                        <td className="p-2 text-center font-bold text-black">
                          {fmtMoney(row.price || 0)}
                        </td>

                        {/* Fluctuation % */}
                        <td className={`p-2 text-center font-bold ${color}`}>
                          {fluctDisplay}
                        </td>

                        {/* Total (€) */}
                        <td className="p-2 text-center font-bold text-black">
                          {fmtMoney(total)}
                        </td>

                        <td className="p-2 text-center">
                          <button
                            onClick={() => {
                              const rows = [...(data[activeTab] || [])];
                              rows[i].locked = !rows[i].locked;
                              setData({ ...data, [activeTab]: rows });
                            }}
                            className="text-neutral-300 hover:text-orange-400"
                            title="Lock row"
                          >
                            {row.locked ? (
                              <img
                                src="/lock.svg"
                                alt="Locked"
                                className="w-4 h-4 opacity-80 hover:opacity-100 hover:drop-shadow-[0_0_6px_#ff8c00] transition-all"
                              />
                            ) : (
                              <img
                                src="/unlock.svg"
                                alt="Unlocked"
                                className="w-4 h-4 opacity-80 hover:opacity-100 hover:drop-shadow-[0_0_6px_#ff8c00] transition-all"
                              />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm("Delete this row?")) return;
                              const rows = [...(data[activeTab] || [])];
                              rows.splice(i, 1);
                              setData({ ...data, [activeTab]: rows });
                            }}
                            className="ml-3 text-red-400 hover:text-red-500"
                            title="Delete row"
                          >
                            <img
                              src="/trash.svg"
                              alt="Delete"
                              className="w-4 h-4 opacity-80 hover:opacity-100 hover:drop-shadow-[0_0_6px_#ff8c00] transition-all"
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Color picker menu portal */}
      {colorMenu.open && (
        <div
          id="color-menu-portal"
          className={`fixed z-50 transition-transform duration-150 ease-out transform ${
            colorMenu.openAbove
              ? "origin-bottom translate-y-1 animate-[appear-up_0.15s_ease-out]"
              : "origin-top -translate-y-1 animate-[appear-down_0.15s_ease-out]"
          }`}
          style={{
            top: colorMenu.y,
            left: colorMenu.x,
          }}
        >
          <div className="bg-neutral-900 border border-neutral-700 rounded-md shadow-lg p-2 min-w-[180px]">
            <div className="text-xs text-neutral-400 px-1 pb-1">
              Choose color
            </div>
            <button
              onClick={() => {
                const rows = [...(data[colorMenu.tab] || [])];
                if (!rows[colorMenu.index]) return;
                rows[colorMenu.index].colorHex = "";
                setData({ ...data, [colorMenu.tab]: rows });
                closeColorMenu();
              }}
              className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 text-sm"
            >
              <span className="h-3 w-3 rounded border border-neutral-600 bg-transparent" />
              None
            </button>

            {settings.colors.map((c) => (
              <button
                key={c.name + c.hex}
                onClick={() => {
                  const rows = [...(data[colorMenu.tab] || [])];
                  if (!rows[colorMenu.index]) return;
                  rows[colorMenu.index].colorHex = c.hex;
                  setData({ ...data, [colorMenu.tab]: rows });
                  closeColorMenu();
                }}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 text-sm"
              >
                <span
                  className="h-3 w-3 rounded border border-neutral-600"
                  style={{ backgroundColor: c.hex }}
                />
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

{/* Watermark */}
<Watermark />
   
   {/* Mini Modal System */}
{modal.open && (
  <MiniModal
    mode={modal.mode}
    initialData={modal.initialData}
    onClose={closeModal}
onConfirm={(values) => {
  const { name, image } = values;

   if (modal.mode === "addTab" || modal.mode === "addFolder") {
  const exists = tabs.some((t) =>
    typeof t === "object" ? t.folder === name : getTabName(t) === name
  );
  if (exists) {
    toast.error("Name already exists", {
      style: {
        icon: null,
        background: "#141414",
        color: "#fff",
        border: "1px solid #ff4d4d",
        fontWeight: 600,
      },
    });
    return;
  }
}

  // 🧩 Add Tab
  if (modal.mode === "addTab") {
    setTabs((prev) => {
      if (modal.parentFolder) {
        return prev.map((t) =>
          typeof t === "object" && t.folder === modal.parentFolder
            ? { ...t, tabs: [...t.tabs, { name, image }] }
            : t
        );
      }
      return [...prev, { name, image }];
    });
    setData((p) => ({ ...p, [name]: [] }));

    toast.success(
      modal.parentFolder ? "Tab added to folder!" : "New tab added!",
      {
        style: {
          icon: null,
          background: "#141414",
          color: "#fff",
          border: "1px solid #ff8c00",
          boxShadow: "0 0 15px rgba(255,140,0,0.3)",
          fontWeight: 600,
        },
      }
    );
  }

  // 🗂️ Add Folder
  else if (modal.mode === "addFolder") {
    setTabs((prev) => [...prev, { folder: name, tabs: [], open: true }]);
    toast.success("Folder created!", {
      style: {
        icon: null,
        background: "#141414",
        color: "#fff",
        border: "1px solid #ff8c00",
        boxShadow: "0 0 15px rgba(255,140,0,0.3)",
        fontWeight: 600,
      },
    });
  }

// ✏️ Edit Tab (root or subtab)
else if (modal.mode === "editTab") {
  setTabs((prev) =>
    prev.map((t) => {
      if (typeof t === "object" && t.folder) {
        return {
          ...t,
          tabs: t.tabs.map((sub) =>
            getTabName(sub) === modal.initialData.name
              ? { ...sub, name, image }
              : sub
          ),
        };
      }
      // only rename actual tabs, not folders
      if (!t.folder && getTabName(t) === modal.initialData.name) {
        return { ...t, name, image };
      }
      return t;
    })
  );

  // ✅ Preserve data safely
  setData((prev) => {
    const next = { ...prev };
    const oldName = modal.initialData.name;

    // Only move data if the name actually changed
    if (oldName !== name && next[oldName]) {
      next[name] = next[oldName];
      delete next[oldName];
    }

    // Always keep the existing rows if only image changed
    if (oldName === name && next[oldName]) {
      next[oldName] = [...next[oldName]];
    }

    return next;
  });

  toast.success("Tab updated!", {
    style: {
      icon: null,
      background: "#141414",
      color: "#fff",
      border: "1px solid #ff8c00",
      boxShadow: "0 0 15px rgba(255,140,0,0.3)",
      fontWeight: 600,
    },
  });
}

  // ✏️ Edit Folder
  else if (modal.mode === "editFolder") {
    setTabs((prev) =>
      prev.map((t) =>
        typeof t === "object" && t.folder === modal.initialData.name
          ? { ...t, folder: name }
          : t
      )
    );

    toast.success("Folder renamed!", {
      style: {
        icon: null,
        background: "#141414",
        color: "#fff",
        border: "1px solid #ff8c00",
        boxShadow: "0 0 15px rgba(255,140,0,0.3)",
        fontWeight: 600,
      },
    });
  }

  closeModal();
}}
  />
)}
</div>
);
}
function MiniModal({ mode, onClose, onConfirm, initialData }) {
  const [name, setName] = useState(initialData?.name || "");
  const [image, setImage] = useState(initialData?.image || "");

  const confirm = () => {
    if (!name.trim()) return;
    onConfirm({ name: name.trim(), image: image.trim() });
  };

  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const titles = {
    addTab: "Add New Tab",
    addFolder: "Create New Folder",
    editTab: "Edit Tab",
    editFolder: "Edit Folder",
  };

  const showImage = mode === "addTab" || mode === "editTab";

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000] animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-[90%] max-w-sm shadow-[0_0_25px_rgba(255,140,0,0.25)] animate-scaleIn"
      >
        <h3 className="text-xl font-semibold text-orange-400 mb-4 text-center">
          {titles[mode]}
        </h3>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter name"
          className="w-full mb-3 bg-neutral-800 text-gray-100 px-3 py-2 rounded border border-neutral-700 focus:border-orange-500 outline-none"
        />

        {showImage && (
          <input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="Optional image URL"
            className="w-full mb-3 bg-neutral-800 text-gray-100 px-3 py-2 rounded border border-neutral-700 focus:border-orange-500 outline-none"
          />
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className="px-4 py-1.5 rounded bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold shadow-md hover:shadow-orange-500/40 transition-all"
          >
            {mode.startsWith("add") ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
