'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Icon from '@/components/Icon';

// 관리자 전용 접속 통계: 지금 접속 중, 오늘 들어온·나간 횟수, 방문자 수, 머문 시간, 최근 14일
interface Day { day: string; visitors: number; members: number; entries: number; exits: number; avgStayMin: number }
interface Stats {
  setupNeeded?: boolean;
  online: number; onlineMembers: number; onlineGuests: number;
  today: Day; yesterday: Day; weekVisitors: number; appUsers: number; hours: number[]; daily: Day[];
}

const dayLabel = (d: string) => { const [, m, dd] = d.split('-'); return `${Number(m)}/${Number(dd)}`; };
const weekday = (d: string) => '일월화수목금토'[new Date(`${d}T12:00:00+09:00`).getDay()];
const diff = (a: number, b: number) => a === b ? '어제와 같음' : a > b ? `어제보다 ${a - b} 많음` : `어제보다 ${b - a} 적음`;

export default function AdminStats({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<number | null>(null); // 그래프에서 누른 날
  const [updatedAt, setUpdatedAt] = useState('');

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${session?.access_token}` }, cache: 'no-store' }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { setError(json.error || '통계를 불러오지 못했어요.'); return; }
    setError('');
    setStats(json);
    setUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30 * 1000); // 30초마다 새로 고침
    return () => clearInterval(timer);
  }, []);

  const tile = 'bg-white border border-stone-200 rounded-2xl p-3.5';
  const maxVisitors = stats ? Math.max(1, ...stats.daily.map(d => d.visitors)) : 1;
  const busiestHour = stats ? stats.hours.reduce((best, n, h) => n > stats.hours[best] ? h : best, 0) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-[86] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-stone-50 w-full sm:w-[30rem] h-[94dvh] sm:h-[90dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
        <div className="p-4 bg-white border-b border-stone-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-stone-900"><Icon name="chart" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />접속 통계</h2>
            {updatedAt && <p className="text-[0.75rem] text-stone-400">{updatedAt} 기준 · 30초마다 새로 고침</p>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">새로 고침</button>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-2" aria-label="닫기">×</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          {error && <p className="p-6 text-center text-sm text-red-600">{error}</p>}
          {!stats && !error && <p className="p-10 text-center text-sm text-stone-400">불러오는 중...</p>}
          {stats?.setupNeeded && (
            <p className="p-6 text-center text-sm text-stone-500 leading-relaxed">접속 통계를 준비 중이에요.<br /><span className="text-xs">(Supabase에서 <code>supabase/visits.sql</code> 실행 후, 그때부터 기록돼요)</span></p>
          )}
          {stats && !stats.setupNeeded && (
            <>
              {/* 지금 접속 중 */}
              <div className="bg-[#101a3f] text-white rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/70 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />지금 접속 중</p>
                  <p className="text-4xl font-bold mt-1">{stats.online}<span className="text-lg font-semibold ml-1">명</span></p>
                </div>
                <div className="text-right text-sm text-white/80 leading-relaxed">
                  회원 {stats.onlineMembers}명<br />비회원 {stats.onlineGuests}명
                </div>
              </div>

              {/* 오늘 */}
              <p className="text-sm font-bold text-stone-700 mt-1">오늘</p>
              <div className="grid grid-cols-2 gap-2">
                <div className={tile}>
                  <p className="text-xs text-stone-500">방문한 사람</p>
                  <p className="text-2xl font-bold text-stone-900">{stats.today.visitors}<span className="text-sm ml-0.5">명</span></p>
                  <p className="text-[0.75rem] text-stone-400">회원 {stats.today.members}명 · {diff(stats.today.visitors, stats.yesterday.visitors)}</p>
                </div>
                <div className={tile}>
                  <p className="text-xs text-stone-500">평균 머문 시간</p>
                  <p className="text-2xl font-bold text-stone-900">{stats.today.avgStayMin}<span className="text-sm ml-0.5">분</span></p>
                  <p className="text-[0.75rem] text-stone-400">어제 {stats.yesterday.avgStayMin}분</p>
                </div>
                <div className={tile}>
                  <p className="text-xs text-stone-500">들어온 횟수</p>
                  <p className="text-2xl font-bold text-stone-900">{stats.today.entries}<span className="text-sm ml-0.5">회</span></p>
                  <p className="text-[0.75rem] text-stone-400">{diff(stats.today.entries, stats.yesterday.entries)}</p>
                </div>
                <div className={tile}>
                  <p className="text-xs text-stone-500">나간 횟수</p>
                  <p className="text-2xl font-bold text-stone-900">{stats.today.exits}<span className="text-sm ml-0.5">회</span></p>
                  <p className="text-[0.75rem] text-stone-400">아직 보는 중 {stats.today.entries - stats.today.exits}회</p>
                </div>
              </div>
              <div className={`${tile} text-sm text-stone-700 leading-relaxed`}>
                · 최근 7일 방문한 사람 <b>{stats.weekVisitors}명</b><br />
                · 오늘 홈 화면 앱으로 연 사람 <b>{stats.appUsers}명</b><br />
                · 오늘 가장 많이 들어온 시간 <b>{stats.hours[busiestHour] ? `${busiestHour}시 (${stats.hours[busiestHour]}회)` : '-'}</b>
              </div>

              {/* 최근 14일 방문한 사람 (막대를 누르면 그날 숫자) */}
              <div className={tile}>
                <p className="text-sm font-bold text-stone-700">최근 14일 방문한 사람</p>
                <p className="text-[0.75rem] text-stone-400 mb-2 min-h-[1.1rem]">
                  {picked !== null
                    ? `${dayLabel(stats.daily[picked].day)}(${weekday(stats.daily[picked].day)}) · ${stats.daily[picked].visitors}명 방문 · 들어옴 ${stats.daily[picked].entries}회 · 나감 ${stats.daily[picked].exits}회`
                    : '막대를 누르면 그날 숫자가 보여요'}
                </p>
                <div className="flex items-end gap-[2px] h-32" role="img" aria-label="최근 14일 하루 방문자 수 막대 그래프">
                  {stats.daily.map((d, i) => {
                    const isToday = i === stats.daily.length - 1;
                    const showLabel = isToday || d.visitors === maxVisitors || picked === i;
                    return (
                      <button key={d.day} onClick={() => setPicked(picked === i ? null : i)} className="flex-1 h-full flex flex-col justify-end items-center gap-1 group" aria-label={`${dayLabel(d.day)} ${d.visitors}명`}>
                        {showLabel && <span className="text-[0.6875rem] font-bold text-stone-700 leading-none">{d.visitors}</span>}
                        <span
                          className={`w-full max-w-[1.25rem] rounded-t-[4px] transition-colors ${picked === i ? 'bg-amber-600' : 'bg-stone-700 group-hover:bg-stone-500'}`}
                          style={{ height: `${Math.max(2, (d.visitors / maxVisitors) * 100)}%` }}
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-[2px] mt-1 border-t border-stone-200 pt-1">
                  {stats.daily.map((d, i) => (
                    <span key={d.day} className={`flex-1 text-center text-[0.625rem] ${i === stats.daily.length - 1 ? 'font-bold text-stone-700' : 'text-stone-400'}`}>{i % 2 === (stats.daily.length - 1) % 2 ? dayLabel(d.day) : ''}</span>
                  ))}
                </div>
              </div>

              {/* 날짜별 표 */}
              <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <table className="w-full text-[0.8125rem] text-stone-700">
                  <thead className="bg-stone-100 text-stone-500 text-xs">
                    <tr><th className="py-2 pl-3 text-left font-semibold">날짜</th><th className="font-semibold">방문</th><th className="font-semibold">들어옴</th><th className="font-semibold">나감</th><th className="pr-3 text-right font-semibold">머문 시간</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {[...stats.daily].reverse().map(d => (
                      <tr key={d.day}>
                        <td className="py-2 pl-3">{dayLabel(d.day)} ({weekday(d.day)})</td>
                        <td className="text-center font-bold">{d.visitors}</td>
                        <td className="text-center">{d.entries}</td>
                        <td className="text-center">{d.exits}</td>
                        <td className="pr-3 text-right">{d.avgStayMin}분</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[0.75rem] text-stone-400 leading-relaxed">
                · 같은 사람(또는 같은 휴대폰)은 하루 한 명으로 셉니다.<br />
                · 다른 앱에 15초 넘게 있다가 돌아오면 새로 들어온 것으로 셉니다.<br />
                · 2분 넘게 움직임이 없으면 나간 것으로 봅니다.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
