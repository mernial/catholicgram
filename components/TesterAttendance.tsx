'use client';

// 안드로이드 테스터 14일 출석 도장 (운영자 2026-11-14 시안 그대로) — lib/tester-attendance
// 테스터가 그날 처음 앱을 열면 홈에 14칸 도장 판. Play 테스트 앱으로 연 날에만 '출석' 도장 (구글은 Play 앱을 연 기록만 셈)
// 예전 아이콘·인터넷 창으로 열었으면 도장 대신 'Play 테스트 앱 열어서 도장 찍기' (지우라는 말은 하지 않음)
import { attendDates, attendDayNo, attendStreak, shortDate, ATTEND_DAYS } from '@/lib/tester-attendance';
import { playAppIntent } from '@/components/AppKindNotice';

function Seal({ day, big }: { day: string; big?: boolean }) {
  return (
    <span aria-hidden className={`absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[2.4rem] h-[2.4rem] rounded-full border-[2.5px] border-[#c0392b] text-[#c0392b] flex flex-col items-center justify-center font-bold leading-none opacity-90 ${big ? 'rotate-[-10deg] scale-110 shadow-[0_0_0_3px_rgba(192,57,43,0.12)]' : 'rotate-[-14deg]'}`}>
      <span className="text-[0.6875rem]">출석</span><span className="text-[0.4375rem] mt-0.5 tracking-wide">{shortDate(day)}</span>
    </span>
  );
}

