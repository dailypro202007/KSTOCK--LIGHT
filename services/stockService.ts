
import { RawStockItem, StockData } from '../types';

interface ProxyConfig {
  name: string;
  getUrl: (target: string) => string;
  isJsonWrapper?: boolean;
}

const PROXIES: ProxyConfig[] = [
  {
    name: 'AllOrigins (JSON)',
    getUrl: (target: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}&disableCache=${Date.now()}`,
    isJsonWrapper: true
  },
  {
    name: 'CorsProxy.io',
    getUrl: (target: string) => `https://corsproxy.io/?${encodeURIComponent(target)}`
  },
  {
    name: 'ThingProxy',
    getUrl: (target: string) => `https://thingproxy.freeboard.io/fetch/${target}`
  },
  {
    name: 'AllOrigins (Raw)',
    getUrl: (target: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}&disableCache=${Date.now()}`
  }
];

const CACHE_KEY_PREFIX = 'kstock_cache_';

const tryParseJson = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      // Fix common malformed JSON issues (like single quotes)
      const fixed = text.replace(/'/g, '"').trim();
      return JSON.parse(fixed);
    } catch (e2) {
      throw e; 
    }
  }
};

const getCacheKey = (symbol: string) => `${CACHE_KEY_PREFIX}${symbol}`;

const loadFromCache = (symbol: string): StockData[] | null => {
  try {
    const cached = localStorage.getItem(getCacheKey(symbol));
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn("Failed to load cache for", symbol);
  }
  return null;
};

const saveToCache = (symbol: string, data: StockData[]) => {
  try {
    localStorage.setItem(getCacheKey(symbol), JSON.stringify(data));
  } catch (e) {
    console.warn("Failed to save cache for", symbol, e);
  }
};

const getDaysDiff = (dateStr1: string, dateStr2: string): number => {
  if (dateStr1.length !== 8 || dateStr2.length !== 8) return 999;
  const d1 = new Date(parseInt(dateStr1.substring(0, 4)), parseInt(dateStr1.substring(4, 6)) - 1, parseInt(dateStr1.substring(6, 8)));
  const d2 = new Date(parseInt(dateStr2.substring(0, 4)), parseInt(dateStr2.substring(4, 6)) - 1, parseInt(dateStr2.substring(6, 8)));
  return Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)); 
};

// Helper to fetch using proxies with retries
const fetchWithProxies = async (targetUrl: string, description: string): Promise<any> => {
  let lastError: Error | null = null;
  
  for (const proxy of PROXIES) {
    try {
      const url = proxy.getUrl(targetUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout
      
      const response = await fetch(url, { 
        signal: controller.signal, 
        method: 'GET', 
        credentials: 'omit', 
        cache: 'no-store' 
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const text = await response.text();
      if (!text || text.trim().length === 0) throw new Error("Empty response");

      const json = tryParseJson(proxy.isJsonWrapper ? JSON.parse(text).contents : text);
      return json;
    } catch (error: any) {
      // console.warn(`${proxy.name} failed for ${description}:`, error.message);
      lastError = error;
    }
  }
  throw lastError || new Error("All proxies failed");
};

export const fetchStockData = async (symbol: string, startTime: string, count: number = 250): Promise<StockData[]> => {
  if (!symbol || symbol.trim().length === 0) throw new Error("Invalid Symbol");
  let cleanSymbol = symbol.trim();
  if (/^\d+$/.test(cleanSymbol) && cleanSymbol.length < 6) cleanSymbol = cleanSymbol.padStart(6, '0');

  const cachedData = loadFromCache(cleanSymbol);
  let fetchCount = count;
  let useIncrementalUpdate = false;

  // Cache Logic
  if (cachedData && cachedData.length > 0) {
    const isFullHistoryRequest = count > 50;
    const isCacheInsufficient = cachedData.length < 240;
    if (isFullHistoryRequest && isCacheInsufficient) {
      useIncrementalUpdate = false;
      fetchCount = count;
    } else {
      cachedData.sort((a, b) => a.date.localeCompare(b.date));
      const lastCachedDate = cachedData[cachedData.length - 1].date;
      if (startTime > lastCachedDate) {
         const daysDiff = getDaysDiff(startTime, lastCachedDate);
         if (daysDiff < 100) { 
            fetchCount = daysDiff + 10;
            useIncrementalUpdate = true;
         }
      } else if (startTime === lastCachedDate) {
         fetchCount = 5;
         useIncrementalUpdate = true;
      }
    }
  }

  // Strategy 1: Main Mobile API (Preferred)
  // Added random parameter to bypass cache
  const mainUrl = `https://m.stock.naver.com/front-api/external/chart/domestic/info?symbol=${cleanSymbol}&requestType=2&count=${fetchCount}&startTime=${startTime}&timeframe=day&_=${Date.now()}`;
  
  let rawData: any = null;
  let usedFallback = false;

  try {
    rawData = await fetchWithProxies(mainUrl, `${cleanSymbol} (Main)`);
  } catch (mainError) {
    console.warn(`Main endpoint failed for ${cleanSymbol}, trying fallback...`, mainError);
    
    // Strategy 2: Fallback Legacy API (siseJson.naver)
    // This endpoint is often more stable for obscure tickers or when the main API is flaky via proxies.
    // requestType=1 returns a simple 2D array.
    const fallbackUrl = `https://api.finance.naver.com/siseJson.naver?symbol=${cleanSymbol}&requestType=1&startTime=${startTime}&count=${fetchCount}&timeframe=day&_=${Date.now()}`;
    try {
      rawData = await fetchWithProxies(fallbackUrl, `${cleanSymbol} (Fallback)`);
      usedFallback = true;
    } catch (fallbackError: any) {
      throw new Error(`데이터 가져오기 실패 (${cleanSymbol}): ${fallbackError.message}`);
    }
  }

  // Parse Data
  let newData: StockData[] = [];
  
  // Normalize response structure
  // Main API returns array of arrays directly (or wrapped in some contexts, but usually handled by proxy parsing)
  // Fallback API returns array of arrays: [['Date', Open, High, Low, Close, Vol, ...], ...]
  
  let dataRows = rawData;
  
  // If fallback API returns string representation of array (sometimes happens with proxies), it's already parsed by tryParseJson.
  // We just need to ensure it's an array.
  if (Array.isArray(dataRows)) {
     // Remove header row if present (Main API includes header sometimes, Fallback usually implies it)
     // Fallback 'siseJson' usually returns: [["날짜", "시가", ...], ["20230101", ...]]
     if (dataRows.length > 0 && (isNaN(Number(dataRows[0][1])) || dataRows[0][0] === '날짜')) {
       dataRows = dataRows.slice(1);
     }

     newData = dataRows.map((row: any[]) => ({
        date: String(row[0]).trim(), 
        open: parseNumber(row[1]), 
        high: parseNumber(row[2]), 
        low: parseNumber(row[3]), 
        close: parseNumber(row[4]), 
        volume: parseNumber(row[5]),
        // Fallback API might have slightly different columns for foreign rate, but for technical analysis OHLCV is key.
        // Row[6] is usually foreign rate in 'info' endpoint, might be different in 'siseJson'. 
        // We default to 0 to be safe.
        foreignRate: 0, 
        ema20: null, ema50: null, ema200: null, 
        rsi: null, macd: null, macdSignal: null, macdHist: null, obv: null, mfi: null, adx: null
      }));
  }

  if (newData.length === 0) {
    throw new Error(`데이터가 비어있습니다 (${cleanSymbol})`);
  }

  // Merge with cache if incremental
  let finalData = newData;
  if (useIncrementalUpdate && cachedData) {
    const dataMap = new Map<string, StockData>();
    cachedData.forEach(item => dataMap.set(item.date, item));
    newData.forEach(item => dataMap.set(item.date, item));
    finalData = Array.from(dataMap.values());
  }
  
  finalData.sort((a, b) => a.date.localeCompare(b.date));
  if (finalData.length > 300) finalData = finalData.slice(finalData.length - 300);

  const dataWithIndicators = calculateIndicators(finalData);
  saveToCache(cleanSymbol, dataWithIndicators);
  return dataWithIndicators;
};

const parseNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseInt(val.replace(/,/g, '').trim() || '0', 10);
  return 0;
};

