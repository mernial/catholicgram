'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { insertMention, typingMention } from '@/lib/mentions';

interface Person { id: string; baptismal_name: string; handle: string; avatar_url?: string | null }

// 입력칸에서 @를 치면 회원 목록을 보여주고, 고르면 @핸들을 넣는다
export default function MentionSuggest({ value, onChange, excludeId }: {
  value: string;
  onChange: (next: string) => void;
  excludeId?: string;
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

  if (query === null || people.length === 0) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
      <span className="text-[0.75rem] text-stone-500 shrink-0 self-center">태그</span>
      {people.map(p => (
        <button
          key={p.id}
          type="button"
          onMouseDown={e => e.preventDefault()} // 입력칸 포커스 유지
          onClick={() => onChange(insertMention(value, p.handle))}
          className="shrink-0 flex items-center gap-1.5 text-xs bg-blue-50 border border-blue-100 text-blue-800 rounded-full pl-1 pr-2.5 py-1"
        >
          {p.avatar_url
            ? <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
            : <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[0.6875rem] font-bold">{p.baptismal_name?.[0]}</span>}
          <b>{p.baptismal_name}</b><span className="text-blue-500">@{p.handle}</span>
        </button>
      ))}
    </div>
  );
}
