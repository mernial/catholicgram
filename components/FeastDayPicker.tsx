'use client';

import { DAYS_IN_MONTH, formatFeastDay, suggestFeastDays, toFeastDay } from '@/lib/feast';

// 축일(월/일) 선택 + 세례명에 맞는 대표 축일 추천
export default function FeastDayPicker({ value, onChange, name }: {
  value: string;              // 'MM-DD' 또는 ''
  onChange: (value: string) => void;
  name?: string;              // 이름 + 세례명 (추천용)
}) {
  const [month, day] = value ? value.split('-').map(Number) : [0, 0];
  const suggestions = name ? suggestFeastDays(name) : [];
  const select = 'flex-1 p-3 text-sm font-medium border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50';

  const changeMonth = (m: number) => {
    if (!m) { onChange(''); return; }
    onChange(toFeastDay(m, Math.min(day || 1, DAYS_IN_MONTH[m - 1])));
  };
  const changeDay = (d: number) => {
    if (!d) { onChange(''); return; }
    onChange(toFeastDay(month || 1, d));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select value={month} onChange={e => changeMonth(Number(e.target.value))} className={select} aria-label="축일 월">
          <option value={0}>월 선택</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
        </select>
        <select value={day} onChange={e => changeDay(Number(e.target.value))} className={select} aria-label="축일 일">
          <option value={0}>일 선택</option>
          {Array.from({ length: DAYS_IN_MONTH[(month || 1) - 1] }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}일</option>)}
        </select>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[0.75rem] text-stone-500">세례명으로 찾은 축일 (눌러서 선택)</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map(s => (
              <button
                key={`${s.saint}-${s.date}`}
                type="button"
                onClick={() => onChange(s.date)}
                className={`text-xs rounded-full px-2.5 py-1.5 border text-left ${value === s.date ? 'bg-stone-900 text-white border-stone-900' : 'bg-amber-50 text-stone-700 border-amber-200'}`}
              >
                🕯️ {s.saint} · {formatFeastDay(s.date)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
