import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';

// 관리자 전용: 회원이 지운 메시지의 원래 글·사진 보기 (최근 300개)
export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { data, error } = await admin.from('deleted_messages').select('*').order('deleted_at', { ascending: false }).limit(300);
  if (error) return Response.json({ error: /does not exist|schema cache/i.test(error.message) ? 'setup' : '불러오지 못했어요.' }, { status: 500 });
  const ids = Array.from(new Set((data || []).flatMap(d => [d.sender_id, d.receiver_id]).filter(Boolean)));
  const { data: profiles } = ids.length
    ? await admin.from('profiles').select('id, baptismal_name, handle').in('id', ids)
    : { data: [] as { id: string; baptismal_name: string; handle: string | null }[] };
  const name = Object.fromEntries((profiles || []).map(p => [p.id, `${p.baptismal_name}${p.handle ? ` @${p.handle}` : ''}`]));
  return Response.json({
    items: (data || []).map(d => ({ ...d, sender_name: name[d.sender_id] || '알 수 없음', receiver_name: name[d.receiver_id] || '알 수 없음' })),
  });
}
