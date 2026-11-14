'use client';

import { useBackLayer } from '@/lib/back-layers';
import { useEffect, useMemo, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase';
import { CelebrateBand } from '@/components/CelebrateAvatar';
import { PHOTO_OPTIONS, uploadMedia } from '@/lib/upload';
import Icon from '@/components/Icon';
import { initial } from '@/lib/fancy-name';
import { askConfirm } from '@/components/ConfirmDialog';
import { clipText } from '@/lib/clip-text';
import VideoTrimmer from '@/components/VideoTrimmer';
import StoryCreate, { type StoryMusic } from '@/components/StoryCreate';
import { MAX_VIDEO_MB, MAX_VIDEO_SECONDS, SHRINK_OVER_MB, getVideoInfo, makeVideoPoster, shrinkVideo } from '@/lib/video';

// 스토리: 24시간 뒤 사라지는 사진 한 장 또는 짧은 영상(1분 이하) + 짧은 글.
// 게시글(posts)에 is_story 표시로 저장 → 기도·공감·댓글·알림을 다른 게시글과 똑같이 씀.
// 홈 맨 위에 동그라미 줄(내 스토리 → 팔로우한 교우 → 다른 교우), 누르면 화면 가득 보기.

export interface StoryPost { id: string; user_id: string; images?: string[] | null; video_url?: string | null; video_poster?: string | null; music?: string | null; music_title?: string | null; content?: string | null; created_at: string; pray_count?: number; like_count?: number }
interface Story { id: string; user_id: string; image_url: string; video_url: string | null; music: string | null; music_title: string | null; caption: string | null; created_at: string; pray: number; like: number }
interface Author { id: string; baptismal_name: string; avatar_url?: string | null; handle?: string | null; badge_type?: string | null }
export interface StoryUser { id: string; baptismal_name: string; avatar_url?: string; handle?: string; badge_type?: string }

const STORY_MS = 5000;
const SEEN_KEY = 'storySeen';
const loadSeen = (): string[] => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } };
const saveSeen = (ids: string[]) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-500))); } catch { /* 저장 불가 */ } };
const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? '방금' : m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간`;
};

export default function Stories({ posts, unavailable, openRequest, onOpenHandled, pickedFile, onDraftEnd, me, followingIds, blockedIds, isAdmin, viewerOpen, setViewerOpen, onOpenProfile, onMessage, onNeedLogin, canPost, onPosted, onDelete, myReactions, commentCounts, onReact, onComment, onReply, onFollow, onPickMusic, musicSrc, onBusyChange }: {
  posts: StoryPost[];                   // 24시간 안의 스토리 (화면이 불러옴)
  unavailable: boolean;                 // SQL 실행 전
  openRequest?: string | null;          // 이 교우의 스토리를 바로 열기 (알림을 눌렀을 때)
  onOpenHandled?: () => void;
  // 새 게시물 화면의 '스토리'에서 고른 사진 → 바로 '새 스토리' 미리보기 (고르기는 새 게시물 화면이 하므로, 고르지 않고 닫으면 그 화면 그대로)
  pickedFile?: { file: File; key: number } | null;
  onDraftEnd?: (posted: boolean) => void; // '새 스토리' 미리보기가 닫힘 (posted: 올림 / false: 취소·뒤로가기)
  me: { id: string; name: string; avatar?: string | null } | null;
  followingIds: Set<string>;
  blockedIds: Set<string>;
  isAdmin: boolean;
  viewerOpen: boolean;                  // 뒤로가기로 닫을 수 있게 열림 여부는 화면(page)이 들고 있음
  setViewerOpen: (open: boolean) => void;
  onOpenProfile: (userId: string) => void;
  onMessage: (u: StoryUser) => void;
  onNeedLogin: () => void;
  canPost: () => boolean;               // 프로필을 다 만들었는지 확인 (아니면 안내)
  onPosted: () => Promise<void>;        // 올린 뒤 다시 불러오기
  onDelete: (id: string) => Promise<boolean>;
  myReactions: Set<string>;             // `${id}:pray` / `${id}:like`
  commentCounts: Record<string, number>;
  onReact: (id: string, type: 'pray' | 'like') => void;
  onComment: (id: string) => void;
  onReply?: (story: { id: string; user_id: string }, text: string) => Promise<boolean>; // 스토리에 메시지·감정 보내기 (1:1 메시지로)
  onFollow?: (userId: string) => void;
  onPickMusic?: (cb: (m: StoryMusic) => void) => void; // 음악 고르기 창(page 의 MusicPicker)
  musicSrc?: (value: string) => { url: string; start: number; clip?: number } | null;
  onBusyChange?: (busy: boolean) => void; // '스토리에 추가'·새 스토리 미리보기가 열려 있는지 (그동안 공지·소식 창을 띄우지 않게)
}) {
  const stories: Story[] = useMemo(() => posts
    .filter(p => (p.images && p.images.length > 0) || !!p.video_url)
    .map(p => ({ id: p.id, user_id: p.user_id, image_url: p.images?.[0] || p.video_poster || '', video_url: p.video_url || null, music: p.music || null, music_title: p.music_title || null, caption: p.content || null, created_at: p.created_at, pray: p.pray_count || 0, like: p.like_count || 0 })), [posts]);
  const [authors, setAuthors] = useState<Record<string, Author>>({});
  const [seen, setSeen] = useState<string[]>([]);
  const [openMineAfterPost, setOpenMineAfterPost] = useState(false);
  // 올리기
  const [draft, setDraft] = useState<{ file: File; url: string; video?: boolean; duration?: number } | null>(null);
  const [trim, setTrim] = useState({ start: 0, end: 0 }); // 영상 스토리: 올릴 구간(초) — 1분 안쪽으로 고름
  const [videoStatus, setVideoStatus] = useState('');
  const [draftMusic, setDraftMusic] = useState<StoryMusic | null>(null);
  const [showCreate, setShowCreate] = useState(false); // '스토리에 추가' 화면
  // 보기: 메시지 보내기
  const [replyText, setReplyText] = useState('');
  const [replyFocus, setReplyFocus] = useState(false);
  const [sentBurst, setSentBurst] = useState<{ emoji: string; key: number } | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const replyTargetRef = useRef<{ id: string; user_id: string } | null>(null); // 답장을 쓰기 시작한 그 스토리 (보내는 곳이 바뀌지 않게)
  const busy = showCreate || !!draft;
  useEffect(() => { onBusyChange?.(busy); }, [busy]);
  const videoJobRef = useRef(0);
  const cancelDraft = () => { videoJobRef.current++; if (draft) URL.revokeObjectURL(draft.url); setDraft(null); setVideoStatus(''); onDraftEnd?.(false); };
  useBackLayer(!!draft, cancelDraft); // 새 스토리 미리보기: 뒤로가기는 취소
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 보기
  const [pos, setPos] = useState<{ user: number; item: number }>({ user: 0, item: 0 });
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const storyVideoRef = useRef<HTMLVideoElement>(null);
  const [videoMuted, setVideoMuted] = useState(false);

  useEffect(() => { setSeen(loadSeen()); }, []);
  // 작성자 이름·사진
  const authorIds = Array.from(new Set(stories.map(st => st.user_id))).sort().join(',');
  useEffect(() => {
    const ids = authorIds ? authorIds.split(',') : [];
    if (ids.length === 0) return;
    supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').in('id', ids)
      .then(({ data }) => setAuthors(prev => ({ ...prev, ...Object.fromEntries((data || []).map(p => [p.id, p])) })));
  }, [authorIds]);

  // 사람별로 묶기: 나 → 안 본 스토리가 있는 사람(팔로우 먼저) → 다 본 사람
  const groups = useMemo(() => {
    const byUser = new Map<string, Story[]>();
    stories.filter(s => !blockedIds.has(s.user_id)).forEach(s => { byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]); });
    const list = Array.from(byUser.entries()).map(([userId, items]) => ({ userId, items, unseen: items.some(i => !seen.includes(i.id)), last: items[items.length - 1].created_at }));
    const rank = (g: typeof list[number]) => (g.userId === me?.id ? 0 : g.unseen ? (followingIds.has(g.userId) ? 1 : 2) : 3);
    return list.sort((a, b) => rank(a) - rank(b) || b.last.localeCompare(a.last));
  }, [stories, seen, followingIds, blockedIds, me?.id]);
  const myGroupIndex = groups.findIndex(g => g.userId === me?.id);

  const current = groups[pos.user]?.items[pos.item];

  // 방금 올린 내 스토리를 바로 보여 줌
  useEffect(() => {
    if (!openMineAfterPost || myGroupIndex < 0) return;
    setOpenMineAfterPost(false);
    setPos({ user: myGroupIndex, item: groups[myGroupIndex].items.length - 1 });
    setPaused(false);
    setViewerOpen(true);
  }, [openMineAfterPost, myGroupIndex]);

  // 보는 중인 스토리는 '봤음'으로
  useEffect(() => {
    if (!viewerOpen || !current || seen.includes(current.id)) return;
    const next = [...seen, current.id];
    setSeen(next); saveSeen(next);
  }, [viewerOpen, current?.id]);

  // 사진 미리 받기 (운영자 2026-11-14: '스토리에서 사진이 좀 늦게 떠'): 예전엔 그 스토리를 여는 순간에야 받기 시작했고(게다가 loading=lazy),
  // 사진이 뜨기 전부터 5초가 흘러 늦게 뜬 사진은 보는 시간이 줄었음 → 창을 열면 지금 것과 다음 세 장을 미리 받고, 사진이 뜰 때까지 막대를 멈춤
  const [loadedImgs, setLoadedImgs] = useState<Set<string>>(() => new Set());
  const markLoaded = (url: string) => setLoadedImgs(prev => (prev.has(url) ? prev : new Set(prev).add(url)));
  const upcoming = useMemo(() => {
    if (!viewerOpen) return [] as string[];
    const out: string[] = [];
    for (let u = pos.user, i = pos.item; u < groups.length && out.length < 4; u++, i = 0) {
      for (; i < groups[u].items.length && out.length < 4; i++) {
        const it = groups[u].items[i];
        if (it.image_url) out.push(it.image_url);
      }
    }
    return out;
  }, [viewerOpen, pos.user, pos.item, groups]);
  const preloadRef = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    upcoming.forEach(url => {
      if (preloadRef.current.has(url)) return;
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => markLoaded(url);
      im.onerror = () => markLoaded(url); // 못 받아도 멈춰 있지 않게
      im.src = url;
      preloadRef.current.set(url, im);
    });
  }, [upcoming]);
  // 창을 열기 전에도: 스토리 줄이 보이면 잠시 뒤 앞쪽 세 교우의 첫 사진을 받아 둠 (동그라미를 누르면 바로 뜨게)
  const firstImgs = groups.slice(0, 3).map(g => g.items.find(i => !seen.includes(i.id))?.image_url || g.items[0]?.image_url || '').filter(Boolean).join('|');
  useEffect(() => {
    if (!firstImgs) return;
    const t = setTimeout(() => firstImgs.split('|').forEach(url => {
      if (preloadRef.current.has(url)) return;
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => markLoaded(url);
      im.src = url;
      preloadRef.current.set(url, im);
    }), 1500);
    return () => clearTimeout(t);
  }, [firstImgs]);
  const waitingImg = !!(viewerOpen && current && !current.video_url && current.image_url && !loadedImgs.has(current.image_url));
  const waitingRef = useRef(false);
  waitingRef.current = waitingImg;
  // 아주 느려도 멈춰 있지만은 않게: 8초 지나면 그냥 흘러감
  useEffect(() => {
    if (!waitingImg || !current?.image_url) return;
    const url = current.image_url;
    const t = setTimeout(() => markLoaded(url), 8000);
    return () => clearTimeout(t);
  }, [waitingImg, current?.image_url]);

  // 5초마다 다음으로 (누르고 있으면 멈춤). 영상은 영상 길이만큼 — 진행 막대는 영상 재생 위치, 끝나면 다음으로
  useEffect(() => {
    if (!viewerOpen || !current) return;
    setProgress(0);
    if (current.video_url) return;
    let elapsed = 0, last = performance.now(), raf = 0;
    const tick = (now: number) => {
      if (!pausedRef.current && !waitingRef.current) elapsed += now - last;
      last = now;
      const ms = current.music ? 15000 : STORY_MS; // 음악 스토리는 15초
      setProgress(Math.min(1, elapsed / ms));
      if (elapsed >= ms) { step(1); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewerOpen, pos.user, pos.item, current?.id]);
  // 답장을 쓰는 동안(입력칸에 초점이 있거나 보내지 않은 글이 있으면) 스토리는 늘 멈춤.
  // 예전엔 답장 칸도 스토리 칸 안이라 손가락을 떼는 순간(onPointerUp) 다시 흘러가, 쓰는 중에 다음 교우로 넘어가 그 교우에게 답장이 갔음 (운영자 2026-11-14)
  const holdForReply = replyFocus || !!replyText.trim();
  const pausedNow = paused || holdForReply;
  const pausedRef = useRef(false);
  pausedRef.current = pausedNow;
  // 음악 스토리: 그 스토리를 보는 동안 음악 (멈추면 같이 멈춤)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicKey = viewerOpen && current?.music && !current.video_url ? `${current.id}` : '';
  useEffect(() => {
    if (!musicKey || !current?.music) return;
    const src = musicSrc?.(current.music);
    if (!src) return;
    const a = new Audio(src.url);
    a.currentTime = src.start || 0;
    a.loop = true;
    audioRef.current = a;
    if (!pausedRef.current) a.play().catch(() => {});
    return () => { a.pause(); a.src = ''; if (audioRef.current === a) audioRef.current = null; };
  }, [musicKey]);
  useEffect(() => { const a = audioRef.current; if (!a) return; if (pausedNow) a.pause(); else a.play().catch(() => {}); }, [pausedNow]);
  // 다른 스토리로 넘어가거나 창을 닫으면 쓰던 답장은 버림 (다른 교우에게 잘못 가지 않게)
  const replyKey = `${viewerOpen ? 1 : 0}:${current?.id || ''}`;
  const [replyKeySeen, setReplyKeySeen] = useState(replyKey);
  if (replyKeySeen !== replyKey) { setReplyKeySeen(replyKey); setReplyText(''); }
  useEffect(() => { replyTargetRef.current = null; }, [replyKey]);
  // 메시지 보내기 · 감정 보내기 (상대에게 1:1 메시지로)
  const sendReply = async (text: string, emoji?: boolean) => {
    if (!current) return;
    if (!me) { onNeedLogin(); return; }
    const t = text.trim();
    if (!t || !onReply) return;
    const target = replyTargetRef.current && !emoji ? replyTargetRef.current : { id: current.id, user_id: current.user_id };
    const ok = await onReply(target, t);
    if (!ok) return;
    setReplyText('');
    replyTargetRef.current = null;
    replyRef.current?.blur();
    setSentBurst({ emoji: emoji ? t : '✓', key: Date.now() });
    setTimeout(() => setSentBurst(b => (b && Date.now() - b.key >= 1300 ? null : b)), 1400);
  };
  useEffect(() => {
    const v = storyVideoRef.current;
    if (!v || !current?.video_url) return;
    if (pausedNow) v.pause(); else v.play().catch(() => {});
  }, [pausedNow, current?.id]);
  // 영상 스토리: 소리와 함께 틀어 보고, 휴대폰이 막으면 소리 없이 (왼쪽 위 단추로 소리 켜기)
  const startVideo = (v: HTMLVideoElement | null) => {
    if (!v) return;
    v.muted = false;
    v.play().then(() => setVideoMuted(false)).catch(() => { v.muted = true; setVideoMuted(true); v.play().catch(() => {}); });
  };
  const toggleSound = () => {
    const v = storyVideoRef.current;
    if (!v) return;
    v.muted = !v.muted; setVideoMuted(v.muted);
    if (!v.muted) v.play().catch(() => {});
  };

  const open = (userIndex: number) => {
    const g = groups[userIndex];
    if (!g) return;
    const firstUnseen = g.items.findIndex(i => !seen.includes(i.id));
    setPos({ user: userIndex, item: firstUnseen >= 0 ? firstUnseen : 0 });
    setPaused(false);
    setViewerOpen(true);
  };
  // 알림으로 들어왔을 때: 그 교우의 스토리가 불러와지면 바로 연다 (이미 지났으면 그냥 넘어감)
  useEffect(() => {
    if (!openRequest) return;
    const i = groups.findIndex(g => g.userId === openRequest);
    if (i >= 0) { open(i); onOpenHandled?.(); }
  }, [openRequest, groups]);
  const step = (dir: 1 | -1) => {
    setPos(p => {
      const g = groups[p.user];
      if (!g) return p;
      if (dir === 1) {
        if (p.item < g.items.length - 1) return { user: p.user, item: p.item + 1 };
        if (p.user < groups.length - 1) return { user: p.user + 1, item: 0 };
        setViewerOpen(false);
        return p;
      }
      if (p.item > 0) return { user: p.user, item: p.item - 1 };
      if (p.user > 0) return { user: p.user - 1, item: groups[p.user - 1].items.length - 1 };
      return { ...p, item: 0 };
    });
  };

  // --- 올리기 ---
  const pick = () => {
    if (!me) { onNeedLogin(); return; }
    if (!canPost()) return;
    setShowCreate(true);
  };
  // 새 게시물 화면에서 고른 사진 → '새 스토리' 미리보기 (받은 사진마다 한 번 — 효과 대신 그리는 중에 맞춤)
  const [pickedKey, setPickedKey] = useState<number | null>(null);
  // 사진이면 바로 미리보기. 영상이면 길이를 재어 미리보기 + 구간 고르기(처음 1분, 짧으면 전체) — 자르기·줄이기는 올릴 때
  const startDraft = async (file: File, music: StoryMusic | null = null) => {
    setCaption('');
    setDraftMusic(file.type.startsWith('video/') ? null : music);
    if (!file.type.startsWith('video/')) { setVideoStatus(''); setDraft({ file, url: URL.createObjectURL(file) }); return; }
    const job = ++videoJobRef.current;
    const info = await getVideoInfo(file).catch(() => null);
    if (job !== videoJobRef.current) return;
    if (!info || !Number.isFinite(info.duration) || info.duration <= 0) { alert('이 영상은 읽을 수 없어요. 다른 영상을 골라주세요.'); onDraftEnd?.(false); return; }
    setVideoStatus('');
    setTrim({ start: 0, end: Math.min(info.duration, MAX_VIDEO_SECONDS) });
    setDraft({ file, url: URL.createObjectURL(file), video: true, duration: info.duration });
  };
  if (pickedFile && pickedFile.key !== pickedKey) {
    setPickedKey(pickedFile.key);
    startDraft(pickedFile.file);
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    startDraft(file);
  };
  const post = async () => {
    if (!draft || !me) return;
    setPosting(true);
    try {
      let media: { images: string[]; video_url?: string; video_poster?: string | null };
      if (draft.video) {
        // 영상 스토리: 게시물 영상과 같은 곳(post-videos, 내 폴더)에 영상 + 미리보기 사진
        const dur = draft.duration || 0;
        const whole = trim.start < 0.3 && trim.end >= dur - 0.3;
        let video: Blob = draft.file;
        // 고른 구간만 잘라 다시 녹화(720p) — 전체를 올릴 때도 크면 줄임. 고른 길이만큼 걸림
        if (!whole || draft.file.size > SHRINK_OVER_MB * 1024 * 1024) {
          const job = videoJobRef.current;
          setVideoStatus(whole ? '영상 용량을 줄이는 중... 0%' : '고른 부분을 자르는 중... 0%');
          const out = await shrinkVideo(draft.file, r => { if (job === videoJobRef.current) setVideoStatus(`${whole ? '영상 용량을 줄이는 중' : '고른 부분을 자르는 중'}... ${Math.round(r * 100)}%`); }, () => job !== videoJobRef.current, whole ? undefined : trim).catch(() => null);
          if (job !== videoJobRef.current) return;
          if (out && (!whole || out.size < draft.file.size)) video = out;
          else if (!whole) { setVideoStatus(''); alert('이 휴대폰에서는 영상을 자를 수 없어요.\n1분 안쪽으로 미리 잘라 둔 영상을 골라 주세요.'); return; }
        }
        if (video.size > MAX_VIDEO_MB * 1024 * 1024) { setVideoStatus(''); alert(`영상이 너무 커요 (${Math.round(video.size / 1024 / 1024)}MB).\n더 짧게 고르거나 화질을 낮춰서 올려주세요.`); return; }
        setVideoStatus('영상 올리는 중...');
        const poster = await makeVideoPoster(video);
        const posterUrl = poster ? await uploadMedia(poster, { kind: 'posters', ext: 'jpg', contentType: 'image/jpeg', bucket: 'community-images', path: `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_poster.jpg` }).catch(() => null) : null;
        const type = video.type || draft.file.type || 'video/mp4';
        const ext = type.includes('webm') ? 'webm' : type.includes('quicktime') ? 'mov' : 'mp4';
        let videoUrl: string;
        try {
          videoUrl = await uploadMedia(video, { kind: 'videos', ext, contentType: type, bucket: 'post-videos', path: `${me.id}/story_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}` });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          alert(/size|large|exceed|413/i.test(msg) ? `영상이 너무 커요. ${MAX_VIDEO_MB}MB 이하로 줄여서 올려주세요.` : '영상을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');
          return;
        } finally { setVideoStatus(''); }
        media = { images: [], video_url: videoUrl, video_poster: posterUrl };
      } else {
        const compressed = await imageCompression(draft.file, PHOTO_OPTIONS);
        const name = `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        media = { images: [await uploadMedia(compressed, { kind: 'stories', ext: 'jpg', contentType: 'image/jpeg', bucket: 'community-images', path: name })] };
      }
      const row: Record<string, unknown> = { user_id: me.id, author_name: me.name, content: clipText(caption.trim(), 100), ...media, is_story: true };
      let { data: created, error } = await supabase.from('posts').insert(draftMusic ? { ...row, music: draftMusic.value, music_title: draftMusic.title } : row).select('id');
      if (error && draftMusic && (error.code === 'PGRST204' || error.code === '42703')) ({ data: created, error } = await supabase.from('posts').insert(row).select('id')); // 음악 칸이 없으면 음악 없이
      if (error) {
        alert(error.code === '42703' || error.code === 'PGRST204' ? '스토리 기능을 준비 중이에요. (관리자: supabase/stories.sql 실행 필요)' : '스토리를 올리지 못했어요.');
        return;
      }
      URL.revokeObjectURL(draft.url);
      setDraft(null); setDraftMusic(null); setShowCreate(false);
      onDraftEnd?.(true);
      // 나를 팔로우하는 교우들에게 알림 (실패해도 무시)
      if (created?.[0]?.id) {
        const { data: { session } } = await supabase.auth.getSession();
        fetch('/api/push/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ type: 'story', id: created[0].id }) }).catch(() => {});
      }
      await onPosted();
      setOpenMineAfterPost(true);
    } catch {
      setVideoStatus('');
      alert(draft.video ? '영상을 올리지 못했어요. 잠시 후 다시 시도해 주세요.' : '사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPosting(false);
    }
  };
  const remove = async (s: Story) => {
    if (!(await askConfirm('이 스토리를 지울까요?'))) return;
    setPaused(true);
    const ok = await onDelete(s.id);
    if (!ok) { setPaused(false); return; }
    setViewerOpen(false);
  };

  const avatarOf = (a: { avatar_url?: string | null; baptismal_name?: string } | undefined, size: string) => a?.avatar_url
    ? <img loading="lazy" src={a.avatar_url} alt="" className={`${size} rounded-full object-cover`} />
    : <span className={`${size} rounded-full bg-stone-200 text-stone-600 font-serif font-bold flex items-center justify-center`}>{initial(a?.baptismal_name, '교')}</span>;

  if (unavailable && !isAdmin) return null; // SQL 실행 전에는 일반 회원에게 숨김

  const meAuthor = me ? { avatar_url: me.avatar, baptismal_name: me.name } : undefined;
  const ring = (unseen: boolean) => unseen ? 'bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600' : 'bg-stone-300';

  return (
    <>
      <div className="flex gap-3 overflow-x-auto px-3 py-3 bg-white border-b border-stone-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* 내 스토리: 있으면 보기, 없으면 올리기. 작은 ＋ 는 항상 올리기 */}
        <div className="shrink-0 w-[4.5rem] flex flex-col items-center gap-1">
          <div className="relative flex">
            <CelebrateBand id={me?.id} fit>
              <button onClick={() => (myGroupIndex >= 0 ? open(myGroupIndex) : pick())} className={`block p-[3px] rounded-full ${myGroupIndex >= 0 ? ring(groups[myGroupIndex].unseen) : 'bg-transparent'}`} aria-label="내 스토리">
                <span className="block p-[2px] bg-white rounded-full">{avatarOf(meAuthor, 'w-16 h-16 text-xl')}</span>
              </button>
            </CelebrateBand>
            <button onClick={pick} className="absolute z-[2] bottom-0 right-0 w-6 h-6 rounded-full bg-blue-500 text-white border-2 border-white flex items-center justify-center" aria-label="스토리 올리기"><Icon name="plus" className="w-3.5 h-3.5" /></button>
          </div>
          <span className="text-[0.75rem] text-stone-700 truncate max-w-full">내 스토리</span>
        </div>
        {groups.map((g, i) => g.userId === me?.id ? null : (
          <button key={g.userId} onClick={() => open(i)} className="shrink-0 w-[4.5rem] flex flex-col items-center gap-1">
            <CelebrateBand id={g.userId} fit>
              <span className={`block p-[3px] rounded-full ${ring(g.unseen)}`}>
                <span className="block p-[2px] bg-white rounded-full">{avatarOf(authors[g.userId], 'w-16 h-16 text-xl')}</span>
              </span>
            </CelebrateBand>
            <span className={`text-[0.75rem] truncate max-w-full ${g.unseen ? 'text-stone-900' : 'text-stone-500'}`}>{authors[g.userId]?.baptismal_name || '교우'}</span>
          </button>
        ))}
        {groups.filter(g => g.userId !== me?.id).length === 0 && (
          <p className="self-center text-[0.8125rem] text-stone-400 leading-snug">{unavailable ? '스토리 준비 중 (관리자: stories.sql 실행)' : <>오늘의 순간을 스토리로 나눠 보세요<br />24시간 뒤에 사라져요</>}</p>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFile} />
      {showCreate && <StoryCreate onClose={() => setShowCreate(false)} onFile={(f, m) => startDraft(f, m || null)} onPickMusic={cb => onPickMusic?.(cb)} />}

      {/* 올리기 미리보기 */}
      {draft && (
        <div className="fixed inset-0 z-[90] bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 text-white">
            <button onClick={cancelDraft} className="text-[0.9375rem]">취소</button>
            <p className="font-bold">새 스토리</p>
            {!draft.video && onPickMusic
              ? <button onClick={() => onPickMusic(m => setDraftMusic(m))} className="px-3 h-8 rounded-full bg-white/15 text-[0.8125rem] font-bold flex items-center gap-1"><Icon name="music" className="w-4 h-4" />{draftMusic ? '바꾸기' : '음악'}</button>
              : <span className="w-8" />}
          </div>
          {draft.video && draft.duration ? (
            <VideoTrimmer src={draft.url} duration={draft.duration} max={MAX_VIDEO_SECONDS} start={trim.start} end={trim.end} onChange={(st, en) => setTrim({ start: st, end: en })} />
          ) : (
            <div className="relative flex-1 min-h-0 flex items-center justify-center">
              <img src={draft.url} alt="" className="max-w-full max-h-full object-contain" />
            </div>
          )}
          <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-3">
            {draftMusic && (
              <div className="flex items-center gap-2 self-center max-w-full px-3 py-1.5 rounded-full bg-white/15 text-white text-[0.8125rem]">
                <Icon name="music" className="w-4 h-4 shrink-0" /><span className="truncate">{draftMusic.title}</span>
                <button onClick={() => setDraftMusic(null)} className="ml-1 text-white/70 text-lg leading-none" aria-label="음악 빼기">×</button>
              </div>
            )}
            {/* input 대신 한 줄 textarea: 휴대폰 자판 위 자동 완성 줄이 뜨지 않음 */}
            <textarea rows={1} value={caption} onChange={e => setCaption(e.target.value.replace(/\n/g, ' ').slice(0, 100))} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} enterKeyHint="done" placeholder="한마디 쓰기 (선택)" className="block w-full resize-none [field-sizing:content] max-h-28 px-4 py-3 rounded-3xl bg-white/15 text-white placeholder-white/60 text-[0.9375rem] leading-6 focus:outline-none" />
            <button onClick={post} disabled={posting} className="w-full py-3.5 rounded-full bg-white text-stone-900 font-bold disabled:opacity-50">{posting ? (videoStatus || '올리는 중...') : '내 스토리에 올리기'}</button>
            <p className="text-center text-[0.75rem] text-white/60">24시간 뒤에 저절로 사라져요</p>
          </div>
        </div>
      )}

      {/* 보기 */}
      {viewerOpen && current && (() => {
        const g = groups[pos.user];
        const a = authors[g.userId] || (g.userId === me?.id ? { id: me.id, baptismal_name: me.name, avatar_url: me.avatar } : undefined);
        const mine = g.userId === me?.id;
        return (
          <div className="fixed inset-0 z-[90] bg-black flex justify-center">
            <div className="relative w-full max-w-xl h-full select-none"
              onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerCancel={() => setPaused(false)}>
              {current.video_url ? (
                <video key={current.id} ref={v => { storyVideoRef.current = v; }} src={current.video_url} poster={current.image_url || undefined} playsInline preload="auto"
                  onLoadedData={e => { if (!pausedRef.current) startVideo(e.currentTarget); }}
                  onTimeUpdate={e => { const v = e.currentTarget; if (v.duration) setProgress(Math.min(1, v.currentTime / v.duration)); }}
                  onEnded={() => step(1)}
                  className="absolute inset-0 w-full h-full object-contain" />
              ) : (
                <img key={current.id} src={current.image_url} alt="" decoding="async" fetchPriority="high" onLoad={() => markLoaded(current.image_url)} onError={() => markLoaded(current.image_url)}
                  className="absolute inset-0 w-full h-full object-contain" draggable={false} />
              )}
              {waitingImg && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" role="status" aria-label="사진을 불러오는 중">
                  <span className="w-10 h-10 rounded-full border-[3px] border-white/30 border-t-white animate-spin" />
                </div>
              )}
              {/* 위: 진행 막대 + 작성자 */}
              <div className="absolute top-0 inset-x-0 z-10 px-2.5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-8 bg-gradient-to-b from-black/60 to-transparent">
                <div className="flex gap-1">
                  {g.items.map((it, i) => (
                    <span key={it.id} className="flex-1 h-[3px] rounded-full bg-white/35 overflow-hidden">
                      <span className="block h-full bg-white" style={{ width: `${i < pos.item ? 100 : i === pos.item ? progress * 100 : 0}%` }} />
                    </span>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center gap-2 text-white">
                  <button onClick={() => { setViewerOpen(false); onOpenProfile(g.userId); }} className="flex items-center gap-2 min-w-0">
                    {avatarOf(a, 'w-8 h-8 text-sm')}
                    <span className="font-bold text-[0.9375rem] truncate">{a?.baptismal_name || '교우'}</span>
                    <span className="text-white/70 text-[0.8125rem] shrink-0">{ago(current.created_at)}</span>
                  </button>
                  {current.music_title && !current.video_url && <span className="min-w-0 truncate text-white/80 text-[0.75rem] flex items-center gap-1"><Icon name="music" className="w-3.5 h-3.5 shrink-0" />{current.music_title}</span>}
                  <span className="flex-1" />
                  {!mine && me && onFollow && !followingIds.has(g.userId) && !followed.has(g.userId) && (
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => { onFollow(g.userId); setFollowed(prev => new Set(prev).add(g.userId)); }} className="shrink-0 px-3 h-8 rounded-lg border border-white/70 text-white text-[0.8125rem] font-bold">팔로우</button>
                  )}
                  {current.video_url && <button onClick={toggleSound} onPointerDown={e => e.stopPropagation()} className="w-10 h-10 flex items-center justify-center" aria-label={videoMuted ? '소리 켜기' : '소리 끄기'}><Icon name={videoMuted ? 'mute' : 'speaker'} className="w-5 h-5" /></button>}
                  {(mine || isAdmin) && <button onClick={() => remove(current)} className="w-10 h-10 flex items-center justify-center" aria-label="스토리 지우기"><Icon name="trash" className="w-5 h-5" /></button>}
                  <button onClick={() => setViewerOpen(false)} className="w-10 h-10 flex items-center justify-center text-3xl leading-none" aria-label="닫기">×</button>
                </div>
              </div>
              {/* 왼쪽·오른쪽 눌러 넘기기 */}
              <button onClick={() => step(-1)} className="absolute left-0 top-24 bottom-28 w-1/3" aria-label="이전 스토리" />
              <button onClick={() => step(1)} className="absolute right-0 top-24 bottom-28 w-2/3" aria-label="다음 스토리" />
              {/* 아래: 한마디 + 메시지 */}
              <div className="absolute bottom-0 inset-x-0 z-10 px-4 pt-10 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/70 to-transparent flex flex-col gap-3">
                {current.caption && <p className="text-white text-[1.0625rem] text-center leading-snug whitespace-pre-wrap drop-shadow">{current.caption}</p>}
                {/* 내 스토리: 기도·공감·댓글 숫자 / 다른 교우 스토리: 인스타그램처럼 '메시지 보내기' + 기도·공감·댓글 */}
                {(() => {
                  const prayed = myReactions.has(`${current.id}:pray`);
                  const liked = myReactions.has(`${current.id}:like`);
                  if (mine || !onReply) {
                    const item = 'flex flex-col items-center gap-0.5 text-white text-[0.8125rem] font-semibold min-w-[3.5rem]';
                    return (
                      <div className="flex items-end justify-around" onPointerDown={e => e.stopPropagation()}>
                        <button onClick={() => onReact(current.id, 'pray')} className={item} aria-label="기도"><Icon name="pray" fill={prayed} className={`w-8 h-8 ${prayed ? 'text-amber-300' : ''}`} />{current.pray}</button>
                        <button onClick={() => onReact(current.id, 'like')} className={item} aria-label="공감"><Icon name="heart" fill={liked} className={`w-8 h-8 ${liked ? 'text-rose-500' : ''}`} />{current.like}</button>
                        <button onClick={() => { setViewerOpen(false); onComment(current.id); }} className={item} aria-label="댓글"><Icon name="message" className="w-8 h-8" />{commentCounts[current.id] || 0}</button>
                      </div>
                    );
                  }
                  const ico = 'w-10 h-10 shrink-0 flex items-center justify-center text-white';
                  return (
                    <div className="flex items-center gap-1" onPointerDown={e => e.stopPropagation()}>
                      <div className="flex-1 min-w-0 flex items-center gap-1 rounded-full border border-white/60 bg-black/20 pl-4 pr-1.5 min-h-12">
                        <textarea ref={replyRef} rows={1} value={replyText} onChange={e => setReplyText(e.target.value.slice(0, 500))}
                          onFocus={() => { setReplyFocus(true); setPaused(true); if (!replyTargetRef.current && current) replyTargetRef.current = { id: current.id, user_id: current.user_id }; }} onBlur={() => { setReplyFocus(false); setPaused(false); }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover) and (pointer: fine)').matches) { e.preventDefault(); sendReply(replyText); } }}
                          enterKeyHint="send" placeholder={`${a?.baptismal_name || '교우'}님에게 메시지 보내기`}
                          className="flex-1 min-w-0 bg-transparent text-white placeholder-white/80 text-[0.9375rem] leading-6 py-2.5 resize-none [field-sizing:content] max-h-24 focus:outline-none" />
                        {replyText.trim() && <button onPointerDown={e => e.preventDefault()} onClick={() => sendReply(replyText)} className="shrink-0 px-3 h-9 rounded-full text-[0.9375rem] font-bold text-white">보내기</button>}
                      </div>
                      {!replyFocus && <>
                        <button onClick={() => onReact(current.id, 'pray')} className={ico} aria-label={`기도 ${current.pray}`}><Icon name="pray" fill={prayed} className={`w-7 h-7 ${prayed ? 'text-amber-300' : ''}`} /></button>
                        <button onClick={() => onReact(current.id, 'like')} className={ico} aria-label={`공감 ${current.like}`}><Icon name="heart" fill={liked} className={`w-7 h-7 ${liked ? 'text-rose-500' : ''}`} /></button>
                        <button onClick={() => { setViewerOpen(false); onComment(current.id); }} className={ico} aria-label={`댓글 ${commentCounts[current.id] || 0}`}><Icon name="message" className="w-7 h-7" /></button>
                      </>}
                    </div>
                  );
                })()}
              </div>
              {/* 메시지 칸을 누르면: 화면을 어둡게 하고 빠른 감정 여섯 (누르면 바로 메시지로) */}
              {replyFocus && !mine && (
                <div className="absolute inset-x-0 top-0 bottom-28 z-[5] bg-black/55 backdrop-blur-[2px] flex items-center justify-center animate-fade-in"
                  onPointerDown={e => { e.stopPropagation(); e.preventDefault(); replyRef.current?.blur(); }}>
                  <div className="grid grid-cols-3 gap-x-8 gap-y-7" onPointerDown={e => e.stopPropagation()}>
                    {['😂', '😮', '😍', '😢', '🙏', '👏'].map(em => (
                      <button key={em} onPointerDown={e => e.preventDefault()} onClick={() => sendReply(em, true)} className="text-[3.75rem] leading-none active:scale-90 transition" aria-label={`${em} 보내기`}>{em}</button>
                    ))}
                  </div>
                </div>
              )}
              {sentBurst && (
                <div key={sentBurst.key} className="pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center gap-2 animate-fade-in">
                  <span className="text-[5.5rem] leading-none drop-shadow-lg" style={{ animation: 'giftPop 0.6s ease-out' }}>{sentBurst.emoji}</span>
                  <span className="px-3 py-1.5 rounded-full bg-black/60 text-white text-[0.875rem] font-bold">메시지로 보냈어요</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}
