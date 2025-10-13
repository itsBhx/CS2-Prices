import { useEffect, useState } from "react";

export default function Home() {
  const [tabs, setTabs] = useState(["Dashboard"]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [data, setData] = useState({ Dashboard: [] });
  const [colorMenu, setColorMenu] = useState({ open: false });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  /* ================== HELPERS ================== */
  const getWESTDate = () =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

  function openColorMenuAtButton(tab, index, e) {
    const rect = e.currentTarget.getBoundingClientRect();
    setColorMenu({
      open: true,
      x: rect.left,
      y: rect.bottom + 6,
      tab,
      index,
    });
  }

  const closeColorMenu = () => setColorMenu({ open: false });

  function updateColor(tab, index, colorHex) {
    const rows = [...(data[tab] || [])];
    rows[index].colorHex = colorHex;
    setData({ ...data, [tab]: rows });
    closeColorMenu();
  }

  /* ================== REFRESH + SNAPSHOT ================== */
  async function fetchPrices() {
    setLoading(true);
    const newData = { ...data };

    for (const tab of Object.keys(data)) {
      for (const row of data[tab]) {
        if (!row.name) continue;
        try {
          const res = await fetch(
            `/api/price?name=${encodeURIComponent(row.name)}`
          );
          const json = await res.json();
          if (json.ok) {
            const newPrice = json.lowest;
            row.fluct =
              row.price && row.price > 0
                ? (((newPrice - row.price) / row.price) * 100).toFixed(2)
                : 0;
            row.price = newPrice;
          }
        } catch (e) {
          console.log("Error fetching", row.name, e);
        }
      }
    }

    setData(newData);
    setLoading(false);
    setLastUpdated(getWESTDate());
  }

  // auto refresh every 10 min
  useEffect(() => {
    fetchPrices();
    const int = setInterval(fetchPrices, 10 * 60 * 1000);
    return () => clearInterval(int);
  }, []);

  /* ================== ROW CONTROLS ================== */
  function addRow() {
    const rows = [...(data[activeTab] || [])];
    rows.push({ name: "", quantity: 1, price: 0, colorHex: "", locked: false });
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

  /* ================== TAB CONTROLS ================== */
  function addTab() {
    const name = prompt("Enter tab name:");
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

  /* ================== UI ================== */
  const totalValue =
    data[activeTab]?.reduce(
      (a, r) => a + (r.price || 0) * (r.quantity || 0),
      0
    ) || 0;

  return (
    <div
      className="min-h-screen bg-[#0b0b0b] text-gray-200 font-sans"
      onClick={closeColorMenu}
    >
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-gradient-to-b from-[#101010] to-[#0b0b0b]">
        <h1 className="text-xl font-bold tracking-wide">
          💎 CS2 Prices Dashboard
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={addTab}
            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded text-white"
          >
            + Add Tab
          </button>
          <span className="text-sm text-gray-400">
            Last updated at {lastUpdated || "--:--"} WEST
          </span>
        </div>
      </header>

      <nav className="flex gap-3 px-6 py-3 border-b border-neutral-800 bg-[#0e0e0e]">
        {tabs.map((t) => (
          <div
            key={t}
            className={`relative px-3 py-1.5 rounded-t-md cursor-pointer transition ${
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
                const steamHref = row.name
                  ? `https://steamcommunity.com/market/listings/730/${encodeURIComponent(
                      row.name
                    )}`
                  : null;
                const bgColor = row.colorHex
                  ? `${row.colorHex}40`
                  : "transparent";
                return (
                  <tr
                    key={i}
                    className="border-t border-neutral-800 hover:bg-neutral-800/50 transition"
                    style={{ backgroundColor: bgColor }}
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
                          value={row.name || ""}
                          disabled={!!row.locked}
                          onChange={(e) => {
                            const rows = [...(data[activeTab] || [])];
                            rows[i].name = e.target.value;
                            setData({ ...data, [activeTab]: rows });
                          }}
                          placeholder="Item name"
                          className={`w-full bg-neutral-800 text-gray-100 px-2 py-1 rounded border border-neutral-700 focus:border-blue-600 outline-none ${
                            row.locked ? "opacity-60 cursor-not-allowed" : ""
                          }`}
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
                        value={row.quantity || 1}
                        disabled={!!row.locked}
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
                      <div className="flex justify-center gap-2">
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

      {/* Floating Color Menu */}
      {colorMenu.open && (
        <div
          className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-md shadow-lg p-2 min-w-[160px]"
          style={{
            top: colorMenu.y,
            left: colorMenu.x,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { name: "Red", hex: "#ea9999" },
            { name: "Pink", hex: "#d5a6bd" },
            { name: "Purple", hex: "#b4a7d6" },
            { name: "Blue", hex: "#a4c2f4" },
          ].map((c) => (
            <div
              key={c.name}
              onClick={() => updateColor(colorMenu.tab, colorMenu.index, c.hex)}
              className="flex items-center gap-2 p-1 hover:bg-neutral-800 cursor-pointer rounded transition"
            >
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: c.hex }}
              ></div>
              <span>{c.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
