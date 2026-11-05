// 홍보 영상용 예시 데이터 (모두 지어낸 교우·글)
export function makeData() {
  const now = Date.now();
  const ago = m => new Date(now - m * 60e3).toISOString();
  const kst = new Date(now + 9 * 3600e3);
  const today = `${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
  const S = 'https://example.supabase.co/storage/v1/object/public/community-images/demo/';
  const A = 'https://example.supabase.co/storage/v1/object/public/avatars/demo/';
  const files = {};
  for (const n of ['sunset', 'candles', 'flowers', 'sea', 'stars', 'rosary', 'bible', 'churchday']) files[`${n}.jpg`] = `/tmp/cgpromo/img/${n}.jpg`;
  for (const n of ['joseph', 'maria', 'peter', 'lucia', 'michael', 'cecilia', 'anna', 'stephano']) files[`av-${n}.jpg`] = `/tmp/cgpromo/av/${n}.jpg`;
  files['reel.webm'] = '/tmp/cgpromo/img/reel.webm';
  const img = n => S + n + '.jpg';
  const av = n => A + 'av-' + n + '.jpg';
  const me = { id: 'me', email: 'clara@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'kakao' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
  const P = (id, name, handle, avatar, extra = {}) => ({ id, baptismal_name: name, handle, avatar_url: avatar, badge_type: null, bio: null, feast_day: null, birthday: null, profile_music: null, profile_music_title: null, created_at: '2026-10-01T00:00:00Z', ...extra });
  const profiles = [
    P('me', '클라라', 'clara', av('anna'), { bio: '주님 안에서 기쁘게 🌸 매일 감사하며 살아요', birthday: today, feast_day: '08-11', profile_music: 'bgm:builtin-new-beginning', profile_music_title: '새로운 시작' }),
    P('andrea', '안드레아 신부', 'fr.andrea', av('joseph'), { badge_type: 'priest', bio: '평화를 빕니다' }),
    P('monica', '모니카', 'monica', av('maria'), { feast_day: today }),
    P('agnes', '아녜스', 'agnes', av('lucia'), { birthday: today }),
    P('paulo', '바오로', 'paulo', av('peter')),
    P('raphael', '라파엘', 'raphael', av('michael')),
    P('katarina', '카타리나', 'katarina', av('cecilia')),
    P('stephano', '스테파노', 'stephano', av('stephano')),
  ];
  const post = (id, user_id, content, images, extra = {}) => ({ id, user_id, author_name: profiles.find(p => p.id === user_id).baptismal_name, content, images, pray_count: 0, like_count: 0, created_at: ago(30), visibility: 'public', music: null, is_story: false, video_url: null, video_poster: null, ...extra });
  const posts = [
    post('p1', 'monica', '이번 주 토요일 청년 성서 모임 있어요 📖\n처음 오시는 분도 환영해요! #성서모임 #성당소식', [img('bible')], { pray_count: 18, like_count: 32, created_at: ago(12), music: 'bgm:builtin-new-beginning' }),
    post('p2', 'andrea', '위령성월을 맞아 세상을 떠난 이들을 위해\n함께 기도해요 🙏 #위령성월 #기도', [img('candles')], { pray_count: 41, like_count: 57, created_at: ago(55) }),
    post('p3', 'agnes', '성당 꽃꽂이 봉사자 모집해요 🌸\n관심 있는 분 댓글 주세요! #봉사 #성당소식', [img('flowers'), img('rosary'), img('sea')], { pray_count: 9, like_count: 26, created_at: ago(120) }),
    post('p4', 'paulo', '우리 본당 주일 미사 시간 정리해 봤어요 ⛪\n저장해 두세요! #미사시간 #정보', [img('churchday')], { pray_count: 23, like_count: 44, created_at: ago(40) }),
    post('p5', 'raphael', '저녁 기도 드리며 하루를 마무리해요 ✨ #저녁기도', [img('stars')], { pray_count: 15, like_count: 21, created_at: ago(300) }),
    post('p6', 'katarina', '피정 다녀왔어요. 마음이 맑아졌어요 🌊 #피정후기', [img('sea')], { pray_count: 7, like_count: 19, created_at: ago(420) }),
    post('r1', 'stephano', '성당 가는 길 🌙 #영상', [], { video_url: S + 'reel.webm', video_poster: img('stars'), pray_count: 11, like_count: 38, created_at: ago(250) }),
    // 내 글
    post('m1', 'me', '꽃 선물 받았어요 💐 #감사', [img('flowers')], { pray_count: 6, like_count: 22, created_at: ago(1500) }),
    post('m2', 'me', '촛불 봉헌 🕯', [img('candles')], { pray_count: 12, like_count: 18, created_at: ago(2900) }),
    post('m3', 'me', '노을 지는 성당', [img('sunset')], { pray_count: 4, like_count: 30, created_at: ago(4300) }),
    post('m4', 'me', '별이 빛나는 밤', [img('stars')], { created_at: ago(6000) }),
    post('m5', 'me', '바다 산책', [img('sea')], { created_at: ago(7000) }),
    post('m6', 'me', '묵주기도 시작', [img('rosary')], { created_at: ago(8000) }),
    // 스토리
    post('s1', 'monica', '', [img('flowers')], { is_story: true, created_at: ago(40) }),
    post('s2', 'agnes', '', [img('sunset')], { is_story: true, created_at: ago(80) }),
    post('s3', 'katarina', '', [img('sea')], { is_story: true, created_at: ago(140) }),
    post('s4', 'stephano', '', [img('stars')], { is_story: true, created_at: ago(200) }),
    post('s5', 'andrea', '', [img('candles')], { is_story: true, created_at: ago(260) }),
  ];
  const comments = [];
  const cmt = (id, post_id, user_id, content, m) => comments.push({ id, post_id, user_id, author_name: profiles.find(p => p.id === user_id).baptismal_name, content, created_at: ago(m), parent_id: null });
  ['p1', 'p1', 'p1', 'p2', 'p2', 'p2', 'p2', 'p4', 'p5'].forEach((p, i) => cmt('c' + i, p, ['andrea', 'agnes', 'paulo', 'raphael'][i % 4], '함께 기도할게요 🙏', 5 + i));
  cmt('q1', 'p3', 'monica', '저도 해 보고 싶어요! 몇 시에 모여요?', 100);
  cmt('q2', 'p3', 'agnes', '토요일 오전 10시, 성당 2층이에요 😊', 95);
  cmt('q3', 'p3', 'paulo', '처음인데 괜찮을까요? 🙋‍♂️', 80);
  cmt('q4', 'p3', 'agnes', '그럼요! 처음 오셔도 금방 배워요 🌸', 75);
  cmt('q5', 'p3', 'katarina', '저도 같이 갈게요! 꽃 좋아해요 💐', 60);
  cmt('cm1', 'm1', 'monica', '꽃이 정말 예뻐요! 축하해요 💐', 8);
  cmt('cm2', 'm2', 'andrea', '기도 안에서 함께합니다 🙏', 25);
  cmt('cm3', 'm3', 'agnes', '사진 너무 좋아요 ☺️', 70);
  const follows = [];
  for (const id of ['andrea', 'monica', 'agnes', 'paulo', 'raphael', 'katarina', 'stephano']) {
    follows.push({ follower_id: 'me', following_id: id, status: 'accepted', created_at: ago(5000) });
    follows.push({ follower_id: id, following_id: 'me', status: 'accepted', created_at: ago(id === 'stephano' ? 3 : 4000) });
  }
  for (let i = 0; i < 41; i++) follows.push({ follower_id: 'x' + i, following_id: 'me', status: 'accepted', created_at: ago(9000) });
  for (let i = 0; i < 31; i++) follows.push({ follower_id: 'me', following_id: 'y' + i, status: 'accepted', created_at: ago(9000) });
  const messages = [];
  const msg = (id, from, to, content, m, extra = {}) => messages.push({ id, sender_id: from, receiver_id: to, content, created_at: ago(m), read_at: ago(m - 1), deleted_at: null, image_url: null, images: null, reply_to: null, edited_at: null, silent: false, ...extra });
  msg('d1', 'monica', 'me', '클라라 자매님~ 이번 주 성경 공부 오시나요?', 40);
  msg('d2', 'me', 'monica', '네! 목요일 저녁 7시 맞지요?', 38);
  msg('d3', 'monica', 'me', '[아멘이] 좋은 아침!', 37);
  msg('d4', 'monica', 'me', '맞아요 ☺️ 성당 2층에서 만나요', 36);
  msg('d5', 'me', 'monica', '[아멘이] 미사 때 만나요', 35);
  msg('d6', 'me', 'monica', '오늘도 좋은 하루 보내세요 🙏', 2, { read_at: null });
  msg('e1', 'andrea', 'me', '클라라 자매님, 축일 축하드려요 🎉', 300);
  msg('e2', 'agnes', 'me', '꽃꽂이 봉사 같이 해요!', 500);
  const message_reactions = [{ message_id: 'd2', user_id: 'monica', emoji: '❤️', created_at: ago(37) }, { message_id: 'd4', user_id: 'me', emoji: '🙏', created_at: ago(35) }];
  const lounge_messages = [];
  const lm = (id, user_id, content, m) => lounge_messages.push({ id, user_id, author_name: profiles.find(p => p.id === user_id).baptismal_name, avatar_url: profiles.find(p => p.id === user_id).avatar_url, content, created_at: ago(m), reply_to: null, image_url: null, images: null, deleted_at: null });
  lm('l1', 'andrea', '찬미예수님! 오늘도 반갑습니다 🙏', 30);
  lm('l2', 'monica', '신부님 찬미예수님! 🙏', 28);
  lm('l3', 'paulo', '다들 평안한 저녁 보내세요 😊', 26);
  lm('l4', 'agnes', '오늘 성당 꽃꽂이 정말 예뻤어요 🌸', 20);
  lm('l5', 'raphael', '[딩동이] 미사 때 만나요', 15);
  lm('l6', 'katarina', '내일 새벽 미사 같이 가실 분 계신가요?', 10);
  lm('l7', 'stephano', '저요! 함께 기도해요 🙏', 6);
  const anon = [];
  const ap = (id, content, m, pray, like) => anon.push({ id, anon_code: id.toUpperCase(), content, created_at: ago(m), pray_count: pray, like_count: like, cheer_count: 3, reply_count: 2, is_mine: false, my_reactions: [], expires_at: new Date(now + 86400e3).toISOString() });
  ap('k7qx', '요즘 기도가 잘 안 돼요. 어떻게 하면 좋을까요?', 30, 4, 6);
  ap('m2pl', '취업 준비 중인데 마음이 불안합니다. 함께 기도해 주세요.', 60, 9, 7);
  ap('t9aa', '가족과의 화해를 위해 기도 부탁드려요 🙏', 120, 12, 5);
  const kstDate = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  const intentions = [
    { id: 'i1', user_id: 'monica', author_name: '모니카', title: '수험생 아들을 위하여', content: '시험을 앞둔 아들이 평화로운 마음으로 실력을 다 발휘하도록 함께 기도해 주세요 🙏', created_at: ago(200), prayer_date: kstDate, is_mine: false },
    { id: 'i2', user_id: 'paulo', author_name: '바오로', title: '어머니의 쾌유를 위하여', content: '수술을 앞두신 어머니께서 두려움 없이 잘 회복하시도록 기도 부탁드려요.', created_at: ago(150), prayer_date: kstDate, is_mine: false },
    { id: 'i3', user_id: 'agnes', author_name: '아녜스', title: '새 일터를 위하여', content: '새 일터에서 좋은 사람들과 잘 지낼 수 있도록 ❤️', created_at: ago(90), prayer_date: kstDate, is_mine: false },
  ];
  const intention_prayers = [];
  [['i1', 24], ['i2', 37], ['i3', 15]].forEach(([id, n]) => { for (let k = 0; k < n; k++) intention_prayers.push({ intention_id: id, user_id: k === 0 && id === 'i2' ? 'me' : 'z' + k }); });
  const db = {
    profiles, posts, comments, follows, messages, message_reactions, lounge_messages,
    post_reactions: [], comment_reactions: [], blocks: [], reports: [], announcements: [], sponsor_banners: [], feedback: [],
    letters: [], bgm_tracks: [], music_grants: [], sticker_grants: [], tester_signups: [], push_subscriptions: [], dm_threads: [],
    lounge_reactions: [], lounge_bans: [], lounge_badges: [], interest_events: [], intention_prayers, chat_mutes: [],
    group_chats: [], group_chat_members: [], group_chat_messages: [], group_chat_reactions: [], deleted_messages: [],
    anon_posts_feed: anon, anon_replies_feed: [], anon_posts: anon, anon_replies: [], profile_private: [],
    prayer_intentions: intentions, prayer_intentions_feed: intentions, lounge_trash: [], user_alert_state: [],
  };
  const rpc = {
    merge_alert_state: () => ({}), touch_chat_presence: null, leave_chat_presence: null, mark_tester_play_opened: null,
    my_group_chats: () => [], sync_my_author_name: null,
  };
  return { db, rpc, me, files, today, ago };
}
