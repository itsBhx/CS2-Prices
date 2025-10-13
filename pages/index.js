import { useState, useEffect } from "react";

export default function Home() {
  const [tabs, setTabs] = useState(["Dashboard"]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [data, setData] = useState({ Dashboard: [] });
  const [colorMenu, setColorMenu] = useState({ open: false });
  const [settings, setSettings] = useState({
    colors: [
      { name: "Red", hex: "#ea9999" },
      { name: "Pink", hex: "#d5a6bd" },
      { name: "Purple", hex: "#b4a7d6" },
      { name: "Blue", hex: "#a4c2f4" },
    ],
    refreshInterval: 10,
  });
  const [lastUpdated, setLastUpdated] = useState("--:--");
  const [loading, setLoading] = useState(false);

  /* ---------- WEST TIME ---------- */
  const getWESTTime = () =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

  /* ---------- PRICE FETCH ---------- */
  async function fetchPrices() {
    const newData = { ...data };
    setLoading(true);

    for (const tab of Object.keys(newData)) {
      for (const row of newData[tab]) {
        if (!row.name) continue;
        try {
          const res = await fetch(
            `/api/price?name=${encodeURIComponent(row.name)}`
          );
          const json = await res.json();
          if (json.ok) {
            const newPrice = json.lowest;
            const oldPrice = row.price || 0;
            const fluct =
              oldPrice > 0
                ? (((newPrice - oldPrice) / oldPrice) * 100).toFixed(2)
                : 0;
            row.fluct = fluct;
            row.price = newPrice;
          }
        } catch (e) {
          console.warn("Error fetching", row.name, e);
        }
      }
    }

    setData(newData);
    setLastUpdated(getWESTTime());
    setLoading(false);
  }

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, settings.refreshInterval * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  /* ---------- ROW CONTROLS ---------- */
  function addRow() {
    const rows = [...(data[activeTab] || [])];
    rows.push({
      name: "",
      quantity: 1,
      price: 0,
      colorHex: "",
      locked: false,
      fluct: 0,
    });
    setData({ ...data, [activeTab]: rows });
  }

  function deleteRow(i) {
    if (!confirm("Are you sure you want to delete this row?")) return;
    const rows = [...(data[activeTab] || [])];
    rows.splice(i, 1);
    setData({ ...data, [activeTab]: rows });
  }

  function toggleLock(i) {
    const rows = [...(data[activeTab] || [])];
    rows[i].locked = !rows[i].locked;
    setData({ ...data, [activeTab]: rows });
  }

  /* ---------- COLOR MENU ---------- */
  function openColorMenuAtButton(tabName, rowIndex, e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setColorMenu({
      open: true,
      tab: tabName,
      index: rowIndex,
      x: rect.left,
      y: rect.bottom + 6,
    });
  }

  function closeColorMenu() {
    setColorMenu({ open: false });
  }

  function applyColorToRow(tabName, rowIndex, hex) {
    const rows = [...(data[tabName] || [])];
    if (!rows[rowIndex]) return;
    rows[rowIndex].colorHex = hex;
    setData({ ...data, [tabName]: rows });
    closeColorMenu();
  }

  useEffect(() => {
    if (!colorMenu.open) return;
    const onDocClick = (e) => {
      const el = document.getElementById("color-menu-portal");
      if (el && el.contains(e.target)) return;
      closeColorMenu();
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [colorMenu.open]);

  /* ---------- TABS ---------- */
  function addTab() {
    const name = prompt("Enter new tab name:");
    if (!name) return;
    if (tabs.includes(name)) return alert("Tab already exists!");
    setTabs([...tabs, name]);
    setData({ ...data, [name]: [] });
    setActiveTab(name);
  }

  function deleteTab(name) {
    if (name === "Dashboard") return alert("Cannot delete Dashboard");
    if (!confirm(`Delete tab "${name}"?`)) return;
    const filtered = tabs.filter((t) => t !== name);
    const newData = { ...data };
    delete newData[name];
    setTabs(filtered);
    setData(newData);
    setActiveTab("Dashboard");
  }

  /* ---------- COMPUTE ---------- */
  const totalValue =
    data[activeTab]?.reduce(
      (a, r) => a + (r.price || 0) * (r.quantity || 0),
      0
    ) || 0;

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-gray-200 font-sans"
      onClick={closeColorMenu}
    >
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-gradient-to-b from-[#111] to-[#0a0a0a]">
        <h1 className="text-xl font-bold">💎 CS2 Prices Dashboard</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={addTab}
            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-white"
          >
            + Add Tab
          </button>
          <span className="text-sm text-gray-400">
            Last updated at {lastUpdated} WEST
          </span>
        </div>
      </header>

      <nav className="flex gap-3 px-6 py-3 border-b border-neutral-800 bg-[#0d0d0d]">
        {tabs.map((t) => (
          <div
            key={t}
            className={`px-3 py-1.5 rounded-t-md cursor-pointer transition ${
              activeTab === t
                ? "bg-blue-700 text-white"
                : "bg-neutral-900 hover:bg-neutral-800"
            }`}
            onClick={() => setActiveTab(t)}
          >
            {t}
            {t !== "Dashboard" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteTab(t);
                }}
                className="ml-2 text-red-400 hover:text-red-500"
              >
                ✖
              </button>
            )}
          </div>
        ))}
        <div className="ml-auto text-gray-500 text-xl cursor-pointer">⚙️</div>
      </nav>

      <main className="p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-neutral-900 text-gray-300 text-sm">
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-right">Quantity</th>
                <th className="p-2 text-right">Price (€)</th>
                <th className="p-2 text-right">Fluctuation %</th>
                <th className="p-2 text-right">Total (€)</th>
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data[activeTab]?.map((row, i) => {
                const bg = row.colorHex ? `${row.colorHex}40` : "transparent";
                const steamHref = row.name
                  ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(
                      row.name
                    )}`
                  : null;
                return (
                  <tr
                    key={i}
                    style={{ backgroundColor: bg }}
                    className="border-t border-neutral-800 hover:bg-neutral-800/50 transition"
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) =>
                            openColorMenuAtButton(activeTab, i, e)
                          }
                          className="h-4 w-4 rounded border border-neutral-700 hover:border-blue-400 transition"
                          style={{
                            backgroundColor: row.colorHex || "transparent",
                          }}
                          title="Set rarity color"
                        />
                        <input
                          value={row.name}
                          disabled={row.locked}
                          onChange={(e) => {
                            const rows = [...(data[activeTab] || [])];
                            rows[i].name = e.target.value;
                            setData({ ...data, [activeTab]: rows });
                          }}
                          className={`w-full bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-blue-600 outline-none ${
                            row.locked ? "opacity-60 cursor-not-allowed" : ""
                          }`}
                          placeholder="Item name"
                        />
                        {steamHref ? (
                          <a
                            href={steamHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neutral-400 hover:text-blue-300 text-sm"
                          >
                            ↗
                          </a>
                        ) : (
                          <span className="text-neutral-700 text-sm">↗</span>
                        )}
                      </div>
                    </td>

                    <td className="p-2 text-right">
                      <input
                        type="number"
                        disabled={row.locked}
                        value={row.quantity}
                        onChange={(e) => {
                          const rows = [...(data[activeTab] || [])];
                          rows[i].quantity = parseInt(e.target.value) || 0;
                          setData({ ...data, [activeTab]: rows });
                        }}
                        className="w-20 bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 text-right"
                      />
                    </td>

                    <td className="p-2 text-right">
                      {row.price ? row.price.toFixed(2) : "—"}
                    </td>

                    <td
                      className={`p-2 text-right ${
                        row.fluct > 0
                          ? "text-green-400"
                          : row.fluct < 0
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}
                    >
                      {row.fluct ? `${row.fluct}%` : "0%"}
                    </td>

                    <td className="p-2 text-right">
                      {((row.price || 0) * (row.quantity || 0)).toFixed(2)}
                    </td>

                    <td className="p-2 text-center">
                      <div className="flex justify-center gap-3">
                        <button
                          onClick={() => toggleLock(i)}
                          className={`${
                            row.locked ? "text-blue-400" : "text-gray-500"
                          } hover:text-blue-500`}
                        >
                          🔒
                        </button>
                        <button
                          onClick={() => deleteRow(i)}
                          className="text-red-400 hover:text-red-500"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-gray-300">
          <button
            onClick={addRow}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded text-white"
          >
            + Add Row
          </button>
          <div className="text-lg font-bold">
            Total: {totalValue.toFixed(2)} €
          </div>
        </div>
      </main>

      {/* Color Picker Dropdown */}
      {colorMenu.open && (
        <div
          id="color-menu-portal"
          className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-md shadow-lg p-2 min-w-[160px] animate-fadeSlide"
          style={{
            top: colorMenu.y,
            left: colorMenu.x,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {settings.colors.map((c) => (
            <div
              key={c.hex}
              onClick={() => applyColorToRow(colorMenu.tab, colorMenu.index, c.hex)}
              className="flex items-center gap-2 p-1 hover:bg-neutral-800 cursor-pointer rounded transition"
            >
              <div
                className="w-4 h-4 rounded border border-neutral-700"
                style={{ backgroundColor: c.hex }}
              />
              <span>{c.name}</span>
            </div>
          ))}
          <style jsx global>{`
            @keyframes fadeSlide {
              from {
                opacity: 0;
                transform: translateY(-4px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            .animate-fadeSlide {
              animation: fadeSlide 0.15s ease-out;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
