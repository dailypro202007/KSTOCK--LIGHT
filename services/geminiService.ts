import { GoogleGenAI } from "@google/genai";
import { StockData } from '../types';

const REFERENCE_MATERIAL = `
[이동평균선 조합: EMA 20, EMA 50, EMA 200]

**가장 강력한 신호**
가격이 20일 EMA 위에 있고 + (20 EMA > 50 EMA > 200 EMA) 정배열 상태 + pullback 후 20일 EMA 지지 반등

[시장 국면별 행동 전략 및 필터]

1. **강세 초기**
   - **배열 상태**: 20일 EMA가 50일 EMA를 급상승 돌파 (골든크로스 초기)
   - **행동 전략**: 신규 매수
   - **추가 필터**: 거래량이 20일 평균보다 50% 이상 증가 + RSI(14) 45 이상
   - **비고**: 가장 강한 진입 타이밍

2. **안정 강세**
   - **배열 상태**: 가격 > 20 EMA > 50 EMA > 200 EMA (나란히 상승)
   - **행동 전략**: 홀드(Hold) 또는 추가 매수
   - **추가 필터**: 가격이 200일 EMA 위에 있을 때만 롱 포지션 유지
   - **비고**: 200일 EMA 아래로 떨어지면 즉시 전량 청산

3. **천장권 예고**
   - **배열 상태**: 20일 EMA 상승 둔화 혹은 수평 전환, 가격이 20일 EMA 아래로 이탈
   - **행동 전략**: 50~70% 익절, Trailing Stop을 20일 EMA 아래로 설정
   - **추가 필터**: RSI 70 이상 과매수 구간 진입 후 거래량 감소
   - **비고**: 50일 EMA 이탈 시 나머지 물량 전량 청산

4. **약세 초기**
   - **배열 상태**: 20일 EMA가 50일 EMA를 급하락 돌파 (데드크로스 초기)
   - **행동 전략**: 전량 청산 또는 공매도
   - **추가 필터**: 거래량 50% 이상 증가 + RSI 55 이하
   - **비고**: 가격이 200일 EMA 아래에 위치하면 롱(매수) 포지션 절대 금지

5. **강력 약세**
   - **배열 상태**: 가격 < 20 EMA < 50 EMA < 200 EMA (나란히 하락)
   - **행동 전략**: 현금 보유 (관망) 또는 공매도
   - **추가 필터**: 200일 EMA 아래에 있을 때만 숏(매도) 포지션 유지

6. **바닥권 예고**
   - **배열 상태**: 20일 EMA가 하락을 멈추고 상향으로 꺾임, 50일 EMA 지지 시도
   - **행동 전략**: 숏커버(공매도 청산) 또는 매수 준비
   - **추가 필터**: RSI 30 이하 과매도 구간 + 거래량 증가
   - **비고**: 20일 EMA가 50일 EMA를 상향 돌파 시 진입 고려

7. **보합·혼조 국면**
   - **배열 상태**: 20, 50, 200일 선이 서로 얽혀 있거나 수평 이동
   - **행동 전략**: 거래 보류 (전량 현금)
   - **추가 필터**: 어떤 명확한 크로스 신호도 없으면 절대 진입 금지
   - **비고**: MA101 전략에서 가장 강조하는 규칙 (손실 방지)

[실전 진입·청산 규칙 (20·50·200 전용)]

**매수 조건 (3가지 모두 충족 시)**
1. **정배열 완성**: 20일 EMA > 50일 EMA > 200일 EMA
2. **Pullback 매수**: 가격이 20일 EMA 위에서 상승하다가 20일 EMA 부근까지 내려와서(Pullback) 지지를 받고 반등할 때 (가장 높은 승률)
3. **거래량 증가**: 반등 시점에 거래량이 수반되어야 함

**매도·청산 조건 (하나라도 충족 시 즉시)**
1. 20일 EMA가 50일 EMA 아래로 하향 돌파 (데드크로스)
2. 가격이 200일 EMA 아래로 이탈 (대세 하락 신호)
3. 20일 EMA 이탈 (단기 추세 붕괴 시 부분 청산 고려)

**손절 규칙**
- 진입 후 직전 저점 또는 20일 EMA 아래 2~3% 수준
- **200일 EMA 이탈 시 무조건 전량 청산** (손실이 15%를 넘더라도 대세 하락을 피하기 위함)

[핵심 매매 원칙 (Trend & Level)]
1. **Spot the Trend and Go With It – 추세를 찾아 따라가라**
   - “추세가 상승이면 dip(조정)에서 매수하고, 하락이면 rally(반등)에서 매도하라.”
   - 추세 역행 매매는 계좌 파산의 지름길이다.

2. **Find the Low and High of It – 지지·저항 찾아라**
   - 이전 고점 = 미래 저항 → 돌파되면 지지로 바뀜.
   - 이전 저점 = 미래 지지 → 깨지면 저항으로 바뀜.

3. **Know How Far to Backtrack – 되돌림 비율**
   - 최소 33%, 보통 50%, 최대 66% 되돌림을 확인하라.
   - 피보나치 38.2%·61.8% 구간을 필수적으로 감시하라.
`;

