import { useEffect, useState } from "react";

export default function Home() {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [inventory, setInventory] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Load saved data from localStorage (browser only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTabs = JSON.parse(localStorage.getItem("cs2-tabs")) || ["Dashboard"];
      const savedInventory = JSON.parse(localStorage.getItem("cs2-inventory")) || [];
      setTabs(savedTabs);
      setInventory(savedInventory);
    }
  }, []);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("cs2-tabs", JSON.stringify(tabs));
      localStorage.setItem("cs2-inventory", JSON.stringify(inventory));
    }
  }, [tabs, inventory]);

  // Add or remove custom tabs (Majors, Stickers, etc.)
  const addTab = () => {
    const name = prompt("Enter new tab name:");
    if (name && !tabs.includes(name)) setTabs([...tabs, name]);
  };

  const removeTab = (name) => {
    if (name !== "Dashboard" && confirm(`Delete tab "${name}"?`)) {
      setTabs(tabs.filter((t) => t !== name));
      if (activeTab === name) setActiveTab("Dashboard");
    }
  };

  // Mock total for demonstration
  const totalValue = inventory.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900">
        <h1 className="text-xl font-bold text-blue-400">💎 CS2 Prices Dashboard</h1>
        <div className="flex items-center space-x-2">
          <button
            onClick={addTab}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm"
          >
            ＋ Add Tab
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-2 px-6 py-3 bg-gray-900 border-b border-gray-800">
        {tabs.map((tab) => (
          <div
            key={tab}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg cursor-pointer ${
              tab === activeTab ? "bg-blue-600 text-white" : "bg-gray-800 hover:bg-gray-700"
            }`}
            onClick={() => setActiveTab(tab)}
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
            <h2 className="text-2xl font-semibold mb-3">Your Inventory Overview</h2>
            <p className="text-gray-400 mb-4">
              Current Total Value: <span className="text-green-400 font-semibold">{totalValue}€</span>
            </p>
            <p className="text-sm text-gray-500">
              {lastUpdated ? `Last updated: ${new Date(lastUpdated).toLocaleTimeString()}` : ""}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-xl font-semibold">{activeTab}</h2>
            <p className="text-gray-400 mt-2">
              This is your <strong>{activeTab}</strong> collection page.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
