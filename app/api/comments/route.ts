import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';

// 댓글 수정 / 삭제 (서버에서 본인 확인)
// POST { action: 'edit', id, content } → 본인 댓글만
// POST { action: 'delete', id }        → 본인, 글(스토리) 주인, 또는 관리자

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { action, id, content } = ((await request.json().catch(() => ({}))) ?? {}) as { action?: string; id?: string; content?: string };
  if (!id || (action !== 'edit' && action !== 'delete')) return Response.json({ error: 'bad request' }, { status: 400 });

  const { data: comment } = await admin.from('comments').select('id, user_id, post_id').eq('id', id).maybeSingle();
  if (!comment) return Response.json({ error: '댓글을 찾을 수 없어요.' }, { status: 404 });
  const isOwner = comment.user_id === user.id;
  const isAdmin = !!user.email && ADMIN_EMAILS.includes(user.email);

  if (action === 'edit') {
    if (!isOwner) return Response.json({ error: '내 댓글만 수정할 수 있어요.' }, { status: 403 });
    const text = (content || '').trim().slice(0, 2000);
    if (!text) return Response.json({ error: '내용을 입력해주세요.' }, { status: 400 });
    const editedAt = new Date().toISOString();
    let { error } = await admin.from('comments').update({ content: text, edited_at: editedAt }).eq('id', id);
    // edited_at 칼럼이 없으면 내용만 수정
    if (error) ({ error } = await admin.from('comments').update({ content: text }).eq('id', id));
    if (error) return Response.json({ error: '수정하지 못했어요.' }, { status: 500 });
    return Response.json({ ok: true, content: text, edited_at: editedAt });
  }

  // 인스타그램처럼 내 글(스토리)에 달린 댓글은 글 주인도 지울 수 있음
  let isPostOwner = false;
  if (!isOwner && !isAdmin && comment.post_id) {
    const { data: post } = await admin.from('posts').select('user_id').eq('id', comment.post_id).maybeSingle();
    isPostOwner = post?.user_id === user.id;
  }
  if (!isOwner && !isAdmin && !isPostOwner) return Response.json({ error: '내 댓글이나 내 글에 달린 댓글만 삭제할 수 있어요.' }, { status: 403 });
  await admin.from('comment_reactions').delete().eq('comment_id', id); // 표가 없어도 무시
  const { error } = await admin.from('comments').delete().eq('id', id);
  if (error) return Response.json({ error: '삭제하지 못했어요.' }, { status: 500 });
  return Response.json({ ok: true });
}
