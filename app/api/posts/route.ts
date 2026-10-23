import { createClient } from '@supabase/supabase-js';
import { ADMIN_EMAILS } from '@/lib/admin';
import { deleteMedia, filesSafeToDelete, mediaKeyFromUrl } from '@/lib/media-server';

// 게시글 고치기 / 지우기 (서버에서 본인 확인 — 데이터베이스 권한 설정과 상관없이 동작)
// POST { action: 'update', id, changes: { content?, video_overlays?, visibility?, music?, images? } } → 본인 글만
// POST { action: 'delete', id } → 본인 또는 관리자 (사진·영상 파일도 함께 지움)

const VISIBILITIES = ['public', 'followers', 'private'];
const storagePath = (url: string | null | undefined, bucket: string) => {
  const part = url?.split(`/${bucket}/`)[1];
  return part ? decodeURIComponent(part.split('?')[0]) : null;
};

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: '서버 설정이 완료되지 않았습니다.' }, { status: 503 });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = ((await request.json().catch(() => ({}))) ?? {}) as { action?: string; id?: string; changes?: Record<string, unknown> };
  if (!body.id || (body.action !== 'update' && body.action !== 'delete')) return Response.json({ error: 'bad request' }, { status: 400 });

  const { data: post } = await admin.from('posts').select('*').eq('id', body.id).maybeSingle();
  if (!post) return Response.json({ error: '글을 찾을 수 없어요.' }, { status: 404 });
  const isOwner = post.user_id === user.id;
  const isAdmin = !!user.email && ADMIN_EMAILS.includes(user.email);

  if (body.action === 'update') {
    if (!isOwner) return Response.json({ error: '내 글만 고칠 수 있어요.' }, { status: 403 });
    const c = body.changes || {};
    const changes: Record<string, unknown> = {};
    if (typeof c.content === 'string') changes.content = c.content.trim().slice(0, 5000);
    if ('video_overlays' in c) changes.video_overlays = c.video_overlays ?? null;
    if ('music' in c) {
      changes.music = typeof c.music === 'string' && c.music ? c.music.slice(0, 300) : null;
      changes.music_title = changes.music && typeof c.music_title === 'string' ? c.music_title.slice(0, 200) : null;
    }
    // 사진 바꾸기 (빼기·추가·편집): 최대 5장, 주소만 받음
    let removedImages: string[] = [];
    if (Array.isArray(c.images)) {
      if (post.video_url) return Response.json({ error: '영상 글은 사진을 바꿀 수 없어요.' }, { status: 400 });
      // 새로 넣는 사진은 우리 저장소에 내가 올린 것만 (R2 는 경로에 내 id, 예전 저장소는 글 사진 칸)
      const current = (post.images as string[] | null) || [];
      const ownUpload = (u: string) => {
        const key = mediaKeyFromUrl(u);
        if (key) return key.split('/')[1] === user.id;
        return u.startsWith(`${supabaseUrl}/storage/v1/object/public/community-images/`);
      };
      const imgs = c.images.filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u) && u.length <= 600
        && (current.includes(u) || ownUpload(u))).slice(0, 5);
      if (imgs.length !== c.images.length) return Response.json({ error: 'bad images' }, { status: 400 });
      changes.images = imgs;
      removedImages = current.filter(u => !imgs.includes(u));
    }
    if (typeof c.visibility === 'string') {
      if (!VISIBILITIES.includes(c.visibility)) return Response.json({ error: 'bad request' }, { status: 400 });
      changes.visibility = c.visibility;
    }
    if (Object.keys(changes).length === 0) return Response.json({ ok: true });
    const { error } = await admin.from('posts').update(changes).eq('id', body.id);
    if (error) {
      if (/visibility/.test(error.message)) return Response.json({ error: '공개 범위 기능을 준비 중이에요. (관리자: supabase/post-visibility.sql 실행 필요)' }, { status: 500 });
      return Response.json({ error: `고치지 못했어요. (${error.message})` }, { status: 500 });
    }
    // 빠진 사진 파일 정리 (글 주인의 파일이고 다른 곳에서 쓰지 않는 것만, 실패해도 무시)
    if (removedImages.length) {
      const safe = await filesSafeToDelete(admin, removedImages, post.user_id, { postId: post.id });
      const paths = safe.map(u => storagePath(u, 'community-images')).filter((x): x is string => !!x);
      if (paths.length) await admin.storage.from('community-images').remove(paths).catch(() => null);
      await deleteMedia(safe);
    }
    return Response.json({ ok: true, changes });
  }

  if (!isOwner && !isAdmin) return Response.json({ error: '내 글만 지울 수 있어요.' }, { status: 403 });
  // 딸린 기록 먼저 정리 (표가 없으면 무시)
  const { data: comments } = await admin.from('comments').select('id').eq('post_id', body.id);
  const commentIds = (comments || []).map(c => c.id as string);
  if (commentIds.length) await admin.from('comment_reactions').delete().in('comment_id', commentIds);
  await admin.from('comments').delete().eq('post_id', body.id);
  await admin.from('post_reactions').delete().eq('post_id', body.id);
  const { error } = await admin.from('posts').delete().eq('id', body.id);
  if (error) return Response.json({ error: `지우지 못했어요. (${error.message})` }, { status: 500 });
  // 사진·영상 파일 지우기: 글 주인의 파일이고 다른 글·프로필이 쓰지 않는 것만 (남의 사진 주소를 넣은 글로 남의 파일을 지우지 못하게)
  const safe = await filesSafeToDelete(admin, [...((post.images as string[] | null) || []), post.video_url, post.video_poster], post.user_id, { postId: post.id });
  const images = safe.map(u => storagePath(u, 'community-images')).filter((p): p is string => !!p);
  if (images.length) await admin.storage.from('community-images').remove(images);
  const videoFiles = safe.map(u => storagePath(u, 'post-videos')).filter((p): p is string => !!p);
  if (videoFiles.length) await admin.storage.from('post-videos').remove(videoFiles);
  await deleteMedia(safe); // R2 에 있는 파일
  return Response.json({ ok: true });
}
