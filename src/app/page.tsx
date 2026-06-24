"use client";

import { useEffect, useState } from "react";
import StockChart from "@/components/StockChart";

const DEFAULT_WATCHLIST = [
  "JASH",
  "NLCINDIA",
  "BANDHANBNK",
  "TARIL",
  "NACLIND",
  "EBGNG",
  "AEQUS",
  "BHARATGEAR",
];

const STORAGE_KEY = "nse-watchlist-symbols";

export default function Home() {
  // Start with the default list on first render (server + client match,
  // avoiding hydration mismatches), then overwrite from localStorage
  // once we're actually in the browser.
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_WATCHLIST);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Load saved watchlist on mount.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSymbols(parsed);
        }
      }
    } catch {
      // If localStorage is unavailable or data is corrupt, just keep defaults.
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist whenever the list changes, but only after initial load
  // so we don't overwrite saved data with the default list on first paint.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
    } catch {
      // Storage might be full or disabled; non-critical, so ignore.
    }
  }, [symbols, hydrated]);

  function addSymbol(e: React.FormEvent) {
    e.preventDefault();
    const sym = input.trim().toUpperCase();
    if (sym && !symbols.includes(sym)) {
      setSymbols((prev) => [...prev, sym]);
    }
    setInput("");
  }

  function removeSymbol(sym: string) {
    setSymbols((prev) => prev.filter((s) => s !== sym));
  }

  function resetToDefault() {
    setSymbols(DEFAULT_WATCHLIST);
  }

  return (
    <main className="min-h-screen bg-[#05070a] px-4 py-6 text-gray-100">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-xl font-bold">NSE Watchlist Charts</h1>
        <p className="mb-4 text-sm text-gray-400">
          Data sourced directly from Yahoo Finance — no TradingView symbol
          restrictions. Any NSE-listed ticker works.
        </p>

        <form onSubmit={addSymbol} className="mb-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add symbol e.g. PARKHOSPS"
            className="w-64 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <button
            type="submit"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            Add chart
          </button>
        </form>

        <button
          onClick={resetToDefault}
          className="mb-6 text-xs text-gray-500 underline hover:text-gray-300"
        >
          Reset to default watchlist
        </button>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {symbols.map((sym) => (
            <div key={sym} className="relative">
              <button
                onClick={() => removeSymbol(sym)}
                title="Remove this chart"
                className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800/90 text-sm font-bold text-gray-300 shadow-md hover:bg-red-600 hover:text-white"
              >
                ✕
              </button>
              <StockChart symbol={sym} />
            </div>
          ))}
        </div>

        {symbols.length === 0 && (
          <p className="mt-8 text-center text-sm text-gray-500">
            No charts to show. Add a symbol above, or{" "}
            <button onClick={resetToDefault} className="underline">
              restore the default watchlist
            </button>
            .
          </p>
        )}
      </div>
    </main>
  );
}