// EMA Calculation
const calculateEMAArray = (data: number[], period: number): (number | null)[] => {
  if (data.length < period) return new Array(data.length).fill(null);
  const k = 2 / (period + 1);
  const emas: (number | null)[] = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let prevEma = sum / period;
  emas[period - 1] = prevEma;
  for (let i = period; i < data.length; i++) {
    const currentEma = (data[i] - prevEma) * k + prevEma;
    emas[i] = currentEma;
    prevEma = currentEma;
  }
  return emas;
};

const calculateIndicators = (data: StockData[]): StockData[] => {
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);

  // 1. EMA
  const ema20 = calculateEMAArray(closes, 20);
  const ema50 = calculateEMAArray(closes, 50);
  const ema200 = calculateEMAArray(closes, 200);

  // 2. RSI (14)
  const rsi: (number | null)[] = new Array(data.length).fill(null);
  if (data.length > 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= 14; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / 14;
    let avgLoss = losses / 14;
    for (let i = 15; i < data.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const curGain = diff >= 0 ? diff : 0;
      const curLoss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * 13 + curGain) / 14;
      avgLoss = (avgLoss * 13 + curLoss) / 14;
      rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
  }

  // 3. MACD (12, 26, 9)
  const ema12 = calculateEMAArray(closes, 12);
  const ema26 = calculateEMAArray(closes, 26);
  const macdLine = ema12.map((e12, idx) => (e12 && ema26[idx]) ? e12 - ema26[idx]! : null);
  const macdSignal = calculateEMAArray(macdLine.filter(v => v !== null) as number[], 9);
  const fullMacdSignal: (number | null)[] = new Array(data.length).fill(null);
  let signalIdx = 0;
  macdLine.forEach((v, i) => { if (v !== null) fullMacdSignal[i] = macdSignal[signalIdx++]; });

  // 4. OBV
  const obv: (number | null)[] = new Array(data.length).fill(null);
  if (data.length > 0) {
    obv[0] = 0;
    for (let i = 1; i < data.length; i++) {
      if (closes[i] > closes[i - 1]) obv[i] = obv[i - 1]! + volumes[i];
      else if (closes[i] < closes[i - 1]) obv[i] = obv[i - 1]! - volumes[i];
      else obv[i] = obv[i - 1];
    }
  }

  // 5. MFI (14)
  const mfi: (number | null)[] = new Array(data.length).fill(null);
  if (data.length > 14) {
    const tp = data.map(d => (d.high + d.low + d.close) / 3);
    const mf = tp.map((p, i) => p * volumes[i]);
    for (let i = 14; i < data.length; i++) {
      let posMf = 0, negMf = 0;
      for (let j = i - 13; j <= i; j++) {
        if (tp[j] > tp[j - 1]) posMf += mf[j];
        else if (tp[j] < tp[j - 1]) negMf += mf[j];
      }
      mfi[i] = negMf === 0 ? 100 : 100 - (100 / (1 + posMf / negMf));
    }
  }

  // 6. ADX (14)
  const adx: (number | null)[] = new Array(data.length).fill(null);
  if (data.length > 28) {
    const tr = data.map((d, i) => i === 0 ? d.high - d.low : Math.max(d.high - d.low, Math.abs(d.high - closes[i - 1]), Math.abs(d.low - closes[i - 1])));
    const plusDM = data.map((d, i) => i === 0 ? 0 : (d.high - highs[i - 1] > lows[i - 1] - d.low && d.high - highs[i - 1] > 0) ? d.high - highs[i - 1] : 0);
    const minusDM = data.map((d, i) => i === 0 ? 0 : (lows[i - 1] - d.low > d.high - highs[i - 1] && lows[i - 1] - d.low > 0) ? lows[i - 1] - d.low : 0);
    
    let smoothTR = tr.slice(1, 15).reduce((a, b) => a + b, 0);
    let smoothPlusDM = plusDM.slice(1, 15).reduce((a, b) => a + b, 0);
    let smoothMinusDM = minusDM.slice(1, 15).reduce((a, b) => a + b, 0);
    
    const dxValues: number[] = [];
    for (let i = 15; i < data.length; i++) {
      smoothTR = smoothTR - (smoothTR / 14) + tr[i];
      smoothPlusDM = smoothPlusDM - (smoothPlusDM / 14) + plusDM[i];
      smoothMinusDM = smoothMinusDM - (smoothMinusDM / 14) + minusDM[i];
      const plusDI = 100 * (smoothPlusDM / smoothTR);
      const minusDI = 100 * (smoothMinusDM / smoothTR);
      dxValues.push(100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI));
      if (dxValues.length >= 14) {
        let adxSum = dxValues.slice(-14).reduce((a, b) => a + b, 0);
        adx[i] = adxSum / 14;
      }
    }
  }

  return data.map((item, i) => ({
    ...item,
    ema20: ema20[i] ? Math.round(ema20[i]!) : null,
    ema50: ema50[i] ? Math.round(ema50[i]!) : null,
    ema200: ema200[i] ? Math.round(ema200[i]!) : null,
    rsi: rsi[i] ? Number(rsi[i]!.toFixed(2)) : null,
    macd: macdLine[i] ? Number(macdLine[i]!.toFixed(2)) : null,
    macdSignal: fullMacdSignal[i] ? Number(fullMacdSignal[i]!.toFixed(2)) : null,
    macdHist: (macdLine[i] && fullMacdSignal[i]) ? Number((macdLine[i]! - fullMacdSignal[i]!).toFixed(2)) : null,
    obv: obv[i],
    mfi: mfi[i] ? Number(mfi[i]!.toFixed(2)) : null,
    adx: adx[i] ? Number(adx[i]!.toFixed(2)) : null,
  }));
};
