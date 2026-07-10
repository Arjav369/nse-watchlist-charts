"use client";

import { useEffect, useMemo, useState } from "react";
import StockChart from "@/components/StockChart";
import type { IndicatorSummary } from "@/lib/indicators";

const STORAGE_KEY = "nse-watchlist-symbols";

type Filters = {
  hideRsiOverbought: boolean;
  hideMfiOverbought: boolean;
  requireVolumeSpike: boolean; // >= 1.3x 20-day avg, per momentum framework
  minBullishMA: number; // 0-8
};

const DEFAULT_FILTERS: Filters = {
  hideRsiOverbought: false,
  hideMfiOverbought: false,
  requireVolumeSpike: false,
  minBullishMA: 0,
};

export default function Home() {
  // No preloaded stocks — the watchlist starts empty. Every symbol on it
  // is one the user explicitly added themselves.
  const [symbols, setSymbols] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [indicatorsMap, setIndicatorsMap] = useState<
    Record<string, IndicatorSummary | null>
  >({});
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

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
    setIndicatorsMap((prev) => {
      const next = { ...prev };
      delete next[sym];
      return next;
    });
  }

  function clearWatchlist() {
    setSymbols([]);
    setIndicatorsMap({});
  }

  function handleIndicators(sym: string, indicators: IndicatorSummary | null) {
    setIndicatorsMap((prev) => ({ ...prev, [sym]: indicators }));
  }

  // A symbol passes the filters if every active filter is satisfied.
  // Symbols with no indicator data yet (still loading, or errored) are
  // always shown rather than hidden, so a slow fetch doesn't look like
  // "0 stocks match."
  const passesFilters = useMemo(() => {
    return (sym: string): boolean => {
      const ind = indicatorsMap[sym];
      if (!ind) return true;

      if (filters.hideRsiOverbought && ind.rsiLabel === "Overbought")
        return false;

      if (
        filters.hideMfiOverbought &&
        (ind.mfiLabel === "Overbought" || ind.mfiLabel === "Strongly Overbought")
      )
        return false;

      if (
        filters.requireVolumeSpike &&
        (ind.volumeVsAvgPct === null || ind.volumeVsAvgPct < 130)
      )
        return false;

      if (ind.bullishMACount < filters.minBullishMA) return false;

      return true;
    };
  }, [indicatorsMap, filters]);

  const visibleCount = symbols.filter(passesFilters).length;
  const hiddenCount = symbols.length - visibleCount;
  const filtersActive =
    filters.hideRsiOverbought ||
    filters.hideMfiOverbought ||
    filters.requireVolumeSpike ||
    filters.minBullishMA > 0;

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

        {symbols.length > 0 && (
          <button
            onClick={clearWatchlist}
            className="mb-6 text-xs text-gray-500 underline hover:text-gray-300"
          >
            Clear watchlist
          </button>
        )}

        {symbols.length > 0 && (
          <div className="mb-6 rounded-lg border border-gray-800 bg-[#0b0f14] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Filters
              </span>
              {filtersActive && (
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs text-gray-500 underline hover:text-gray-300"
                >
                  Reset filters
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-300">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.hideRsiOverbought}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      hideRsiOverbought: e.target.checked,
                    }))
                  }
                />
                Hide RSI overbought (&gt;70)
              </label>

              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.hideMfiOverbought}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      hideMfiOverbought: e.target.checked,
                    }))
                  }
                />
                Hide MFI overbought (&gt;70)
              </label>

              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.requireVolumeSpike}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      requireVolumeSpike: e.target.checked,
                    }))
                  }
                />
                Require volume ≥ 1.3x avg
              </label>

              <label className="flex items-center gap-1.5">
                Min bullish MAs
                <select
                  value={filters.minBullishMA}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minBullishMA: Number(e.target.value),
                    }))
                  }
                  className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-xs"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}/8
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {filtersActive && (
              <p className="mt-2 text-xs text-gray-500">
                Showing {visibleCount} of {symbols.length}
                {hiddenCount > 0 &&
                  ` — ${hiddenCount} hidden by filters (still loading in the background)`}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {symbols.map((sym) => (
            <div
              key={sym}
              className={`relative ${passesFilters(sym) ? "" : "hidden"}`}
            >
              <button
                onClick={() => removeSymbol(sym)}
                title="Remove this chart"
                className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800/90 text-sm font-bold text-gray-300 shadow-md hover:bg-red-600 hover:text-white"
              >
                ✕
              </button>
              <StockChart symbol={sym} onIndicators={handleIndicators} />
            </div>
          ))}
        </div>

        {symbols.length === 0 && (
          <p className="mt-8 text-center text-sm text-gray-500">
            No charts to show. Add a symbol above to build your watchlist.
          </p>
        )}

        {symbols.length > 0 && visibleCount === 0 && (
          <p className="mt-8 text-center text-sm text-gray-500">
            All {symbols.length} stocks are hidden by the current filters.
          </p>
        )}
      </div>
    </main>
  );
}