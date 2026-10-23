'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { insertMention, typingMention } from '@/lib/mentions';

interface Person { id: string; baptismal_name: string; handle: string; avatar_url?: string | null }

// 안드로이드 자판은 같은 입력칸에 있는 한 조합 중이던 한글(예: '@베'의 '베')을 기억했다가 다음 글자를 칠 때 다시 붙인다.
// 보이지 않는 칸으로 잠깐 옮겨 자판 연결을 새로 시작하게 한다 (다른 입력칸으로 옮기는 것이라 자판은 내려가지 않음).
let imeHelper: HTMLInputElement | null = null;
const getImeHelper = () => {
  if (imeHelper && document.body.contains(imeHelper)) return imeHelper;
  const el = document.createElement('input');
  el.type = 'text';
  el.tabIndex = -1;
  el.autocomplete = 'off';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px;border:0;padding:0;margin:0';
  document.body.appendChild(el);
  imeHelper = el;
  return el;
};

// 입력칸에서 @를 치면 회원 목록을 보여주고, 고르면 @핸들을 넣는다
export default function MentionSuggest({ value, onChange, excludeId, label = '태그' }: {
  value: string;
  onChange: (next: string) => void;
  excludeId?: string;
  label?: string;
}) {
  const query = typingMention(value);
  const [people, setPeople] = useState<Person[]>([]);

  useEffect(() => {
    if (query === null) return;
    const q = query.replace(/[%_,()]/g, '');
    const timer = setTimeout(async () => {
      let req = supabase.from('profiles').select('id, baptismal_name, handle, avatar_url').not('handle', 'is', null).limit(6);
      if (q) req = req.or(`handle.ilike.${q}%,baptismal_name.ilike.%${q}%`);
      const { data } = await req;
      setPeople(((data || []) as Person[]).filter(p => p.id !== excludeId));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, excludeId]);

  // 고르면 '@아이디 ' 다음(한 칸 띈 자리)에 커서를 두어 바로 이어서 칠 수 있게
  const pick = (handle: string) => {
    const el = typeof document !== 'undefined' ? document.activeElement : null;
    const field = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el : null;
    const next = insertMention(value, handle);
    const toEnd = () => { if (!field) return; field.focus({ preventScroll: true }); field.setSelectionRange(next.length, next.length); };
    if (field && /Android/i.test(navigator.userAgent)) {
      // 한글을 치던 중이면(조합 중) 자판이 그 글자를 잊도록 보이지 않는 칸에 잠깐 들렀다가 '@아이디 ' 뒤로 돌아온다
      const helper = getImeHelper();
      const r = field.getBoundingClientRect();
      helper.style.top = `${Math.max(0, r.top)}px`;
      helper.style.left = `${Math.max(0, r.left)}px`;
      helper.focus({ preventScroll: true });
      onChange(next);
      setTimeout(() => { toEnd(); helper.value = ''; }, 80);
      return;
    }
    // 그 밖의 기기: 조합 중인 글자를 끝맺고 바꾼 뒤 '@아이디 ' 뒤에 커서
    if (field) { field.blur(); field.focus(); }
    onChange(next);
    setTimeout(toEnd, 0);
  };

  if (query === null || people.length === 0) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
      <span className="text-[0.75rem] text-stone-500 shrink-0 self-center">{label}</span>
      {people.map(p => (
        <button
          key={p.id}
          type="button"
          onPointerDown={e => e.preventDefault()} // 입력칸 포커스 유지 (자판이 내려가지 않게)
          onMouseDown={e => e.preventDefault()}
          onClick={() => pick(p.handle)}
          className="shrink-0 flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-100 text-blue-800 rounded-full pl-1 pr-2.5 py-1"
        >
          {p.avatar_url
            ? <img loading="lazy" src={p.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
            : <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[0.6875rem] font-bold">{p.baptismal_name?.[0]}</span>}
          <b>{p.baptismal_name}</b><span className="text-blue-500">@{p.handle}</span>
        </button>
      ))}
    </div>
  );
}
