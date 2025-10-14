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
    if (lastUpdatedAt) localStorage.setItem("cs2-lastUpdatedAt", lastUpdatedAt);
  }, [lastUpdatedAt]);

  /* ------------------------------- Categories & Tabs ------------------------------- */
  const [categories, setCategories] = useState({});
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeTab, setActiveTab] = useState("Dashboard");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = JSON.parse(localStorage.getItem("cs2-categories") || "{}");
    setCategories(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("cs2-categories", JSON.stringify(categories));
  }, [categories]);

  const addCategory = () => {
    const name = prompt("New category name:");
    if (!name || categories[name]) return;
    setCategories({ ...categories, [name]: {} });
  };
  const removeCategory = (name) => {
    const hasTabs = Object.keys(categories[name] || {}).length > 0;
    if (hasTabs) {
      alert("❌ Cannot delete a category that still has tabs inside.");
      return;
    }
    if (!confirm(`Delete category "${name}"?`)) return;
    const next = { ...categories };
    delete next[name];
    setCategories(next);
    if (activeCategory === name) setActiveCategory(null);
  };
  const addTabToCategory = (cat) => {
    const tabName = prompt(`New tab inside "${cat}":`);
    if (!tabName || categories[cat][tabName]) return;
    const next = { ...categories };
    next[cat][tabName] = [];
    setCategories(next);
    setActiveCategory(cat);
    setActiveTab(tabName);
  };
  const removeTabFromCategory = (cat, tab) => {
    if (!confirm(`Delete tab "${tab}" from "${cat}"?`)) return;
    const next = { ...categories };
    delete next[cat][tab];
    setCategories(next);
    if (activeTab === tab) setActiveTab("Dashboard");
  };
  const openTab = (cat, tab) => {
    setActiveCategory(cat);
    setActiveTab(tab);
    setShowSettings(false);
  };

  const addRow = () => {
    if (!activeCategory || !activeTab || activeTab === "Dashboard") return;
    const next = { ...categories };
    const rows = next[activeCategory][activeTab] || [];
    rows.push({ name: "", qty: 1, price: 0, colorHex: "", locked: false });
    next[activeCategory][activeTab] = rows;
    setCategories(next);
    localStorage.setItem("cs2-categories", JSON.stringify(next));
  };

  /* Close dropdowns when clicking outside */
  useEffect(() => {
    const closeAll = () => setActiveCategory(null);
    document.body.addEventListener("click", closeAll);
    return () => document.body.removeEventListener("click", closeAll);
  }, []);

  /* ----------------------------- Totals per tab ----------------------------- */
  useEffect(() => {
    const t = {};
    for (const tab of tabs) {
      if (!data[tab]) continue;
      t[tab] = data[tab].reduce((sum, r) => sum + (Number(r.qty || 0) * Number(r.price || 0)), 0);
    }
    setTotals(t);
  }, [data, tabs]);
  const grandTotal = useMemo(() => Object.values(totals).reduce((a, b) => a + b, 0), [totals]);

  /* -------------------------- Behavior Settings Component -------------------------- */
  function BehaviorSettings({ settings, setSettings }) {
    const [pendingSettings, setPendingSettings] = useState(settings);
    useEffect(() => setPendingSettings(settings), [settings]);
    const handleSave = () => {
      setSettings(pendingSettings);
      console.log("✅ Settings saved:", pendingSettings);
    };
    return (
      <section className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
        <h2 className="text-xl font-semibold mb-4">Behavior</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Snapshot time (WEST)</label>
            <input
              type="time"
              value={pendingSettings.snapshotTimeHHMM}
              onChange={(e) => setPendingSettings({ ...pendingSettings, snapshotTimeHHMM: e.target.value })}
              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Auto refresh (min)</label>
            <input
              type="number"
              value={pendingSettings.refreshMinutes}
              onChange={(e) => setPendingSettings({ ...pendingSettings, refreshMinutes: Number(e.target.value) })}
              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
            />
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={handleSave}
            className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition"
          >
            💾 Save Changes
          </button>
        </div>
      </section>
    );
  }

  /* ------------------------------- Render ------------------------------- */
  return (
    <div className="min-h-screen text-gray-100 font-sans bg-gradient-to-br from-[#050505] to-[#121212]">
      <header className="px-6 py-4 border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-sm">
        <div className="grid grid-cols-3 items-center">
          <div className="justify-self-start">
            <h1 className="text-xl font-bold text-blue-400">💎 CS2 Prices Dashboard</h1>
            <div className="mt-1 text-xs text-neutral-400">
              {lastUpdatedAt ? `Last updated at ${lastUpdatedAt} WEST` : "Waiting for first auto refresh…"}
            </div>
          </div>
          <div className="justify-self-center">
            <button
              onClick={() => {
                setActiveTab("Dashboard");
                setShowSettings(false);
              }}
              className={`group relative px-7 py-2 text-sm font-semibold rounded-full transition-all duration-300 ${
                activeTab === "Dashboard"
                  ? "text-white bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-[1.05]"
                  : "text-neutral-300 bg-neutral-800 hover:bg-neutral-700 hover:text-white hover:scale-[1.03] hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]"
              }`}
            >
              Dashboard
            </button>
          </div>
          <div className="justify-self-end flex items-center gap-3">
            <button
              onClick={addCategory}
              className="bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
              title="Add Category"
            >
              ＋ Add Category
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

      {/* Category dropdowns */}
      {!showSettings && (
        <div className="flex flex-wrap items-center justify-center gap-2 px-6 py-3 bg-neutral-900/50 border-b border-neutral-800">
          {Object.keys(categories).length === 0 && (
            <div className="text-neutral-500 text-sm italic py-1">
              No categories yet — click “＋ Add Category” above to get started.
            </div>
          )}

          {Object.keys(categories).map((cat) => (
            <div key={cat} className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveCategory((prev) => (prev === cat ? null : cat));
                }}
                className={`px-4 py-1.5 rounded-lg font-semibold transition ${
                  activeCategory === cat
                    ? "bg-blue-700 text-white"
                    : "bg-neutral-800 text-gray-300 hover:bg-neutral-700"
                }`}
              >
                {cat} ▾
              </button>

              {activeCategory === cat && (
                <div
                  className="absolute left-0 mt-2 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-50 min-w-[200px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {Object.keys(categories[cat] || {}).map((tab) => (
                    <div
                      key={tab}
                      className="flex justify-between items-center px-3 py-2 hover:bg-neutral-800 cursor-pointer"
                      onClick={() => {
                        openTab(cat, tab);
                        setActiveCategory(null);
                      }}
                    >
                      <span>{tab}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTabFromCategory(cat, tab);
                        }}
                        className="opacity-40 hover:opacity-100 text-red-400 hover:text-red-500 text-sm transition"
                        title="Delete Tab"
                      >
                        ✖
                      </button>
                    </div>
                  ))}
                  <div
                    className="px-3 py-2 text-blue-400 hover:bg-neutral-800 cursor-pointer border-t border-neutral-800"
                    onClick={() => addTabToCategory(cat)}
                  >
                    ＋ Add Tab
                  </div>
                  <div
                    className="px-3 py-2 text-red-400 hover:bg-neutral-800 cursor-pointer border-t border-neutral-800"
                    onClick={() => removeCategory(cat)}
                  >
                    🗑 Delete Category
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <main className="p-6">
        {showSettings ? (
          <div className="max-w-3xl mx-auto space-y-6">
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

            <BehaviorSettings settings={settings} setSettings={setSettings} />
          </div>
        ) : (
          <>
            {activeTab === "Dashboard" ? (
              <div className="space-y-6">
                <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="text-sm text-neutral-400">Inventory Value</div>
                      <div className="text-3xl font-extrabold text-blue-300">{fmtMoney(grandTotal)}€</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
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
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
