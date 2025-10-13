import { useEffect, useState } from "react";

export default function Home() {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [data, setData] = useState({});
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(false);

  // NEW: last snapshot for fluctuation banner
  const [lastSnapshot, setLastSnapshot] = useState(null); // { value: number, ts: number }

  /* ---------- Load from localStorage (client only) ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedTabs = JSON.parse(localStorage.getItem("cs2-tabs")) || ["Dashboard"];
    const savedData = JSON.parse(localStorage.getItem("cs2-data")) || {};
    const savedSnap = JSON.parse(localStorage.getItem("cs2-lastSnapshot") || "null");

    setTabs(savedTabs);
    setData(savedData);
    setLastSnapshot(savedSnap);
  }, []);

  /* ---------- Persist to localStorage ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cs2-tabs", JSON.stringify(tabs));
    localStorage.setItem("cs2-data", JSON.stringify(data));
  }, [tabs, data]);

  /* ---------- Tab management ---------- */
  const addTab = () => {
    const name = prompt("Enter new tab name:");
    if (!name || tabs.includes(name)) return;
    setTabs([...tabs, name]);
    setData({ ...data, [name]: [] });
  };

  const removeTab = (tab) => {
    if (tab === "Dashboard") return;
    if (confirm(`Delete "${tab}" tab?`)) {
      const newTabs = tabs.filter((t) => t !== tab);
      const newData = { ...data };
      delete newData[tab];
      setTabs(newTabs);
      setData(newData);
      if (activeTab === tab) setActiveTab("Dashboard");
    }
  };

  /* ---------- Row management ---------- */
  const addRow = () => {
    if (activeTab === "Dashboard") return;
    setData({
      ...data,
      [activeTab]: [...(data[activeTab] || []), { name: "", qty: 1, price: 0 }],
    });
  };

  const deleteRow = (i) => {
    const updated = [...(data[activeTab] || [])];
    updated.splice(i, 1);
    setData({ ...data, [activeTab]: updated });
  };

  /* ---------- Live price fetch ---------- */
  const fetchPrice = async (i, name) => {
    if (!name?.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/price?name=${encodeURIComponent(name)}`);
      const json = await res.json();
      if (json.ok && json.lowest != null) {
        const updated = [...(data[activeTab] || [])];
        updated[i].price = Number(json.lowest);
        setData({ ...data, [activeTab]: updated });
      } else {
        alert(`Price not found for "${name}"`);
      }
    } catch (e) {
      console.error(e);
      alert("Error fetching price");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Totals per tab + grand total ---------- */
  useEffect(() => {
    const t = {};
    for (const tab of tabs) {
      if (!data[tab]) continue;
      t[tab] = data[tab].reduce((sum, r) => sum + (Number(r.qty || 0) * Number(r.price || 0)), 0);
    }
    setTotals(t);
  }, [data, tabs]);

  const grandTotalNum = Object.values(totals).reduce((a, b) => a + (b || 0), 0);
  const grandTotal = grandTotalNum.toFixed(2);

  /* ---------- Fluctuation logic ---------- */
  const percentChange = (() => {
    if (!lastSnapshot || !lastSnapshot.value || lastSnapshot.value <= 0) return null;
    const diff = grandTotalNum - lastSnapshot.value;
    return (diff / lastSnapshot.value) * 100;
  })();

  const changeColor =
    percentChange == null
      ? "text-gray-300"
      : percentChange >= 0
      ? "text-green-400"
      : "text-red-400";

  const changeSign = percentChange != null && percentChange >= 0 ? "+" : "";

  const saveSnapshot = () => {
    const snap = { value: Number(grandTotalNum.toFixed(2)), ts: Date.now() };
    setLastSnapshot(snap);
    if (typeof window !== "undefined") {
      localStorage.setItem("cs2-lastSnapshot", JSON.stringify(snap));
    }
  };

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
            {/* Fluctuation banner */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm text-gray-400">Inventory value</div>
                  <div className="text-2xl font-bold text-blue-400">{grandTotal}€</div>
                </div>
                <div className="text-sm">
                  {percentChange == null ? (
                    <span className="text-gray-400">
                      No snapshot yet. Save one to track fluctuations.
                    </span>
                  ) : (
                    <span className={changeColor}>
                      {changeSign}
                      {percentChange.toFixed(2)}% since last snapshot
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveSnapshot}
                    className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-sm"
                  >
                    Save Snapshot
                  </button>
                  {lastSnapshot && (
                    <div className="text-xs text-gray-400">
                      Last: {new Date(lastSnapshot.ts).toLocaleString()}
                    </div>
                  )}
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
                      {totals[t]?.toFixed(2) || "0.00"}€
                    </span>
                  </div>
                ))}
              <div className="flex justify-between mt-4 text-lg font-bold">
                <span>Total Inventory</span>
                <span className="text-blue-400">{grandTotal}€</span>
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
                    <th className="p-2 text-center">Total (€)</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data[activeTab] || []).map((row, i) => (
                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-900">
                      <td className="p-2">
                        <input
                          value={row.name}
                          onChange={(e) => {
                            const updated = [...(data[activeTab] || [])];
                            updated[i].name = e.target.value;
                            setData({ ...data, [activeTab]: updated });
                          }}
                          onBlur={() => fetchPrice(i, row.name)}
                          placeholder="Item name (e.g., Snakebite Case)"
                          className="w-full bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          value={row.qty}
                          min={0}
                          onChange={(e) => {
                            const updated = [...(data[activeTab] || [])];
                            updated[i].qty = Number(e.target.value);
                            setData({ ...data, [activeTab]: updated });
                          }}
                          className="w-16 bg-gray-800 text-center rounded border border-gray-700 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-2 text-center text-green-400">
                        {row.price != null ? Number(row.price).toFixed(2) : "—"}
                      </td>
                      <td className="p-2 text-center text-blue-400">
                        {((Number(row.price) || 0) * (Number(row.qty) || 0)).toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => deleteRow(i)}
                          className="text-red-400 hover:text-red-500"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(data[activeTab] || []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-gray-400">
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
          Fetching live prices…
        </div>
      )}
    </div>
  );
}
