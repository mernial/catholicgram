import { createClient } from '@supabase/supabase-js';

// 메시지 삭제 (서버에서 본인 확인)
// POST { action: 'delete', id } → 내가 보낸 메시지만.
// 원래 글·사진은 관리자만 볼 수 있는 deleted_messages 로 옮기고, 대화에서는 내용을 비우고 '삭제됨' 표시만 남긴다
// (상대가 앱 밖에서 데이터를 꺼내 봐도 지운 내용은 남아 있지 않음).

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { action, id } = ((await request.json().catch(() => ({}))) ?? {}) as { action?: string; id?: string | number };
  if (action !== 'delete' || id === undefined || id === null) return Response.json({ error: 'bad request' }, { status: 400 });

  const { data: msg } = await admin.from('messages').select('*').eq('id', id).maybeSingle();
  if (!msg) return Response.json({ error: '메시지를 찾을 수 없어요.' }, { status: 404 });
  if (String(msg.sender_id) !== user.id) return Response.json({ error: '내가 보낸 메시지만 삭제할 수 있어요.' }, { status: 403 });
  if (msg.deleted_at) return Response.json({ ok: true });

  // 1) 관리자용으로 원래 내용 보관 (표가 없으면 지우지 않음 → 관리자가 내용을 잃지 않게)
  const { error: keepError } = await admin.from('deleted_messages').insert({
    message_id: String(msg.id), sender_id: msg.sender_id, receiver_id: msg.receiver_id,
    content: msg.content, image_url: msg.image_url ?? null, sent_at: msg.created_at,
  });
  if (keepError) {
    return Response.json({ error: /does not exist|schema cache/i.test(keepError.message)
      ? '메시지 삭제 기능을 준비 중이에요. (관리자: supabase/message-delete.sql 실행 필요)'
      : '삭제하지 못했어요.' }, { status: 500 });
  }
  // 2) 대화에서는 내용 비우고 삭제 표시 (하트도 정리)
  const changes: Record<string, unknown> = { content: '', deleted_at: new Date().toISOString() };
  if ('image_url' in msg) changes.image_url = null;
  const { error } = await admin.from('messages').update(changes).eq('id', msg.id);
  if (error) return Response.json({ error: '삭제하지 못했어요.' }, { status: 500 });
  await admin.from('message_reactions').delete().eq('message_id', msg.id); // 표가 없어도 무시
  return Response.json({ ok: true });
}
