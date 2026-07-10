// Pure, dependency-free technical indicator calculations.
// All functions take full historical arrays (oldest -> newest) and return
// either a full aligned series (same length, leading nulls where the
// indicator isn't yet defined) or a single "latest value" depending on use.

export type OHLCV = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Standard EMA. Seeds with an SMA of the first `period` closes, matching
 * how most retail platforms (e.g. ICICI Direct) compute it. Returns an
 * array the same length as `values`, with nulls until the seed point. */
export function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  const k = 2 / (period + 1);
  const seed =
    values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  result[period - 1] = seed;

  let prev = seed;
  for (let i = period; i < values.length; i++) {
    const next = values[i] * k + prev * (1 - k);
    result[i] = next;
    prev = next;
  }
  return result;
}

/** Wilder's RSI (the standard used by most trading platforms), 14-period
 * default. Returns a full aligned series; nulls until enough data exists. */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  result[period] =
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

/** Money Flow Index, 14-period default. Needs high/low/close/volume.
 * Standard formula: typical price -> raw money flow -> signed by whether
 * typical price rose or fell vs the prior day -> 14-day positive/negative
 * flow ratio -> MFI. */
export function mfi(candles: OHLCV[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return result;

  const typicalPrices = candles.map((c) => (c.high + c.low + c.close) / 3);
  const rawFlow = typicalPrices.map((tp, i) => tp * candles[i].volume);

  for (let i = period; i < candles.length; i++) {
    let posFlow = 0;
    let negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (typicalPrices[j] > typicalPrices[j - 1]) posFlow += rawFlow[j];
      else if (typicalPrices[j] < typicalPrices[j - 1]) negFlow += rawFlow[j];
      // unchanged typical price contributes to neither side
    }
    if (negFlow === 0) {
      result[i] = 100;
    } else {
      const moneyRatio = posFlow / negFlow;
      result[i] = 100 - 100 / (1 + moneyRatio);
    }
  }

  return result;
}

/** Simple rolling average, e.g. for 20-day average volume. */
export function rollingAverage(
  values: number[],
  period: number
): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result[i] = sum / period;
  }
  return result;
}

export const MA_PERIODS = [5, 10, 12, 20, 26, 50, 100, 200] as const;

export type MASnapshot = {
  period: number;
  value: number | null;
  bullish: boolean | null; // true if CMP > EMA, false if below, null if no data
};

/** Computes EMA-based moving averages at the standard periods used across
 * the momentum framework (5/10/12/20/26/50/100/200 day) and reports how
 * many are bullish (price above) vs bearish (price below) at the latest
 * close — mirrors the "Bullish Moving Averages: N" style summary. */
export function movingAverageSnapshot(closes: number[]): {
  mas: MASnapshot[];
  bullishCount: number;
  bearishCount: number;
} {
  const latestClose = closes[closes.length - 1];
  const mas: MASnapshot[] = MA_PERIODS.map((period) => {
    const series = ema(closes, period);
    const value = series[series.length - 1];
    return {
      period,
      value,
      bullish: value === null ? null : latestClose > value,
    };
  });

  const bullishCount = mas.filter((m) => m.bullish === true).length;
  const bearishCount = mas.filter((m) => m.bullish === false).length;

  return { mas, bullishCount, bearishCount };
}

export type IndicatorSummary = {
  rsi: number | null;
  rsiLabel: "Overbought" | "Oversold" | "Neutral" | null;
  mfi: number | null;
  mfiLabel: "Strongly Overbought" | "Overbought" | "Oversold" | "Neutral" | null;
  bullishMACount: number;
  bearishMACount: number;
  volume: number | null;
  avgVolume20d: number | null;
  volumeVsAvgPct: number | null; // e.g. 180 means 1.8x the 20-day average
};

/** Computes the full indicator summary (latest values only) for a candle
 * series. Used by the API route so the client doesn't have to recompute. */
export function computeIndicatorSummary(candles: OHLCV[]): IndicatorSummary {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const rsiSeries = rsi(closes, 14);
  const mfiSeries = mfi(candles, 14);
  const volAvgSeries = rollingAverage(volumes, 20);

  const latestRsi = rsiSeries[rsiSeries.length - 1];
  const latestMfi = mfiSeries[mfiSeries.length - 1];
  const latestVolume = volumes[volumes.length - 1] ?? null;
  const latestAvgVol = volAvgSeries[volAvgSeries.length - 1];

  const { bullishCount, bearishCount } = movingAverageSnapshot(closes);

  let rsiLabel: IndicatorSummary["rsiLabel"] = null;
  if (latestRsi !== null) {
    if (latestRsi > 70) rsiLabel = "Overbought";
    else if (latestRsi < 30) rsiLabel = "Oversold";
    else rsiLabel = "Neutral";
  }

  let mfiLabel: IndicatorSummary["mfiLabel"] = null;
  if (latestMfi !== null) {
    if (latestMfi > 80) mfiLabel = "Strongly Overbought";
    else if (latestMfi > 70) mfiLabel = "Overbought";
    else if (latestMfi < 20) mfiLabel = "Oversold";
    else mfiLabel = "Neutral";
  }

  const volumeVsAvgPct =
    latestAvgVol && latestAvgVol > 0 && latestVolume !== null
      ? (latestVolume / latestAvgVol) * 100
      : null;

  return {
    rsi: latestRsi,
    rsiLabel,
    mfi: latestMfi,
    mfiLabel,
    bullishMACount: bullishCount,
    bearishMACount: bearishCount,
    volume: latestVolume,
    avgVolume20d: latestAvgVol,
    volumeVsAvgPct,
  };
}