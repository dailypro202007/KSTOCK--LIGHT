
export interface RawStockItem {
  dt: string; // Date YYYYMMDD
  nc: string; // Close Price (Numeric String)
  ov: string; // Open
  hv: string; // High
  lv: string; // Low
  cv: string; // Change
  sv: string; // Volume
}

export interface StockData {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  foreignRate: number; // 외국인 소진율 (API 미제공시 0)
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  obv: number | null;
  mfi: number | null;
  adx: number | null;
}

export interface AnalysisResult {
  markdown: string;
}

export interface StockRequestParams {
  symbol: string;
  date: string; // YYYYMMDD
}
