"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
  ColorType,
} from "lightweight-charts";

import type { IndicatorSummary } from "@/lib/indicators";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Range = "1d" | "5d" | "1m" | "3m";

const RANGES: Range[] = ["1d", "5d", "1m", "3m"];

export default function StockChart({
  symbol,
  onIndicators,
}: {
  symbol: string;
  onIndicators?: (symbol: string, indicators: IndicatorSummary | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [range, setRange] = useState<Range>("3m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastClose, setLastClose] = useState<number | null>(null);
  const [indicators, setIndicators] = useState<IndicatorSummary | null>(null);

  // Keep the latest callback in a ref so the fetch effect below doesn't
  // need it as a dependency (parents rarely memoize inline callbacks,
  // which would otherwise cause a refetch loop on every render). Updated
  // in an effect, not during render, to satisfy the refs-during-render rule.
  const onIndicatorsRef = useRef(onIndicators);
  useEffect(() => {
    onIndicatorsRef.current = onIndicators;
  });

  // Create chart once on mount.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0f14" },
        textColor: "#d1d5db",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#374151",
      },
      rightPriceScale: { borderColor: "#374151" },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceScaleId: "right",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Fetch + (re)populate data whenever symbol or range changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/ohlcv?symbol=${encodeURIComponent(symbol)}&range=${range}`
        );
        const json = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setError(json.error ?? "Failed to load data");
          candleSeriesRef.current?.setData([]);
          volumeSeriesRef.current?.setData([]);
          setIndicators(null);
          onIndicatorsRef.current?.(symbol, null);
          return;
        }

        const candles: Candle[] = json.candles;
        const ind: IndicatorSummary | undefined = json.indicators;
        if (ind) {
          setIndicators(ind);
          onIndicatorsRef.current?.(symbol, ind);
        }

        const candleData: CandlestickData[] = candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        const volumeData: HistogramData[] = candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "#22c55e55" : "#ef444455",
        }));

        candleSeriesRef.current?.setData(candleData);
        volumeSeriesRef.current?.setData(volumeData);
        chartRef.current?.timeScale().fitContent();

        if (candles.length > 0) {
          setLastClose(candles[candles.length - 1].close);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error");
          setIndicators(null);
          onIndicatorsRef.current?.(symbol, null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  return (
    <div className="w-full rounded-lg border border-gray-800 bg-[#0b0f14] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-100">
            {symbol.toUpperCase()}
          </span>
          {lastClose !== null && (
            <span className="text-sm text-gray-400">
              ₹{lastClose.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                range === r
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {indicators && (
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
          <span>
            RSI{" "}
            <span
              className={
                indicators.rsiLabel === "Overbought"
                  ? "font-semibold text-red-400"
                  : indicators.rsiLabel === "Oversold"
                  ? "font-semibold text-emerald-400"
                  : "font-semibold text-gray-200"
              }
            >
              {indicators.rsi !== null ? indicators.rsi.toFixed(1) : "—"}
            </span>
          </span>

          <span>
            MFI{" "}
            <span
              className={
                indicators.mfiLabel === "Strongly Overbought" ||
                indicators.mfiLabel === "Overbought"
                  ? "font-semibold text-red-400"
                  : indicators.mfiLabel === "Oversold"
                  ? "font-semibold text-emerald-400"
                  : "font-semibold text-gray-200"
              }
            >
              {indicators.mfi !== null ? indicators.mfi.toFixed(1) : "—"}
            </span>
          </span>

          <span>
            MA{" "}
            <span className="font-semibold text-emerald-400">
              {indicators.bullishMACount}▲
            </span>{" "}
            <span className="font-semibold text-red-400">
              {indicators.bearishMACount}▼
            </span>
          </span>

          <span>
            Vol{" "}
            <span
              className={
                indicators.volumeVsAvgPct !== null &&
                indicators.volumeVsAvgPct >= 130
                  ? "font-semibold text-emerald-400"
                  : "font-semibold text-gray-200"
              }
            >
              {indicators.volumeVsAvgPct !== null
                ? `${(indicators.volumeVsAvgPct / 100).toFixed(1)}x`
                : "—"}
            </span>{" "}
            avg
          </span>
        </div>
      )}

      <div className="relative h-[320px] w-full">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0f14]/80 text-sm text-gray-400">
            Loading {symbol}…
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0f14]/90 px-4 text-center text-sm text-red-400">
            {error}
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}