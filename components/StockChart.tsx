import React from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area
} from 'recharts';
import { StockData } from '../types';

interface StockChartProps {
  data: StockData[];
  symbol: string;
}

const StockChart: React.FC<StockChartProps> = ({ data, symbol }) => {
  // Show all available data (up to 250 points)
  const chartData = data; 

  if (chartData.length === 0) return null;

  return (
    <div className="w-full bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-700">
      <h3 className="text-white text-lg font-bold mb-4 pl-2 border-l-4 border-blue-500">
        {symbol} Price & MA Chart (Last {chartData.length} Days)
      </h3>
      {/* Explicit height wrapper for Recharts to avoid 0/-1 dimension errors */}
      <div className="w-full h-[400px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={chartData}>
            <defs>
              <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              tick={{fill: '#94a3b8', fontSize: 10}}
              tickFormatter={(value) => value.substring(4)} // Show MMDD
              minTickGap={30} 
            />
            <YAxis 
              domain={['auto', 'auto']} 
              stroke="#94a3b8"
              tick={{fill: '#94a3b8', fontSize: 12}}
              tickFormatter={(val) => val.toLocaleString()} // Full number with commas
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: number) => value.toLocaleString()}
              itemSorter={(item) => {
                // Sort tooltip items: Close, EMA 20, EMA 50, EMA 200
                if (item.name === 'EMA 20') return 1;
                if (item.name === 'EMA 50') return 2;
                if (item.name === 'EMA 200') return 3;
                return 0; 
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '10px' }} />
            
            <Area 
              type="monotone" 
              dataKey="close" 
              name="Close Price" 
              stroke="#8884d8" 
              fillOpacity={1} 
              fill="url(#colorClose)" 
              isAnimationActive={false} 
            />
            
            <Line 
              type="monotone" 
              dataKey="ema20" 
              name="EMA 20" 
              stroke="#fbbf24" // Amber/Yellow
              strokeWidth={2} 
              dot={false}
              isAnimationActive={false}
            />
            
            <Line 
              type="monotone" 
              dataKey="ema50" 
              name="EMA 50" 
              stroke="#22c55e" // Green
              strokeWidth={2} 
              dot={false}
              isAnimationActive={false}
            />

            {/* EMA 200 defined LAST to ensure it appears on the far right of the Legend */}
            <Line 
              type="monotone" 
              dataKey="ema200" 
              name="EMA 200" 
              stroke="#ef4444" // Red
              strokeWidth={2} 
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StockChart;