// 14칸 도장 판
export function StampGrid({ days, today }: { days: Set<string>; today: string }) {
  const dates = attendDates();
  return (
    <div className="grid grid-cols-7 gap-1.5" role="list" aria-label="출석 도장 14칸">
      {dates.map((d, i) => {
        const on = days.has(d), td = d === today, past = d < today, last = i === ATTEND_DAYS - 1 && !on;
        const tone = td && on ? 'bg-[#fff3e8] border-2 border-[#e8a76a] shadow-[0_0_0_4px_rgba(232,167,106,0.2)]'
          : on ? 'bg-[#fff7f2] border-[1.5px] border-[#f3d9cc]'
          : td ? 'bg-white border-2 border-[#e8a76a]'
          : past ? 'bg-stone-100 border-[1.5px] border-stone-200'
          : last ? 'bg-[#fffbea] border-[1.5px] border-dashed border-[#e9c46a]'
          : 'bg-[#f7f5f1] border-[1.5px] border-dashed border-stone-300';
        return (
          <div key={d} role="listitem" aria-label={`${i + 1}일째 ${shortDate(d)} ${on ? '출석' : past ? '빠짐' : ''}`}
            className={`relative aspect-[1/1.18] rounded-[0.875rem] flex flex-col items-center justify-end pb-1 ${tone}`}>
            <span className={`absolute top-1 inset-x-0 text-center text-[0.6875rem] font-bold ${past && !on ? 'text-stone-300' : 'text-stone-400'}`}>{i + 1}일</span>
            <span className="text-[0.625rem] font-bold text-stone-400">{shortDate(d)}</span>
            {on && <Seal day={d} big={td} />}
            {td && <span className="absolute -right-1.5 -top-2.5 bg-[#c0392b] text-white text-[0.625rem] font-bold px-1.5 py-px rounded-full rotate-[8deg]">오늘</span>}
            {past && !on && <span className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-stone-300 font-bold">–</span>}
            {last && <span className="absolute top-[36%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.9375rem] leading-none" aria-hidden>⭐</span>}
          </div>
        );
      })}
    </div>
  );
}

export function TesterAttendancePopup({ days: dayList, today, isPlay, preview, onClose, onHide }: {
  days: string[];
  today: string;
  isPlay: boolean;          // 지금 Play 테스트 앱으로 보고 있음 → 오늘 도장
  preview?: boolean;
  onClose: () => void;      // 오늘은 그만 (내일 다시)
  onHide?: () => void;      // 다시 보지 않기
}) {
  const days = new Set(dayList);
  if (isPlay && attendDayNo(today) >= 1 && attendDayNo(today) <= ATTEND_DAYS) days.add(today); // 서버가 아직 못 적었어도 지금 Play 앱으로 열었음
  const n = days.size, done = n >= ATTEND_DAYS, stampedToday = days.has(today);
  const streak = attendStreak(days, today);
  const left = Math.max(0, ATTEND_DAYS - attendDayNo(today));
  const dates = attendDates();
  const title = done ? '14일 완주! 정말 고맙습니다 🙌' : stampedToday ? `오늘 도장 쾅! 🎉${streak > 1 ? ` 연속 ${streak}일째예요` : ''}` : '오늘 도장은 아직이에요';
  return (
    <div className="fixed inset-0 z-[88] bg-black/55 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-sm max-h-[88dvh] bg-white rounded-[1.75rem] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="테스터 출석 도장">
        <div className="px-5 pt-[1.125rem] pb-3 flex items-center gap-2.5 border-b border-stone-200">
          <span className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-xl shrink-0" aria-hidden>📱</span>
          <div className="min-w-0">
            <p className="text-[0.75rem] font-bold text-blue-700">{preview ? '출석 도장 미리 보기 (관리자) · ' : ''}{+dates[0].slice(5, 7)}월 {+dates[0].slice(8)}일 ~ {+dates[ATTEND_DAYS - 1].slice(5, 7)}월 {+dates[ATTEND_DAYS - 1].slice(8)}일 · 14일</p>
            <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">안드로이드 테스터 출석 도장</h2>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-[1.125rem] pt-3.5 pb-4">
          <p className="flex items-baseline justify-center gap-1.5 flex-wrap text-center">
            <b className="text-[2.125rem] font-bold text-blue-700 leading-none">{n}</b>
            <span className="text-[0.9375rem] font-bold text-stone-600">/ 14일 · {title}</span>
          </p>
          <div className="mt-2.5 mb-3 mx-1 h-2 rounded-full bg-stone-200 overflow-hidden"><i className="block h-full rounded-full bg-blue-600" style={{ width: `${(n / ATTEND_DAYS) * 100}%` }} /></div>
          <StampGrid days={days} today={today} />
          {done ? (
            <p className="mt-3 p-3 rounded-2xl bg-blue-50 border border-blue-100 text-[0.875rem] text-stone-700 leading-relaxed">덕분에 가톨릭그램이 정식 출시에 한 걸음 더 다가갔어요. 14일 동안 함께해 주셔서 정말 고맙습니다 🙏</p>
          ) : stampedToday ? (
            <p className="mt-3 p-3 rounded-2xl bg-blue-50 border border-blue-100 text-[0.875rem] text-stone-700 leading-relaxed">
              구글은 <b className="text-stone-900">Play 테스트 앱</b>을 여신 날을 세어요. 내일도 이 앱으로 한 번만 들어와 주세요.{left > 0 && <> <b className="text-stone-900">{left}일</b> 남았어요</>} 🙏
            </p>
          ) : (
            <>
              <p className="mt-3 p-3 rounded-2xl bg-orange-50 border border-orange-200 text-[0.875rem] text-stone-700 leading-relaxed">
                ⚠️ 지금은 <b className="text-stone-900">예전 아이콘이나 인터넷 창</b>으로 보고 계세요. 도장은 <b className="text-stone-900">Play 테스트 앱</b>으로 여실 때만 찍혀요.
              </p>
              <a href={playAppIntent()} className="mt-3 block w-full py-3.5 rounded-2xl bg-emerald-700 text-white text-[0.9375rem] font-bold text-center active:bg-emerald-800">Play 테스트 앱 열어서 도장 찍기</a>
            </>
          )}
        </div>
        <div className="flex border-t border-stone-200">
          {onHide && <button onClick={onHide} className="flex-1 py-3.5 text-[0.9375rem] font-bold text-stone-500 border-r border-stone-200">다시 보지 않기</button>}
          <button onClick={onClose} className="flex-1 py-3.5 text-[0.9375rem] font-bold text-stone-900">{stampedToday ? '확인했어요' : '닫기'}</button>
        </div>
      </div>
    </div>
  );
}

// 관리자 출석부 한 줄: 14칸 점 (빨강 = 출석, 노란 테두리 = 오늘)
export function AttendDots({ days, today }: { days: string[]; today: string }) {
  const set = new Set(days);
  return (
    <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-[2px] flex-1 min-w-0" aria-label={`출석 ${days.length}일`}>
      {attendDates().map(d => (
        <span key={d} className={`aspect-square rounded-full ${set.has(d) ? 'bg-[#c0392b]/85' : d > today ? 'border border-dashed border-stone-300' : 'bg-stone-200'} ${d === today ? 'outline outline-2 outline-offset-1 outline-[#e8a76a]' : ''}`} />
      ))}
    </div>
  );
}
