
import { StockData } from '../types';

// Helper to format stock data for JSON (Header + Rows)
export const formatStockDataForSave = (data: StockData[]) => {
  const header = ['날짜', '시가', '고가', '저가', '종가', '거래량', '외국인소진율', 'EMA20', 'EMA50', 'EMA200', 'RSI', 'MACD', 'OBV', 'MFI', 'ADX'];
  const rows = data.map(d => [
    d.date, d.open, d.high, d.low, d.close, d.volume, d.foreignRate,
    d.ema20 || 0, d.ema50 || 0, d.ema200 || 0, d.rsi || 0, d.macd || 0, d.obv || 0, d.mfi || 0, d.adx || 0
  ]);
  return [header, ...rows];
};

// Existing Single Save Function (Maintains backward compatibility)
export const saveStockDataToLocal = async (symbol: string, date: string, data: StockData[]) => {
  try {
    const result = formatStockDataForSave(data);
    return await saveJsonToLocal(`${symbol}_Data_${date}.txt`, result);
  } catch (error: any) {
    throw error;
  }
};

// Existing Single Save Function
export const saveLearningResultToLocal = async (symbol: string, date: string, results: any[]) => {
  return await saveJsonToLocal(`${symbol}_SelfLearning_${date}.txt`, results);
};

// Internal helper for single file save (Fallback/Direct Download)
export const saveJsonToLocal = async (fileName: string, data: any) => {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  
  // Try File System Access API first if available
  if ('showDirectoryPicker' in window) {
    try {
      const directoryHandle = await (window as any).showDirectoryPicker();
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      return "선택된 폴더에 저장되었습니다.";
    } catch (err: any) {
      if (err.name === 'AbortError') return "사용자가 저장을 취소했습니다.";
      console.warn("Directory Picker failed, falling back to download.", err);
    }
  }

  // Fallback: Download via Blob
  try {
      const blob = new Blob([jsonString], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return "다운로드 폴더에 저장되었습니다. (브라우저 다운로드)";
  } catch (e: any) {
      throw new Error("파일 저장에 실패했습니다: " + e.message);
  }
};

// --- New Features for Bulk & Auto Saving ---

export const getUserDirectoryHandle = async () => {
  if (!('showDirectoryPicker' in window)) {
    throw new Error("이 브라우저는 폴더 선택 기능을 지원하지 않습니다. (Chrome, Edge PC버전 권장)");
  }
  return await (window as any).showDirectoryPicker();
};

export const saveJsonToHandle = async (dirHandle: any, fileName: string, data: any) => {
  return saveTextToHandle(dirHandle, fileName, JSON.stringify(data, null, 2));
};

export const saveTextToHandle = async (dirHandle: any, fileName: string, textContent: string) => {
  try {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(textContent);
    await writable.close();
  } catch (error) {
    console.error(`Failed to save ${fileName}`, error);
    throw error;
  }
};
