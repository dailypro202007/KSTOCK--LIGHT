
import { StockData } from '../types';

export interface LearningResult {
  buyDate: string;
  successDate: string | null;
  maxReturn: number;
  context: {
    emaTrend: string;
    adxStrength: string;
    volumeMultiplier: number;
  };
  details: any[];
}

export const runSelfLearning = (data: StockData[]): LearningResult[] => {
  const results: LearningResult[] = [];
  const LOOK_FORWARD = 20; // 향후 20일
  const LOOK_BACK = 10;    // 직전 10일
  const TARGET_RETURN = 1.10; // 10% 수익

  // 데이터가 최소 분석 가능 수량(LOOK_BACK + LOOK_FORWARD) 이상이어야 함
  if (data.length < LOOK_BACK + LOOK_FORWARD) return [];

  // i는 매수 시점 t
  for (let i = LOOK_BACK - 1; i < data.length - LOOK_FORWARD; i++) {
    const buyDay = data[i];
    const buyPrice = buyDay.close;
    let isSuccess = false;
    let successDate = null;
    let maxHigh = 0;

    // 1. 향후 20일간 10% 수익 여부 판별
    for (let j = i + 1; j <= i + LOOK_FORWARD; j++) {
      if (data[j].high > maxHigh) maxHigh = data[j].high;
      if (!isSuccess && data[j].high >= buyPrice * TARGET_RETURN) {
        isSuccess = true;
        successDate = data[j].date;
      }
    }

    // 수익 성공 케이스만 Context 분석 진행
    if (isSuccess) {
      const contextData = data.slice(i - (LOOK_BACK - 1), i + 1);
      
      // 2. 직전 10일(t-9 ~ t) 기술적 흐름 분석 (라벨링)
      
      // EMA 추세 라벨링
      const first = contextData[0];
      const last = contextData[contextData.length - 1];
      let emaTrendLabel = "혼조세";
      
      const isFullBullish = (d: StockData) => (d.ema20 || 0) > (d.ema50 || 0) && (d.ema50 || 0) > (d.ema200 || 0);
      const isFullBearish = (d: StockData) => (d.ema20 || 0) < (d.ema50 || 0) && (d.ema50 || 0) < (d.ema200 || 0);

      if (isFullBullish(last)) {
        emaTrendLabel = isFullBullish(first) ? "정배열 유지" : "정배열 전환 성공";
      } else if (isFullBearish(last)) {
        emaTrendLabel = "역배열 하락중";
      } else if ((last.ema20 || 0) > (last.ema50 || 0) && isFullBearish(first)) {
        emaTrendLabel = "역배열 탈출 시도";
      }

      // ADX 강도 라벨링
      let adxLabel = "강도 보통";
      const currentAdx = last.adx || 0;
      if (currentAdx > 25) adxLabel = "강력 추세 유지";
      else if (currentAdx > 20 && currentAdx > (contextData[contextData.length - 2].adx || 0)) adxLabel = "추세 강화 시작";
      else if (currentAdx < 20) adxLabel = "에너지 응축(저변동)";

      // 거래량 폭발 배수 (직전 5일 평균 대비 당일)
      const prevAvgVol = contextData.slice(0, 5).reduce((acc, cur) => acc + cur.volume, 0) / 5;
      const volumeMultiplier = Number((last.volume / (prevAvgVol || 1)).toFixed(2));

      results.push({
        buyDate: buyDay.date,
        successDate,
        maxReturn: Number(((maxHigh - buyPrice) / buyPrice * 100).toFixed(2)),
        context: {
          emaTrend: emaTrendLabel,
          adxStrength: adxLabel,
          volumeMultiplier
        },
        details: contextData
      });
    }
  }

  return results;
};
