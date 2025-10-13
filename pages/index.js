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
  }).format(date);
}
function hasPassedLisbonHHMM(targetHHMM = "19:00") {
  const now = new Date();
  const [h, m] = targetHHMM.split(":").map(Number);
  const tzNow = new Date(
    now.toLocaleString("en-US", { timeZone: LISBON_TZ })
  );
  return (
    tzNow.getHours() > h || (tzNow.getHours() === h && tzNow.getMinutes() >= m)
  );
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
  const [colorMenu, setColorMenu] = useState({ open: false, tab: null, index: null, x: 0, y: 0 });
  const refreshTimerRef = useRef([]);

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
    if (lastUpdatedAt)
      localStorage.setItem("cs2-lastUpdatedAt", lastUpdatedAt);
  }, [lastUpdatedAt]);

  /* ------------------------------- Tabs & Rows ------------------------------- */
  const addTab = () => {
    const name = prompt("New tab name:");
    if (!name || tabs.includes(name)) return;
    setTabs([...tabs, name]);
    setData({ ...data, [name]: [] });
    setActiveTab(name);
    setShowSettings(false);
  };
  const removeTab = (tab) => {
    if (tab === "Dashboard") return;
    if (!confirm(`Delete tab "${tab}"?`)) return;
    const nextTabs = tabs.filter((t) => t !== tab);
    const nextData = { ...data };
    delete nextData[tab];
    setTabs(nextTabs);
    setData(nextData);
    setActiveTab("Dashboard");
  };
  const addRow = () => {
    if (activeTab === "Dashboard" || showSettings) return;
    const rows = data[activeTab] || [];
    setData({
      ...data,
      [activeTab]: [...rows, { name: "", qty: 1, price: 0, colorHex: "", locked: false }],
    });
  };
  const deleteRow = (i) => {
    if (!confirm("Delete this row?")) return;
    const rows = [...(data[activeTab] || [])];
    rows.splice(i, 1);
    setData({ ...data, [activeTab]: rows });
  };
  const toggleLockRow = (i) => {
    const rows = [...(data[activeTab] || [])];
    rows[i].locked = !rows[i].locked;
    setData({ ...data, [activeTab]: rows });
  };

  /* ----------------------------- Totals per tab ----------------------------- */
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
  const grandTotal = useMemo(
    () => Object.values(totals).reduce((a, b) => a + b, 0),
    [totals]
  );

  /* -------------------------- Daily snapshots -------------------------- */
  useEffect(() => {
    const key = todayKeyLisbon();
    if (!hasPassedLisbonHHMM(settings.snapshotTimeHHMM)) return;
    if (snapshots["dashboard"]?.dateKey === key) return;
    const newSnaps = { ...snapshots };
    newSnaps["dashboard"] = { value: grandTotal, dateKey: key, ts: Date.now() };
    for (const tab of tabs) {
      if (tab === "Dashboard") continue;
      newSnaps[tab] = {
        value: totals[tab] || 0,
        dateKey: key,
        ts: Date.now(),
      };
    }
    setSnapshots(newSnaps);
  }, [grandTotal, totals, tabs, snapshots, settings.snapshotTimeHHMM]);

/* -------------------------- Auto refresh system (self-healing loop with live state) -------------------------- */
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

      console.log(`🔄 Starting full refresh cycle (${intervalMin} min interval)`);

      // 🔥 always get fresh data and tabs each loop iteration
      const liveTabs = JSON.parse(localStorage.getItem("cs2-tabs") || "[]");
      const liveData = JSON.parse(localStorage.getItem("cs2-data") || "{}");

      for (const tab of liveTabs) {
        if (tab === "Dashboard") continue;
        const rows = liveData[tab] || [];
        if (!rows.length) continue;

        console.log(`▶ Fetching tab: ${tab}`);
        const updated = [...rows];

        for (let i = 0; i < rows.length; i++) {
          if (stop) return;
          const row = rows[i];
          const name = row?.name?.trim();
          if (!name) continue;

          try {
            const res = await fetch(`/api/price?name=${encodeURIComponent(name)}`);
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
          const next = { ...prev, [tab]: updated };
          localStorage.setItem("cs2-data", JSON.stringify(next));
          return next;
        });

        console.log(`✅ Finished tab: ${tab}`);
      }

      setLastUpdatedAt(formatLisbonHM());
      localStorage.setItem("cs2-lastFullRefreshAt", Date.now());
      console.log(`⏸ Waiting ${intervalMin} min before next refresh cycle…`);

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

