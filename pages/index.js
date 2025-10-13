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

/* --------------------------- Formatting helpers ------------------------------ */
const fmtMoney = (n) => (isFinite(n) ? Number(n).toFixed(2) : "0.00");
const sign = (n) => (n > 0 ? "+" : "");

/* ---------------------------------------------------------------------------- */
export default function Home() {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [data, setData] = useState({}); // { [tabName]: Array<{name, qty, price, prevPrice?, fluctPct?}> }
  const [totals, setTotals] = useState({}); // { [tabName]: number }
  const [loading, setLoading] = useState(false);

  // snapshots: { [key]: { value:number, ts:number, dateKey:string } }
  // keys: "dashboard" and each tab name
  const [snapshots, setSnapshots] = useState({});
  const refreshTimerRef = useRef(null);

  /* ---------------------------- Load from localStorage ---------------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTabs = JSON.parse(localStorage.getItem("cs2-tabs")) || ["Dashboard"];
    const savedData = JSON.parse(localStorage.getItem("cs2-data")) || {};
    const savedSnaps = JSON.parse(localStorage.getItem("cs2-snapshots") || "{}");
    setTabs(savedTabs);
    setData(savedData);
    setSnapshots(savedSnaps);
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

  /* -------------------------------- Tab mgmt ----------------------------------- */
  const addTab = () => {
    const name = prompt("Enter new tab name:");
    if (!name) return;
    if (tabs.includes(name)) return;
    const nextTabs = [...tabs, name];
    setTabs(nextTabs);
    setData({ ...data, [name]: [] });
    setActiveTab(name);
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
    if (activeTab === "Dashboard") return;
    const rows = data[activeTab] || [];
    setData({
      ...data,
      [activeTab]: [...rows, { name: "", qty: 1, price: 0 }],
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

  /* ----------------------- Auto snapshot at 19:00 CET daily ---------------------- */
  useEffect(() => {
    // Take snapshot if:
    // - it's CET hour >= 19
    // - AND (no dashboard snapshot for today OR its dateKey !== today)
    const hour = getCETHour();
    if (hour < 19) return; // not yet 19:00 CET

    const needSnapshot = !dashSnap || dashSnap.dateKey !== todayKey;
    if (!needSnapshot) return;

    // Build snapshots for dashboard + each tab
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
    // persisted by snapshots effect
  }, [grandTotalNum, totals, tabs, dashSnap, todayKey, snapshots]);

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

        // compute fluctuation based on previous price if it existed
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
          prevPrice: wasSeenBefore ? oldPrice : newPrice, // keep last known price for next diff
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
  const handleNameBlur = (i, name) => {
    fetchPriceForRow(activeTab, i);
  };

  /* --------------------------- Auto refresh every 10 min ------------------------- */
  useEffect(() => {
    if (!tabs.length) return;
    // Clear existing timer (if hot reloaded)
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);

    const doRefreshAll = async () => {
      setLoading(true);
      try {
        // Process tabs sequentially to avoid hammering the API
        for (const tab of tabs) {
          if (tab === "Dashboard") continue;
          const rows = data[tab] || [];
          for (let i = 0; i < rows.length; i++) {
            const name = rows[i]?.name?.trim();
            if (!name) continue;
            // fetch sequentially
            // eslint-disable-next-line no-await-in-loop
            await fetchPriceForRow(tab, i);
            // small delay to be polite
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 250));
          }
        }
      } finally {
        setLoading(false);
      }
    };

    // kick off immediately once after mount/tabs/data ready
    doRefreshAll();

    // then every 10 minutes
    refreshTimerRef.current = setInterval(doRefreshAll, 10 * 60 * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]); // run when tabs list changes

  /* ------------------------------------ UI ------------------------------------- */
  const dashChangeColor =
    dashPct == null
      ? "text-gray-300"
      : dashPct > 0
      ? "text-green-400"
      : dashPct < 0
      ? "text-red-400"
      : "text-gray-300";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
        <h1 className="text-xl font-bold text-blue-400">💎 CS2 Prices Dashboard</h1>
        <button
          onClick={addTab}
          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm"
        >
          ＋ Add Tab
        </button>
      </header>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-2 px-6 py-3 bg-gray-900 border-b border-gray-800">
        {tabs.map((tab) => (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg cursor-pointer ${
              activeTab === tab ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"
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

      {/* Main */}
      <main className="p-6">
        {activeTab === "Dashboard" ? (
          <div className="space-y-6">
            {/* Inventory + fluctuation banner */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-400">Inventory Value</div>
                  <div className="text-3xl font-extrabold text-blue-400">{fmtMoney(grandTotalNum)}€</div>
                </div>
                <div className="text-base font-semibold">
                  {dashPct == null ? (
                    <span className="text-gray-400">
                      Daily snapshot will auto-save at 19:00 CET.
                    </span>
                  ) : (
                    <span className={dashChangeColor}>
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
            <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow">
              {tabs
                .filter((t) => t !== "Dashboard")
                .map((t) => (
                  <div
                    key={t}
                    className="flex justify-between py-2 border-b border-gray-800 last:border-0"
                  >
                    <span>{t}</span>
                    <span className="text-green-400">
                      {fmtMoney(totals[t] || 0)}€
                    </span>
                  </div>
                ))}
              <div className="flex justify-between mt-4 text-lg font-bold">
                <span>Total Inventory</span>
                <span className="text-blue-400">{fmtMoney(grandTotalNum)}€</span>
              </div>
            </div>
          </div>
        ) : (
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
                    return (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-900">
                        <td className="p-2">
                          <input
                            value={row.name}
                            onChange={(e) => {
                              const rows = [...(data[activeTab] || [])];
                              rows[i].name = e.target.value;
                              setData({ ...data, [activeTab]: rows });
                            }}
                            onBlur={() => handleNameBlur(i, row.name)}
                            placeholder="Item name (e.g., Snakebite Case)"
                            className="w-full bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min={0}
                            value={row.qty}
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
                      <td colSpan={6} className="p-4 text-center text-gray-400">
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
        <div className="fixed bottom-4 right-4 bg-gray-900 px-4 py-2 rounded-lg shadow border border-gray-700 text-sm text-gray-300">
          Updating prices…
        </div>
      )}
    </div>
  );
}
