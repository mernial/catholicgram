'use client';

import { DAYS_IN_MONTH, toFeastDay } from '@/lib/feast';

// 축일(월/일) 선택. 생일(월/일)도 같은 칸을 쓴다 (what='생일')
// 예전엔 세례명으로 대표 축일을 추천했는데, 같은 세례명의 성인이 여럿이라(요한·마리아·데레사…) 본인 축일과 다른 날이 나와 없앰 (운영자 요청)
export default function FeastDayPicker({ value, onChange, what = '축일' }: {
  value: string;              // 'MM-DD' 또는 ''
  onChange: (value: string) => void;
  what?: string;              // 읽어 주기용 이름 ('축일' · '생일')
}) {
  const [month, day] = value ? value.split('-').map(Number) : [0, 0];
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
        <select value={month} onChange={e => changeMonth(Number(e.target.value))} className={select} aria-label={`${what} 월`}>
          <option value={0}>월 선택</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
        </select>
        <select value={day} onChange={e => changeDay(Number(e.target.value))} className={select} aria-label={`${what} 일`}>
          <option value={0}>일 선택</option>
          {Array.from({ length: DAYS_IN_MONTH[(month || 1) - 1] }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}일</option>)}
        </select>
      </div>
      {what === '축일' && <p className="text-[0.75rem] text-stone-500 leading-snug">세례 때 정한 주보 성인의 축일을 골라 주세요. 같은 세례명이라도 성인에 따라 축일이 달라요. (잘 모르시면 세례 증명서나 본당에서 확인할 수 있어요)</p>}
    </div>
  );
}
