// /pages/index.js
import { useEffect, useMemo, useRef, useState } from "react";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_SETTINGS = {
  colors: [
    { name: "Red", hex: "#ea9999" },
    { name: "Pink", hex: "#d5a6bd" },
    { name: "Purple", hex: "#b4a7d6" },
    { name: "Blue", hex: "#a4c2f4" },
  ],
  behavior: {
    snapshotTime: "19:00", // CET
    autoRefreshInterval: 10, // minutes
  },
};

const LS_KEYS = {
  TABS: "cs2-tabs",
  DATA: "cs2-data",
  SETTINGS: "cs2-settings",
  LAST_UPDATED: "cs2-lastUpdated",
  SNAPSHOTS: "cs2-snapshots", // reserved for future per-tab snapshots
};

function loadJSON(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function hexToRgba(hex, alpha = 0.4) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatMoney(n) {
  if (n == null || Number.isNaN(n)) return "€0.00";
  return `€${n.toFixed(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function useOutsideClick(ref, onClickOutside) {
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClickOutside?.();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, onClickOutside]);
}

function ColorDropdown({ anchorRef, open, onClose, options, onSelect }) {
  const popRef = useRef(null);
  useOutsideClick(popRef, onClose);

  if (!open) return null;

  const rect = anchorRef.current?.getBoundingClientRect();
  const style = rect
    ? {
        position: "fixed",
        top: rect.bottom + 6,
        left: Math.max(12, rect.left - 6),
        zIndex: 50,
      }
    : {};

  return (
    <div
      ref={popRef}
      style={style}
      className="min-w-[180px] rounded-xl border border-white/10 bg-[#141416] shadow-xl"
    >
      <div className="p-2">
        {options.map((opt) => (
          <button
            key={opt.name + opt.hex}
            onClick={() => {
              onSelect(opt);
              onClose?.();
            }}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5 transition"
          >
            <span
              className="inline-block h-4 w-4 rounded"
              style={{ background: opt.hex }}
            />
            <span className="text-sm text-white/90">{opt.name}</span>
            <span className="ml-auto text-[10px] text-white/40">{opt.hex}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function IndexPage() {
  const [tabs, setTabs] = useState(() => {
    const initial = loadJSON(LS_KEYS.TABS, null);
    if (initial && initial.length) return initial;
    const first = [{ id: uid(), name: "Stickers" }];
    saveJSON(LS_KEYS.TABS, first);
    return first;
  });

  const [activeTabId, setActiveTabId] = useState(() => tabs[0]?.id);
  useEffect(() => {
    if (!tabs.find((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id);
    }
  }, [tabs, activeTabId]);

  const [data, setData] = useState(() => {
    const d = loadJSON(LS_KEYS.DATA, {});
    // ensure structure per tab
    tabs.forEach((t) => {
      if (!d[t.id]) d[t.id] = [];
    });
    saveJSON(LS_KEYS.DATA, d);
    return d;
  });

  // settings (rarity colors + behavior)
  const [settings, setSettings] = useState(() => {
    const s = loadJSON(LS_KEYS.SETTINGS, DEFAULT_SETTINGS);
    // merge defaults if missing
    const merged = {
      colors: Array.isArray(s.colors) && s.colors.length ? s.colors : DEFAULT_SETTINGS.colors,
      behavior: {
        snapshotTime: s.behavior?.snapshotTime || DEFAULT_SETTINGS.behavior.snapshotTime,
        autoRefreshInterval:
          Number(s.behavior?.autoRefreshInterval) > 0
            ? Number(s.behavior?.autoRefreshInterval)
            : DEFAULT_SETTINGS.behavior.autoRefreshInterval,
      },
    };
    saveJSON(LS_KEYS.SETTINGS, merged);
    return merged;
  });

  const [showSettings, setShowSettings] = useState(false);
  const [lastUpdatedIso, setLastUpdatedIso] = useState(() => loadJSON(LS_KEYS.LAST_UPDATED, null));

  // Pricing refresh control
  const intervalMs = useMemo(() => Math.max(1, settings.behavior.autoRefreshInterval) * 60 * 1000, [settings]);
  const refreshTimerRef = useRef(null);
  const isRefreshingRef = useRef(false);

  // Color palette dropdown control (per-row)
  const [colorMenuFor, setColorMenuFor] = useState(null); // itemId or null
  const colorButtonRef = useRef(null);

  function persistData(next) {
    setData(next);
    saveJSON(LS_KEYS.DATA, next);
  }

  function persistTabs(next) {
    setTabs(next);
    saveJSON(LS_KEYS.TABS, next);
  }

  function persistSettings(next) {
    setSettings(next);
    saveJSON(LS_KEYS.SETTINGS, next);
  }

  function persistLastUpdated(iso) {
    setLastUpdatedIso(iso);
    saveJSON(LS_KEYS.LAST_UPDATED, iso);
  }

  function addTab() {
    const name = prompt("New tab name:");
    if (!name) return;
    const nextTabs = [...tabs, { id: uid(), name: name.trim() }];
    const nextData = { ...data, [nextTabs[nextTabs.length - 1].id]: [] };
    persistTabs(nextTabs);
    persistData(nextData);
    setActiveTabId(nextTabs[nextTabs.length - 1].id);
  }

  function deleteTab(tabId) {
    if (!confirm("Delete this tab and all its items?")) return;
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    const nextData = { ...data };
    delete nextData[tabId];
    persistTabs(nextTabs);
    persistData(nextData);
    if (activeTabId === tabId && nextTabs.length) setActiveTabId(nextTabs[0].id);
  }

  function addRow() {
    const next = { ...data };
    const list = next[activeTabId] || [];
    list.push({
      id: uid(),
      name: "",
      quantity: 1,
      price: 0,
      baselinePrice: null, // used for fluctuation reference
      fluctuation: 0,
      color: settings.colors?.[2]?.hex || "#b4a7d6", // default purple-ish
      locked: false,
      lastPrice: null,
      lastUpdated: null,
    });
    next[activeTabId] = list;
    persistData(next);
  }

  function deleteRow(itemId) {
    const item = (data[activeTabId] || []).find((x) => x.id === itemId);
    const label = item?.name?.trim() ? `"${item.name.trim()}"` : "this item";
    if (!confirm(`Delete ${label}?`)) return;
    const next = { ...data };
    next[activeTabId] = (next[activeTabId] || []).filter((r) => r.id !== itemId);
    persistData(next);
  }

  function updateItem(itemId, patch) {
    const next = { ...data };
    next[activeTabId] = (next[activeTabId] || []).map((r) => (r.id === itemId ? { ...r, ...patch } : r));
    persistData(next);
  }

  function totalForRow(row) {
    return Number(row.quantity || 0) * Number(row.price || 0);
  }

  function totalForTab(tabId) {
    const list = data[tabId] || [];
    return list.reduce((acc, r) => acc + totalForRow(r), 0);
  }

  const portfolioValue = useMemo(() => {
    return tabs.reduce((acc, t) => acc + totalForTab(t.id), 0);
  }, [tabs, data]);

  async function fetchPriceForName(name) {
    if (!name) return null;
    try {
      const res = await fetch(`/api/price?name=${encodeURIComponent(name)}`);
      if (!res.ok) return null;
      const json = await res.json();
      if (typeof json?.price !== "number") return null;
      return json.price;
    } catch {
      return null;
    }
  }

  async function refreshAllPrices() {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    const next = { ...data };
    const tabIds = tabs.map((t) => t.id);

    for (const tId of tabIds) {
      const list = next[tId] || [];
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (!it.name?.trim()) continue;
        const price = await fetchPriceForName(it.name.trim());
        if (typeof price === "number" && price >= 0) {
          const baseline =
            typeof it.baselinePrice === "number" && it.baselinePrice > 0 ? it.baselinePrice : price;
          const fluct = baseline > 0 ? ((price - baseline) / baseline) * 100 : 0;
          list[i] = {
            ...it,
            price,
            lastPrice: it.price,
            baselinePrice: baseline,
            fluctuation: Number.isFinite(fluct) ? fluct : 0,
            lastUpdated: nowIso(),
          };
        }
      }
      next[tId] = list;
    }

    persistData(next);
    const iso = nowIso();
    persistLastUpdated(iso);
    isRefreshingRef.current = false;
  }

  // Initial boot: ensure structures include all tabs
  useEffect(() => {
    setData((prev) => {
      const next = { ...prev };
      tabs.forEach((t) => {
        if (!next[t.id]) next[t.id] = [];
      });
      saveJSON(LS_KEYS.DATA, next);
      return next;
    });
  }, [tabs]);

  // Auto refresh timer
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    refreshTimerRef.current = setInterval(() => {
      refreshAllPrices();
    }, intervalMs);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, tabs, data]);

  // Refresh on reopen (if stale)
  useEffect(() => {
    function onFocus() {
      const last = loadJSON(LS_KEYS.LAST_UPDATED, null);
      if (!last) {
        refreshAllPrices();
        return;
      }
      const lastMs = Date.parse(last);
      if (!Number.isFinite(lastMs)) {
        refreshAllPrices();
        return;
      }
      const diff = Date.now() - lastMs;
      if (diff >= intervalMs) {
        refreshAllPrices();
      }
    }
    window.addEventListener("focus", onFocus);
    // Also run once on mount (first load)
    onFocus();
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  // Format "Last updated" as requested under the title (CET label)
  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedIso) return "—";
    try {
      const d = new Date(lastUpdatedIso);
      // Show HH:MM with user's (Lisbon) time; label as CET per your spec
      const time = d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${time} CET`;
    } catch {
      return "—";
    }
  }, [lastUpdatedIso]);

  // Settings modal state (for rarity colors + behavior)
  const [settingsDraft, setSettingsDraft] = useState(settings);
  useEffect(() => setSettingsDraft(settings), [showSettings]); // refresh draft when reopening

  function applySettings() {
    const sanitized = {
      colors: (settingsDraft.colors || []).filter(
        (c) => c.name?.trim() && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.hex?.trim())
      ),
      behavior: {
        snapshotTime: settingsDraft.behavior?.snapshotTime || "19:00",
        autoRefreshInterval:
          Number(settingsDraft.behavior?.autoRefreshInterval) > 0
            ? Number(settingsDraft.behavior?.autoRefreshInterval)
            : 10,
      },
    };
    persistSettings(sanitized);
    setShowSettings(false);
  }

  const activeList = data[activeTabId] || [];

  const headerGlow = "from-[#0e0e10] via-[#121215] to-[#1a1a1d]";
  const cardBg = "bg-[#121216]";

  return (
    <div className={`min-h-screen w-full bg-gradient-to-b ${headerGlow} text-white`}>
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#9ecbff] drop-shadow">
              💎 CS2 Prices Dashboard
            </h1>
            <div className="mt-1 text-sm text-[#9ecbff]/70">
              Last updated at {lastUpdatedLabel}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={addTab}
              className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5 transition"
              title="Add Tab"
            >
              + Add Tab
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-xl border border-white/10 p-2 hover:bg-white/5 transition"
              aria-label="Settings"
              title="Settings"
            >
              <span className="text-lg">⚙️</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={`${cardBg} rounded-2xl border border-white/10 p-3 mb-4`}>
          <div className="flex items-center gap-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTabId(t.id)}
                className={`rounded-xl px-3 py-2 text-sm transition whitespace-nowrap ${
                  activeTabId === t.id
                    ? "bg-white/10 text-white"
                    : "hover:bg-white/5 text-white/80"
                }`}
              >
                {t.name}
              </button>
            ))}
            {tabs.length > 1 && (
              <button
                onClick={() => deleteTab(activeTabId)}
                className="ml-auto rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 transition"
                title="Delete current tab"
              >
                Delete Tab
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className={`${cardBg} rounded-2xl border border-white/10 overflow-hidden`}>
          <div className="w-full overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f0f13]">
                <tr className="text-left text-sm text-white/70">
                  <th className="px-4 py-3 min-w-[220px]">Item Name</th>
                  <th className="px-4 py-3 w-[120px]">Quantity</th>
                  <th className="px-4 py-3 w-[140px]">Price (€)</th>
                  <th className="px-4 py-3 w-[160px]">Fluctuation (%)</th>
                  <th className="px-4 py-3 w-[160px]">Total (€)</th>
                  <th className="px-4 py-3 w-[160px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-white/50">
                      No items yet. Add your first line below.
                    </td>
                  </tr>
                )}
                {activeList.map((row) => {
                  const tinted = row.color ? hexToRgba(row.color, 0.4) : "transparent";
                  const locked = !!row.locked;
                  const total = totalForRow(row);
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-white/10 hover:bg-white/5 transition"
                      style={{ background: tinted }}
                    >
                      {/* Item Name */}
                      <td className="px-4 py-2">
                        <input
                          className={`w-full bg-transparent outline-none rounded-lg border border-transparent focus:border-white/20 px-3 py-2 transition ${
                            locked ? "opacity-70 cursor-not-allowed" : ""
                          }`}
                          placeholder="Sticker | Example (Holo)"
                          value={row.name}
                          onChange={(e) => {
                            if (locked) return;
                            updateItem(row.id, { name: e.target.value });
                          }}
                          disabled={locked}
                        />
                      </td>

                      {/* Quantity */}
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          className={`w-full bg-transparent outline-none rounded-lg border border-transparent focus:border-white/20 px-3 py-2 transition text-right ${
                            locked ? "opacity-70 cursor-not-allowed" : ""
                          }`}
                          value={row.quantity}
                          onChange={(e) => {
                            if (locked) return;
                            const v = Math.max(0, Number(e.target.value || 0));
                            updateItem(row.id, { quantity: v });
                          }}
                          disabled={locked}
                        />
                      </td>

                      {/* Price */}
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-white/90">{formatMoney(Number(row.price || 0))}</span>
                        </div>
                      </td>

                      {/* Fluctuation */}
                      <td className="px-4 py-2">
                        <div
                          className={`text-right ${
                            Number(row.fluctuation) > 0
                              ? "text-emerald-300"
                              : Number(row.fluctuation) < 0
                              ? "text-red-300"
                              : "text-white/70"
                          }`}
                        >
                          {Number.isFinite(Number(row.fluctuation))
                            ? `${Number(row.fluctuation).toFixed(2)}%`
                            : "0.00%"}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-2">
                        <div className="text-right">{formatMoney(total)}</div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {/* Color square */}
                          <button
                            ref={row.id === colorMenuFor ? colorButtonRef : null}
                            onClick={(e) => {
                              // set anchor ref to the clicked button
                              colorButtonRef.current = e.currentTarget;
                              setColorMenuFor((prev) => (prev === row.id ? null : row.id));
                            }}
                            title="Set rarity color"
                            className="h-7 w-7 rounded-md border border-white/15 hover:border-white/30 transition"
                            style={{ background: row.color || "#2a2a2a" }}
                          />
                          {colorMenuFor === row.id && (
                            <ColorDropdown
                              anchorRef={colorButtonRef}
                              open={true}
                              onClose={() => setColorMenuFor(null)}
                              options={settings.colors || []}
                              onSelect={(opt) => updateItem(row.id, { color: opt.hex })}
                            />
                          )}

                          {/* Lock / Unlock */}
                          <button
                            onClick={() => updateItem(row.id, { locked: !locked })}
                            className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 transition text-sm"
                            title={locked ? "Unlock row" : "Lock row"}
                          >
                            {locked ? "🔓" : "🔒"}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => deleteRow(row.id)}
                            className="rounded-lg border border-red-500/30 px-2 py-1 text-sm text-red-300 hover:bg-red-500/10 transition"
                            title="Delete row"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add row */}
          <div className="border-t border-white/10 px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-white/60">
              Tab total: <span className="text-white/90">{formatMoney(totalForTab(activeTabId))}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-white/60">
                Portfolio: <span className="text-white/90">{formatMoney(portfolioValue)}</span>
              </div>
              <button
                onClick={addRow}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5 transition"
              >
                + Add Row
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSettings(false)} />
          <div className="relative z-10 w-[min(96vw,720px)] rounded-2xl border border-white/10 bg-[#121216] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-[#9ecbff]">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-lg border border-white/10 px-3 py-1 text-sm hover:bg-white/5 transition"
              >
                Close
              </button>
            </div>

            {/* Rarity Colors */}
            <div className="mb-6">
              <div className="mb-2 text-sm text-white/70">Rarity Colors</div>
              <div className="space-y-2">
                {(settingsDraft.colors || []).map((c, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <input
                      className="w-44 bg-transparent outline-none rounded-lg border border-white/10 px-3 py-2 text-sm"
                      value={c.name}
                      onChange={(e) => {
                        const next = { ...settingsDraft };
                        next.colors[idx] = { ...next.colors[idx], name: e.target.value };
                        setSettingsDraft(next);
                      }}
                      placeholder="Name"
                    />
                    <input
                      className="w-40 bg-transparent outline-none rounded-lg border border-white/10 px-3 py-2 text-sm"
                      value={c.hex}
                      onChange={(e) => {
                        const next = { ...settingsDraft };
                        next.colors[idx] = { ...next.colors[idx], hex: e.target.value };
                        setSettingsDraft(next);
                      }}
                      placeholder="#hex"
                    />
                    <span
                      className="inline-block h-6 w-10 rounded border border-white/10"
                      style={{ background: c.hex }}
                    />
                    <button
                      onClick={() => {
                        const next = { ...settingsDraft };
                        next.colors = next.colors.filter((_, i) => i !== idx);
                        setSettingsDraft(next);
                      }}
                      className="ml-auto rounded-lg border border-red-500/30 px-2 py-1 text-sm text-red-300 hover:bg-red-500/10 transition"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    colors: [...(prev.colors || []), { name: "New", hex: "#888888" }],
                  }))
                }
                className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5 transition"
              >
                + Add Color
              </button>
            </div>

            {/* Behavior */}
            <div className="mb-6">
              <div className="mb-2 text-sm text-white/70">Behavior</div>
