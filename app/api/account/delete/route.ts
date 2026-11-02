import { createClient } from '@supabase/supabase-js';
import { deleteMedia, filesSafeToDelete } from '@/lib/media-server';

// 회원 탈퇴: 로그인한 본인의 계정과 작성한 데이터를 모두 삭제한다.
// (구글 플레이·앱스토어 정책: 앱 안에서 계정 삭제가 가능해야 함)

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: '서버 설정이 완료되지 않았습니다. 운영자에게 문의해주세요.' }, { status: 503 });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const uid = user.id;

  // 올린 사진 파일 정리 (실패해도 계속 진행)
  try {
    const { data: myPosts } = await admin.from('posts').select('images, video_url, video_poster').eq('user_id', uid);
    const { data: me } = await admin.from('profiles').select('avatar_url').eq('id', uid).maybeSingle();
    // 메시지·사연·건의에 붙인 사진, 내가 지운 메시지의 사진 (표·칸이 없으면 빈 목록)
    const attachedOf = async (table: string, owner: string) =>
      ((await admin.from(table).select('image_url').eq(owner, uid).not('image_url', 'is', null)).data || []).map(r => r.image_url as string);
    const attachments = [
      ...await attachedOf('messages', 'sender_id'), ...await attachedOf('letters', 'user_id'),
      ...await attachedOf('feedback', 'user_id'), ...await attachedOf('deleted_messages', 'sender_id'),
      // 건의 사진 여러 장 (supabase/feedback-photos.sql — 칸이 없으면 빈 목록)
      ...((await admin.from('feedback').select('images').eq('user_id', uid).not('images', 'is', null)).data || []).flatMap(r => (r.images as string[] | null) || []),
    ];
    // 글·프로필의 사진 주소는 아무 주소나 넣을 수 있으므로, 내 파일이고 다른 교우가 쓰지 않는 것만 지운다
    const safe = await filesSafeToDelete(admin,
      [...(myPosts || []).flatMap(p => [...((p.images as string[] | null) || []), p.video_url, p.video_poster]), me?.avatar_url, ...attachments], uid, { userId: uid });
    await deleteMedia(safe); // R2 에 있는 파일
    const postFiles = safe
      .map(url => url.split('/community-images/')[1]?.split('?')[0])
      .filter((name): name is string => !!name)
      .map(name => decodeURIComponent(name));
    if (postFiles.length > 0) await admin.storage.from('community-images').remove(postFiles);
    const { data: avatars } = await admin.storage.from('avatars').list('', { search: uid, limit: 100 });
    const avatarFiles = (avatars || []).map(f => f.name).filter(name => name.startsWith(uid));
    if (avatarFiles.length > 0) await admin.storage.from('avatars').remove(avatarFiles);
    const { data: videos } = await admin.storage.from('post-videos').list(uid, { limit: 1000 });
    const videoFiles = (videos || []).map(f => `${uid}/${f.name}`);
    if (videoFiles.length > 0) await admin.storage.from('post-videos').remove(videoFiles);
  } catch { /* 파일 정리 실패는 무시 */ }

  // 작성한 데이터 삭제 (없는 테이블은 건너뜀)
  const deletions: [string, string][] = [
    ['post_reactions', 'user_id'],
    ['comment_reactions', 'user_id'],
    ['prayer_intentions', 'user_id'],
    ['comments', 'user_id'],
    ['posts', 'user_id'],
    ['messages', 'sender_id'],
    ['messages', 'receiver_id'],
    ['follows', 'follower_id'],
    ['follows', 'following_id'],
    ['push_subscriptions', 'user_id'],
    ['feedback', 'user_id'],
    ['letters', 'user_id'],
    ['anon_reactions', 'user_id'],
    ['anon_replies', 'user_id'],
    ['anon_posts', 'user_id'],
    ['reports', 'reporter_id'],
    ['blocks', 'blocker_id'],
    ['blocks', 'blocked_id'],
    ['interest_events', 'user_id'],
    // 관리자 보관함에 남은 내 기록 (지운 메시지·지운 사랑방 대화)
    ['deleted_messages', 'sender_id'],
    ['deleted_messages', 'receiver_id'],
    ['lounge_trash', 'user_id'],
    ['lounge_messages', 'user_id'],
    ['app_sessions', 'user_id'],
    ['profiles', 'id'],
  ];
  for (const [table, column] of deletions) {
    await admin.from(table).delete().eq(column, uid);
  }

  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return Response.json({ error: `계정을 삭제하지 못했습니다: ${error.message}` }, { status: 500 });
  return Response.json({ deleted: true });
}
