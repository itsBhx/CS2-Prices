import { useEffect, useMemo, useRef, useState } from "react";

/* --------------------------- Timezone helpers (CET) -------------------------- */
function getCETDateKey(d = new Date()) {
  // YYYY-MM-DD in Europe/Paris (CET/CEST)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function getCETHour(d = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      hour12: false,
    }).format(d)
  );
}

/* ------------------------------ Color utilities ------------------------------ */
function hexToRgba(hex, alpha = 0.4) {
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

const fmtMoney = (n) => (isFinite(n) ? Number(n).toFixed(2) : "0.00");
const sign = (n) => (n > 0 ? "+" : "");

/* ---------------------------- Default Settings ------------------------------- */
const DEFAULT_SETTINGS = {
  colors: [
    { name: "Red",    hex: "#ea9999" },
    { name: "Pink",   hex: "#d5a6bd" },
    { name: "Purple", hex: "#b4a7d6" },
    { name: "Blue",   hex: "#a4c2f4" },
  ],
  snapshotHourCET: 19,
  refreshMinutes: 10,
};

export default function Home() {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showSettings, setShowSettings] = useState(false);

  // data: { [tabName]: Array<{name, qty, price, prevPrice?, fluctPct?, colorHex?, colorChoice?:string, customHex?:string}> }
  const [data, setData] = useState({});
  const [totals, setTotals] = useState({}); // { [tabName]: number }
  const [loading, setLoading] = useState(false);

  // snapshots: { [key]: { value:number, ts:number, dateKey:string } }
  // keys: "dashboard" and each tab name
  const [snapshots, setSnapshots] = useState({});

  // settings: rarity colors + behavior (snapshot hour, refresh minutes)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const refreshTimerRef = useRef(null);

  /* ---------------------------- Load from localStorage ---------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTabs = JSON.parse(localStorage.getItem("cs2-tabs")) || ["Dashboard"];
    const savedData = JSON.parse(localStorage.getItem("cs2-data")) || {};
    const savedSnaps = JSON.parse(localStorage.getItem("cs2-snapshots") || "{}");
    const savedSettings = JSON.parse(localStorage.getItem("cs2-settings") || "null");

    setTabs(savedTabs);
    setData(savedData);
    setSnapshots(savedSnaps);
    setSettings(savedSettings || DEFAULT_SETTINGS);
  }, []);

  /* ---------------------------- Persist to localStorage --------------------------- */
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

  /* -------------------------------- Tab mgmt ----------------------------------- */
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

  /* -------------------------------- Rows mgmt ---------------------------------- */
  const addRow = () => {
    if (activeTab === "Dashboard" || showSettings) return;
    const rows = data[activeTab] || [];
    setData({
      ...data,
      [activeTab]: [...rows, { name: "", qty: 1, price: 0, colorChoice: "none", colorHex: "" }],
    });
  };

  const deleteRow = (i) => {
    const rows = [...(data[activeTab] || [])];
    rows.splice(i, 1);
    setData({ ...data, [activeTab]: rows });
  };

  /* ---------------------------- Compute totals per tab --------------------------- */
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

  /* ----------------------- Dashboard fluctuation vs snapshot --------------------- */
  const todayKey = getCETDateKey();
  const dashSnap = snapshots["dashboard"]; // may be undefined initially
  const dashPct =
    dashSnap && dashSnap.value > 0
      ? ((grandTotalNum - dashSnap.value) / dashSnap.value) * 100
      : null;

  /* ----------------------- Auto snapshot at settings.snapshotHourCET CET --------- */
  useEffect(() => {
    const hour = getCETHour();
    const targetHour = Number(settings.snapshotHourCET || 19);
    if (hour < targetHour) return;

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
  }, [grandTotalNum, totals, tabs, dashSnap, todayKey, snapshots, settings.snapshotHourCET]);

  /* ---------------------------- Fetch single item price -------------------------- */
  async function fetchPriceForRow(tabName, rowIndex) {
    const rows = data[tabName] || [];
    const row = rows[rowIndex];
    if (!row || !row.name?.trim()) return;

    try {
      const res = await fetch(`/api/price?name=${encodeURIComponent(row.name)}`);
      const json = await res.json();
      if (json.ok && json.lowest != null) {
        const oldPrice = Number(row.price || 0);
        const newPrice = Number(json.lowest);

        const updated = [...rows];
        const wasSeenBefore = isFinite(oldPrice) && oldPrice > 0;

        let fluctPct = row.fluctPct ?? null;
        if (wasSeenBefore) {
          const base = oldPrice === 0 ? null : oldPrice;
          if (base) {
            fluctPct = ((newPrice - base) / base) * 100;
          } else {
            fluctPct = 0;
          }
        } else {
          fluctPct = null; // show "—" until we have a previous price
        }

        updated[rowIndex] = {
          ...row,
          prevPrice: wasSeenBefore ? oldPrice : newPrice,
          price: newPrice,
          fluctPct,
        };

        setData((prev) => ({ ...prev, [tabName]: updated }));
      }
    } catch (e) {
      console.error("Fetch price error:", e);
    }
  }

  /* ----------------------------- Manual onBlur fetch ----------------------------- */
  const handleNameBlur = (i) => {
    if (showSettings) return;
    fetchPriceForRow(activeTab, i);
  };

  /* --------------------------- Auto refresh every N min ------------------------- */
  useEffect(() => {
    if (!tabs.length) return;

    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);

    const doRefreshAll = async () => {
      if (showSettings) return;
      setLoading(true);
      try {
        for (const tab of tabs) {
          if (tab === "Dashboard") continue;
          const rows = data[tab] || [];
          for (let i = 0; i < rows.length; i++) {
            const name = rows[i]?.name?.trim();
            if (!name) continue;
            // eslint-disable-next-line no-await-in-loop
            await fetchPriceForRow(tab, i);
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      } finally {
        setLoading(false);
      }
    };

    // run once now
    doRefreshAll();

    const minutes = Math.max(1, Number(settings.refreshMinutes || 10));
    refreshTimerRef.current = setInterval(doRefreshAll, minutes * 60 * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, settings.refreshMinutes, showSettings]);

  /* ------------------------------------ UI ------------------------------------- */
  const dashChangeColor =
    dashPct == null
      ? "text-gray-300"
      : dashPct > 0
      ? "text-green-400"
      : dashPct < 0
      ? "text-red-400"
      : "text-gray-300";

  /* --------------------------- Settings helpers --------------------------------- */
  const addColorPreset = () => {
    setSettings((prev) => ({
      ...prev,
      colors: [...prev.colors, { name: "New", hex: "#ffffff" }],
    }));
  };
  const updateColorPreset = (index, key, value) => {
    setSettings((prev) => {
      const next = [...prev.colors];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, colors: next };
    });
  };
  const removeColorPreset = (index) => {
    setSettings((prev) => {
      const next = [...prev.colors];
      next.splice(index, 1);
      return { ...prev, colors: next };
    });
  };

  /* --------------------------- Row color change --------------------------------- */
  const applyPresetToRow = (rowIndex, choice) => {
    const rows = [...(data[activeTab] || [])];
    const row = rows[rowIndex] || {};
    let colorHex = "";

    if (choice === "none") {
      colorHex = "";
    } else if (choice === "custom") {
      colorHex = row.customHex || "";
    } else {
      const preset = settings.colors.find((c) => c.name === choice);
      if (preset) colorHex = preset.hex;
    }

    rows[rowIndex] = { ...row, colorChoice: choice, colorHex };
    setData({ ...data, [activeTab]: rows });
  };

  const setCustomHexForRow = (rowIndex, hex) => {
    const rows = [...(data[activeTab] || [])];
    const row = rows[rowIndex] || {};
    let colorHex = row.colorHex;
    if (row.colorChoice === "custom") {
      colorHex = hex;
    }
    rows[rowIndex] = { ...row, customHex: hex, colorHex };
    setData({ ...data, [activeTab]: rows });
  };

  /* --------------------------------- Render ------------------------------------ */
  return (
    <div className="min-h-screen text-gray-100 font-sans bg-gradient-to-br from-[#0e0e10] to-[#1a1a1d]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/60 backdrop-blur-sm">
        <h1
          className="text-xl font-bold"
          style={{
            background:
              "linear-gradient(90deg, rgba(96,165,250,1) 0%, rgba(56,189,248,1) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          💎 CS2 Prices Dashboard
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={addTab}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
            title="Add Tab"
          >
            ＋ Add Tab
          </button>
          <button
            onClick={() => {
              setShowSettings((s) => !s);
              setActiveTab("Dashboard");
            }}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition"
            title="Settings"
          >
            <span aria-hidden>⚙️</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      {!showSettings && (
        <nav className="flex flex-wrap gap-2 px-6 py-3 bg-gray-900/50 border-b border-gray-800">
          {tabs.map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg cursor-pointer transition ${
                activeTab === tab ? "bg-blue-600 shadow-md shadow-blue-900/30" : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              <span>{tab}</span>
              {tab !== "Dashboard" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab);
                  }}
                  className="text-xs text-gray-300 hover:text-red-400"
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
          /* ------------------------------ SETTINGS VIEW ------------------------------ */
          <div className="max-w-4xl mx-auto space-y-8">
            <section className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Rarity Colors</h2>

              <div className="space-y-3">
                {settings.colors.map((c, idx) => (
                  <div
                    key={idx}
                    className="grid md:grid-cols-[1fr,220px,80px,auto] grid-cols-1 gap-3 items-center bg-gray-800/50 rounded-lg p-3"
                  >
                    <input
                      value={c.name}
                      onChange={(e) => updateColorPreset(idx, "name", e.target.value)}
                      placeholder="Name (e.g., Purple)"
                      className="bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                    />
                    <input
                      value={c.hex}
                      onChange={(e) => updateColorPreset(idx, "hex", e.target.value)}
                      placeholder="#aabbcc"
                      className="bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                    />
                    <div
                      className="h-8 w-12 rounded border border-gray-700"
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
                  className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm"
                >
                  ＋ Add Color
                </button>
              </div>
            </section>

            <section className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Behavior</h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <label className="block text-sm text-gray-400 mb-1">
                    Snapshot time (CET, hour 0–23)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={settings.snapshotHourCET}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        snapshotHourCET: Math.max(0, Math.min(23, Number(e.target.value))),
                      }))
                    }
                    className="w-28 bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="bg-gray-800/50 rounded-lg p-3">
                  <label className="block text-sm text-gray-400 mb-1">
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
                    className="w-28 bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </section>
          </div>
        ) : activeTab === "Dashboard" ? (
          /* ------------------------------ DASHBOARD VIEW ----------------------------- */
          <div className="space-y-6">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-400">Inventory Value</div>
                  <div className="text-3xl font-extrabold text-blue-400 drop-shadow-sm">
                    {fmtMoney(grandTotalNum)}€
                  </div>
                </div>
                <div className="text-base font-semibold">
                  {dashPct == null ? (
                    <span className="text-gray-400">
                      Daily snapshot will auto-save at {settings.snapshotHourCET}:00 CET.
                    </span>
                  ) : (
                    <span
                      className={
                        dashPct > 0
                          ? "text-green-400"
                          : dashPct < 0
                          ? "text-red-400"
                          : "text-gray-300"
                      }
                    >
                      {sign(dashPct)}
                      {isFinite(dashPct) ? Math.abs(dashPct).toFixed(2) : "0.00"}% since last snapshot
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {snapshots["dashboard"]
                    ? `Last snapshot: ${new Date(snapshots["dashboard"].ts).toLocaleString()} (CET daily)`
                    : `No snapshot yet`}
                </div>
              </div>
            </div>

            {/* Per-tab totals + Grand total */}
            <div className="bg-gray-900/60 p-4 rounded-xl border border-gray-800 shadow">
              {tabs
                .filter((t) => t !== "Dashboard")
                .map((t) => (
                  <div
                    key={t}
                    className="flex justify-between py-2 border-b border-gray-800 last:border-0"
                  >
                    <span>{t}</span>
                    <span className="text-green-400">{fmtMoney(totals[t] || 0)}€</span>
                  </div>
                ))}
              <div className="flex justify-between mt-4 text-lg font-bold">
                <span>Total Inventory</span>
                <span className="text-blue-400">{fmtMoney(grandTotalNum)}€</span>
              </div>
            </div>
          </div>
        ) : (
          /* ------------------------------ TAB VIEW ----------------------------------- */
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">{activeTab}</h2>
              <button
                onClick={addRow}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm"
              >
                ＋ Add Item
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-800 text-gray-300">
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-center">Price (€)</th>
                    <th className="p-2 text-center">Fluctuation %</th>
                    <th className="p-2 text-center">Color</th>
                    <th className="p-2 text-center">Total (€)</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data[activeTab] || []).map((row, i) => {
                    const total = (Number(row.price) || 0) * (Number(row.qty) || 0);
                    let fluctText = "—";
                    let fluctClass = "text-gray-400";
                    if (row.fluctPct != null) {
                      if (row.fluctPct > 0) fluctClass = "text-green-400";
                      else if (row.fluctPct < 0) fluctClass = "text-red-400";
                      else fluctClass = "text-gray-300";
                      fluctText = `${sign(row.fluctPct)}${Math.abs(row.fluctPct).toFixed(2)}%`;
                    }

                    const tint = hexToRgba(row.colorHex || "", 0.4);
                    return (
                      <tr
                        key={i}
                        className="border-b border-gray-800 transition-transform duration-150 ease-out hover:-translate-y-[1px] hover:shadow-lg hover:shadow-black/30"
                        style={tint ? { backgroundColor: tint } : {}}
                      >
                        <td className="p-2">
                          <input
                            value={row.name || ""}
                            onChange={(e) => {
                              const rows = [...(data[activeTab] || [])];
                              rows[i].name = e.target.value;
                              setData({ ...data, [activeTab]: rows });
                            }}
                            onBlur={() => handleNameBlur(i)}
                            placeholder="Item name (e.g., Snakebite Case)"
                            className="w-full bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={row.qty ?? 1}
                            onChange={(e) => {
                              const rows = [...(data[activeTab] || [])];
                              rows[i].qty = Number(e.target.value);
                              setData({ ...data, [activeTab]: rows });
                            }}
                            className="w-16 bg-gray-800 text-center rounded border border-gray-700 focus:border-blue-500 outline-none"
                          />
                        </td>
                        <td className="p-2 text-center text-green-400">
                          {row.price != null ? fmtMoney(row.price) : "—"}
                        </td>
                        <td className={`p-2 text-center font-medium ${fluctClass}`}>{fluctText}</td>

                        {/* Color column: dropdown + optional custom hex */}
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-5 w-5 rounded border border-gray-700"
                              style={{ backgroundColor: row.colorHex || "transparent" }}
                              title={row.colorHex || "No color"}
                            />
                            <select
                              value={row.colorChoice || "none"}
                              onChange={(e) => applyPresetToRow(i, e.target.value)}
                              className="bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                            >
                              <option value="none">None</option>
                              {settings.colors.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                              <option value="custom">Custom…</option>
                            </select>
                          </div>
                          {row.colorChoice === "custom" && (
                            <div className="mt-2">
                              <input
                                value={row.customHex || ""}
                                onChange={(e) => setCustomHexForRow(i, e.target.value)}
                                placeholder="#hex"
                                className="w-[140px] bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                              />
                            </div>
                          )}
                        </td>

                        <td className="p-2 text-center text-blue-400">{fmtMoney(total)}</td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => deleteRow(i)}
                            className="text-red-400 hover:text-red-500"
                            title="Delete row"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(data[activeTab] || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-gray-400">
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

      {loading && (
        <div className="fixed bottom-4 right-4 bg-gray-900/80 px-4 py-2 rounded-lg shadow border border-gray-700 text-sm text-gray-300">
          Updating prices…
        </div>
      )}
    </div>
  );
}
