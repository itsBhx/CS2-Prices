import { useEffect, useMemo, useRef, useState } from "react";

function getCETDateKey(d = new Date()) {
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
const DEFAULT_SETTINGS = {
  colors: [
    { name: "Red", hex: "#ea9999" },
    { name: "Pink", hex: "#d5a6bd" },
    { name: "Purple", hex: "#b4a7d6" },
    { name: "Blue", hex: "#a4c2f4" },
  ],
  snapshotHourCET: 19,
  refreshMinutes: 10,
};
export default function Home() {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [showSettings, setShowSettings] = useState(false);
  const [data, setData] = useState({});
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(false);
  const [snapshots, setSnapshots] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [lastUpdated, setLastUpdated] = useState(null);
  const refreshTimerRef = useRef(null);
  const [openPalette, setOpenPalette] = useState(null);
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
  const addRow = () => {
    if (activeTab === "Dashboard" || showSettings) return;
    const rows = data[activeTab] || [];
    setData({
      ...data,
      [activeTab]: [
        ...rows,
        { name: "", qty: 1, price: 0, colorHex: "", locked: false },
      ],
    });
  };
  const deleteRow = (i) => {
    if (!confirm("Delete this item?")) return;
    const rows = [...(data[activeTab] || [])];
    rows.splice(i, 1);
    setData({ ...data, [activeTab]: rows });
  };
  const toggleLock = (i) => {
    const rows = [...(data[activeTab] || [])];
    rows[i].locked = !rows[i].locked;
    setData({ ...data, [activeTab]: rows });
  };
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
  const todayKey = getCETDateKey();
  const dashSnap = snapshots["dashboard"];
  const dashPct =
    dashSnap && dashSnap.value > 0
      ? ((grandTotalNum - dashSnap.value) / dashSnap.value) * 100
      : null;
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
          if (base) fluctPct = ((newPrice - base) / base) * 100;
          else fluctPct = 0;
        } else {
          fluctPct = null;
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
            await fetchPriceForRow(tab, i);
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        setLastUpdated(new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }));
      } finally {
        setLoading(false);
      }
    };
    const last = localStorage.getItem("cs2-lastUpdated");
    const lastTs = last ? Number(last) : 0;
    const now = Date.now();
    const minutes = Math.max(1, Number(settings.refreshMinutes || 10));
    if (now - lastTs > minutes * 60 * 1000) doRefreshAll();
    refreshTimerRef.current = setInterval(doRefreshAll, minutes * 60 * 1000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [tabs, settings.refreshMinutes, showSettings]);
  useEffect(() => {
    if (lastUpdated) localStorage.setItem("cs2-lastUpdated", Date.now());
  }, [lastUpdated]);
  return (
    <div className="min-h-screen text-gray-100 font-sans bg-gradient-to-br from-[#0e0e10] to-[#1a1a1d]">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/60 backdrop-blur-sm">
        <div>
          <h1
            className="text-xl font-bold"
            style={{
              background: "linear-gradient(90deg, rgba(96,165,250,1) 0%, rgba(56,189,248,1) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            💎 CS2 Prices Dashboard
          </h1>
          <div className="text-sm text-blue-400/80 mt-1">
            {lastUpdated ? `Last updated at ${lastUpdated} CET` : "Updating prices…"}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 sm:mt-0">
          <button
            onClick={addTab}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm transition"
          >
            ＋ Add Tab
          </button>
          <button
            onClick={() => {
              setShowSettings((s) => !s);
              setActiveTab("Dashboard");
            }}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition"
          >
            ⚙️
          </button>
        </div>
      </header>
      {/* The rest of the layout stays identical to your existing tables; you'd merge here the new actions with color palette dropdown, lock/unlock, and confirm delete logic. */}
    </div>
  );
}
