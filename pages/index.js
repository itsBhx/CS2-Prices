import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from '../lib/supabaseClient'

// persistent id per browser (used as the “owner” key for your data row)
function getDeviceId() {
  if (typeof window === 'undefined') return null
  let id = localStorage.getItem('cs2-device-id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('cs2-device-id', id)
  }
  return id
}

/* ====================== Time (Lisbon / WEST) helpers ====================== */
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
  return tzNow.getHours() > h || (tzNow.getHours() === h && tzNow.getMinutes() >= m);
}

/* ============================= UI helpers ============================= */
const fmtMoney = (n) => (isFinite(n) ? Number(n).toFixed(2) : "0.00");
const sign = (n) => (n > 0 ? "+" : "");
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

/* Small helper for handling mixed tab structures */
function getTabName(tab) {
  if (!tab) return "";
  return typeof tab === "string" ? tab : tab.name;
}

/* ============================= Defaults ============================= */
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

/* ================================== App ==================================== */
export default function Home() {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showSettings, setShowSettings] = useState(false);
  const [data, setData] = useState({});
  const [totals, setTotals] = useState({});
  const [snapshots, setSnapshots] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [apiStatus, setApiStatus] = useState("stable"); // "stable" | "429" | "down"
  const [isLoading, setIsLoading] = useState(false); // controls spinner visibility
  const [colorMenu, setColorMenu] = useState({ open: false, tab: null, index: null, x: 0, y: 0 });
  const refreshTimerRef = useRef([]);
  const isRefreshingRef = useRef(false);

  // Optional: small toast state
const [syncMsg, setSyncMsg] = useState(null)

async function saveToCloud() {
  try {
    const deviceId = getDeviceId()
    if (!deviceId) throw new Error('No device id')

    const payload = {
      tabs,
      data,
      snapshots,
      settings,
      lastUpdatedAt,
    }

    const { error } = await supabase
      .from('user_data')
      .upsert(
        {
          device_id: deviceId,
          blob: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'device_id' } // upsert by device_id
      )

    if (error) throw error
    setSyncMsg('✅ Saved to cloud')
    setTimeout(() => setSyncMsg(null), 3000)
  } catch (e) {
    console.error(e)
    setSyncMsg('❌ Save failed')
    setTimeout(() => setSyncMsg(null), 3000)
  }
}

