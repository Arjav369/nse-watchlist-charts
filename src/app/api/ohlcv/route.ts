import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import { computeIndicatorSummary, type OHLCV } from "@/lib/indicators";

// yahoo-finance2 v3+ requires explicit instantiation; the default export
// is the class itself, not a ready-to-use singleton.
const yahooFinance = new YahooFinance();

/**
 * Maps a human-friendly range string to a *display* window. This is what
 * the chart actually shows — it is separate from how much history we
 * fetch, since indicators like the 200-day EMA need far more lookback
 * than what's visible on screen.
 */
function rangeToDisplayStart(range: string): Date {
  const now = new Date();
  const start = new Date(now);

  switch (range) {
    case "5d":
      start.setDate(start.getDate() - 12); // pad past weekends
      break;
    case "1m":
      start.setMonth(start.getMonth() - 1);
      break;
    case "3m":
      start.setMonth(start.getMonth() - 3);
      break;
    case "1d":
      start.setDate(start.getDate() - 7); // pad to guarantee >=1 trading day
      break;
    default:
      start.setMonth(start.getMonth() - 3);
  }

  return start;
}

// Indicators need a much longer lookback than the visible chart window —
// a 200-day EMA needs roughly a year of calendar days (accounting for
// weekends/holidays) to fully seed. We always fetch this much regardless
// of the requested display range, then slice for what's shown on screen.
const INDICATOR_LOOKBACK_DAYS = 400;

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const rawSymbol = searchParams.get("symbol");
  const range = searchParams.get("range") ?? "3m";

  if (!rawSymbol) {
    return NextResponse.json(
      { error: "Missing required query param: symbol" },
      { status: 400 }
    );
  }

  // Normalize: allow "TARIL", "TARIL.NS", or "NSE:TARIL" as input.
  const cleanSymbol = rawSymbol.trim().toUpperCase().replace(/^NSE:/, "");
  const yahooSymbol = cleanSymbol.endsWith(".NS")
    ? cleanSymbol
    : `${cleanSymbol}.NS`;

  const displayStart = rangeToDisplayStart(range);
  const fetchStart = new Date();
  fetchStart.setDate(fetchStart.getDate() - INDICATOR_LOOKBACK_DAYS);

  try {
    const result: ChartResultArray = await yahooFinance.chart(yahooSymbol, {
      period1: fetchStart,
      period2: new Date(),
      interval: "1d",
      return: "array",
    });

    const quotes = result.quotes ?? [];

    if (quotes.length === 0) {
      return NextResponse.json(
        {
          error: `No data returned for ${yahooSymbol}. It may be delisted, mistyped, or not covered by Yahoo Finance.`,
          symbol: yahooSymbol,
        },
        { status: 404 }
      );
    }

    // Shape into plain OHLCV rows. lightweight-charts wants UNIX seconds
    // for time, and will reject rows with null close (non-trading days
    // that sometimes leak through).
    const fullHistory: OHLCV[] = quotes
      .filter((q) => q.close !== null && q.open !== null)
      .map((q) => ({
        time: Math.floor(new Date(q.date).getTime() / 1000),
        open: q.open as number,
        high: q.high as number,
        low: q.low as number,
        close: q.close as number,
        volume: q.volume ?? 0,
      }));

    // Indicators are computed on the FULL fetched history (so a 200-day
    // EMA has enough runway), independent of what's actually shown.
    const indicators = computeIndicatorSummary(fullHistory);

    // Chart display is sliced down to just the requested range.
    const displayStartSeconds = Math.floor(displayStart.getTime() / 1000);
    const candles = fullHistory.filter((c) => c.time >= displayStartSeconds);

    return NextResponse.json({
      symbol: yahooSymbol,
      range,
      candles,
      indicators,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: `Failed to fetch data for ${yahooSymbol}: ${message}`,
        symbol: yahooSymbol,
      },
      { status: 502 }
    );
  }
}