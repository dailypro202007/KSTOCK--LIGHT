
import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, AlertCircle, Plus, Trash2, Calendar, ChevronDown, ChevronRight, Download, Upload, CheckSquare, Square, Loader2, RefreshCw, HardDrive, BrainCircuit, ExternalLink, FolderInput, FolderCheck } from 'lucide-react';
import { fetchStockData } from './services/stockService';
import { saveStockDataToLocal, saveLearningResultToLocal, getUserDirectoryHandle, saveJsonToHandle, formatStockDataForSave } from './services/fileSystemService';
import { runSelfLearning } from './services/selfLearningService';
import { StockData } from './types';

const getTodayYYYYMMDD = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

interface WatchlistItem {
  id: number;
  category: string;
  name: string;
  symbol: string;
  isHeld?: boolean;
}

interface PriceInfo {
  close: number;
  changeRate: number; 
  isLoading?: boolean;
  error?: boolean;
  errorMessage?: string;
}

const CATEGORIES = ["지수", "채권", "개별", "리츠"];

const App: React.FC = () => {
  const [date, setDate] = useState(() => {
    try {
      const savedDate = localStorage.getItem('stockAnalysisDate');
      return savedDate || getTodayYYYYMMDD();
    } catch (e) {
      return getTodayYYYYMMDD();
    }
  });

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => {
    try {
      const saved = localStorage.getItem('stockWatchlist');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => ({
            ...item,
            category: item.category || '개별',
            isHeld: item.isHeld || false
          }));
        }
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  const [stockPrices, setStockPrices] = useState<Record<string, PriceInfo>>({});
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<string>("");

  const [newCategory, setNewCategory] = useState("개별");
  const [newStockName, setNewStockName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newIsHeld, setNewIsHeld] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('stockWatchlistExpanded');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { "지수": true, "채권": true, "개별": true, "리츠": true };
  });

  const [savingLocal, setSavingLocal] = useState(false);
  const [learning, setLearning] = useState(false);
  
  // Persistent Directory Handle State
  const [saveDirHandle, setSaveDirHandle] = useState<any>(null);

  // States for Bulk Operations
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [autoSaveMsg, setAutoSaveMsg] = useState<string | null>(null);
  
  const [currentStock, setCurrentStock] = useState<{name: string, symbol: string} | null>(null);

  useEffect(() => { localStorage.setItem('stockAnalysisDate', date); }, [date]);
  useEffect(() => { localStorage.setItem('stockWatchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem('stockWatchlistExpanded', JSON.stringify(expandedGroups)); }, [expandedGroups]);

  // Clear auto-save message after 3 seconds
  useEffect(() => {
    if (autoSaveMsg) {
      const timer = setTimeout(() => setAutoSaveMsg(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [autoSaveMsg]);

  const handleConnectFolder = async () => {
    try {
      const handle = await getUserDirectoryHandle();
      setSaveDirHandle(handle);
      setAutoSaveMsg("저장 폴더가 연결되었습니다. 이후 작업은 자동 저장됩니다.");
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert("폴더 연결 실패: " + err.message);
      }
    }
  };

  const fetchPricesForWatchlist = async (items: WatchlistItem[]) => {
    if (isUpdatingPrices) return;
    setIsUpdatingPrices(true);
    setUpdateProgress(`0 / ${items.length}`);
    const uniqueItems: WatchlistItem[] = [];
    const seenSymbols = new Set();
    for (const item of items) { if (!seenSymbols.has(item.symbol)) { seenSymbols.add(item.symbol); uniqueItems.push(item); } }
    const batchSize = 8; 
    for (let i = 0; i < uniqueItems.length; i += batchSize) {
      const batch = uniqueItems.slice(i, i + batchSize);
      setUpdateProgress(`${Math.min(i + batch.length, uniqueItems.length)} / ${uniqueItems.length}`);
      await Promise.all(batch.map(async (item) => {
        try {
          setStockPrices(prev => ({ ...prev, [item.symbol]: { ...prev[item.symbol], isLoading: true } }));
          const data = await fetchStockData(item.symbol, date, 2);
          if (data && data.length > 0) {
            const current = data[data.length - 1];
            let changeRate = 0;
            if (data.length >= 2) changeRate = ((current.close - data[data.length - 2].close) / data[data.length - 2].close) * 100;
            setStockPrices(prev => ({ ...prev, [item.symbol]: { close: current.close, changeRate, isLoading: false, error: false } }));
          }
        } catch (e: any) {
          setStockPrices(prev => ({ ...prev, [item.symbol]: { close: 0, changeRate: 0, isLoading: false, error: true, errorMessage: "Error" } }));
        }
      }));
      if (i + batchSize < uniqueItems.length) await new Promise(r => setTimeout(r, 1000));
    }
    setIsUpdatingPrices(false);
    setUpdateProgress("");
  };

  const handleSmartUpdate = () => {
    const failedOrMissing = watchlist.filter(item => !stockPrices[item.symbol] || stockPrices[item.symbol].error);
    if (failedOrMissing.length > 0) fetchPricesForWatchlist(failedOrMissing);
    else if (window.confirm("전체 업데이트하시겠습니까?")) fetchPricesForWatchlist(watchlist);
  };

  const handleAddStock = () => {
    if (!newStockName.trim() || !newSymbol.trim()) return;
    let cleanSymbol = newSymbol.trim();
    if (/^\d+$/.test(cleanSymbol) && cleanSymbol.length < 6) cleanSymbol = cleanSymbol.padStart(6, '0');
    setWatchlist([...watchlist, { id: Date.now(), category: newCategory, name: newStockName.trim(), symbol: cleanSymbol, isHeld: newIsHeld }]);
    setNewStockName(''); setNewSymbol(''); setNewIsHeld(false);
  };

  const handleSaveToHardDrive = async (name: string, symbol: string) => {
    setSavingLocal(true);
    setError(null);
    try {
      const data = await fetchStockData(symbol, date, 250);
      const formattedData = formatStockDataForSave(data);

      if (saveDirHandle) {
        const fileName = `${symbol}_Data_${date}.txt`;
        await saveJsonToHandle(saveDirHandle, fileName, formattedData);
        setAutoSaveMsg(`${fileName} 자동 저장 완료`);
      } else {
        const result = await saveStockDataToLocal(symbol, date, data);
        alert(result);
      }
    } catch (err: any) { setError(`저장 실패: ${err.message}`); } finally { setSavingLocal(false); }
  };

  const handleRunSelfLearning = async (name: string, symbol: string) => {
    setLearning(true); 
    setError(null);
    setCurrentStock({ name, symbol }); 
    
    try {
      const data = await fetchStockData(symbol, date, 300);
      const learningResults = runSelfLearning(data);
      if (learningResults.length === 0) {
        alert(`[${name}] 분석 완료: \n데이터 내에서 분석 가능한 성공 패턴(과거 수익 구간)이 발견되지 않았습니다.`);
        return;
      }

      if (saveDirHandle) {
        const fileName = `${symbol}_SelfLearning_${date}.txt`;
        await saveJsonToHandle(saveDirHandle, fileName, learningResults);
        setAutoSaveMsg(`${learningResults.length}개 패턴 ${fileName} 자동 저장 완료`);
      } else {
        const resultMsg = await saveLearningResultToLocal(symbol, date, learningResults);
        alert(`${learningResults.length}개의 자가학습 세트 추출 완료.\n${resultMsg}`);
      }

    } catch (err: any) { 
      console.error(err);
      const msg = `자가학습 실패: ${err.message}`;
      setError(msg); 
      alert(msg); 
    } finally { 
      setLearning(false); 
    }
  };

  // --- Bulk Save Functions ---

  const handleBulkSaveAllData = async () => {
    if (watchlist.length === 0) return alert("목록이 비어있습니다.");
    
    let handle = saveDirHandle;
    // 폴더가 연결되지 않았으면 먼저 저장 위치를 묻습니다.
    if (!handle) {
       try {
         handle = await getUserDirectoryHandle();
         setSaveDirHandle(handle); // 편의를 위해 연결 상태 유지
         setAutoSaveMsg("저장 폴더가 연결되었습니다.");
       } catch (e: any) {
         if (e.name === 'AbortError') {
             alert("폴더 선택이 취소되어 작업을 중단합니다.");
         } else {
             alert("폴더 선택 실패: " + e.message);
         }
         return; 
       }
    }

    if (!window.confirm(`선택된 폴더에 ${watchlist.length}개 종목의 데이터를 일괄 저장하시겠습니까?`)) {
        alert("작업이 취소되었습니다.");
        return;
    }

    setError(null);
    setIsBulkProcessing(true);
    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < watchlist.length; i++) {
        const item = watchlist[i];
        
        // 상태 메시지 업데이트: 계산 중임을 명시
        setBulkProgress(`일괄데이터 계산 중... (${i + 1} / ${watchlist.length})`);
        
        try {
          const data = await fetchStockData(item.symbol, date, 250);
          const formattedData = formatStockDataForSave(data);
          
          await saveJsonToHandle(handle, `${item.symbol}_Data_${date}.txt`, formattedData);
          successCount++;
        } catch (e) {
          console.error(`Failed to save ${item.name}`, e);
          failCount++;
        }
        // UI 갱신을 위한 짧은 대기
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      alert(`완료되었습니다.\n성공: ${successCount}건\n실패: ${failCount}건`);
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(`일괄 저장 중 오류: ${err.message}`);
    } finally {
      setIsBulkProcessing(false);
      setBulkProgress("");
    }
  };

  const handleBulkSaveAllLearning = async () => {
    if (watchlist.length === 0) return alert("목록이 비어있습니다.");
    
    let handle = saveDirHandle;
    // 폴더가 연결되지 않았으면 먼저 저장 위치를 묻습니다.
    if (!handle) {
       try {
         handle = await getUserDirectoryHandle();
         setSaveDirHandle(handle);
         setAutoSaveMsg("저장 폴더가 연결되었습니다.");
       } catch (e: any) {
         if (e.name === 'AbortError') {
            alert("폴더 선택이 취소되어 작업을 중단합니다.");
         } else {
            alert("폴더 선택 실패: " + e.message);
         }
         return;
       }
    }

    if (!window.confirm(`선택된 폴더에 ${watchlist.length}개 종목의 자가학습 결과를 일괄 저장하시겠습니까?`)) {
        alert("작업이 취소되었습니다.");
        return;
    }

    setError(null);
    setIsBulkProcessing(true);
    try {
      let successCount = 0;
      let noResultCount = 0;
      let failCount = 0;

      for (let i = 0; i < watchlist.length; i++) {
        const item = watchlist[i];

        // 상태 메시지 업데이트: 자가학습 계산 중임을 명시
        setBulkProgress(`일괄 자가학습 계산 중... (${i + 1} / ${watchlist.length})`);
        
        try {
          const data = await fetchStockData(item.symbol, date, 300);
          const learningResults = runSelfLearning(data);
          
          if (learningResults.length > 0) {
            await saveJsonToHandle(handle, `${item.symbol}_SelfLearning_${date}.txt`, learningResults);
            successCount++;
          } else {
            noResultCount++;
          }
        } catch (e) {
          console.error(`Failed to analyze ${item.name}`, e);
          failCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      alert(`완료되었습니다.\n저장됨: ${successCount}건\n패턴없음: ${noResultCount}건\n실패: ${failCount}건`);
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(`일괄 저장 중 오류: ${err.message}`);
    } finally {
      setIsBulkProcessing(false);
      setBulkProgress("");
    }
  };

  const handleExportCSV = () => {
    const header = "Category,Name,Symbol,IsHeld\n";
    const csvContent = watchlist.map(item => `${item.category},${item.name},${item.symbol},${item.isHeld ? 'Yes' : 'No'}`).join('\n');
    const blob = new Blob([header + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `kstock_watchlist_${getTodayYYYYMMDD()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      const newItems: WatchlistItem[] = [];
      const timestamp = Date.now();

      lines.forEach((line, index) => {
        // Skip header or empty lines
        if (index === 0 && (line.includes('Category') || line.includes('분류'))) return;
        if (!line.trim()) return;

        const cols = line.split(',').map(c => c.trim());
        if (cols.length >= 3) {
          const category = cols[0] || '개별';
          const name = cols[1];
          const symbol = cols[2];
          const heldVal = cols[3]?.toLowerCase() || '';
          
          // Recognize 'true' or '보유' as true
          const isHeld = heldVal === 'true' || heldVal === '보유';

          if (name && symbol) {
            newItems.push({
              id: timestamp + index,
              category,
              name,
              symbol,
              isHeld
            });
          }
        }
      });

      if (newItems.length > 0) {
        // Append to existing watchlist (filter duplicates by symbol)
        const currentSymbols = new Set(watchlist.map(w => w.symbol));
        const uniqueNewItems = newItems.filter(item => !currentSymbols.has(item.symbol));
        
        setWatchlist([...watchlist, ...uniqueNewItems]);
        alert(`${uniqueNewItems.length}개 종목을 추가했습니다. (중복 제외)`);
      } else {
        alert("유효한 데이터가 없습니다.");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg"><TrendingUp size={24} className="text-white" /></div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">K-Stock Analyst Pro</h1>
          </div>
          
          {/* Folder Connection Button */}
          <button 
            onClick={handleConnectFolder}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border ${
              saveDirHandle 
              ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' 
              : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600 hover:text-white'
            }`}
          >
            {saveDirHandle ? <FolderCheck size={16} /> : <FolderInput size={16} />}
            {saveDirHandle ? "자동 저장 폴더 연결됨" : "저장 폴더 연결 (자동 저장 활성화)"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-slate-800 rounded-xl shadow-xl border border-slate-700">
          <div className="bg-slate-750 p-6 border-b border-slate-700">
             <label className="block text-sm font-medium text-slate-400 mb-1 flex items-center gap-2"><Calendar size={16} /> 분석 기준 일자 (YYYYMMDD)</label>
             <input type="text" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 transition-all" />
          </div>

          <div className="p-6 border-b border-slate-700">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-3">
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"><>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</></select>
                <input type="text" placeholder="종목명" value={newStockName} onChange={(e) => setNewStockName(e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2" />
                <input type="text" placeholder="코드 (6자리)" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} className="md:w-32 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2" />
                <button onClick={handleAddStock} className="bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded-lg font-bold transition-all active:scale-95">추가</button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={handleSmartUpdate} className="bg-blue-900/40 text-blue-400 px-4 py-2 rounded text-sm font-bold flex items-center gap-2 border border-blue-800/50 hover:bg-blue-900/60 transition-colors">
                  {isUpdatingPrices ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {isUpdatingPrices ? updateProgress : "현재가 업데이트"}
                </button>
                <div className="w-px h-6 bg-slate-700 mx-2 hidden md:block"></div>
                <button onClick={handleBulkSaveAllData} disabled={isBulkProcessing} className="bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 min-w-[140px] justify-center">
                  {isBulkProcessing && bulkProgress.includes("데이터") ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />} 
                  {isBulkProcessing && bulkProgress.includes("데이터") ? bulkProgress : "일괄 데이터 저장"}
                </button>
                <button onClick={handleBulkSaveAllLearning} disabled={isBulkProcessing} className="bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 min-w-[140px] justify-center">
                  {isBulkProcessing && bulkProgress.includes("자가학습") ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />} 
                  {isBulkProcessing && bulkProgress.includes("자가학습") ? bulkProgress : "일괄 자가학습 저장"}
                </button>
                <div className="w-px h-6 bg-slate-700 mx-2 hidden md:block"></div>
                <button onClick={handleExportCSV} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-colors">
                  <Download size={14} /> CSV 내보내기
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-colors">
                  <Upload size={14} /> CSV 불러오기
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" className="hidden" />
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            {CATEGORIES.map(category => (
              <div key={category} className="border-b border-slate-700 last:border-0">
                <div onClick={() => setExpandedGroups(p => ({...p, [category]: !p[category]}))} className="flex items-center gap-3 p-4 hover:bg-slate-700 cursor-pointer transition-colors">
                  {expandedGroups[category] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  <span className="font-bold">{category}</span>
                  <span className="text-xs text-slate-500 bg-slate-900 px-2 py-0.5 rounded-full">{watchlist.filter(w => w.category === category).length}</span>
                </div>
                {expandedGroups[category] && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[700px]">
                      <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase">
                        <tr>
                          <th className="p-3 text-center w-12">보유</th>
                          <th className="p-3">종목명(코드)</th>
                          <th className="p-3 text-right">종가</th>
                          <th className="p-3 text-right">%</th>
                          <th className="p-3 text-center">데이터 (Txt)</th>
                          <th className="p-3 text-center">자가학습 (Txt)</th>
                          <th className="p-3 text-center w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {watchlist.filter(i => i.category === category).map(item => (
                          <tr key={item.id} className="hover:bg-slate-700/30 transition-colors">
                            <td className="p-3 text-center">
                              <button onClick={() => setWatchlist(watchlist.map(w => w.id === item.id ? {...w, isHeld: !w.isHeld} : w))}>
                                {item.isHeld ? <CheckSquare className="text-blue-400" size={18} /> : <Square className="text-slate-600" size={18} />}
                              </button>
                            </td>
                            <td className="p-3 font-medium">
                              <div className="flex items-center gap-2">
                                <div>
                                  {item.name}<br/>
                                  <span className="text-[10px] text-slate-500 font-mono">{item.symbol}</span>
                                </div>
                                <a 
                                  href={`https://m.stock.naver.com/domestic/stock/${item.symbol}/total`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-slate-600 hover:text-green-400 transition-colors p-1"
                                  title="네이버 증권 상세"
                                >
                                  <ExternalLink size={14} />
                                </a>
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono">{stockPrices[item.symbol]?.close?.toLocaleString() || '-'}</td>
                            <td className={`p-3 text-right font-mono font-bold ${stockPrices[item.symbol]?.changeRate > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                              {stockPrices[item.symbol]?.changeRate ? `${stockPrices[item.symbol].changeRate.toFixed(2)}%` : '-'}
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => handleSaveToHardDrive(item.name, item.symbol)} disabled={savingLocal} title={saveDirHandle ? "데이터 자동저장" : "데이터 저장 (다운로드)"} className={`p-1.5 rounded disabled:opacity-50 transition-colors ${saveDirHandle ? 'bg-emerald-700 text-emerald-100 hover:bg-emerald-600' : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white'}`}>
                                <HardDrive size={14} />
                              </button>
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => handleRunSelfLearning(item.name, item.symbol)} disabled={learning} title={saveDirHandle ? "자가학습 및 자동저장" : "자가학습 결과 저장"} className="p-1.5 bg-amber-700/50 text-amber-400 rounded hover:bg-amber-600 hover:text-white disabled:opacity-50 transition-colors">
                                {learning && currentStock?.symbol === item.symbol ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                              </button>
                            </td>
                            <td className="p-3 text-center">
                              <button onClick={() => setWatchlist(watchlist.filter(w => w.id !== item.id))} className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={16}/></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Auto Save Feedback Toast */}
        {autoSaveMsg && (
          <div className="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-2xl animate-bounce flex items-center gap-2">
             <CheckSquare size={18} />
             {autoSaveMsg}
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg flex items-start gap-3 text-red-200 animate-pulse">
            <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
