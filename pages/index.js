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
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const [categories, setCategories] = useState({});
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [activeCatCtx, setActiveCatCtx] = useState(null);

  const [colorMenu, setColorMenu] = useState({
    open: false,
    cat: null,
    tab: null,
    index: null,
    x: 0,
    y: 0,
  });

  /* --------------------------- Load / Save --------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCategories(JSON.parse(localStorage.getItem("cs2-categories")) || {});
    setSettings(JSON.parse(localStorage.getItem("cs2-settings")) || DEFAULT_SETTINGS);
    setLastUpdatedAt(localStorage.getItem("cs2-lastUpdatedAt") || null);
  }, []);
  useEffect(() => {
    localStorage.setItem("cs2-categories", JSON.stringify(categories));
  }, [categories]);
  useEffect(() => {
    localStorage.setItem("cs2-settings", JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    if (lastUpdatedAt)
      localStorage.setItem("cs2-lastUpdatedAt", lastUpdatedAt);
  }, [lastUpdatedAt]);

  /* ------------------------------- Category Logic ------------------------------- */
  const addCategory = () => {
    const name = prompt("New category name:");
    if (!name || categories[name]) return;
    setCategories({ ...categories, [name]: {} });
  };
  const removeCategory = (name) => {
    const hasTabs = Object.keys(categories[name] || {}).length > 0;
    if (hasTabs) return alert("❌ Cannot delete a category that has tabs.");
    if (!confirm(`Delete category "${name}"?`)) return;
    const next = { ...categories };
    delete next[name];
    setCategories(next);
    if (activeCategory === name) setActiveCategory(null);
  };
  const addTabToCategory = (cat) => {
    const tab = prompt(`New tab inside "${cat}":`);
    if (!tab || categories[cat][tab]) return;
    const next = { ...categories };
    next[cat][tab] = [];
    setCategories(next);
    setActiveTab(tab);
    setActiveCatCtx(cat);
  };
  const removeTabFromCategory = (cat, tab) => {
    if (!confirm(`Delete tab "${tab}" from "${cat}"?`)) return;
    const next = { ...categories };
    delete next[cat][tab];
    setCategories(next);
    if (activeTab === tab) setActiveTab("Dashboard");
  };
  const openTab = (cat, tab) => {
    setActiveCategory(null);
    setActiveTab(tab);
    setActiveCatCtx(cat);
    setShowSettings(false);
  };

  /* ------------------------------- Items ------------------------------- */
  const addRow = () => {
    if (!activeCatCtx || !activeTab || activeTab === "Dashboard") return;
    const next = { ...categories };
    const rows = next[activeCatCtx][activeTab] || [];
    rows.push({ name: "", qty: 1, price: 0, colorHex: "", locked: false });
    next[activeCatCtx][activeTab] = rows;
    setCategories(next);
  };
  const toggleLockRow = (i) => {
    const next = { ...categories };
    const rows = next[activeCatCtx][activeTab] || [];
    rows[i].locked = !rows[i].locked;
    next[activeCatCtx][activeTab] = rows;
    setCategories(next);
  };
  const deleteRow = (i) => {
    if (!confirm("Delete this item?")) return;
    const next = { ...categories };
    const rows = [...(next[activeCatCtx][activeTab] || [])];
    rows.splice(i, 1);
    next[activeCatCtx][activeTab] = rows;
    setCategories(next);
  };

  /* ---------------------- Color Menu ---------------------- */
  const openColorMenuAtButton = (cat, tab, i, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 200;
    const y = rect.bottom + menuHeight > window.innerHeight ? rect.top - menuHeight - 6 : rect.bottom + 6;
    setColorMenu({ open: true, cat, tab, index: i, x: rect.left, y });
  };
  const closeColorMenu = () =>
    setColorMenu({ open: false, cat: null, tab: null, index: null, x: 0, y: 0 });
  const applyColorToRow = (cat, tab, i, hex) => {
    const next = { ...categories };
    const rows = [...(next[cat]?.[tab] || [])];
    if (!rows[i]) return;
    rows[i].colorHex = hex;
    next[cat][tab] = rows;
    setCategories(next);
    closeColorMenu();
  };
  useEffect(() => {
    const closeAll = () => setActiveCategory(null);
    document.body.addEventListener("click", closeAll);
    return () => document.body.removeEventListener("click", closeAll);
  }, []);

  /* -------------------------- Behavior Settings -------------------------- */
  function BehaviorSettings({ settings, setSettings }) {
    const [temp, setTemp] = useState(settings);
    useEffect(() => setTemp(settings), [settings]);
    return (
      <section className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
        <h2 className="text-xl font-semibold mb-4">Behavior</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Snapshot time</label>
            <input
              type="time"
              value={temp.snapshotTimeHHMM}
              onChange={(e) => setTemp({ ...temp, snapshotTimeHHMM: e.target.value })}
              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Auto refresh (min)</label>
            <input
              type="number"
              value={temp.refreshMinutes}
              onChange={(e) => setTemp({ ...temp, refreshMinutes: Number(e.target.value) })}
              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700"
            />
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={() => setSettings(temp)}
            className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm"
          >
            💾 Save Changes
          </button>
        </div>
      </section>
    );
  }

  /* -------------------------- UI -------------------------- */
  return (
    <div className="min-h-screen text-gray-100 font-sans bg-gradient-to-br from-[#050505] to-[#121212]">
      {/* Header */}
      <header className="px-6 py-4 border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-sm">
        <div className="grid grid-cols-3 items-center">
          <div>
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
              className={`group relative px-7 py-2 text-sm font-semibold rounded-full transition-all ${
                activeTab === "Dashboard"
                  ? "text-white bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-[1.05]"
                  : "text-neutral-300 bg-neutral-800 hover:bg-neutral-700 hover:text-white"
              }`}
            >
              Dashboard
            </button>
          </div>
          <div className="justify-self-end flex items-center gap-3">
            <button onClick={addCategory} className="bg-blue-800 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm">
              ＋ Add Category
            </button>
            <button
              onClick={() => {
                setShowSettings((s) => !s);
                setActiveTab("Dashboard");
              }}
              className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {/* Category Bar */}
      {!showSettings && (
        <div className="flex flex-wrap justify-center gap-2 px-6 py-3 bg-neutral-900/50 border-b border-neutral-800">
          {Object.keys(categories).length === 0 && (
            <div className="text-neutral-500 text-sm italic">No categories yet — click “＋ Add Category”.</div>
          )}
          {Object.keys(categories).map((cat) => (
            <div key={cat} className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveCategory((prev) => (prev === cat ? null : cat));
                }}
                className={`px-4 py-1.5 rounded-lg font-semibold ${
                  activeCategory === cat ? "bg-blue-700 text-white" : "bg-neutral-800 text-gray-300 hover:bg-neutral-700"
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
                      className={`flex justify-between items-center px-3 py-2 hover:bg-neutral-800 cursor-pointer ${
                        activeTab === tab && activeCatCtx === cat ? "bg-blue-900/40" : ""
                      }`}
                      onClick={() => openTab(cat, tab)}
                    >
                      <span>{tab}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTabFromCategory(cat, tab);
                        }}
                        className="opacity-40 hover:opacity-100 text-red-400 hover:text-red-500 text-sm"
                      >
                        ✖
                      </button>
                    </div>
                  ))}
                  <div className="px-3 py-2 text-blue-400 hover:bg-neutral-800 cursor-pointer border-t border-neutral-800" onClick={() => addTabToCategory(cat)}>
                    ＋ Add Tab
                  </div>
                  <div className="px-3 py-2 text-red-400 hover:bg-neutral-800 cursor-pointer border-t border-neutral-800" onClick={() => removeCategory(cat)}>
                    🗑 Delete Category
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main className="p-6">
        {showSettings ? (
          <div className="max-w-3xl mx-auto space-y-6">
            <BehaviorSettings settings={settings} setSettings={setSettings} />
          </div>
        ) : activeTab === "Dashboard" ? (
          <div className="text-center text-blue-300 text-lg mt-10">Welcome to your Dashboard 💎</div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">{activeTab}</h2>
              <button onClick={addRow} className="bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm">
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
                  {(categories[activeCatCtx]?.[activeTab] || []).map((row, i) => {
                    const total = (row.price || 0) * (row.qty || 0);
                    const tint = hexToRgba(row.colorHex || "", 0.5);
                    return (
                      <tr key={i} style={tint ? { backgroundColor: tint } : {}} className="border-b border-neutral-800 hover:bg-neutral-800/40 transition">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => openColorMenuAtButton(activeCatCtx, activeTab, i, e)} className="h-4 w-4 rounded border border-neutral-700" style={{ backgroundColor: row.colorHex || "transparent" }} />
                            <input
                              value={row.name || ""}
                              disabled={row.locked}
                              onChange={(e) => {
                                const next = { ...categories };
                                const rows = [...(next[activeCatCtx][activeTab] || [])];
                                rows[i].name = e.target.value;
                                next[activeCatCtx][activeTab] = rows;
                                setCategories(next);
                              }}
                              placeholder="Item name"
                              className="bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 w-full"
                            />
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => {
                                const next = { ...categories };
                                const rows = [...(next[activeCatCtx][activeTab] || [])];
                                rows[i].qty = Math.max(0, (rows[i].qty || 0) - 1);
                                next[activeCatCtx][activeTab] = rows;
                                setCategories(next);
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
                                const val = e.target.value.replace(/\D/g, "");
                                const next = { ...categories };
                            const rows = [...(next[activeCatCtx][activeTab] || [])];
                            rows[i].qty = Number(val);
                            next[activeCatCtx][activeTab] = rows;
                            setCategories(next);
                          }}
                          className="w-12 text-center bg-neutral-800 text-gray-100 rounded border border-neutral-700"
                        />
                        <button
                          onClick={() => {
                            const next = { ...categories };
                            const rows = [...(next[activeCatCtx][activeTab] || [])];
                            rows[i].qty = (rows[i].qty || 0) + 1;
                            next[activeCatCtx][activeTab] = rows;
                            setCategories(next);
                          }}
                          className="px-2 py-0.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="p-2 text-center text-green-400">{fmtMoney(row.price || 0)}</td>
                    <td className="p-2 text-center text-neutral-400">—</td>
                    <td className="p-2 text-center text-blue-300">{fmtMoney(total)}</td>
                    <td className="p-2 text-center">
                      <button onClick={() => toggleLockRow(i)} className="text-neutral-300 hover:text-blue-300">{row.locked ? "🔒" : "🔓"}</button>
                      <button onClick={() => deleteRow(i)} className="ml-3 text-red-400 hover:text-red-500">🗑</button>
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
    <div id="color-menu-portal" className="fixed z-50" style={{ top: colorMenu.y, left: colorMenu.x }}>
      <div className="bg-neutral-900 border border-neutral-700 rounded-md shadow-lg p-2 min-w-[180px]">
        <div className="text-xs text-neutral-400 px-1 pb-1">Choose color</div>
        <button onClick={() => applyColorToRow(colorMenu.cat, colorMenu.tab, colorMenu.index, "")} className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 text-sm">
          <span className="h-3 w-3 rounded border border-neutral-600 bg-transparent" />
          None
        </button>
        {settings.colors.map((c) => (
          <button key={c.name + c.hex} onClick={() => applyColorToRow(colorMenu.cat, colorMenu.tab, colorMenu.index, c.hex)} className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 text-sm">
            <span className="h-3 w-3 rounded border border-neutral-600" style={{ backgroundColor: c.hex }} />
            {c.name}
          </button>
        ))}
      </div>
    </div>
  )}
</div>
);
}