async function loadFromCloud() {
  try {
    const deviceId = getDeviceId()
    if (!deviceId) throw new Error('No device id')

    const { data: rows, error } = await supabase
      .from('user_data')
      .select('blob')
      .eq('device_id', deviceId)
      .limit(1)

    if (error) throw error
    const row = rows?.[0]
    if (!row?.blob) {
      setSyncMsg('ℹ️ No cloud data yet')
      setTimeout(() => setSyncMsg(null), 3000)
      return
    }

    const { tabs: T, data: D, snapshots: S, settings: ST, lastUpdatedAt: LU } = row.blob

    // merge into state
    setTabs(T || [])
    setData(D || {})
    setSnapshots(S || {})
    setSettings(ST || settings)
    setLastUpdatedAt(LU || null)

    // also update localStorage
    localStorage.setItem('cs2-tabs', JSON.stringify(T || []))
    localStorage.setItem('cs2-data', JSON.stringify(D || {}))
    localStorage.setItem('cs2-snapshots', JSON.stringify(S || {}))
    localStorage.setItem('cs2-settings', JSON.stringify(ST || settings))
    if (LU) localStorage.setItem('cs2-lastUpdatedAt', LU)

    setSyncMsg('✅ Loaded from cloud')
    setTimeout(() => setSyncMsg(null), 3000)
  } catch (e) {
    console.error(e)
    setSyncMsg('❌ Load failed')
    setTimeout(() => setSyncMsg(null), 3000)
  }
}

  /* --------------------------- Load / Save localStorage --------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setTabs(JSON.parse(localStorage.getItem("cs2-tabs")) || ["Dashboard"]);
    setData(JSON.parse(localStorage.getItem("cs2-data")) || {});
    setSnapshots(JSON.parse(localStorage.getItem("cs2-snapshots")) || {});
    setSettings(JSON.parse(localStorage.getItem("cs2-settings")) || DEFAULT_SETTINGS);
    setLastUpdatedAt(localStorage.getItem("cs2-lastUpdatedAt") || null);
  }, []);

  useEffect(() => { localStorage.setItem("cs2-tabs", JSON.stringify(tabs)); }, [tabs]);
  useEffect(() => { localStorage.setItem("cs2-data", JSON.stringify(data)); }, [data]);
  useEffect(() => { localStorage.setItem("cs2-snapshots", JSON.stringify(snapshots)); }, [snapshots]);
  useEffect(() => { localStorage.setItem("cs2-settings", JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    if (lastUpdatedAt) localStorage.setItem("cs2-lastUpdatedAt", lastUpdatedAt);
  }, [lastUpdatedAt]);

  /* ------------------------------- Tabs & Rows ------------------------------- */
  const addTab = () => {
    const name = prompt("New tab name:");
    if (!name) return;

    const image = prompt("Optional image URL (50x50 recommended):") || null;

    setTabs([...tabs, { name, image }]);
    setData({ ...data, [name]: [] });
    setActiveTab(name);
    setShowSettings(false);
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

  /* ------------------------------ Folder Functions ------------------------------ */
  const addFolder = () => {
    const name = prompt("New folder name:");
    if (!name || tabs.find((t) => typeof t === "object" && t.folder === name)) return;
    setTabs([...tabs, { folder: name, tabs: [], open: true }]);
  };

  const addTabToFolder = (folderName) => {
    const name = prompt("New tab name:");
    if (!name) return;

    const image = prompt("Optional image URL (50x50 recommended):") || null;

    setTabs((prev) =>
      prev.map((t) =>
        typeof t === "object" && t.folder === folderName
          ? { ...t, tabs: [...t.tabs, { name, image }] }
          : t
      )
    );
    setData((p) => ({ ...p, [name]: [] }));
    setActiveTab(name);
  };

  const toggleFolder = (folderName) =>
    setTabs((prev) =>
      prev.map((t) =>
        typeof t === "object"
          ? { ...t, open: t.folder === folderName ? !t.open : false }
          : t
      )
    );

  /* ------------------------------ Remove functions ------------------------------ */
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
    console.log(`🗑 Deleted sub-tab "${subName}" from folder "${folderName}"`);
  };

  const removeTabOrFolder = (target) => {
    if (typeof target === "string" || target.name) {
      removeTab(target);
      return;
    }

    if (target.tabs && target.tabs.length > 0) {
      alert(`⚠️ You must delete or move all tabs inside "${target.folder}" before deleting it.`);
      return;
    }

    if (!confirm(`Delete empty folder "${target.folder}"?`)) return;

    setTabs((prev) => prev.filter((t) => t.folder !== target.folder));
    console.log(`🗑 Deleted empty folder "${target.folder}"`);
  };

  /* ----------------------------- Totals per tab ----------------------------- */
  // Helper: flatten all tab names (excluding "Dashboard")
  const allTabNames = useMemo(() => {
    const names = [];
    for (const t of tabs) {
      // keep backward compatibility with older saved structure
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
    // Build totals per tabName only (not folders)
    for (const name of allTabNames) {
      const rows = data[name] || [];
      tmap[name] = rows.reduce((sum, r) => sum + (Number(r.qty || 0) * Number(r.price || 0)), 0);
    }
    setTotals(tmap);
  }, [data, allTabNames]);

  const grandTotal = useMemo(
    () => Object.values(totals).reduce((a, b) => a + b, 0),
    [totals]
  );

/* -------------------------- Daily snapshots -------------------------- */
useEffect(() => {
  const checkSnapshot = async () => {
    const key = todayKeyLisbon();
    const passed = hasPassedLisbonHHMM(settings.snapshotTimeHHMM);
    const alreadyTaken = snapshots["dashboard"]?.dateKey === key;

    // Skip if not time yet or already taken
    if (!passed || alreadyTaken) return;

    // Wait for refresh loop to finish if active
    while (isRefreshingRef.current) {
      console.log("⏳ Waiting for refresh loop to finish before snapshot...");
      await new Promise((r) => setTimeout(r, 5000)); // check every 5s
    }

    console.log("📸 Taking daily snapshot...");
    const newSnaps = { ...snapshots };
    newSnaps["dashboard"] = { value: grandTotal, dateKey: key, ts: Date.now() };

    for (const name of allTabNames) {
      newSnaps[name] = {
        value: totals[name] || 0,
        dateKey: key,
        ts: Date.now(),
      };
    }

    setSnapshots(newSnaps);
    localStorage.setItem("cs2-snapshots", JSON.stringify(newSnaps));
    console.log(`✅ Snapshot completed for ${key} at ${settings.snapshotTimeHHMM} WEST`);
  };

  // Check once per minute
  const interval = setInterval(checkSnapshot, 60 * 1000);
  checkSnapshot(); // run immediately on mount
  return () => clearInterval(interval);
}, [totals, allTabNames, grandTotal, snapshots, settings.snapshotTimeHHMM]);

  /* -------------------------- Auto refresh system -------------------------- */
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
  const res = await fetch(`/api/price?name=${encodeURIComponent(name)}`);

  if (res.status === 429) {
    console.warn("⚠️ Steam API rate limited (429)");
    setApiStatus("429");
    await sleep(10000); // 10s cooldown before retry
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

// ✅ Auto cloud save after each successful refresh
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

function BehaviorSettings({ settings, setSettings }) {
  const [snapshotTime, setSnapshotTime] = useState(settings.snapshotTimeHHMM);
  const [refreshMinutes, setRefreshMinutes] = useState(settings.refreshMinutes);

  const handleSave = () => {
    setSettings((prev) => ({
      ...prev,
      snapshotTimeHHMM: snapshotTime,
      refreshMinutes: Number(refreshMinutes),
    }));
    console.log("✅ Settings saved:", { snapshotTime, refreshMinutes });
  };

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

/* ------------------------------- Color menu ------------------------------- */
/* ------------------------------- Color menu ------------------------------- */
const openColorMenuAtButton = (tab, i, e) => {
  const trigger = e.currentTarget.getBoundingClientRect();
  const gap = 4;

  // Step 1: open immediately below while we measure
  setColorMenu({
    open: true,
    tab,
    index: i,
    x: trigger.left,
    y: trigger.bottom + gap,
    openAbove: false,
  });

  // Step 2: on next frame, measure the actual menu height and reposition if needed
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
      // open upward if there's more space above
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
    if (menuEl.contains(e.target)) return; // click inside → ignore
    closeColorMenu();
  };

  const onScroll = () => closeColorMenu();
  const onResize = () => closeColorMenu();

  // delay listener to avoid capturing the opening click
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

  /* -------------------------- Close folders on outside click -------------------------- */
useEffect(() => {
  const handleBodyClick = (e) => {
    // Ignore clicks inside folders OR inside settings panel
    if (e.target.closest("[data-folder]") || e.target.closest("[data-settings]")) return;

    setTabs((prev) =>
      prev.map((t) =>
        typeof t === "object" && t.open ? { ...t, open: false } : t
      )
    );
  };

  document.body.addEventListener("click", handleBodyClick);
  return () => document.body.removeEventListener("click", handleBodyClick);
}, []);

  /* ------------------------------- Render UI ------------------------------- */
  const dashSnap = snapshots["dashboard"];
  const dashPct =
    dashSnap && dashSnap.value > 0
      ? ((grandTotal - dashSnap.value) / dashSnap.value) * 100
      : null;

  return (
    <div className="min-h-screen text-orange-50 font-sans bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a]">
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

      {syncMsg && (
        <div className="mt-1 text-xs text-neutral-300">{syncMsg}</div>
      )}

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

      {/* Horizontal Tabs with Folder Dropdowns + 50x50 images */}
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
    toggleFolder(t.folder);
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

                  {/* Dropdown items */}
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
                              onClick={() => setActiveTab(subName)}
className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm cursor-pointer transition-all duration-200 ${
  active
    ? "bg-gradient-to-r from-orange-600 to-orange-500 text-white"
    : "hover:bg-neutral-800 text-neutral-300 hover:text-orange-400"
}`}
                            >
                              {/* left: icon + name */}
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

                              {/* right: delete */}
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

            // Normal tab (string or {name,image})
            const name = getTabName(t);
            if (name === "Dashboard") return null;
            const img = typeof t === "object" ? t.image : null;
            const isActive = activeTab === name;

            return (
<div
  key={`tab-${name}-${idx}`}
  onClick={() => setActiveTab(name)}
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

      <main className="p-6">
        {/* Dashboard */}
        {activeTab === "Dashboard" && !showSettings && (
          <div className="space-y-6">
            <div className="bg-neutral-900/70 border border-orange-900/60 rounded-xl p-5 shadow-[0_0_25px_rgba(255,140,0,0.1)] transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm text-neutral-400">Inventory Value</div>
                  <div className="text-3xl font-extrabold text-orange-400">{fmtMoney(grandTotal)}€</div>
                </div>
                <div className="text-base font-semibold">
                  {dashPct == null ? (
                    <span className="text-neutral-400">
                      Snapshot auto-saves at {settings.snapshotTimeHHMM} WEST
                    </span>
                  ) : (
                    <span
                      className={
                        dashPct > 0
                          ? "text-green-400"
                          : dashPct < 0
                          ? "text-red-400"
                          : "text-neutral-300"
                      }
                    >
                      {sign(dashPct)}
                      {Math.abs(dashPct).toFixed(2)} % since last snapshot
                    </span>
                  )}
                </div>
              </div>
            </div>

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
        <span className="text-green-400">{fmtMoney(totals[t] || 0)}€</span>
      </div>
    );
  }

  // folder type
  if (t.folder) {
    return (
      <div key={`total-folder-${t.folder}-${idx}`} className="mb-2">
        <div className="text-neutral-300 font-semibold mb-1">{t.folder}</div>
        {(t.tabs || []).map((sub, i) => {
          const subName = getTabName(sub);
          const subImg = typeof sub === "object" ? sub.image : null;
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
      <span className="text-green-400">{fmtMoney(totals[name] || 0)}€</span>
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
    Your data automatically saves to Supabase after every price refresh.
    You can also manually load or save your current data below.
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

  {syncMsg && (
    <div className="mt-2 text-xs text-neutral-300">{syncMsg}</div>
  )}
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
                        { name: "", qty: 1, price: 0, colorHex: "", locked: false },
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
      onClick={(e) => openColorMenuAtButton(activeTab, i, e)}
      className="h-4 w-4 rounded border border-neutral-700 shrink-0"
      style={{ backgroundColor: row.colorHex || "transparent" }}
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
                                rows[i].qty = Math.max(0, (rows[i].qty || 0) - 1);
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

                        <td className="p-2 text-center text-green-400">
                          {fmtMoney(row.price || 0)}
                        </td>

                        <td className={`p-2 text-center ${color}`}>{fluctDisplay}</td>

                        <td className="p-2 text-center text-orange-400">
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
    <div className="text-xs text-neutral-400 px-1 pb-1">Choose color</div>
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
    </div>
  );
}
