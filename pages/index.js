import { useEffect, useState } from "react";

export default function Home() {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [data, setData] = useState({});
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(false);

  // Load from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTabs = JSON.parse(localStorage.getItem("cs2-tabs")) || ["Dashboard"];
    const savedData = JSON.parse(localStorage.getItem("cs2-data")) || {};
    setTabs(savedTabs);
    setData(savedData);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("cs2-tabs", JSON.stringify(tabs));
    localStorage.setItem("cs2-data", JSON.stringify(data));
  }, [tabs, data]);

  // Add / delete tabs
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

  // Add / delete rows
  const addRow = () => {
    setData({
      ...data,
      [activeTab]: [...(data[activeTab] || []), { name: "", qty: 1, price: 0 }],
    });
  };

  const deleteRow = (i) => {
    const updated = [...data[activeTab]];
    updated.splice(i, 1);
    setData({ ...data, [activeTab]: updated });
  };

  // Fetch price
  const fetchPrice = async (i, name) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/price?name=${encodeURIComponent(name)}`);
      const json = await res.json();
      if (json.ok && json.lowest) {
        const updated = [...data[activeTab]];
        updated[i].price = json.lowest;
        setData({ ...data, [activeTab]: updated });
      } else {
        alert("Price not found for " + name);
      }
    } catch (e) {
      console.error(e);
      alert("Error fetching price");
    } finally {
      setLoading(false);
    }
  };

  // Update totals
  useEffect(() => {
    const t = {};
    for (const tab of tabs) {
      if (!data[tab]) continue;
      t[tab] = data[tab].reduce((sum, r) => sum + (r.qty * r.price || 0), 0);
    }
    setTotals(t);
  }, [data, tabs]);

  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0).toFixed(2);

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

      {/* Main Content */}
      <main className="p-6">
        {activeTab === "Dashboard" ? (
          <div>
            <h2 className="text-2xl font-semibold mb-3">Inventory Overview</h2>
            <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow">
              {tabs
                .filter((t) => t !== "Dashboard")
                .map((t) => (
                  <div key={t} className="flex justify-between py-2 border-b border-gray-800 last:border-0">
                    <span>{t}</span>
                    <span className="text-green-400">{totals[t]?.toFixed(2) || "0.00"}€</span>
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
                            const updated = [...data[activeTab]];
                            updated[i].name = e.target.value;
                            setData({ ...data, [activeTab]: updated });
                          }}
                          onBlur={() => fetchPrice(i, row.name)}
                          placeholder="Item name"
                          className="w-full bg-gray-800 text-gray-100 px-2 py-1 rounded border border-gray-700 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          value={row.qty}
                          onChange={(e) => {
                            const updated = [...data[activeTab]];
                            updated[i].qty = Number(e.target.value);
                            setData({ ...data, [activeTab]: updated });
                          }}
                          className="w-16 bg-gray-800 text-center rounded border border-gray-700 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-2 text-center text-green-400">{row.price?.toFixed(2) || "—"}</td>
                      <td className="p-2 text-center text-blue-400">
                        {(row.price * row.qty).toFixed(2)}
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