export const analyzeStockData = async (symbol: string, stockName: string, data: StockData[], referenceDate?: string): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing in environment variables");
  }

  // Use the last 20 data points for recent trend analysis
  const recentData = data.slice(-20).map(d => ({
    date: d.date,
    close: d.close,
    ema20: d.ema20,   // Short (Exponential)
    ema50: d.ema50,   // Mid (Exponential)
    ema200: d.ema200  // Long (Exponential)
  }));

  const dataString = JSON.stringify(recentData, null, 2);
  const dataCount = recentData.length;
  // Use the provided reference date or fallback to the last data point's date
  const inquiryDate = referenceDate || recentData[recentData.length - 1]?.date || "Unknown";

  const prompt = `
    종목명: ${stockName}
    종목코드: ${symbol}
    조회기준일자: ${inquiryDate}
    
    아래 제공된 최근 ${dataCount}일간의 주가 데이터(일자, 종가, EMA 20, EMA 50, EMA 200)를 바탕으로 기술적 분석 보고서를 작성해줘.
    
    [데이터 정의]
    - 단기 추세선: EMA 20 (20일 지수이동평균)
    - 중기 추세선: EMA 50 (50일 지수이동평균)
    - 장기 추세선: EMA 200 (200일 지수이동평균)

    [데이터 참고사항]
    - 만약 이동평균 값(ema20, ema50, ema200) 중 null이 있다면, 신규 상장 등으로 데이터가 부족한 것이니 오류로 간주하지 말고, 가능한 데이터 범위 내에서만 분석해줘. (특히 최근 상장주는 EMA 200이 없을 수 있음)

    [보고서 작성 필수 순서 및 형식]
    
    **1. 핵심 요약**
    분석 결과의 최상단에 반드시 아래 리스트 형식을 그대로 사용하여 요약 정보를 작성해줘. 표를 사용하지 말고 아래와 같이 목록(Bullet list) 형태로 작성해.
    
    - 종목명 : ${stockName}
    - 조회일자 : ${inquiryDate}
    - 종가 : (조회일자 기준 종가)
    - 시장 국면 : (강세 초기/안정 강세/천장권/약세 초기/강력 약세/바닥권/보합 등)
    - 배열상태 : (정배열/역배열/혼조세)
    - 20EMA 추세 : (상승/하락/횡보)
    - 50EMA 추세 : (상승/하락/횡보)
    - 200EMA 추세 : (상승/하락/횡보)
    - 1차 매수 추천가 : (구체적 가격 또는 '진입 금지')

    **2. 상세 기술적 분석 (간결하게)**
    제공된 [분석 전략 가이드]와 [핵심 매매 원칙]을 적용하여 분석하되, **설명을 최대한 줄이고 핵심만 간단명료하게 작성해.**
    - 문단 구분은 유지하되, 장황한 서술을 피하고 결론 위주로 짧게 기술할 것.
    - "사전학습 자료" 같은 표현은 쓰지 말고, 바로 차트 상황을 진단해.
    - 정배열/역배열, 크로스 여부, 지지/저항 등을 핵심만 짚어서 설명.

    **3. 실전 투자 전략 (1,000만원 / 6개월)**
    투자 행동 지침을 핵심만 요약해서 짧게 제시해.
    - 진입/청산/관망 전략을 명확하고 간결하게 작성.

    [분석 전략 가이드]
    ${REFERENCE_MATERIAL}

    [주가 데이터 (최근 ${dataCount}일)]
    ${dataString}
  `;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const MAX_RETRIES = 3;
  let lastError;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.7, 
          systemInstruction: "너는 주식 차트 기술적 분석 전문가야. 보고서는 '핵심 요약' 리스트로 시작하고, 이후 내용은 문단 구분을 유지하되 군더더기 없이 핵심만 간단명료하게 작성해."
        }
      });

      return response.text || "분석 결과가 없습니다.";
    } catch (error: any) {
      console.warn(`Gemini API attempt ${i + 1} failed:`, error);
      lastError = error;
      // Wait before retrying (exponential backoff: 1s, 2s, 4s)
      if (i < MAX_RETRIES - 1) {
         await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
  }

  console.error("Gemini Analysis Error after retries:", lastError);
  throw new Error(`Gemini API 호출 중 오류가 발생했습니다 (${lastError?.message || 'Unknown Error'}). 잠시 후 다시 시도해주세요.`);
};