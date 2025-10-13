import { useEffect, useMemo, useRef, useState } from "react";

/* ======================= Time (Lisbon / WEST) helpers ======================= */
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
  }).format(date); // YYYY-MM-DD
}

function lisbonNowParts() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LISBON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function hasPassedLisbonHHMM(targetHHMM = "19:00") {
  const { hour, minute } = lisbonNowParts();
  const [th, tm] = targetHHMM.split(":").map((x) => Number(x));
  if (hour > th) return true;
  if (hour < th) return false;
  return minute >= tm;
}

/* ============================= UI / format utils ============================ */
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

/* ============================= Default Settings ============================= */
const DEFAULT_SETTINGS = {
  colors: [
    { name: "Red",    hex: "#ea9999" },
    { name: "Pink",   hex: "#d5a6bd" },
    { name: "Purple", hex: "#b4a7d6" },
    { name: "Blue",   hex: "#a4c2f4" },
  ],
  snapshotTimeHHMM: "19:00", // WEST
  refreshMinutes: 10,        // global auto refresh
};

/* ================================== App ==================================== */
export default function Home() {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showSettings, setShowSettings] = useState(false);

  // data: { [tabName]: Array<{name, qty, price, prevPrice?, fluctPct?, colorHex?, locked?:boolean}> }
  const [data, setData] = useState({});
  const [totals, setTotals] = useState({});
  const [snapshots, setSnapshots] = useState({}); // { key: { value, ts, dateKey } }
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [loading, setLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null); // "HH:MM"

  // Floating color menu state (portal)
  const [colorMenu, setColorMenu] = useState({
    open: false,
    tab: null,
    index: null,
    x: 0,
    y: 0,
  });

  const refreshTimerRef = useRef(null);

  /* ----------------------------- Load / persist ------------------------------ */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTabs = JSON.parse(localStorage.getItem("cs2-tabs")) || ["Dashboard"];
    const savedData = JSON.parse(localStorage.getItem("cs2-data")) || {};
    const savedSnaps = JSON.parse(localStorage.getItem("cs2-snapshots") || "{}");
    const savedSettings = JSON.parse(localStorage.getItem("cs2-settings") || "null");
    const savedUpdated = localStorage.getItem("cs2-lastUpdatedAt") || null;

    setTabs(savedTabs);
    setData(savedData);
    setSnapshots(savedSnaps);
    setSettings(savedSettings || DEFAULT_SETTINGS);
    setLastUpdatedAt(savedUpdated);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cs2-tabs", JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cs2-data", JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cs2-snapshots", JSON.stringify(snapshots));
  }, [snapshots]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cs2-settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastUpdatedAt) localStorage.setItem("cs2-lastUpdatedAt", lastUpdatedAt);
  }, [lastUpdatedAt]);

  /* -------------------------------- Tab mgmt -------------------------------- */
  const addTab = () => {
    const name = prompt("Enter new tab name:");
    if (!name) return;
    if (tabs.includes(name)) return;
    const nextTabs = [...tabs, name];
    setTabs(nextTabs);
    setData({ ...data, [name]: [] });
    setActiveTab(name);
    setShowSettings(false);
  };

  const removeTab = (tab) => {
    if (tab === "Dashboard") return;
    if (!confirm(`Delete "${tab}" tab?`)) return;
    const nextTabs = tabs.filter((t) => t !== tab);
    const nextData = { ...data };
    delete nextData[tab];
    const nextSnaps = { ...snapshots };
    delete nextSnaps[tab];
    setTabs(nextTabs);
    setData(nextData);
    setSnapshots(nextSnaps);
    if (activeTab === tab) setActiveTab("Dashboard");
  };

  /* ------------------------------- Row mgmt --------------------------------- */
  const addRow = () => {
    if (activeTab === "Dashboard" || showSettings) return;
    const rows = data[activeTab] || [];
    setData({
      ...data,
      [activeTab]: [...rows, { name: "", qty: 1, price: 0, colorHex: "", locked: false }],
    });
  };

  const deleteRow = (i) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    const rows = [...(data[activeTab] || [])];
    rows.splice(i, 1);
    setData({ ...data, [activeTab]: rows });
  };

  const toggleLockRow = (i) => {
    const rows = [...(data[activeTab] || [])];
    rows[i].locked = !rows[i].locked;
    setData({ ...data, [activeTab]: rows });
  };

  /* ---------------------------- Totals per tab ------------------------------- */
  useEffect(() => {
    const t = {};
    for (const tab of tabs) {
      if (!data[tab]) continue;
      t[tab] = data[tab].reduce(
        (sum, r) => sum + (Number(r.qty || 0) * Number(r.price || 0)),
        0
      );
    }
    setTotals(t);
  }, [data, tabs]);

  const grandTotalNum = useMemo(
    () => Object.values(totals).reduce((a, b) => a + (b || 0), 0),
    [totals]
  );

  /* --------------------- Dashboard fluctuation vs snapshot -------------------- */
  const todayKey = todayKeyLisbon();
  const dashSnap = snapshots["dashboard"];
  const dashPct =
    dashSnap && dashSnap.value > 0
      ? ((grandTotalNum - dashSnap.value) / dashSnap.value) * 100
      : null;

  /* ----------------------- Daily snapshot at HH:MM WEST ----------------------- */
  useEffect(() => {
    const targetHHMM = settings.snapshotTimeHHMM || "19:00";
    if (!hasPassedLisbonHHMM(targetHHMM)) return;

    const needSnapshot = !dashSnap || dashSnap.dateKey !== todayKey;
    if (!needSnapshot) return;

    const newSnaps = { ...snapshots };
    newSnaps["dashboard"] = {
      value: Number(grandTotalNum.toFixed(2)),
      ts: Date.now(),
      dateKey: todayKey,
    };
    for (const tab of tabs) {
      if (tab === "Dashboard") continue;
      const value = Number((totals[tab] || 0).toFixed(2));
      newSnaps[tab] = { value, ts: Date.now(), dateKey: todayKey };
    }
    setSnapshots(newSnaps);
  }, [grandTotalNum, totals, tabs, dashSnap, todayKey, settings.snapshotTimeHHMM, snapshots]);

  /* -------------------------- Fetch & global refresh -------------------------- */
  async function fetchPriceFor(tabName, rowIndex) {
    const rows = data[tabName] || [];
    const row = rows[rowIndex];
    if (!row || !row.name?.trim()) return;
    if (row.locked) return;

    try {
      const res = await fetch(`/api/price?name=${encodeURIComponent(row.name)}`);
      const json = await res.json();
      if (json.ok && json.lowest != null) {
        const oldPrice = Number(row.price || 0);
        const newPrice = Number(json.lowest);

        const updated = [...rows];
        const hadPrev = isFinite(oldPrice) && oldPrice > 0;
        let fluctPct = row.fluctPct ?? null;
        if (hadPrev) {
          const base = oldPrice || null;
          if (base) {
            fluctPct = ((newPrice - base) / base) * 100;
          } else {
            fluctPct = 0;
          }
        } else {
          fluctPct = null; // show "—" until we have at least one previous price
        }

        updated[rowIndex] = {
          ...row,
          prevPrice: hadPrev ? oldPrice : newPrice,
          price: newPrice,
          fluctPct,
        };

        setData((prev) => ({ ...prev, [tabName]: updated }));
      }
    } catch (e) {
      console.error("Fetch price error:", e);
    }
  }

  const handleNameBlur = (i) => {
    if (showSettings) return;
    const rows = data[activeTab] || [];
    if (!rows[i] || rows[i].locked) return;
    fetchPriceFor(activeTab, i);
  };

  // Global auto refresh (all tabs)
  useEffect(() => {
    if (!tabs.length) return;
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);

    const doRefreshAll = async () => {
      if (showSettings) return; // pause while settings open
      setLoading(true);
      try {
        for (const tab of tabs) {
          if (tab === "Dashboard") continue;
          const rows = data[tab] || [];
          for (let i = 0; i < rows.length; i++) {
            const name = rows[i]?.name?.trim();
            if (!name) continue;
            if (rows[i].locked) continue;
            // eslint-disable-next-line no-await-in-loop
            await fetchPriceFor(tab, i);
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 200)); // gentle pacing
          }
        }
        setLastUpdatedAt(formatLisbonHM());
      } finally {
        setLoading(false);
      }
    };

    // initial run
    doRefreshAll();

    const minutes = Math.max(1, Number(settings.refreshMinutes || 10));
    refreshTimerRef.current = setInterval(doRefreshAll, minutes * 60 * 1000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, settings.refreshMinutes, showSettings]);

  /* ------------------------------ Settings helpers ---------------------------- */
  const addColorPreset = () => {
    setSettings((prev) => ({
      ...prev,
      colors: [...prev.colors, { name: "New", hex: "#ffffff" }],
    }));
  };
  const updateColorPreset = (i, key, value) => {
    setSettings((prev) => {
      const next = [...prev.colors];
      next[i] = { ...next[i], [key]: value };
      return { ...prev, colors: next };
    });
  };
  const removeColorPreset = (i) => {
    setSettings((prev) => {
      const next = [...prev.colors];
      next.splice(i, 1);
      return { ...prev, colors: next };
    });
  };

  /* ------------------------------- Color dropdown (portal) ----------------------------- */
  const openColorMenuAtButton = (tabName, rowIndex, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Position just below the button, left-aligned
    const x = rect.left;
    const y = rect.bottom + 6;
    setColorMenu({ open: true, tab: tabName, index: rowIndex, x, y });
  };
  const closeColorMenu = () => setColorMenu({ open: false, tab: null, index: null, x: 0, y: 0 });

  // Close color menu on click outside / scroll / resize
  useEffect(() => {
    if (!colorMenu.open) return;
    const onDocClick = (e) => {
      // If click is inside our menu container, ignore
      const el = document.getElementById("color-menu-portal");
      if (el && el.contains(e.target)) return;
      closeColorMenu();
    };
    const onScroll = () => closeColorMenu();
    const onResize = () => closeColorMenu();

    document.addEventListener("click", onDocClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [colorMenu.open]);

  const applyColorToRow = (tabName, i, hex) => {
    const rows = [...(data[tabName] || [])];
    if (!rows[i]) return;
    rows[i].colorHex = hex || "";
    setData({ ...data, [tabName]: rows });
    closeColorMenu();
  };

  /* ------------------------------------ UI ------------------------------------ */
  const dashChangeColor =
    dashPct == null
      ? "text-gray-300"
      : dashPct > 0
      ? "text-green-400"
      : dashPct < 0
      ? "text-red-400"
      : "text-gray-300";

  return (
    <div className="min-h-screen text-gray-100 font-sans bg-gradient-to-br from-[#050505] to-[#121212]">
      {/* Header */}
      <header className="px-6 py-4 border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h1
            className="text-xl font-bold"
            style={{
              background: "linear-gradient(90deg, #1e40af 0%, #2563eb 60%, #60a5fa 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            💎 CS2 Prices Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={addTab}
              className="bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
              title="Add Tab"
            >
              ＋ Add Tab
            </button>
            <button
              onClick={() => {
                setShowSettings((s) => !s);
                setActiveTab("Dashboard");
              }}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition"
              title="Settings"
            >
              <span aria-hidden>⚙️</span>
            </button>
          </div>
        </div>
        {/* Last updated line (always visible) */}
        <div className="mt-2 text-xs text-neutral-400">
          {lastUpdatedAt ? `Last updated at ${lastUpdatedAt} WEST` : "Waiting for first auto refresh…"}
        </div>
      </header>

      {/* Tabs (hidden while in settings) */}
      {!showSettings && (
        <nav className="flex flex-wrap gap-2 px-6 py-3 bg-neutral-900/50 border-b border-neutral-800">
          {tabs.map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg cursor-pointer transition ${
                activeTab === tab
                  ? "bg-blue-800 shadow-md shadow-black/30"
                  : "bg-neutral-800 hover:bg-neutral-700"
              }`}
            >
              <span>{tab}</span>
              {tab !== "Dashboard" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab);
                  }}
                  className="text-xs text-neutral-300 hover:text-red-400"
                  title="Delete tab"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* Main */}
      <main className="p-6">
        {showSettings ? (
          /* ============================== SETTINGS VIEW ============================== */
          <div className="max-w-4xl mx-auto space-y-8">
            <section className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Rarity Colors</h2>

              <div className="space-y-3">
                {settings.colors.map((c, idx) => (
                  <div
                    key={idx}
                    className="grid md:grid-cols-[1fr,220px,80px,auto] grid-cols-1 gap-3 items-center bg-neutral-800/50 rounded-lg p-3"
                  >
                    <input
                      value={c.name}
                      onChange={(e) => updateColorPreset(idx, "name", e.target.value)}
                      placeholder="Name (e.g., Purple)"
                      className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-blue-600 outline-none"
                    />
                    <input
                      value={c.hex}
                      onChange={(e) => updateColorPreset(idx, "hex", e.target.value)}
                      placeholder="#aabbcc"
                      className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-blue-600 outline-none"
                    />
                    <div
                      className="h-8 w-12 rounded border border-neutral-700"
                      style={{ backgroundColor: c.hex }}
                      title={c.hex}
                    />
                    <button
                      onClick={() => removeColorPreset(idx)}
                      className="text-red-400 hover:text-red-500 text-sm"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <button
                  onClick={addColorPreset}
                  className="bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm"
                >
                  ＋ Add Color
                </button>
              </div>
            </section>

            <section className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Behavior</h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <label className="block text-sm text-neutral-400 mb-1">
                    Snapshot time (WEST, HH:MM)
                  </label>
                  <input
                    type="time"
                    value={settings.snapshotTimeHHMM}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        snapshotTimeHHMM: e.target.value || "19:00",
                      }))
                    }
                    className="w-36 bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-blue-600 outline-none"
                  />
                </div>

                <div className="bg-neutral-800/50 rounded-lg p-3">
                  <label className="block text-sm text-neutral-400 mb-1">
                    Auto refresh interval (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={settings.refreshMinutes}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        refreshMinutes: Math.max(1, Number(e.target.value)),
                      }))
                    }
                    className="w-36 bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-blue-600 outline-none"
                  />
                </div>
              </div>
            </section>
          </div>
        ) : activeTab === "Dashboard" ? (
          /* ============================== DASHBOARD VIEW ============================== */
          <div className="space-y-6">
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm text-neutral-400">Inventory Value</div>
                  <div className="text-3xl font-extrabold text-blue-300 drop-shadow-sm">
                    {fmtMoney(grandTotalNum)}€
                  </div>
                </div>
                <div className="text-base font-semibold">
                  {dashPct == null ? (
                    <span className="text-neutral-400">
                      Daily snapshot will auto-save at {settings.snapshotTimeHHMM} WEST.
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
                      {isFinite(dashPct) ? Math.abs(dashPct).toFixed(2) : "0.00"}% since last snapshot
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-400">
                  {snapshots["dashboard"]
                    ? `Last snapshot: ${new Date(snapshots["dashboard"].ts).toLocaleString()} (WEST daily)`
                    : `No snapshot yet`}
                </div>
              </div>
            </div>

            {/* Per-tab totals + Grand total */}
            <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 shadow">
              {tabs
                .filter((t) => t !== "Dashboard")
                .map((t) => (
                  <div
                    key={t}
                    className="flex justify-between py-2 border-b border-neutral-800 last:border-0"
                  >
                    <span>{t}</span>
                    <span className="text-green-400">{fmtMoney(totals[t] || 0)}€</span>
                  </div>
                ))}
              <div className="flex justify-between mt-4 text-lg font-bold">
                <span>Total Inventory</span>
                <span className="text-blue-300">{fmtMoney(grandTotalNum)}€</span>
              </div>
            </div>
          </div>
        ) : (
          /* ================================= TAB VIEW ================================ */
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">{activeTab}</h2>
              <button
                onClick={addRow}
                className="bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm"
              >
                ＋ Add Item
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-800 text-neutral-300">
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
                    const total = (Number(row.price) || 0) * (Number(row.qty) || 0);
                    let fluctText = "—";
                    let fluctClass = "text-neutral-400";
                    if (row.fluctPct != null) {
                      if (row.fluctPct > 0) fluctClass = "text-green-400";
                      else if (row.fluctPct < 0) fluctClass = "text-red-400";
                      else fluctClass = "text-neutral-300";
                      fluctText = `${sign(row.fluctPct)}${Math.abs(row.fluctPct).toFixed(2)}%`;
                    }
                    const tint = hexToRgba(row.colorHex || "", 0.5);

                    // External link (Steam Market)
                    const hasName = !!row.name?.trim();
                    const steamHref = hasName
                      ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(
                          row.name.trim()
                        )}`
                      : null;

                    return (
                      <tr
                        key={i}
                        className="border-b border-neutral-800 transition-transform duration-150 ease-out hover:-translate-y-[1px] hover:shadow-lg hover:shadow-black/30"
                        style={tint ? { backgroundColor: tint } : {}}
                      >
                        <td className="p-2">
  <div className="flex items-center gap-2">
    {/* Color square */}
    <button
      onClick={(e) => openColorMenuAtButton(activeTab, i, e)}
      className="h-4 w-4 rounded border border-neutral-700 hover:border-blue-400 transition"
      style={{ backgroundColor: row.colorHex || "transparent" }}
      title="Set rarity color"
    />

    {/* Item name input */}
    <input
      value={row.name || ""}
      disabled={!!row.locked}
      onChange={(e) => {
        const rows = [...(data[activeTab] || [])];
        rows[i].name = e.target.value;
        setData({ ...data, [activeTab]: rows });
      }}
      onBlur={() => handleNameBlur(i)}
      placeholder="Item name (e.g., Snakebite Case)"
      className={`w-full bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-blue-600 outline-none ${
        row.locked ? "opacity-60 cursor-not-allowed" : ""
      }`}
    />

    {/* Steam market link */}
    {steamHref ? (
      <a
        href={steamHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-neutral-400 hover:text-blue-300 text-sm"
        title="Open on Steam Market ↗"
      >
        ↗
      </a>
    ) : (
      <span
        className="text-neutral-700 cursor-not-allowed select-none text-sm"
        title="Enter item name to open Steam link"
      >
        ↗
      </span>
    )}
  </div>
</td>


                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={row.qty ?? 1}
                            disabled={!!row.locked}
                            onChange={(e) => {
                              const rows = [...(data[activeTab] || [])];
                              rows[i].qty = Number(e.target.value);
                              setData({ ...data, [activeTab]: rows });
                            }}
                            className={`w-16 bg-neutral-800 text-center rounded border border-neutral-700 focus:border-blue-600 outline-none ${
                              row.locked ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          />
                        </td>

                        <td className="p-2 text-center text-green-400">
                          {row.price != null ? fmtMoney(row.price) : "—"}
                        </td>

                        <td className={`p-2 text-center font-medium ${fluctClass}`}>{fluctText}</td>

                        <td className="p-2 text-center text-blue-300">{fmtMoney(total)}</td>

                        <td className="p-2">
                          <div className="relative flex items-center justify-center gap-3">
                            {/* Lock toggle */}
                            <button
                              onClick={() => toggleLockRow(i)}
                              className="text-neutral-300 hover:text-blue-300"
                              title={row.locked ? "Unlock row" : "Lock row"}
                            >
                              {row.locked ? "🔒" : "🔓"}
                            </button>

                            {/* Delete (with confirm) */}
                            <button
                              onClick={() => deleteRow(i)}
                              className="text-red-400 hover:text-red-500"
                              title="Delete row"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(data[activeTab] || []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-neutral-400">
                        No items yet. Click “＋ Add Item” to start.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Floating Color Menu (Portal-like: fixed to viewport) */}
      {colorMenu.open && (
        <div
          id="color-menu-portal"
          className="fixed z-50"
          style={{ top: colorMenu.y, left: colorMenu.x }}
        >
          <div
            className="origin-top-left animate-[fadeSlide_.15s_ease-out] bg-neutral-900 border border-neutral-700 rounded-md shadow-lg p-2 min-w-[180px]"
            style={{
              // simple keyframes without CSS file
              animationName: undefined,
            }}
          >
            <div className="text-xs text-neutral-400 px-1 pb-1">Choose color</div>
            <button
              onClick={() => applyColorToRow(colorMenu.tab, colorMenu.index, "")}
              className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 text-sm"
            >
              <span className="h-3 w-3 rounded border border-neutral-600 bg-transparent" />
              None
            </button>
            {settings.colors.map((c) => (
              <button
                key={c.name + c.hex}
                onClick={() => applyColorToRow(colorMenu.tab, colorMenu.index, c.hex)}
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

      {loading && (
        <div className="fixed bottom-4 right-4 bg-neutral-900/80 px-4 py-2 rounded-lg shadow border border-neutral-700 text-sm text-neutral-300">
          Updating prices…
        </div>
      )}
    </div>
  );
}
