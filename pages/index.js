console.log("✅ Tailwind connected!");

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Navbar = ({ tabs, setTabs, active, setActive }) => {
  const addTab = () => {
    const name = prompt("New tab name:");
    if (!name) return;
    const newTab = { id: Date.now(), name, rows: [], cols: ["Name", "Quantity"] };
    setTabs([...tabs, newTab]);
    setActive(newTab.id);
  };

  const deleteTab = (id) => {
    if (!confirm("Delete this tab?")) return;
    const updated = tabs.filter((t) => t.id !== id);
    setTabs(updated);
    if (active === id) setActive(null);
  };

  return (
    <nav className="flex items-center justify-between bg-gray-900 text-gray-100 px-4 py-2 shadow">
      <h1 className="text-lg font-bold tracking-wide">💎 CS2 Prices</h1>
      <div className="flex items-center gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg cursor-pointer transition ${
              active === t.id
                ? "bg-teal-600 text-white"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
            onClick={() => setActive(t.id)}
          >
            {t.name}
            <button
              className="text-xs opacity-70 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                deleteTab(t.id);
              }}
            >
              🗑️
            </button>
          </div>
        ))}
        <button
          onClick={addTab}
          className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-3 py-1 rounded-lg"
        >
          + New Tab
        </button>
      </div>
    </nav>
  );
};

const PageGrid = ({ page }) => {
  const [rows, setRows] = useState(page.rows || []);
  const [cols, setCols] = useState(page.cols || ["Name", "Quantity"]);

  useEffect(() => {
    localStorage.setItem(
      `page-${page.id}`,
      JSON.stringify({ rows, cols })
    );
  }, [rows, cols, page.id]);

  const addRow = () => {
    const newRow = Array(cols.length).fill("");
    setRows([...rows, newRow]);
  };

  const addCol = () => {
    const name = prompt("Column name:");
    if (!name) return;
    setCols([...cols, name]);
    setRows(rows.map((r) => [...r, ""]));
  };

  const updateCell = (r, c, value) => {
    const updated = [...rows];
    updated[r][c] = value;
    setRows(updated);
  };

  return (
    <div className="p-6">
      <div className="flex justify-end gap-2 mb-3">
        <button
          onClick={addCol}
          className="bg-gray-700 hover:bg-gray-600 text-sm px-3 py-1 rounded text-white"
        >
          + Column
        </button>
        <button
          onClick={addRow}
          className="bg-teal-600 hover:bg-teal-500 text-sm px-3 py-1 rounded text-white"
        >
          + Row
        </button>
      </div>
      <div className="overflow-x-auto border border-gray-700 rounded-lg">
        <table className="w-full text-sm text-gray-100">
          <thead className="bg-gray-800">
            <tr>
              {cols.map((c, i) => (
                <th key={i} className="px-3 py-2 text-left">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-gray-900 even:bg-gray-800">
                {r.map((cell, j) => (
                  <td key={j} className="px-3 py-2">
                    <input
                      className="bg-transparent border border-gray-700 rounded w-full px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      value={cell}
                      onChange={(e) => updateCell(i, j, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function App() {
  const [tabs, setTabs] = useState(() => {
    const saved = localStorage.getItem("tabs");
    return saved ? JSON.parse(saved) : [{ id: 1, name: "Dashboard", rows: [], cols: [] }];
  });
  const [active, setActive] = useState(tabs[0]?.id || null);

  useEffect(() => {
    localStorage.setItem("tabs", JSON.stringify(tabs));
  }, [tabs]);

  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navbar tabs={tabs} setTabs={setTabs} active={active} setActive={setActive} />
      <main className="p-6">
        <AnimatePresence mode="wait">
          {activeTab ? (
            <motion.div
              key={activeTab.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab.name === "Dashboard" ? (
                <div className="text-center text-gray-400 mt-20">
                  <h2 className="text-2xl font-bold mb-2">Welcome to your CS2 Inventory Dashboard</h2>
                  <p>Create tabs using the “+ New Tab” button to begin tracking items.</p>
                </div>
              ) : (
                <PageGrid page={activeTab} />
              )}
            </motion.div>
          ) : (
            <p>No tab selected.</p>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