/* ------------------------------- Color menu ------------------------------- */
const openColorMenuAtButton = (tab, i, e) => {
  const rect = e.currentTarget.getBoundingClientRect();
  const menuHeight = 200; // rough estimate for dropdown height
  const viewportHeight = window.innerHeight;

  // if there’s not enough space below → open above
  const openAbove = rect.bottom + menuHeight > viewportHeight;
  const y = openAbove ? rect.top - menuHeight - 6 : rect.bottom + 6;

  setColorMenu({
    open: true,
    tab,
    index: i,
    x: rect.left,
    y,
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

  // 🧠 delay listener to avoid capturing the opening click
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

const applyColorToRow = (tab, i, hex) => {
  const rows = [...(data[tab] || [])];
  if (!rows[i]) return;
  rows[i].colorHex = hex;
  setData({ ...data, [tab]: rows });
  closeColorMenu();
};

  /* ------------------------------- Render UI ------------------------------- */
  const dashSnap = snapshots["dashboard"];
  const dashPct =
    dashSnap && dashSnap.value > 0
      ? ((grandTotal - dashSnap.value) / dashSnap.value) * 100
      : null;

  return (
    <div className="min-h-screen text-gray-100 font-sans bg-gradient-to-br from-[#050505] to-[#121212]">
<header className="px-6 py-4 border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-sm">
  <div className="flex items-center justify-between">
    {/* Left title */}
    <h1 className="text-xl font-bold text-blue-400">💎 CS2 Prices Dashboard</h1>

    {/* Center Dashboard button */}
    <div className="flex-1 flex justify-center">
      <button
        onClick={() => {
          setActiveTab("Dashboard");
          setShowSettings(false);
        }}
        className={`group relative px-6 py-2 text-sm font-semibold rounded-full transition-all duration-300 
          ${activeTab === "Dashboard"
            ? "text-white bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-[1.05]"
            : "text-neutral-300 bg-neutral-800 hover:bg-neutral-700 hover:text-white hover:scale-[1.03] hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]"}`}
      >
        <span className="relative z-10">Dashboard</span>
        {activeTab === "Dashboard" && (
          <span className="absolute inset-0 rounded-full bg-blue-600/20 blur-xl animate-pulse" />
        )}
      </button>
    </div>

    {/* Right side buttons */}
    <div className="flex items-center gap-3">
      <button
        onClick={addTab}
        className="bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
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
        ⚙️
      </button>
    </div>
  </div>
</header>

{/* Tabs (no Dashboard here) */}
{!showSettings && (
  <nav className="flex flex-wrap gap-2 px-6 py-3 bg-neutral-900/50 border-b border-neutral-800">
    {tabs
      .filter((t) => t !== "Dashboard")
      .map((tab) => (
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeTab(tab);
            }}
            className="text-xs text-neutral-300 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      ))}
  </nav>
)}


      <main className="p-6">
        {/* Dashboard */}
        {activeTab === "Dashboard" && !showSettings && (
          <div className="space-y-6">
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm text-neutral-400">Inventory Value</div>
                  <div className="text-3xl font-extrabold text-blue-300">{fmtMoney(grandTotal)}€</div>
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
              {tabs.filter((t) => t !== "Dashboard").map((t) => (
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
                <span className="text-blue-300">{fmtMoney(grandTotal)}€</span>
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        {showSettings && (
          <div className="max-w-3xl mx-auto space-y-6">
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
                    <div className="h-6 w-10 rounded border border-neutral-700" style={{ backgroundColor: c.hex }} />
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
                      🗑
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
                className="mt-3 bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm"
              >
                ＋ Add Color
              </button>
            </section>

            <section className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Behavior</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">Snapshot time (WEST)</label>
                  <input
                    type="time"
                    value={settings.snapshotTimeHHMM}
                    onChange={(e) =>
                      setSettings({ ...settings, snapshotTimeHHMM: e.target.value })
                    }
                    className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
                  />
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">Auto refresh (min)</label>
                  <input
                    type="number"
                    value={settings.refreshMinutes}
                    onChange={(e) =>
                      setSettings({ ...settings, refreshMinutes: Number(e.target.value) })
                    }
                    className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Tab content */}
        {!showSettings && activeTab !== "Dashboard" && (
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
              <table className="w-full text-sm border-collapse">
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
const total = (row.price || 0) * (row.qty || 0);
const tint = hexToRgba(row.colorHex || "", 0.5);

// Fluctuation formatting
let fluctDisplay = "—";
let color = "text-neutral-400";
if (typeof row.fluctPct === "number") {
  color =
    row.fluctPct > 0
      ? "text-green-400"
      : row.fluctPct < 0
      ? "text-red-400"
      : "text-neutral-300";

  // keep natural minus from toFixed(); only add + for positives
  const signed =
    row.fluctPct > 0
      ? `+${row.fluctPct.toFixed(2)}`
      : row.fluctPct.toFixed(2); // includes the minus automatically
  fluctDisplay = `${signed} %`;
}
                    return (
                      <tr
                        key={i}
                        style={tint ? { backgroundColor: tint } : {}}
                        className="border-b border-neutral-800 hover:bg-neutral-800/40 transition"
                      >
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => openColorMenuAtButton(activeTab, i, e)}
                              className="h-4 w-4 rounded border border-neutral-700"
                              style={{ backgroundColor: row.colorHex || "transparent" }}
                              title="Set color"
                            />
                            <input
                              value={row.name || ""}
                              disabled={row.locked}
                              onChange={(e) => {
                                const rows = [...(data[activeTab] || [])];
                                rows[i].name = e.target.value;
                                setData({ ...data, [activeTab]: rows });
                              }}
                              placeholder="Item name"
                              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-blue-600 outline-none w-full"
                            />
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
                        <td className="p-2 text-center text-blue-300">{fmtMoney(total)}</td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => toggleLockRow(i)}
                            className="text-neutral-300 hover:text-blue-300"
                          >
                            {row.locked ? "🔒" : "🔓"}
                          </button>
                          <button
                            onClick={() => deleteRow(i)}
                            className="ml-3 text-red-400 hover:text-red-500"
                          >
                            🗑
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

      {colorMenu.open && (
        <div
          id="color-menu-portal"
          className="fixed z-50"
          style={{ top: colorMenu.y, left: colorMenu.x }}
        >
          <div className="bg-neutral-900 border border-neutral-700 rounded-md shadow-lg p-2 min-w-[180px]">
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
    </div>
  );
}
