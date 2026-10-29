'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import imageCompression from 'browser-image-compression';
import { User } from '@supabase/supabase-js';
import Cropper from 'react-easy-crop';
import { frameRatio, photoFit, naturalRatio } from '@/lib/photo-frame';
import AnonBoard from '@/components/AnonBoard';
import RoleBadge, { BADGES } from '@/components/RoleBadge';
import Lounge, { loungeSeenKey } from '@/components/Lounge';
import GroupChat from '@/components/GroupChat';
import NewChat from '@/components/NewChat';
import MessageMenu, { REACTION_EMOJIS, MORE_EMOJIS, SwipeHint, anchorOf, type MenuAnchor } from '@/components/MessageMenu';
import { useChatMedia, ChatMediaView, QuoteThumb, quoteLabel } from '@/components/ChatMedia';
import { renderCapture, visibleIds, CaptureChoice, CaptureBar, CapturePreview, type CaptureItem } from '@/components/ChatCapture';
import { SelectCopySheet, BookmarkSheet, JumpToLatest, TypingIndicator } from '@/components/ChatSheets';
import BottomSheet from '@/components/BottomSheet';
import { useSheetDrag } from '@/lib/sheet-drag';
import { useFlipList } from '@/lib/use-flip-list';
import { closePanelOnInputFocus, leaveInputForPanel, useEnterSend, useTypeToInput } from '@/lib/use-enter-send';
import { askConfirm } from '@/components/ConfirmDialog';
import { pushDeviceKey } from '@/lib/push-devices';
import StickerPanel, { PostStickers, StickerAbove, StickerButton, StickerImage, StickerWithText, useCloseStickersOnTap, useStickerPicker, type StickerPicker } from '@/components/StickerPanel';
import { MAX_POST_STICKERS, STICKER_PACKS, chatPreview, chatStickerParts, chatText, hasStickerSuggestion, isGiftHandle, joinChatSticker, joinPostStickers, parseSticker, postPlainText, setStickerAccess, splitPostStickers, stickerText, type Sticker } from '@/lib/stickers';
import GiftBox, { type Gift } from '@/components/GiftBox';
import { appKind } from '@/lib/app-kind';
import { useTyping } from '@/lib/typing';
import { copyText, toast as showToast, useBookmarks, useHiddenMessages } from '@/lib/chat-actions';
import { usePressGestures } from '@/lib/use-press-gestures';
import { useStickToBottom } from '@/lib/stick-bottom';
import ExploreTab from '@/components/ExploreTab';
import HashtagText from '@/components/HashtagText';
import MentionSuggest from '@/components/MentionSuggest';
import NoticeBoard, { type Notice, noticeShownNow } from '@/components/NoticeBoard';
import { extractMentions, mentionsHandle } from '@/lib/mentions';
import { popularHashtags } from '@/lib/hashtags';
import { recordInterest } from '@/lib/interests';
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from '@/lib/push';
import { playAlertSound, unlockAlertSound } from '@/lib/alert-sound';
import { ADMIN_EMAILS } from '@/lib/admin';
import { signOutAndClear } from '@/lib/account';
import FeedbackModal from '@/components/FeedbackModal';
import ReportDialog, { ReportTarget } from '@/components/ReportDialog';
import SettingsModal from '@/components/SettingsModal';
import AdminMembers from '@/components/AdminMembers';
import MusicPicker, { type SelectedMusic, type MusicSegmentTarget } from '@/components/MusicPicker';
import BgmAdmin from '@/components/BgmAdmin';
import PostPhotos from '@/components/PostPhotos';
import PhotoZoom from '@/components/PhotoZoom';
import InstallGuide from '@/components/InstallGuide';
import StickerGift from '@/components/StickerGift';
import YouTubePlayer from '@/components/YouTubePlayer';
import PostVideo, { VideoViewer } from '@/components/PostVideo';
import ReelVideo from '@/components/ReelVideo';
import Stories from '@/components/Stories';
import HeartBurst from '@/components/HeartBurst';
import { useDoubleTap } from '@/lib/double-tap';
import VideoEditor, { OverlayLayer, hasOverlays, type VideoOverlays } from '@/components/VideoOverlays';
import { MAX_VIDEO_MB, MAX_VIDEO_SECONDS, SHRINK_OVER_MB, getVideoInfo, makeVideoPoster, shrinkVideo } from '@/lib/video';
import { type BgmTrack, BUILTIN_BGM, parsePostMusic } from '@/lib/music';
import { PHOTO_OPTIONS, uploadMedia, uploadPhoto, PHOTO_ONLY_TEXT, VIDEO_ONLY_TEXT, isMediaOnlyText, isVideoUrl } from '@/lib/upload';
import SponsorBanner from '@/components/SponsorBanner';
import SponsorAdmin from '@/components/SponsorAdmin';
import { FEED_BANNER_EVERY, type SponsorBannerData } from '@/lib/sponsor';
import FeastDayPicker from '@/components/FeastDayPicker';
import Icon, { IconBadge, type IconName } from '@/components/Icon';
import ClampText from '@/components/ClampText';
import AdminStats from '@/components/AdminStats';
import AdminUsage from '@/components/AdminUsage';
import TesterSignup from '@/components/TesterSignup';
import AdminTesters from '@/components/AdminTesters';
import { TesterStatus, isAndroidDevice } from '@/lib/android-test';
import DeletedMessages from '@/components/DeletedMessages';
import MediaStorage from '@/components/MediaStorage';
import LoadMore from '@/components/LoadMore';
import LettersModal from '@/components/LettersModal';
import PhotoStrip from '@/components/PhotoStrip';
import MyComments from '@/components/MyComments';
import SwipeRow from '@/components/SwipeRow';
import PhotoEditor from '@/components/PhotoEditor';
import { startVisitTracking } from '@/lib/visit';
import { birthdayFromMeta, CHEER_ICON, CHEER_WORD, cheerKindOf, cheerMessage, cheerWordOfMany, formatFeastDay, isTodayMonthDay, isValidFeastDay, selfCheer, todayFeastKeys, todayKst, type CheerKind } from '@/lib/feast';
import CelebrateAvatar from '@/components/CelebrateAvatar';
import { FANCY_STYLES, hasLatin, initial, toFancy, toPlain } from '@/lib/fancy-name';
import { outsideHref } from '@/lib/open-outside';

// Safari에서 '모든 쿠키 차단'이나 일부 개인정보 보호 설정이 켜져 있으면
// localStorage 접근 자체가 오류를 내서 화면 전체가 멈출 수 있으므로 안전하게 감싼다.
// 알림 주소(?post=…, ?chat=…, ?alerts=1, ?feedback=1)에서 열어야 할 화면
const deepLinkFromSearch = (search: string) => {
  const params = new URLSearchParams(search);
  const post = params.get('post') || undefined;
  const chat = params.get('chat') || undefined;
  const cheerRaw = params.get('cheer');                // chat 과 함께: 생일·축일 축하 인사를 입력칸에 채워 둠
  const cheer = cheerRaw === 'birthday' || cheerRaw === 'feast' || cheerRaw === 'both' ? cheerRaw as CheerKind : undefined;
  const alerts = params.get('alerts') === '1';
  const feedback = params.get('feedback') === '1';
  const notice = params.get('notice') || undefined;
  const reports = params.get('reports') === '1';
  const comment = params.get('comment') || undefined; // post 와 함께: 그 댓글로
  const view = params.get('view') || undefined;       // 글 크게 보기 (글에서 언급됐을 때)
  const profile = params.get('profile') || undefined; // 그 교우의 공간 (새 팔로워)
  const story = params.get('story') || undefined;     // 그 교우의 스토리 (새 스토리 알림)
  const anon = params.get('anon') || undefined;       // 고민상담의 그 글 (답글 알림)
  const reply = params.get('reply') || undefined;     // anon 과 함께: 그 답글로
  const letters = params.get('letters') === '1';      // 사연함 (관리자) / 보낸 사연
  const lounge = params.get('lounge') || undefined;   // 사랑방의 그 대화 (관리자 부름)
  const tester = params.get('tester') === '1';        // 안드로이드 테스터 신청 창 (구글 등록 완료 알림)
  const group = params.get('group') || undefined;     // 단체 채팅방 (새 메시지 알림)
  const gift = params.get('gift') || undefined;       // 관리자의 선물 상자 ('sticker:팩' · 'letter:사연id')
  return post || chat || alerts || feedback || notice || reports || view || profile || story || anon || letters || lounge || tester || group || gift ? { post, chat, cheer, alerts, feedback, notice, reports, comment, view, profile, story, anon, reply, letters, lounge, tester, group, gift } : null;
};

// 인스타그램처럼 '3시간 전', 일주일 넘으면 날짜
const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

// 서비스 워커가 알림을 누를 때 적어 둔 목적지 (public/sw.js writePending)
const PENDING_CACHE = 'catholicgram-sw-meta';
const clearPendingLink = () => { caches?.open(PENDING_CACHE).then(c => c.delete('/__pending')).catch(() => {}); };
let pendingLinkHandler: ((url: string) => void) | null = null;
// 같은 알림 목적지를 두 번 열지 않게 (서비스 워커 메시지 + 적어 둔 목적지가 둘 다 올 수 있음)
let lastOpenedLink: { url: string; at: number } | null = null;
// 알림·링크로 화면을 연 때: 앱을 다시 띄우며 이어 열던 예전 대화방이 그 뒤에 늦게 열려 알림 화면을 덮지 않게
let linkHandledAt = 0;
const markLinkOpened = (url: string) => {
  const key = new URL(url, 'http://x').search;
  if (lastOpenedLink && lastOpenedLink.url === key && Date.now() - lastOpenedLink.at < 60 * 1000) return false;
  lastOpenedLink = { url: key, at: Date.now() };
  return true;
};
// 알림 이동 기록 (문제 찾기용, 이 휴대폰에만 남음) — 알림 목록 맨 아래에서 볼 수 있다
let lastTouchAt = 0;
const linkLog = (kind: string, detail = '') => {
  try {
    const list = JSON.parse(localStorage.getItem('linkLog') || '[]') as { at: number; kind: string; detail: string }[];
    list.push({ at: Date.now(), kind, detail: detail.slice(0, 80) });
    localStorage.setItem('linkLog', JSON.stringify(list.slice(-25)));
  } catch { /* 무시 */ }
};
// 이미 연 알림 주소 (이 휴대폰에 기억) — 휴대폰이 앱을 예전 알림 주소로 다시 띄워도 또 열지 않는다
const claimLink = (url: string) => {
  const key = new URL(url, 'http://x').search;
  let handled: [string, number][] = [];
  try { handled = (JSON.parse(localStorage.getItem('handledLinks') || '[]') as (string | [string, number])[]).map(h => (typeof h === 'string' ? [h, 0] : h)); } catch { /* 무시 */ }
  // 오래전에 연 주소면 막는다. 방금(1분 안) 연 주소는 허용 — 알림을 누르면 휴대폰이 앱을 곧바로 새로 띄우는 경우가 있어서
  const prev = handled.find(([k]) => k === key);
  if (prev && Date.now() - prev[1] > 60 * 1000) { linkLog('skip', `이미 연 주소 ${key.slice(0, 40)}`); return false; }
  if (!markLinkOpened(url)) return false;
  try { localStorage.setItem('handledLinks', JSON.stringify([...handled.filter(([k]) => k !== key), [key, prev ? prev[1] : Date.now()]].slice(-60))); } catch { /* 무시 */ }
  return true;
};
// staleSearch: 앱이 알림 주소로 열렸는데 고유 표시(n)가 없는 예전 형식 → 적어 둔 목적지와 같을 때만 연다
// 휴대폰에 저장된 로그인 정보 (서버 확인 없이). 인터넷이 잠깐 안 될 때 로그인이 풀린 것처럼 보이지 않게 쓴다
const storedAuthUser = () => {
  try {
    const key = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { refresh_token?: string; user?: User };
    if (!saved.refresh_token) return null;
    let u = saved.user;
    if (!u?.id) { const sep = JSON.parse(localStorage.getItem(`${key}-user`) || 'null') as { user?: User } | null; u = sep?.user; }
    return u?.id ? u : null;
  } catch { return null; }
};
const consumePendingLink = async (staleSearch?: string, retried = false): Promise<void> => {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(PENDING_CACHE);
    const res = await cache.match('/__pending');
    if (!res) {
      // 알림을 막 누른 경우 적어 두기가 조금 늦을 수 있어 한 번 더 본다
      if (staleSearch && !retried) { setTimeout(() => consumePendingLink(staleSearch, true), 1000); return; }
      if (staleSearch) linkLog('skip', `예전 주소 ${staleSearch.slice(0, 40)}`);
      return;
    }
    const pending = await res.json() as { url?: string; at?: number };
    await cache.delete('/__pending');
    linkLog('pending', `${pending.url?.replace(/^https?:\/\/[^/]+/, '')} ${Math.round((Date.now() - (pending.at || 0)) / 1000)}s전`);
    // 이미 연 곳이면(이동 신호로 먼저 열림) 다시 열지 않는다 — 나중에 앱으로 돌아올 때 예전 알림 화면으로 튀지 않게
    if (pending.url && lastOpenedLink && lastOpenedLink.url === new URL(pending.url, 'http://x').search && (pending.at || 0) <= lastOpenedLink.at + 10 * 1000) return;
    if (pending.url && pending.at && Date.now() - pending.at < 2 * 60 * 1000) pendingLinkHandler?.(pending.url);
  } catch { /* 무시 */ }
};

// 알림 대신 앱 아이콘(숫자가 붙은)을 눌러 들어온 경우 (루비로사 건의): 휴대폰 위쪽 줄에 아직 떠 있는 가톨릭그램 알림 중
// 가장 최근 것(since 뒤에 온 것만)의 화면으로 바로 간다. 그 알림은 닫는다 (아이콘의 숫자도 하나 줄어듦)
const openShownNotification = async (since = 0) => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const at = (n: Notification) => (n as Notification & { timestamp?: number }).timestamp || 0; // sw.js 가 띄울 때 적은 시각
    const list = ((await reg?.getNotifications()) || []).filter(n => at(n) >= since && typeof n.data?.url === 'string');
    if (list.length === 0) return;
    const latest = list.reduce((a, b) => (at(b) > at(a) ? b : a));
    const url = new URL(latest.data.url, window.location.origin);
    if (url.origin !== window.location.origin) return;
    linkLog('icon', `${url.pathname}${url.search} (떠 있는 알림 ${list.length}개)`);
    latest.close();
    pendingLinkHandler?.(url.href);
  } catch { /* 무시 */ }
};

const ALERT_KEEP_MS = 3 * 24 * 60 * 60 * 1000; // 알림 보관 기간 (3일)

const storageGet = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const storageSet = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* 저장 불가 환경 */ } };
const isStorageAvailable = () => {
  try { localStorage.setItem('__test__', '1'); localStorage.removeItem('__test__'); return true; } catch { return false; }
};

interface Post {
  id: string;
  content: string;
  images: string[];
  pray_count: number;
  like_count: number;
  author_name: string;
  user_id: string; 
  created_at: string;
  avatar_url?: string;
  handle?: string;
  badge_type?: string;
  music?: string | null;        // 'yt:영상ID' 또는 'bgm:트랙ID' (lib/music.ts)
  video_url?: string | null;    // 숏폼 영상 (1분 이하)
  video_poster?: string | null; // 영상 미리보기 이미지
  video_overlays?: VideoOverlays | null; // 영상 위 글자·이모티콘
  music_title?: string | null;
  visibility?: Visibility | null; // 공개 범위 (없으면 전체 공개)
}

interface Comment { id: string; post_id: string; content: string; author_name: string; created_at: string; user_id?: string; reply_to_user_id?: string | null; reply_to_name?: string | null; parent_id?: string | null; edited_at?: string | null; }
// 댓글 감정: 꾹 눌러 고르는 그림 ↔ 저장하는 이름 (supabase/comment-reactions.sql). 한 사람이 여러 개 고를 수 있다
const COMMENT_REACTION_TYPES: Record<string, string> = { '❤️': 'like', '👍': 'thumbs', '😊': 'smile', '😂': 'laugh', '😮': 'wow', '😢': 'sad', '🙏': 'pray' };
interface CommentReactions { n: Record<string, number>; mine: string[] }   // 종류별 수, 내가 고른 것
const NO_REACTIONS: CommentReactions = { n: {}, mine: [] };
// 안드로이드 크롬 등에서 '앱 설치' 창을 띄우기 위한 이벤트 (표준 타입에 없음)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type FollowStatus = 'none' | 'pending' | 'accepted';
type Tab = 'home' | 'explore' | 'reels' | 'profile' | 'messages' | 'chat' | 'anon';
// 뒤로가기(쓸어 넘기기)를 위해 휴대폰 이동 기록(history)에 남기는 화면 정보
interface ScreenState { screen: true; tab: Tab; viewingUserId?: string | null; chatUser?: UserProfile | null }
// 나를 팔로우한 사람 (알림용). iFollow: 내가 맞팔로우 중인지
interface FollowRequest { id: string; follower: UserProfile; created_at?: string; iFollow?: boolean }
interface UnreadFrom { partner: UserProfile; count: number; lastMessage: string; lastAt: string; }
// 단체 채팅방 목록 (supabase/group-chats.sql 의 my_group_chats / admin_group_chats)
interface GroupChatRow { id: string; name: string; member_count: number; last_message: string | null; last_sender: string | null; last_kind: string | null; last_message_at: string; unread: number }
interface AdminGroupRow { id: string; name: string; created_at: string; last_message_at: string; member_count: number; member_names: string | null; message_count: number; last_message: string | null; last_sender: string | null }
// anon: 익명 고민글 답글 알림 (mine = 내 고민글에 달린 답글, author = 내가 답글을 단 고민글에 글쓴이가 남긴 답글). id 는 'a:답글id', post_id 는 고민글 id
interface CommentNotification { id: string; post_id: string; post_content: string; content: string; author_name: string; created_at: string; is_reply?: boolean; mention?: 'post' | 'comment'; anon?: 'mine' | 'author'; post_image?: string | null; }
interface Message { id: string; sender_id: string; receiver_id: string; content: string; created_at: string; read_at?: string | null; image_url?: string | null; images?: string[] | null; deleted_at?: string | null; reply_to?: string | number | null; edited_at?: string | null; }
// 휴대폰 알림창에 남은 그 대화(채팅·단체방)의 알림을 닫는다 (대화방을 열었을 때)
const closeOsNotifications = (tag: string) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration('/sw.js').then(reg => reg?.getNotifications({ tag })).then(list => (list || []).forEach(n => n.close())).catch(() => {});
};
// 메시지 감정 표시 (supabase/message-extras.sql) — 두 번 누르면 하트, 꾹 누르면 고르기
const MESSAGE_EMOJIS = REACTION_EMOJIS;
const ALL_EMOJIS = [...REACTION_EMOJIS, ...MORE_EMOJIS]; // 감정 표시를 모아 보여 줄 때의 순서
const DM_REQUEST_HINT = '메시지 요청·대화방 나가기를 준비 중이에요. (관리자: supabase/dm-requests.sql 실행 필요)';
const MESSAGE_EXTRAS_HINT = '메시지 답장·감정 표시·고치기를 준비 중이에요. (관리자: supabase/message-extras.sql 실행 필요)';
// baptismal_name: 화면에 보이는 '닉네임' (실명인 이름+세례명은 profile_private.real_name 에 비공개로 보관)
// birthday: 'MM-DD' (supabase/birthday.sql — 실행 전이면 없음(undefined), 실행했는데 안 적었으면 null)
interface UserProfile { id: string; baptismal_name: string; avatar_url?: string; handle?: string; badge_type?: string; feast_day?: string | null; birthday?: string | null; nickname_set?: boolean; }
// 생일·축일 리본에 쓰는 그 교우의 날 (내 공간·교우 공간 머리, 프로필 카드)
type MemberDays = { id: string; birthday?: string | null; feast_day?: string | null };
const fetchMemberDays = async (id: string): Promise<MemberDays> => {
  const { data, error } = await supabase.from('profiles').select('feast_day, birthday').eq('id', id).maybeSingle();
  if (!error) return { id, ...(data || {}) };
  const { data: old } = await supabase.from('profiles').select('feast_day').eq('id', id).maybeSingle(); // 생일 칸 생기기 전
  return { id, ...(old || {}) };
};

// --- 이미지 자르기 유틸리티 ---
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });

async function getCroppedImg(imageSrc: string, pixelCrop: any): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  // 프로필 사진은 작은 동그라미로만 보이므로 400px 로 줄여 저장 (원본 크기면 피드마다 수 MB씩 전송됨)
  const size = Math.min(400, Math.round(pixelCrop.width));
  canvas.width = size;
  canvas.height = Math.round(size * pixelCrop.height / pixelCrop.width);
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error('Canvas is empty')); }, 'image/jpeg', 0.85);
  });
}

const MAX_PHOTOS = 10; // 한 글에 올릴 수 있는 사진 수 (서버 app/api/posts 도 같게)

// 글 공개 범위
type Visibility = 'public' | 'followers' | 'private';
const VISIBILITY: Record<Visibility, { icon: IconName; label: string; hint: string }> = {
  public: { icon: 'globe', label: '전체 공개', hint: '모든 교우가 볼 수 있어요' },
  followers: { icon: 'users', label: '팔로워만', hint: '나를 팔로우하는 교우만 볼 수 있어요' },
  private: { icon: 'lock', label: '나만 보기', hint: '나만 볼 수 있어요' },
};
const VISIBILITY_SQL_HINT = '공개 범위 기능을 준비 중이에요. (관리자: supabase/post-visibility.sql 실행 필요)';

// 공개 범위 고르기 (글쓰기·고치기·크게 보기에서 같이 씀)
function VisibilityPicker({ value, onChange }: { value: Visibility; onChange: (v: Visibility) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1.5">
        {(Object.keys(VISIBILITY) as Visibility[]).map(v => (
          <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
            className={`flex-1 py-2 rounded-xl text-[0.8125rem] font-bold border transition-colors ${value === v ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>
            <Icon name={VISIBILITY[v].icon} className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />{VISIBILITY[v].label}
          </button>
        ))}
      </div>
      <p className="text-[0.75rem] text-stone-400 pl-1">{VISIBILITY[value].hint}</p>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState('');
  const [composerPhotoIdx, setComposerPhotoIdx] = useState(0);   // 글쓰기: 크게 보이는 사진
  const [composerVisOpen, setComposerVisOpen] = useState(false);   // 글쓰기: 공개 범위 고르기 펼침
  const [composerStickers, setComposerStickers] = useState<Sticker[]>([]); // 글쓰기: 붙인 이모티콘 (글 끝에 한 줄씩 저장)
  const [composerStickerOpen, setComposerStickerOpen] = useState(false);
  const [editingPhotoIdx, setEditingPhotoIdx] = useState<number | null>(null); // 글쓰기: 자르기·가리기 중인 사진
  // 글 고치기의 사진: 원래 사진은 주소만, 새로 넣거나 편집한 사진은 파일과 미리보기 주소
  const [editPhotos, setEditPhotos] = useState<{ url: string; file?: File }[]>([]);
  const [editPhotoEditor, setEditPhotoEditor] = useState<{ idx: number; file: File; step?: 'crop' | 'cover' } | null>(null);
  const [editPhotoLoading, setEditPhotoLoading] = useState(false);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const [composerVisibility, setComposerVisibility] = useState<Visibility>('public'); // 새 글 공개 범위 (마지막 선택 기억)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  // 숏폼 영상 (사진 대신 1개)
  const [selectedVideo, setSelectedVideo] = useState<Blob | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState('');
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [composerOverlays, setComposerOverlays] = useState<VideoOverlays | null>(null);
  const [showVideoEditor, setShowVideoEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [commentSheetId, setCommentSheetId] = useState<string | null>(null); // 아래에서 올라오는 댓글 창의 글
  const [comments, setComments] = useState<{ [key: string]: Comment[] }>({});
  const [badgeByUser, setBadgeByUser] = useState<{ [userId: string]: string | null }>({});
  // 댓글 쓴 사람의 '현재' 닉네임과 핸들 (댓글에 저장된 이름이 예전 것이어도 최신으로 보여줌)
  const [authorByUser, setAuthorByUser] = useState<{ [userId: string]: { name: string; handle?: string; avatar?: string } }>({});
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [notifications, setNotifications] = useState<CommentNotification[]>([]);
  const [notificationsLastSeen, setNotificationsLastSeen] = useState<string | null>(null);
  // 알림 지우기: 이 시각 이전 알림은 모두 숨김 + 하나씩 지운 알림
  const myHandleRef = useRef<string | null>(null);
  const [notificationsClearedAt, setNotificationsClearedAt] = useState<string | null>(null);
  const [hiddenAlerts, setHiddenAlerts] = useState<Set<string>>(new Set());
  const [readAlerts, setReadAlerts] = useState<Set<string>>(new Set());     // 눌러서 확인한 알림 (흐리게 남고, '확인한 알림 지우기'로 지움)
  const [feastClearedAt, setFeastClearedAt] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isKakaoInApp, setIsKakaoInApp] = useState(false);
  const [canOpenOutside, setCanOpenOutside] = useState(false); // 앱 안의 창(카카오톡 등) → 로그인해 둔 앱·브라우저로 열 수 있음
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(true); // 확인 전에는 배너를 숨김
  const [isIOS, setIsIOS] = useState(false);
  const [installBannerDismissed, setInstallBannerDismissed] = useState(true);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  // 처음 들어왔을 때 휴대폰 알림을 켜도록 안내하는 창
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [showAdminMembers, setShowAdminMembers] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sponsorBanners, setSponsorBanners] = useState<SponsorBannerData[]>([]);
  const [showSponsorAdmin, setShowSponsorAdmin] = useState(false);
  const [topBannerSeed] = useState(() => Math.random());
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  // 휴대폰 푸시 알림 상태
  const [pushStatus, setPushStatus] = useState<'checking' | 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on'>('checking');
  const [pushBusy, setPushBusy] = useState(false);
  // 푸시 알림을 눌러 들어온 경우 열어야 할 화면 (?post=... / ?chat=...)
  const [deepLink, setDeepLink] = useState<{ post?: string; chat?: string; cheer?: CheerKind; alerts?: boolean; feedback?: boolean; notice?: string; reports?: boolean; comment?: string; view?: string; profile?: string; story?: string; anon?: string; reply?: string; letters?: boolean; lounge?: string; tester?: boolean; group?: string; gift?: string } | null>(null);
  const [feedbackView, setFeedbackView] = useState<'reports' | 'inbox' | 'mine' | null>(null); // 알림으로 열면: 신고 목록 / 받은 건의함(관리자) / 내 건의(답변 확인)
  // 공지사항
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showNotices, setShowNotices] = useState(false);
  const [noticeOpenId, setNoticeOpenId] = useState<string | null>(null);
  const [hiddenNotices, setHiddenNotices] = useState<string[]>([]);
  const [noticeAdminMode, setNoticeAdminMode] = useState(false); // 관리자 공간에서 연 공지 (쓰기·관리 가능)
  const [popupClosed, setPopupClosed] = useState<string[]>([]); // 이번에 '닫기'만 누른 팝업 공지 (다음에 들어오면 다시 뜸)
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  // 프로필을 아직 안 만들고 '둘러보기만' 하는 중 (글·댓글 등은 못 함)
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [baptismalName, setBaptismalName] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [setupError, setSetupError] = useState('');
  const [feastDayInput, setFeastDayInput] = useState('');
  const [birthdayInput, setBirthdayInput] = useState('');   // 생일 'MM-DD' (가입·프로필 수정)
  const metaBirthdayTriedRef = useRef<string | null>(null);
  const [birthdayPromptHidden, setBirthdayPromptHidden] = useState(true); // 내 공간 '생일을 알려 주세요' 안내를 닫았는지 (이 휴대폰)
  const [nicknameInput, setNicknameInput] = useState('');   // 공개 닉네임 (baptismalName 은 비공개 실명)
  const [showFancyName, setShowFancyName] = useState(false); // 닉네임 영어 글자를 필기체 등으로 꾸미기
  const [profileEditMode, setProfileEditMode] = useState(false); // 설정에서 프로필 정보 수정 중
  const [myRealName, setMyRealName] = useState('');
  const [viewingRealName, setViewingRealName] = useState(''); // 관리자만
  // 댓글 답글 대상 (게시물별)
  // 게시물별 댓글 수, 댓글별 감정(🙏 기도 · ❤️ 공감 · 꾹 눌러 고른 👍😊😂😮😢)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentReactions, setCommentReactions] = useState<Record<string, CommentReactions>>({});
  const [openIntentionId, setOpenIntentionId] = useState<string | null>(null); // 기도지향 목록에서 펼쳐 본 것
  // 오늘의 기도지향 (한국 시간 기준 오늘 것만)
  // 기도지향: 교우에게는 올린 사람 없이(is_mine 만), 관리자에게만 user_id·이름
  const [intentions, setIntentions] = useState<{ id: string; user_id?: string; author_name?: string | null; title?: string | null; content: string; created_at: string; is_mine?: boolean; blocked?: boolean }[]>([]);
  const [showIntentions, setShowIntentions] = useState(false);
  const [intentionTitleInput, setIntentionTitleInput] = useState(''); // 기도지향 (30자)
  const [intentionInput, setIntentionInput] = useState('');            // 기도 내용 (100자)
  const [intentionEditing, setIntentionEditing] = useState(false);
  const [intentionSaving, setIntentionSaving] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [editCommentStickers, setEditCommentStickers] = useState<Sticker[]>([]); // 댓글 고치기: 붙은 이모티콘 (글만 고치고 × 로 빼기)
  const [replyTargets, setReplyTargets] = useState<Record<string, { userId: string; name: string; commentId?: string } | null>>({});
  // 오늘 축일인 팔로잉 교우들 + 축일 카드 닫음 여부(하루 단위)
  const [feastFriends, setFeastFriends] = useState<UserProfile[]>([]);
  const [feastCardDismissed, setFeastCardDismissed] = useState(true);
  const [feastPromptDismissed, setFeastPromptDismissed] = useState(true);
  // 안드로이드 테스터 모집 (구글 플레이 비공개 테스트): 신청 창, 관리자 목록, 내 신청 상태(표가 없으면 null), 홈 안내 카드
  const [showTesterSignup, setShowTesterSignup] = useState(false);
  const [showAdminTesters, setShowAdminTesters] = useState(false);
  const [testerStatus, setTesterStatus] = useState<TesterStatus | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);
  const [testerPromptDismissed, setTesterPromptDismissed] = useState(true);
  const [settingsView, setSettingsView] = useState<'main' | 'feast'>('main');
  
  // 사진만 크게 보기 (글 사진은 여러 장을 넘겨 볼 수 있게 묶음으로)
  const [selectedImage, setSelectedImage] = useState<{ images: string[]; index: number } | null>(null);
  const zoomPhoto = (url?: string | null) => setSelectedImage(url ? { images: [url], index: 0 } : null);
  const [selectedPostDetail, setSelectedPostDetail] = useState<Post | null>(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [postMenuId, setPostMenuId] = useState<string | null>(null);
  // 배경음악: 목록, 글쓰기에서 고른 음악, 게시물 보기에서 재생 중 여부
  const [bgmTracks, setBgmTracks] = useState<BgmTrack[]>(BUILTIN_BGM);
  const [composerMusic, setComposerMusic] = useState<SelectedMusic | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showBgmAdmin, setShowBgmAdmin] = useState(false);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set()); // 사진·영상 글: 펼쳐 본 글
  const [feedFilter, setFeedFilter] = useState<'all' | 'media' | 'text'>('all');
  const [lettersStart, setLettersStart] = useState<'write' | 'mine'>('write'); // 사연함: 알림으로 열면 '보낸 사연'
  const [showLounge, setShowLounge] = useState(false);   // 모두의 사랑방 (전체 대화방)
  const [groupChats, setGroupChats] = useState<GroupChatRow[]>([]);  // 내 단체 채팅방 (안 읽은 수 포함)
  const [openGroup, setOpenGroup] = useState<{ id: string; adminView: boolean } | null>(null); // 열려 있는 단체 채팅방 (관리자는 몰래 읽기)
  const [showNewChat, setShowNewChat] = useState(false);              // 새 채팅: 교우 찾아 1:1 · 단체방 만들기
  const [switchingAccount, setSwitchingAccount] = useState(false);    // '다른 계정으로 로그인': 로그인 창에서 계정을 새로 고르게
  const [messagesView, setMessagesView] = useState<'dm' | 'group' | 'allGroups'>('dm'); // 메시지 목록: 개인 / 단체 (관리자: 모든 단체방)
  const [adminGroups, setAdminGroups] = useState<AdminGroupRow[] | null>(null);
  const [loungeNew, setLoungeNew] = useState(0);
  const [loungeOnlineIds, setLoungeOnlineIds] = useState<string[]>([]); // 지금 사랑방에 들어와 있는 교우 (실시간)
  const loungeOnline = loungeOnlineIds.length;
  const loungePresenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const showLoungeRef = useRef(false);
  const [loungeStealth, setLoungeStealth] = useState(true); // 관리자는 기본으로 몰래 들어간다 (안내 없이, 참여 인원에서 빠짐) → 안에서 '들어왔다고 알리기'
  const [loungeFocusId, setLoungeFocusId] = useState<string | null>(null); // 관리자 부름 알림으로 연 대화          // 마지막으로 본 뒤 새 사랑방 대화 수
  const [linkLogText, setLinkLogText] = useState<string | null>(null); // 알림 이동 기록 (문제 찾기용)
  const [feedMenuOpen, setFeedMenuOpen] = useState(false); // 가톨릭그램 ▾ 눌러서 보기 고르기
  const [reelsMuted, setReelsMuted] = useState(true); // 영상 탭: 소리 (모든 영상 공통)
  const [storyViewerOpen, setStoryViewerOpen] = useState(false); // 스토리 화면 가득 보기
  const [avatarPreview, setAvatarPreview] = useState<{ url: string; name: string } | null>(null); // 프로필 사진 크게 보기 // 홈 피드: 인스타그램처럼 전체
  const [showComposer, setShowComposer] = useState(false); // 글쓰기 창 (+ 버튼으로 열기)
  const [showAnon, setShowAnon] = useState(false);         // 익명 고민상담 (사연함·알림처럼 아래에서 올라오는 창)
  const [showMyComments, setShowMyComments] = useState(false); // 내 공간 → 내 댓글 모아 보기
  const [composerStep, setComposerStep] = useState<'pick' | 'write'>('pick'); // 인스타그램처럼: 사진 고르기 → 문구 쓰기
  const [composerMulti, setComposerMulti] = useState(false); // 여러 장 선택
  // 새 게시물 1단계 아래 사진 칸: 사진첩에서 한꺼번에 고른 사진들(미리보기). 이 중에서 눌러 올릴 사진을 고른다
  const [tray, setTray] = useState<{ file: File; url: string }[]>([]);
  const [storyPickRequest, setStoryPickRequest] = useState(0); // 글쓰기 아래 '스토리'를 누르면 스토리 사진 고르기
  const [fabOpen, setFabOpen] = useState(false); // + 버튼 메뉴 펼침
  const [showAdminStats, setShowAdminStats] = useState(false); // 관리자: 접속 통계
  const [showAdminUsage, setShowAdminUsage] = useState(false); // 관리자: 데이터 사용량
  // 접속 통계 기록 (앱 열기·나가기)
  useEffect(() => startVisitTracking(), []);
  const [myPostReactions, setMyPostReactions] = useState<Set<string>>(new Set()); // 내가 누른 기도·공감 ('글id:pray')
  const [editContent, setEditContent] = useState('');
  const [editOverlays, setEditOverlays] = useState<VideoOverlays | null>(null); // 영상 글 고치기: 글자·이모티콘
  const [showEditVideoEditor, setShowEditVideoEditor] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editVisibility, setEditVisibility] = useState<Visibility>('public');
  const [editVisOpen, setEditVisOpen] = useState(false); // 게시글 수정: 공개 범위 고르기 펼침
  const [editSelIdx, setEditSelIdx] = useState(0);         // 게시글 수정: 고른 사진 (자르기·가리기·삭제)
  const [editEmojiOpen, setEditEmojiOpen] = useState(false); // 게시글 수정: 이모티콘 줄 펼침
  const [editStickers, setEditStickers] = useState<Sticker[]>([]); // 게시글 수정: 붙인 이모티콘
  const [editMusic, setEditMusic] = useState<{ value: string; title: string } | null>(null); // 글 고치기: 음악
  const [musicSegment, setMusicSegment] = useState<MusicSegmentTarget | null>(null); // 고른 곡의 구간만 다시 고치기
  const [musicPickerFor, setMusicPickerFor] = useState<'composer' | 'edit'>('composer');

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [exploreQuery, setExploreQuery] = useState('');
  const currentScreenRef = useRef<ScreenState>({ screen: true, tab: 'home' });
  const backHandlerRef = useRef<(e: PopStateEvent) => void>(() => {});
  const exitArmedAtRef = useRef(0);
  const historyReadyRef = useRef(false); // 첫 터치 뒤에 뒤로가기용 기록을 깔았는지
  const skipNextPopRef = useRef(false); // 창을 닫으며 직접 뒤로 간 것은 무시
  const pushAlertRef = useRef<(url: string, title: string, body: string) => void>(() => {}); // 앱을 보고 있을 때 푸시가 오면 (아래에서 채움)
  const viewingRef = useRef<(url: string) => boolean>(() => false); // 이 알림 주소의 대화방(1:1·단체)을 지금 보고 있는지 (아래에서 채움)
  const pushToastAtRef = useRef(0); // 푸시 내용을 배너로 띄운 시각 (같은 알림을 배너로 또 띄우지 않게)
  const modalHistoryRef = useRef(false); // 지금 열린 창을 위해 뒤로가기 기록 한 칸을 쌓았는지
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [spaceDays, setSpaceDays] = useState<MemberDays | null>(null);   // 보고 있는 공간 주인의 생일·축일 (리본)
  const [actionUserDays, setActionUserDays] = useState<MemberDays | null>(null); // 프로필 카드 교우의 생일·축일
  const [viewingBio, setViewingBio] = useState(''); // 내 공간 한 줄 소개
  const [bioDraft, setBioDraft] = useState<string | null>(null); // 소개 고치는 중이면 글자
  const [profileTab, setProfileTab] = useState<'posts' | 'videos' | 'tagged'>('posts');
  const [followList, setFollowList] = useState<{ mode: 'followers' | 'following'; items: UserProfile[] | null } | null>(null);
  const [followData, setFollowData] = useState<{ followers: number; following: number; status: FollowStatus }>({ followers: 0, following: 0, status: 'none' });

  const [actionModalUser, setActionModalUser] = useState<UserProfile | null>(null);
  const [stickerGiftFor, setStickerGiftFor] = useState<{ id: string; name: string; handle?: string | null } | null>(null); // 관리자: 이모티콘 선물 창
  const [stickerGrants, setStickerGrants] = useState<string[]>([]); // 내가 선물받은 전용 이모티콘 (sticker_grants)
  // 관리자의 선물 상자: 선물받은 사연(letters.gift), 연 선물(이 휴대폰 localStorage giftsOpened:아이디), 이번에 열지 않고 닫은 선물, 알림으로 연 선물
  const [giftLetters, setGiftLetters] = useState<string[]>([]);
  const [openedGifts, setOpenedGifts] = useState<string[] | null>(null);
  const [snoozedGifts, setSnoozedGifts] = useState<string[]>([]);
  const [forcedGift, setForcedGift] = useState<string | null>(null);
  const [activeGift, setActiveGift] = useState<string | null>(null); // 지금 열어 본 선물 ('확인'을 누를 때까지 그대로 보임)
  const giftLettersAtRef = useRef(0);
  const [actionUserFollowStatus, setActionUserFollowStatus] = useState<FollowStatus>('none');
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<UnreadFrom[]>([]);
  // 앱 사용 중 새 알림을 화면 위에 잠깐 보여주는 배너
  // stay: 누르면 아무 데도 가지 않는 배너(알림 켜짐·종료 안내) — 그 밖의 배너는 누르면 보던 창을 모두 닫고 그 화면으로
  const [toast, setToast] = useState<{ key: string; icon: string; title: string; body: string; action: () => void; stay?: boolean } | null>(null);
  const [updateReady, setUpdateReady] = useState(false); // 새 버전이 나왔는데 앱을 켜 둔 채라 아직 옛 화면일 때
  const updateDismissedRef = useRef(false);
  const [alertSoundOn, setAlertSoundOn] = useState(true);
  const seenAlertKeysRef = useRef<Set<string>>(new Set());
  const sessionStartRef = useRef<number>(0);
  // 앱이 마지막으로 화면에 나온 때: 앱이 뒤에 있는 동안 온 소식은 휴대폰 알림으로 이미 봤으므로(그 알림을 눌러 들어오기도 함)
  // 앱으로 돌아와 다시 불러와도 화면 위 배너로 또 띄우지 않는다
  const visibleSinceRef = useRef<number>(0);

  const [chatPartners, setChatPartners] = useState<(UserProfile & { lastMessage?: string; lastAt?: string; isRequest?: boolean })[]>([]);
  // 1:1 대화방 상태 (supabase/dm-requests.sql): 수락한 때 · 나간 때 — 표가 없으면(SQL 실행 전) 요청·나가기 없이 예전처럼
  const [dmThreads, setDmThreads] = useState<Record<string, { accepted_at: string | null; left_at: string | null }>>({});
  const [dmThreadsReady, setDmThreadsReady] = useState(false);
  const dmThreadsRef = useRef({ map: dmThreads, ready: dmThreadsReady, checked: false });
  dmThreadsRef.current = { ...dmThreadsRef.current, map: dmThreads, ready: dmThreadsReady };
  const [currentChatUser, setCurrentChatUser] = useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 1:1 대화방: 열면 최신 글(맨 아래)부터, 사진이 늦게 불러와져도 맨 아래 유지
  const chatStick = useStickToBottom(activeTab === 'chat' ? (currentChatUser?.id ?? 'chat') : null);
  const latestViewingUserIdRef = useRef<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [viewerRatios, setViewerRatios] = useState<Record<string, number>>({}); // 크게 보기: 사진별 실제 비율
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // 🌟 TS7006 타입 에러 방지를 위해 매개변수에 명시적 타입 지정
  const onCropComplete = (croppedArea: any, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels);
  };

  useEffect(() => {
    // 카카오톡 인앱 브라우저(특히 아이폰)에서는 로그인 버튼이 동작하지 않는 경우가 있어
    // 기본 브라우저(Safari/Chrome)로 다시 열도록 한다.
    // 단, 공유받은 글(?view=)을 보러 온 경우는 로그인 없이 볼 수 있으니 넘기지 않고, 아이패드 카카오톡은 이 넘기기를 못 해
    // '해당 페이지를 찾을 수 없습니다'가 떠서 넘기지 않는다 (로그인 창의 '⋯ → 다른 브라우저로 열기' 안내는 그대로)
    setCanOpenOutside(!!outsideHref(window.location.href));
    if (/KAKAOTALK/i.test(navigator.userAgent)) {
      setIsKakaoInApp(true);
      const isIPad = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      if (!isIPad && !new URLSearchParams(window.location.search).has('view')) {
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
      }
    }
    if (!isStorageAvailable()) setStorageBlocked(true);

    // 네이버 로그인 실패 안내
    const loginError = new URLSearchParams(window.location.search).get('login_error');
    if (loginError) {
      window.history.replaceState(window.history.state, '', window.location.pathname); // Next.js 표시는 남긴다 (아래 설명)
      if (loginError !== 'naver_cancelled') {
        setTimeout(() => alert(loginError === 'naver_not_configured'
          ? '네이버 로그인은 준비 중이에요. 카카오나 구글로 로그인해주세요.'
          : '네이버 로그인에 실패했어요. 잠시 후 다시 시도해주세요.'), 300);
      }
    }

    // 홈 화면 추가(앱 설치) 상태 확인
    const nav = navigator as Navigator & { standalone?: boolean };
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true);
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    setInstallBannerDismissed(storageGet('installBannerDismissed') === '1');
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => { setIsStandalone(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      // 이 창이 홈 화면 앱인지 알려서, 알림을 누르면 브라우저가 아닌 앱으로 열리게 한다
      const standaloneNow = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
      navigator.serviceWorker.ready.then(reg => reg.active?.postMessage({ type: 'client-info', standalone: standaloneNow })).catch(() => {});
      // 앱이 열려 있을 때 알림을 누르면: 새로고침 없이 해당 글/대화로 이동
      navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
        // 앱을 보고 있을 때 온 알림: 휴대폰 알림음 대신 '찬미예수님'
        if (e.data?.type === 'push-alert') { pushAlertRef.current(String(e.data.url || '/'), String(e.data.title || ''), String(e.data.body || '')); return; }
        // 서비스 워커: '이 알림의 대화를 지금 보고 있나요?' → 보고 있으면 휴대폰 알림을 띄우지 않는다
        if (e.data?.type === 'viewing?') { e.ports?.[0]?.postMessage(viewingRef.current(String(e.data.url || ''))); return; }
        if (e.data?.type !== 'open-url') return;
        e.ports?.[0]?.postMessage('ok');
        linkLog('message', String(e.data.url || '').replace(/^https?:\/\/[^/]+/, ''));
        // 적어 둔 목적지는 바로 지우지 않는다: 앱으로 돌아오며 새 버전으로 새로고침되면 그걸로 다시 연다
        if (!claimLink(String(e.data.url || '/'))) return;
        const link = deepLinkFromSearch(new URL(e.data.url, window.location.origin).search);
        if (link) setDeepLink(link); else goToHome();
      });
    }

    // 알림음: 설정 불러오기, 첫 터치 때 오디오 활성화
    sessionStartRef.current = Date.now();
    setAlertSoundOn(storageGet('alertSound') !== 'off');
    const unlock = () => unlockAlertSound();
    // 아이폰은 손을 뗄 때(touchend·click)여야 소리 허용으로 인정된다
    (['pointerdown', 'touchend', 'click'] as const).forEach(ev => window.addEventListener(ev, unlock, { once: true }));

    pendingLinkHandler = (url: string) => {
      if (!claimLink(url)) return; // 방금 연 목적지
      const link = deepLinkFromSearch(new URL(url, window.location.origin).search);
      if (link) setDeepLink(link);
    };
    linkLog('start', `${window.location.search || '(주소 없음)'} 마지막화면=${storageGet('activeTab') || ''}`);
    const touchMark = () => { lastTouchAt = Date.now(); };
    window.addEventListener('pointerdown', touchMark, { capture: true });
    const initialLink = deepLinkFromSearch(window.location.search);
    if (initialLink) {
      const search = window.location.search;
      // 주소만 깨끗이 하고 Next.js 가 남긴 표시(__NA)는 그대로 둔다. 지우면 그 뒤 기록에도 표시가 빠져,
      // 알림으로 연 뒤 창을 닫거나 뒤로가기를 할 때 Next.js 가 페이지를 새로 불러와 홈으로 가 버린다
      window.history.replaceState(window.history.state, '', '/');
      if (new URLSearchParams(search).has('n')) {
        if (claimLink(search)) { setDeepLink(initialLink); clearPendingLink(); }
        // 휴대폰·컴퓨터가 앱을 예전 알림 주소로 다시 띄운 경우: 그 주소는 무시하고, 방금 누른 알림이 적어 둔 곳이 있으면 그리로
        else consumePendingLink();
      }
      // 공유한 글 주소(?view=, 알림 표시 n 없음)는 알림 주소가 아니므로 늘 연다 (1분 안에 같은 주소로 두 번 열리는 것만 막음).
      // 예전엔 n 없는 주소를 모두 '예전 알림 주소'로 보고 버려서, 카카오톡으로 받은 글 링크가 홈 첫 글로만 열렸음
      else if (initialLink.view) { if (markLinkOpened(search)) setDeepLink(initialLink); }
      else consumePendingLink(search);
    } else consumePendingLink(); // 알림을 눌러 열었는데 주소에 목적지가 없으면(새로고침 등) 적어 둔 곳으로
    // 알림이 아니라 앱 아이콘을 눌러 켰으면(목적지가 없고 적어 둔 곳도 없음): 떠 있는 알림 중 가장 최근 것의 화면으로
    if (!initialLink) setTimeout(() => { if (!linkHandledAt) openShownNotification(); }, 1500);

    // 앱을 새로 켜면(휴대폰을 껐다 켬·앱을 완전히 닫았다 엶) 홈에서 시작한다.
    // 앱이 켜져 있는 동안 새로고침된 경우(새 버전 적용 등)만 보던 화면을 이어서 연다 — sessionStorage 는 앱을 닫으면 지워진다
    const sameSession = (() => {
      try { const had = sessionStorage.getItem('appOpened') === '1'; sessionStorage.setItem('appOpened', '1'); return had; } catch { return false; }
    })();
    const savedTab = sameSession ? storageGet('activeTab') as Tab | null : null;
    const savedUserId = storageGet('viewingUserId');
    const savedChatUserId = storageGet('chatUserId');

    // 새로고침이면 마지막으로 보던 화면으로 시작
    let startScreen: ScreenState = { screen: true, tab: 'home' };
    if (savedTab === 'chat' || savedTab === 'messages') startScreen = { screen: true, tab: 'messages' };
    // 다른 교우의 공간은 다시 열 때 이어서 열지 않는다 (알림을 눌러 열었는데 엉뚱한 교우 공간이 뜨지 않게) — 내 공간만
    else if (savedTab === 'profile' && savedUserId && savedUserId === storageGet('myUserId')) startScreen = { screen: true, tab: 'profile', viewingUserId: savedUserId };
    else if (savedTab === 'anon') startScreen = { screen: true, tab: 'anon' };
    else if (savedTab === 'explore') startScreen = { screen: true, tab: 'explore' };
    else if (savedTab === 'reels') startScreen = { screen: true, tab: 'reels' };
    applyScreen(startScreen);
    // 뒤로가기용 기록은 [종료 확인용 표시] → (지금 화면) 두 칸만 둔다. 이전 화면은 뒤로가기 때 앱이 직접 정한다.
    // 크롬·삼성 인터넷은 사람이 화면을 만지기 전에 쌓은 기록을 뒤로가기 때 건너뛰어 앱이 바로 꺼지므로
    // (알림을 눌러 앱이 열린 경우 등) 첫 터치 때 기록을 깐다.
    const setupHistory = () => {
      if (historyReadyRef.current) return;
      historyReadyRef.current = true;
      window.history.replaceState({ guard: true }, '');
      window.history.pushState(currentScreenRef.current, '');
    };
    const activationEvents = ['click', 'keydown', 'touchend'] as const;
    activationEvents.forEach(ev => window.addEventListener(ev, setupHistory, { capture: true, once: true }));
    // Next.js 라우터가 첫 이동 기록에 자기 표시를 남긴 뒤에 다뤄야
    // 뒤로가기 때 Next.js 가 페이지를 새로고침하지 않는다 → 한 박자 뒤에 실행
    const historyTimer = setTimeout(() => {
      if (!historyReadyRef.current) window.history.replaceState(currentScreenRef.current, '');
      // 대화방은 상대 정보가 있어야 열 수 있으므로, 상대를 다시 불러온 뒤 연다
      if (savedTab === 'chat' && savedChatUserId) {
        supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', savedChatUserId).single()
          .then(({ data }) => { if (data && !linkHandledAt) navigate({ screen: true, tab: 'chat', chatUser: data }); else if (linkHandledAt) linkLog('skip', '예전 대화방 이어 열기 (알림 화면 먼저)'); });
      }
    }, 0);
    if (startScreen.tab === 'profile' && savedUserId) setViewingUserId(savedUserId);
    const onPopState = (e: PopStateEvent) => backHandlerRef.current(e);
    window.addEventListener('popstate', onPopState);

    // 저장된 로그인으로 바로 로그인 화면을 보여 준다 (서버 확인이 늦거나 인터넷이 약해도 '로그인' 단추가 뜨지 않게)
    const savedLogin = storedAuthUser();
    if (savedLogin) { setUser(savedLogin); fetchProfile(savedLogin.id); }
    checkUser();
    fetchPosts();
    fetchBgmTracks();
    fetchIntentions();
    fetchNotices();
    try { setHiddenNotices(JSON.parse(storageGet('noticeHidden') || '[]')); } catch { /* 무시 */ }
    const savedVisibility = storageGet('postVisibility');
    if (savedVisibility === 'followers' || savedVisibility === 'private') setComposerVisibility(savedVisibility);
    const intentionTimer = setInterval(() => { if (document.visibilityState !== 'hidden') fetchIntentions(); }, 3 * 60 * 1000);

    // 앱을 닫았다가(다른 앱으로 갔다가) 다시 열면: 새 버전이면 새로고침, 아니면 글·기도지향·공지를 새로 불러오기
    let hiddenAt = 0;
    const onAppResume = async () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < 15 * 1000) { setTimeout(consumePendingLink, 400); return; } // 아주 잠깐이면 그대로
      hiddenAt = 0;
      // 알림을 눌러 돌아온 것이면 그 화면부터 (새 버전 확인을 기다리지 않는다)
      await consumePendingLink();
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await res.json();
        // 방금 알림으로 화면을 열었으면 새로고침은 다음에 (연 화면이 사라지지 않게)
        const justOpened = !!lastOpenedLink && Date.now() - lastOpenedLink.at < 15 * 1000;
        if (version && version !== 'dev' && version !== process.env.NEXT_PUBLIC_APP_VERSION && !justOpened) {
          // 로그인 토큰을 새로 받는 중이면 끝난 뒤에 새로고침 (도중에 끊기면 로그인이 풀릴 수 있음)
          await supabase.auth.getSession().catch(() => {});
          window.location.reload(); // 알림으로 가야 할 곳은 적어 둔 채로 새로고침 → 다시 열리면 그리로
          return;
        }
      } catch { /* 인터넷이 잠깐 끊겨도 아래는 진행 */ }
      setTimeout(consumePendingLink, 400);
      navigator.serviceWorker?.getRegistration('/sw.js').then(reg => reg?.update()).catch(() => {});
      fetchPosts();
      fetchIntentions();
      fetchNotices();
    };
    document.addEventListener('visibilitychange', onAppResume);
    // 앱을 화면에 켜 둔 채로 쓰는 기기(아이패드 등)는 '다시 열기'가 없어 새 버전이 안 들어온다
    // → 5분마다 확인해서 새 버전이면 '새로 고침' 띠를 띄운다 (쓰던 글이 날아가지 않게 저절로 새로고침하지는 않음)
    const checkForUpdate = async () => {
      if (document.visibilityState === 'hidden' || updateDismissedRef.current) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await res.json();
        if (version && version !== 'dev' && version !== process.env.NEXT_PUBLIC_APP_VERSION) setUpdateReady(true);
      } catch { /* 인터넷이 잠깐 끊겨도 다음에 다시 */ }
    };
    const updateTimer = setInterval(checkForUpdate, 5 * 60 * 1000);
    // 알림으로 앱이 앞으로 왔는데 화면 전환 신호가 늦거나 없을 때를 대비
    const onAppFocus = () => setTimeout(consumePendingLink, 300);
    window.addEventListener('focus', onAppFocus);
    window.addEventListener('pageshow', onAppFocus);
    // 휴대폰이 저장 공간을 정리할 때 로그인 정보가 지워지지 않게 '보관' 요청
    navigator.storage?.persist?.().catch(() => {});
    // 인터넷이 다시 연결되면 로그인 다시 확인 (토큰 새로 받기)
    const onOnline = () => { supabase.auth.getSession().catch(() => {}); };
    window.addEventListener('online', onOnline);
    fetchSponsorBanners();
    const bannerTimer = setInterval(fetchSponsorBanners, 10 * 60 * 1000);

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // 로그아웃 단추를 누른 게 아닌데 세션을 못 받은 경우(인터넷 끊김·서버 지연)는 저장된 로그인을 유지하고 잠시 뒤 다시 확인
      if (!session && event !== 'SIGNED_OUT') {
        const kept = storedAuthUser();
        if (kept) {
          setUser(prev => prev ?? kept);
          storageSet('myUserId', kept.id);
          setTimeout(() => supabase.auth.getSession().catch(() => {}), 5000);
          return;
        }
      }
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) storageSet('myUserId', currentUser.id);
      if (currentUser) {
        setShowAuthModal(false);
        fetchProfile(currentUser.id);
      } else {
        setProfile(null);
        setNeedsProfileSetup(false);
        setFeastFriends([]);
        goToHome();
      }
    });
    return () => {
      clearTimeout(historyTimer);
      window.removeEventListener('focus', onAppFocus);
      window.removeEventListener('pageshow', onAppFocus);
      window.removeEventListener('online', onOnline);
      activationEvents.forEach(ev => window.removeEventListener(ev, setupHistory, { capture: true }));
      clearInterval(intentionTimer);
      clearInterval(updateTimer);
      document.removeEventListener('visibilitychange', onAppResume);
      window.removeEventListener('popstate', onPopState);
      clearInterval(bannerTimer);
      authListener.subscription.unsubscribe();
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'profile' && viewingUserId) {
      if (latestViewingUserIdRef.current !== viewingUserId) {
        // 다른 프로필로 이동하면 이전 사람의 정보가 보이지 않도록 초기화
        setViewingProfile(null);
        setFollowData({ followers: 0, following: 0, status: 'none' });
      }
      latestViewingUserIdRef.current = viewingUserId;
      fetchViewingProfile(viewingUserId);
      fetchFollowData(viewingUserId);
      fetchUserPosts(viewingUserId); // 그 사람 글 (홈에서 불러온 것만으로는 모자랄 수 있음)
    } else if (activeTab === 'messages') {
      fetchChatPartners();
      if (user) { fetchUnreadMessages(user.id); fetchLoungeNew(user.id); }
    }
  }, [activeTab, viewingUserId, user]);

  // 고민상담을 열면 새 글 표시를 지운다
  useEffect(() => {
    if (showAnon && user) { storageSet(`anonSeenAt:${user.id}`, new Date().toISOString()); setAnonUnread(0); }
  }, [showAnon, user?.id]);
  // 영상 탭·태그됨은 필요할 때 따로 불러온다
  useEffect(() => { if (activeTab === 'reels') fetchVideoPosts(); }, [activeTab]);
  useEffect(() => {
    if (activeTab === 'profile' && profileTab === 'tagged' && viewingProfile?.handle) fetchMentionPosts(viewingProfile.handle);
  }, [activeTab, profileTab, viewingProfile?.handle]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTab === 'chat' && currentChatUser && user) {
      fetchChatMessages(currentChatUser.id);
      // 3초마다 새 메시지만 받고, 15초마다 한 번 전체를 다시 받는다(읽음·삭제·하트 반영). 앱이 뒤에 있으면 쉰다
      let tick = 0;
      interval = setInterval(() => {
        if (document.visibilityState === 'hidden') return;
        tick += 1;
        if (tick % 5 === 0) fetchChatMessages(currentChatUser.id);
        else fetchNewChatMessages(currentChatUser.id);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeTab, currentChatUser, user]);

  // 대화방에 들어가면 늘 마지막 메시지(맨 아래)부터: 사진·키보드 때문에 늦게 길어져도 2초 남짓 동안은
  // 계속 맨 아래로 붙인다. 그 사이 손으로 만지면(위로 올려 읽기 시작하면) 바로 멈춘다
  useEffect(() => {
    if (activeTab !== 'chat' || !currentChatUser) return;
    const list = chatStick.listRef.current;
    let touched = false;
    const stop = () => { touched = true; };
    list?.addEventListener('touchstart', stop, { passive: true });
    list?.addEventListener('wheel', stop, { passive: true });
    list?.addEventListener('pointerdown', stop);
    const timers = [60, 300, 700, 1200, 2000, 3000].map(ms => setTimeout(() => { if (!touched) chatStick.toBottom(false); }, ms));
    // 그 대화의 휴대폰 알림이 알림창에 남아 있으면 닫는다
    closeOsNotifications(`chat-${currentChatUser.id}`);
    return () => {
      timers.forEach(clearTimeout);
      list?.removeEventListener('touchstart', stop);
      list?.removeEventListener('wheel', stop);
      list?.removeEventListener('pointerdown', stop);
    };
  }, [activeTab === 'chat', currentChatUser?.id]);

  // 다른 대화방으로 가거나 나가면 답장·고치기·메뉴는 접는다
  useEffect(() => { setReplyTo(null); setEditingMessage(null); setMessageSheet(null); setDmCapture(null); setCaptureAsk(null); }, [currentChatUser?.id, activeTab === 'chat']);

  // 새 메시지가 오면: 맨 아래를 보고 있었거나 내가 보낸 것이면 맨 아래로 (위로 올려 읽는 중이면 그대로)
  useEffect(() => {
    if (activeTab !== 'chat') return;
    const last = chatMessages[chatMessages.length - 1];
    if (chatStick.atBottom.current || (last && last.sender_id === user?.id)) chatStick.toBottom(true);
  }, [chatMessages.length, activeTab]);

  // --- 화면 이동 + 뒤로가기 ---
  const applyScreen = (st: ScreenState) => {
    if (st.tab === 'anon') { setShowAnon(true); st = { ...st, tab: 'home' }; } // 고민상담은 이제 창으로 연다
    currentScreenRef.current = st;
    if (st.tab === 'chat' && !st.chatUser) { setActiveTab('messages'); storageSet('activeTab', 'messages'); return; }
    setActiveTab(st.tab);
    storageSet('activeTab', st.tab);
    if (st.tab === 'profile' && st.viewingUserId) { setViewingUserId(st.viewingUserId); storageSet('viewingUserId', st.viewingUserId); }
    if (st.tab === 'chat' && st.chatUser) { setCurrentChatUser(st.chatUser); storageSet('chatUserId', st.chatUser.id); }
  };

  // 새 화면으로 이동하면서 이동 기록을 남긴다 (같은 화면이면 기록을 늘리지 않음)
  const navigate = (st: ScreenState) => {
    if (composerOpenRef.current && !leaveComposer(() => navigate(st))) return; // 글을 쓰다가 다른 화면으로: 취소할지 묻고 버린 뒤 이동
    const cur = currentScreenRef.current;
    const same = cur.tab === st.tab && (cur.viewingUserId ?? null) === (st.viewingUserId ?? null) && (cur.chatUser?.id ?? null) === (st.chatUser?.id ?? null);
    // 아직 기록을 깔기 전(첫 터치 전)이면 지금 칸만 바꿔 둔다 → 첫 터치 때 그 위에 기록을 깐다
    if (same || !historyReadyRef.current) window.history.replaceState(st, '');
    else window.history.pushState(st, '');
    applyScreen(st);
  };

  const goToTab = (tab: Tab) => navigate({ screen: true, tab });
  const goToHome = () => goToTab('home');

  // 해시태그를 누르면 탐색 탭에서 그 태그로 검색
  const openHashtag = (tag: string) => {
    recordInterest(user?.id, 'tag', tag);
    setExploreQuery(`#${tag}`);
    setSelectedPostDetail(null);
    goToTab('explore');
  };

  // @핸들을 누르면 그 사람 프로필로
  const goToHandle = async (handle: string) => {
    const { data } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('handle', handle.toLowerCase()).maybeSingle();
    if (data) openProfileCard({ ...data, name: data.baptismal_name });
    else alert(`@${handle} 회원을 찾을 수 없어요.`);
  };

  const goToProfile = (targetUserId: string) => {
    linkLog('profile', `${targetUserId.slice(0, 8)} ${Date.now() - lastTouchAt < 1500 ? '손으로 누름' : '자동'}`);
    navigate({ screen: true, tab: 'profile', viewingUserId: targetUserId });
    setActionModalUser(null);
  };

  // 로그인 확인: 휴대폰에 저장된 로그인으로 바로 시작한다.
  // (예전에는 서버에 물어봐서, 앱을 켤 때 인터넷이 잠깐 안 되면 로그인이 풀린 것처럼 보였음)
  const checkUser = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    const u = session?.user ?? (error ? storedAuthUser() : null);
    if (!session && !error && storedAuthUser()) return; // 아직 토큰을 새로 받는 중 → 끝나면 알려 줌(onAuthStateChange)
    setUser(u);
    if (u) fetchProfile(u.id);
    if (!session && u) setTimeout(() => supabase.auth.getSession().catch(() => {}), 5000); // 인터넷이 돌아오면 다시
  };

  const fetchProfile = async (userId: string) => {
    let { data, error } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type, feast_day, nickname_set, birthday').eq('id', userId).single();
    // 새 칼럼이 아직 없는 경우(SQL 실행 전)에도 동작하도록
    if (error && error.code !== 'PGRST116') {
      ({ data, error } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type, feast_day, nickname_set').eq('id', userId).single());
    }
    if (error && error.code !== 'PGRST116') {
      ({ data, error } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type, feast_day').eq('id', userId).single());
    }
    if (error && error.code !== 'PGRST116') {
      ({ data, error } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', userId).single());
    }
    const { data: priv } = await supabase.from('profile_private').select('real_name').eq('id', userId).maybeSingle();
    const realName = priv?.real_name || '';
    setMyRealName(realName);
    // 생일을 안 적었으면 로그인 정보(네이버 생일 등)에 있는 생일로 채운다 (생일 칸이 있을 때만)
    const metaBirthday = birthdayFromMeta((await supabase.auth.getSession()).data.session?.user?.user_metadata?.birthday);
    if (data && (data as UserProfile).birthday === null && metaBirthday && metaBirthdayTriedRef.current !== userId) {
      metaBirthdayTriedRef.current = userId; // 한 번만 (앱을 켜는 동안 프로필을 여러 번 불러도)
      const { error: bdError } = await supabase.from('profiles').update({ birthday: metaBirthday }).eq('id', userId);
      if (!bdError) data = { ...data, birthday: metaBirthday } as typeof data;
    }
    setBirthdayInput((data as UserProfile | null)?.birthday || metaBirthday || '');
    setBirthdayPromptHidden(storageGet(`birthdayPromptHidden:${userId}`) === '1');
    if (data && data.baptismal_name && data.handle) {
      setProfile(data);
      // 기존 회원: 닉네임을 아직 정하지 않았으면 안내 (칼럼이 없으면 건너뜀)
      if ((data as UserProfile).nickname_set === false) {
        setNicknameInput(data.baptismal_name === data.handle ? '' : data.baptismal_name);
        setHandleInput(data.handle);
        setBaptismalName(realName);
        setFeastDayInput((data as UserProfile).feast_day || '');
        setNeedsProfileSetup(true);
      } else {
        setNeedsProfileSetup(false);
      }
    } else {
      setNeedsProfileSetup(true);
    }
  };

  // 알림 확인용 내 핸들 (주기적으로 도는 확인 함수에서도 최신 값을 쓰도록)
  myHandleRef.current = profile?.handle || null;
  // 핸들을 알게 되면(로그인 직후 프로필을 불러온 뒤) 나를 태그한 글도 바로 확인
  useEffect(() => {
    if (user && profile?.handle) fetchNotifications(user.id);
  }, [user, profile?.handle]);

  const fetchViewingProfile = async (userId: string) => {
    setViewingRealName('');
    if (user?.email && ADMIN_EMAILS.includes(user.email)) {
      supabase.from('profile_private').select('real_name').eq('id', userId).maybeSingle()
        .then(({ data: priv }) => { if (latestViewingUserIdRef.current === userId) setViewingRealName(priv?.real_name || ''); });
    }
    const { data } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', userId).single();
    // 응답이 늦게 도착해도 지금 보고 있는 프로필이 아니면 무시
    if (data && latestViewingUserIdRef.current === userId) setViewingProfile(data);
  };

  // 내가 target 을 팔로우하는 상태 (없음 / 요청 중 / 수락됨)
  const getFollowStatus = async (targetId: string): Promise<FollowStatus> => {
    if (!user) return 'none';
    // 중복 기록이 있어도 오류 나지 않도록 limit(1)
    const { data } = await supabase.from('follows').select('status').eq('follower_id', user.id).eq('following_id', targetId).limit(1);
    const row = data?.[0] as { status?: string } | undefined;
    if (!row) return 'none';
    return row.status === 'pending' ? 'pending' : 'accepted';
  };

  // 공간 주인의 생일·축일 (오늘이면 프로필 사진에 리본·비둘기). 내가 생일·축일을 고치면 다시
  useEffect(() => {
    if (!viewingUserId) { setSpaceDays(null); return; }
    let alive = true;
    fetchMemberDays(viewingUserId).then(d => { if (alive) setSpaceDays(d); });
    return () => { alive = false; };
  }, [viewingUserId, profile?.birthday, profile?.feast_day]);
  // 한 줄 소개 불러오기 (칼럼이 아직 없으면 조용히 비워 둠)
  useEffect(() => {
    setViewingBio(''); setBioDraft(null); setProfileTab('posts');
    if (!viewingUserId) return;
    supabase.from('profiles').select('bio').eq('id', viewingUserId).maybeSingle()
      .then(({ data, error }) => { if (!error && data) setViewingBio((data as { bio?: string | null }).bio || ''); });
  }, [viewingUserId]);
  const saveBio = async () => {
    if (!user || bioDraft === null) return;
    const bio = bioDraft.trim().slice(0, 80);
    const { error } = await supabase.from('profiles').update({ bio: bio || null }).eq('id', user.id);
    if (error) { alert(/bio|column/i.test(error.message) ? '소개 기능 준비 중이에요. (supabase/profile-bio.sql 실행 필요)' : '소개를 저장하지 못했어요.'); return; }
    setViewingBio(bio); setBioDraft(null);
  };
  // 팔로워·팔로잉 목록
  const openFollowList = async (mode: 'followers' | 'following') => {
    if (!viewingUserId) return;
    setFollowList({ mode, items: null });
    const { data } = mode === 'followers'
      ? await supabase.from('follows').select('follower_id').eq('following_id', viewingUserId).eq('status', 'accepted').limit(500)
      : await supabase.from('follows').select('following_id').eq('follower_id', viewingUserId).eq('status', 'accepted').limit(500);
    const ids = (data || []).map((r: { follower_id?: string; following_id?: string }) => (mode === 'followers' ? r.follower_id : r.following_id) as string).filter(Boolean);
    if (ids.length === 0) { setFollowList({ mode, items: [] }); return; }
    const { data: people } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').in('id', ids);
    setFollowList({ mode, items: ((people || []) as UserProfile[]).filter(p => !blockedIds.has(p.id)) });
  };

  const fetchFollowData = async (targetId: string) => {
    // 수락된 팔로우만 숫자에 포함
    const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetId).eq('status', 'accepted');
    const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId).eq('status', 'accepted');
    const status = await getFollowStatus(targetId);
    if (latestViewingUserIdRef.current !== targetId) return;
    setFollowData({ followers: followers || 0, following: following || 0, status });
  };

  // 팔로우 (승인 없이 바로) / 언팔로우
  // 로그인 + 프로필 완성이 필요한 활동 전에 확인 (안 되어 있으면 해당 창을 연다)
  const requireProfile = () => {
    if (!user) { setShowAuthModal(true); return false; }
    if (needsProfileSetup) { setSetupDismissed(false); return false; }
    return true;
  };
  // 새 게시물 (인스타그램처럼 사진 고르기부터)
  const openComposer = () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    if (activeTab !== 'home') goToHome();
    setComposerStep('pick');
    setShowComposer(true);
    composerOpenRef.current = true;
  };
  // 글쓰기를 닫거나(✕) 다른 화면으로 가면 쓰던 글은 버린다 — 쓰던 것이 있으면 '작성하던 게시글이 취소됩니다' 확인 (운영자 요청)
  const composerOpenRef = useRef(false);
  const discardComposer = () => {
    composerOpenRef.current = false;
    setShowComposer(false);
    setContent(''); setSelectedFiles([]); setPreviewUrls([]); setComposerMusic(null); clearVideo(); setComposerStickers([]); setComposerStickerOpen(false);
    tray.forEach(t => URL.revokeObjectURL(t.url)); setTray([]);
    setComposerStep('pick'); setComposerMulti(false); setComposerPhotoIdx(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  // 글쓰기를 닫을 때: 쓰던 게 없으면 바로 닫고 true. 쓰던 게 있으면 확인 창을 띄우고 false — '글 버리기'를 누르면 닫고 then 을 부른다
  const leaveComposer = (then?: () => void) => {
    const hasDraft = !!(content.trim() || selectedFiles.length || selectedVideo || composerStickers.length);
    if (!hasDraft) { discardComposer(); return true; }
    askConfirm({ title: '작성하던 게시글이 취소됩니다', message: '지금까지 쓴 글과 고른 사진이 지워져요.', ok: '글 버리기', cancel: '계속 쓰기', danger: true, icon: 'pencil' })
      .then(ok => { if (ok) { discardComposer(); then?.(); } });
    return false;
  };

  // 내가 팔로우하는 교우 (홈 피드에서 그분들 글을 먼저)
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const loadFollowing = async (userId: string) => {
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId).eq('status', 'accepted').limit(2000);
    setFollowingIds(new Set((data || []).map(f => f.following_id)));
  };
  useEffect(() => { if (user) loadFollowing(user.id); else setFollowingIds(new Set()); }, [user?.id]);

  const toggleFollow = async (targetId: string, currentStatus: FollowStatus) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    if (currentStatus === 'accepted' && !(await askConfirm({ title: '팔로우를 취소할까요?', ok: '팔로우 취소', cancel: '아니요', icon: 'userMinus' }))) return;
    if (currentStatus === 'none') {
      let { data: created, error } = await supabase.from('follows')
        .insert({ follower_id: user.id, following_id: targetId, status: 'accepted' }).select('id').single();
      // supabase/follow-no-approval.sql 실행 전에는 '요청'만 허용되므로 그 방식으로라도 저장
      if (error && /row-level security|violates/i.test(error.message)) {
        ({ data: created, error } = await supabase.from('follows')
          .insert({ follower_id: user.id, following_id: targetId, status: 'pending' }).select('id').single());
      }
      if (error) { alert(`처리하지 못했습니다.\n(${error.message})`); return; }
      if (created) sendPush('follow', created.id);
    } else {
      const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
      if (error) { alert(`처리하지 못했습니다.\n(${error.message})`); return; }
    }
    const next: FollowStatus = currentStatus === 'none' ? 'accepted' : 'none';
    loadFollowing(user.id);
    if (activeTab === 'profile' && viewingUserId === targetId) fetchFollowData(targetId);
    if (actionModalUser && actionModalUser.id === targetId) setActionUserFollowStatus(next);
  };

  // --- 차단 ---
  const fetchBlocks = async (userId: string) => {
    const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId);
    setBlockedIds(new Set((data || []).map(b => b.blocked_id)));
  };

  const blockUser = async (targetId: string) => {
    if (!user || targetId === user.id) return;
    const { error } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: targetId });
    if (error && error.code !== '23505') { alert(`차단하지 못했습니다.\n(${error.message})`); return; }
    // 서로의 팔로우 관계 정리
    await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
    await supabase.from('follows').delete().eq('follower_id', targetId).eq('following_id', user.id);
    setBlockedIds(prev => new Set(prev).add(targetId));
    setActionModalUser(null);
    if (activeTab === 'chat' && currentChatUser?.id === targetId) goToTab('messages');
  };

  const unblockUser = async (targetId: string) => {
    if (!user) return;
    await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', targetId);
    setBlockedIds(prev => { const next = new Set(prev); next.delete(targetId); return next; });
  };

  const confirmBlock = async (target: UserProfile) => {
    if ((await askConfirm(`${target.baptismal_name}님을 차단할까요?\n서로의 글과 댓글이 보이지 않고, 메시지를 받지 않으며 서로 팔로우할 수 없습니다.`))) blockUser(target.id);
  };

  // 나를 새로 팔로우한 사람 (최근 20명)
  const fetchFollowRequests = async (userId: string) => {
    const { data } = await supabase.from('follows').select('id, follower_id, created_at')
      .eq('following_id', userId).order('created_at', { ascending: false }).limit(20);
    if (!data || data.length === 0) { setFollowRequests([]); return; }
    const ids = data.map(r => r.follower_id);
    const [{ data: profiles }, { data: mine }] = await Promise.all([
      supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').in('id', ids),
      supabase.from('follows').select('following_id').eq('follower_id', userId).in('following_id', ids),
    ]);
    const byId = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const iFollow = new Set((mine || []).map(m => m.following_id));
    setFollowRequests(data.filter(r => byId[r.follower_id]).map(r => ({ id: r.id, follower: byId[r.follower_id], created_at: r.created_at, iFollow: iFollow.has(r.follower_id) })));
  };

  // 오늘이 생일·축일인 팔로잉 교우 (생일 칸이 아직 없으면 축일만)
  const fetchFeastFriends = async (userId: string) => {
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', userId).eq('status', 'accepted');
    const ids = (follows || []).map(f => f.following_id);
    if (ids.length === 0) { setFeastFriends([]); return; }
    const keys = todayFeastKeys().map(k => `"${k}"`).join(',');
    const withBirthday = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type, feast_day, birthday')
      .in('id', ids).or(`feast_day.in.(${keys}),birthday.in.(${keys})`);
    const { data } = withBirthday.error ? await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type, feast_day')
      .in('id', ids).in('feast_day', todayFeastKeys()) : withBirthday;
    setFeastFriends(((data || []) as UserProfile[]).filter(f => cheerKindOf(f)));
  };

  // 설정에서 축일을 바꾼 경우
  const updateMyFeastDay = async (value: string | null) => {
    if (!user) return false;
    const { error } = await supabase.from('profiles').update({ feast_day: value }).eq('id', user.id);
    if (error) return false;
    setProfile(prev => prev ? { ...prev, feast_day: value } : prev);
    return true;
  };

  // 알림에서 바로 맞팔로우
  const followBack = async (item: FollowRequest) => {
    await toggleFollow(item.follower.id, 'none');
    setFollowRequests(prev => prev.map(r => r.id === item.id ? { ...r, iFollow: true } : r));
  };

  // 교우 프로필을 누르면: 프로필 사진을 크게 보여 주고 그 밑에 '방문하기' (내 프로필은 바로 내 공간으로)
  // 글·댓글·사랑방 등 보던 창 위에 뜨고, 방문하기를 누를 때 그 창들을 닫는다
  const [actionUserBio, setActionUserBio] = useState('');
  const profileCardIdRef = useRef<string | null>(null);
  const openProfileCard = (target: { id: string; name?: string; avatar_url?: string | null; handle?: string | null; badge_type?: string | null }) => {
    if (!user) { setShowAuthModal(true); return; }
    if (target.id === user.id) { closeOverlaysForLink(); goToProfile(user.id); return; }
    profileCardIdRef.current = target.id;
    setActionUserBio('');
    setActionUserFollowStatus('none');
    setActionModalUser({ id: target.id, baptismal_name: target.name || '', avatar_url: target.avatar_url || undefined, handle: target.handle || undefined, badge_type: target.badge_type || undefined });
    getFollowStatus(target.id).then(st => { if (profileCardIdRef.current === target.id) setActionUserFollowStatus(st); });
    // 사진·이름이 없거나 예전 것일 수 있어 새로 불러오고, 소개 글도 (소개 칸이 아직 없으면 생략)
    supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', target.id).maybeSingle()
      .then(({ data }) => { if (data && profileCardIdRef.current === target.id) setActionModalUser(cur => (cur && cur.id === data.id ? { ...cur, ...data, avatar_url: data.avatar_url || undefined } : cur)); });
    supabase.from('profiles').select('bio').eq('id', target.id).maybeSingle()
      .then(({ data, error }) => { if (!error && data && profileCardIdRef.current === target.id) setActionUserBio((data as { bio?: string | null }).bio || ''); });
    setActionUserDays(null);
    fetchMemberDays(target.id).then(d => { if (profileCardIdRef.current === target.id) setActionUserDays(d); });
  };

  // ── 메시지 요청 · 대화방 나가기 ──
  const fetchDmThreads = async () => {
    if (!user) return;
    dmThreadsRef.current.checked = true;
    const { data, error } = await supabase.from('dm_threads').select('partner_id, accepted_at, left_at').eq('user_id', user.id);
    if (error) { setDmThreadsReady(false); dmThreadsRef.current.ready = false; return; }
    const map = Object.fromEntries((data || []).map(r => [r.partner_id as string, { accepted_at: r.accepted_at as string | null, left_at: r.left_at as string | null }]));
    setDmThreads(map); setDmThreadsReady(true);
    dmThreadsRef.current = { ...dmThreadsRef.current, map, ready: true };
  };
  const saveDmThread = async (partnerId: string, patch: { accepted_at?: string | null; left_at?: string | null }) => {
    if (!user) return false;
    const next = { ...(dmThreadsRef.current.map[partnerId] || { accepted_at: null, left_at: null }), ...patch };
    const { error } = await supabase.from('dm_threads').upsert({ user_id: user.id, partner_id: partnerId, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,partner_id' });
    if (error) {
      alert(error.code === '42P01' || error.code === 'PGRST205' || /dm_threads/.test(error.message) ? DM_REQUEST_HINT : `저장하지 못했어요.\n(${error.message})`);
      return false;
    }
    const map = { ...dmThreadsRef.current.map, [partnerId]: next };
    dmThreadsRef.current = { ...dmThreadsRef.current, map, ready: true };
    setDmThreads(map); setDmThreadsReady(true);
    return true;
  };
  // 나간 뒤의 대화만 (나가기 전 대화는 내 화면에서 보이지 않음)
  const afterLeft = (partnerId: string, iso: string) => { const l = dmThreadsRef.current.map[partnerId]?.left_at; return !l || iso > l; };
  // 메시지 요청: 상대만 보냈고, 내가 (나간 뒤로) 보낸 적도 수락한 적도 없는 대화 — 수락 전에는 읽음 표시를 하지 않는다
  const isRequestThread = (partnerId: string, msgs: { sender_id: string; created_at: string }[]) => {
    const { map, ready } = dmThreadsRef.current;
    if (!ready || !user) return false;
    const t = map[partnerId];
    const left = t?.left_at || '';
    if (t?.accepted_at && t.accepted_at >= left) return false;
    const after = msgs.filter(m => !left || m.created_at > left);
    return after.some(m => m.sender_id === partnerId) && !after.some(m => m.sender_id === user.id);
  };

  const fetchChatPartners = async () => {
    if (!user) return;
    const [{ data }] = await Promise.all([
      supabase.from('messages').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false }),
      fetchDmThreads(),
    ]);
    if (!data || data.length === 0) { setChatPartners([]); return; }

    // 상대별 가장 최근 메시지 (data는 최신순) · 나간 대화방은 그 뒤 메시지만
    const latest = new Map<string, { content: string; created_at: string }>();
    const byPartner = new Map<string, { sender_id: string; created_at: string }[]>();
    data.forEach(m => {
      const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (!partnerId || !afterLeft(partnerId, m.created_at)) return;
      if (!latest.has(partnerId)) latest.set(partnerId, { content: m.deleted_at ? '삭제된 메시지' : m.content, created_at: m.created_at });
      byPartner.set(partnerId, [...(byPartner.get(partnerId) || []), m]);
    });

    const { data: profiles } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').in('id', Array.from(latest.keys()));
    const list = (profiles || []).map(p => ({ ...p, lastMessage: chatPreview(latest.get(p.id)?.content), lastAt: latest.get(p.id)?.created_at, isRequest: isRequestThread(p.id, byPartner.get(p.id) || []) }));
    list.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
    setChatPartners(list);
  };

  const openChatRoom = (partner: UserProfile) => {
    if (!user) { setShowAuthModal(true); return; }
    setSelectedPostDetail(null); // 크게 보기에서 메시지를 누른 경우 닫기
    if (!requireProfile()) return;
    if (partner.id === user.id) return;
    if (currentChatUser?.id !== partner.id) setChatMessages([]); // 이전 상대와의 대화가 잠깐 보이지 않도록
    setOpenGroup(null); setShowNewChat(false); // 단체 채팅방·새 채팅에서 1:1 대화로
    navigate({ screen: true, tab: 'chat', chatUser: partner });
    setActionModalUser(null);
  };

  // 내 단체 채팅방 (SQL 실행 전이면 조용히 비워 둠)
  const fetchGroupChats = async () => {
    const { data, error } = await supabase.rpc('my_group_chats');
    if (!error) setGroupChats((data || []) as GroupChatRow[]);
  };
  // 관리자: 모든 단체 채팅방
  const fetchAdminGroups = async () => {
    const { data, error } = await supabase.rpc('admin_group_chats');
    setAdminGroups(error ? [] : (data || []) as AdminGroupRow[]);
  };
  viewingRef.current = (url: string) => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
    const q = new URL(url, window.location.origin).searchParams;
    const chatWith = q.get('chat'), group = q.get('group');
    const cur = currentScreenRef.current;
    if (chatWith) return cur.tab === 'chat' && cur.chatUser?.id === chatWith;
    if (group) return !!openGroup && !openGroup.adminView && openGroup.id === group;
    return false;
  };
  const openGroupChat = (id: string, adminView = false) => {
    closeOsNotifications(`group-${id}`);
    if (!user) { setShowAuthModal(true); return; }
    if (!adminView && !requireProfile()) return;
    setShowNewChat(false);
    setGroupChats(prev => prev.map(g => (g.id === id ? { ...g, unread: 0 } : g)));
    setOpenGroup({ id, adminView });
  };

  const fetchChatMessages = async (partnerId: string) => {
    if (!user) return;
    if (!dmThreadsRef.current.checked) await fetchDmThreads();
    const { data: all, error } = await supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    const data = all ? all.filter(m => afterLeft(partnerId, m.created_at)) : null; // 나가기 전 대화는 빼고
    if (data) {
      setChatMessages(data);
      // 메시지 요청이면 수락하기 전까지 읽음 표시를 하지 않는다 (상대가 읽었는지 모르게)
      if (!isRequestThread(partnerId, data) && data.some(m => m.sender_id === partnerId && !m.read_at)) markMessagesRead(partnerId);
      loadMessageHearts(data.slice(-200).map(m => m.id));
      loadDeletedOriginals(data.filter(m => m.deleted_at).map(m => String(m.id)));
    }
    else if (error) console.error('메시지를 불러오지 못했습니다', error);
  };

  // 관리자: 대화방에서도 지운 메시지의 원래 글·사진을 본다
  const [deletedOriginals, setDeletedOriginals] = useState<Record<string, { content: string | null; image_url: string | null }>>({});
  const deletedOriginalsAsked = useRef<Set<string>>(new Set());
  const loadDeletedOriginals = async (ids: string[]) => {
    if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return;
    const need = ids.filter(id => !deletedOriginalsAsked.current.has(id));
    if (need.length === 0) return;
    need.forEach(id => deletedOriginalsAsked.current.add(id));
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/deleted-messages?ids=${encodeURIComponent(need.join(','))}`, { headers: { Authorization: `Bearer ${session?.access_token}` } }).catch(() => null);
    const json = res?.ok ? await res.json().catch(() => null) : null;
    if (!json?.items) { need.forEach(id => deletedOriginalsAsked.current.delete(id)); return; } // 다음에 다시 시도
    setDeletedOriginals(prev => {
      const next = { ...prev };
      (json.items as { message_id: string; content: string | null; image_url: string | null }[]).forEach(d => { next[String(d.message_id)] = { content: d.content, image_url: d.image_url }; });
      return next;
    });
  };

  // 마지막으로 받은 메시지 뒤에 온 것만 받아 덧붙인다 (전송량 절약)
  const chatMessagesRef = useRef<Message[]>([]);
  chatMessagesRef.current = chatMessages;
  const fetchNewChatMessages = async (partnerId: string) => {
    if (!user) return;
    const list = chatMessagesRef.current;
    const last = list.length ? list[list.length - 1].created_at : null;
    if (!last) { fetchChatMessages(partnerId); return; }
    const { data } = await supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
      .gt('created_at', last)
      .order('created_at', { ascending: true });
    if (!data || data.length === 0) return;
    setChatMessages(prev => {
      const seen = new Set(prev.map(m => String(m.id)));
      const fresh = data.filter(m => !seen.has(String(m.id)));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    if (!isRequestThread(partnerId, [...list, ...data]) && data.some(m => m.sender_id === partnerId && !m.read_at)) markMessagesRead(partnerId);
  };

  // 메시지 감정 표시: 두 번 누르면 하트(다시 두 번 누르면 취소), 꾹 누르면 ❤️👍😊😂😮😢🙏 중에서 고르기. 한 사람이 한 메시지에 하나
  const [messageHearts, setMessageHearts] = useState<Record<string, { user_id: string; emoji: string }[]>>({}); // 메시지 id → 감정 표시
  const [heartPop, setHeartPop] = useState<{ id: string; emoji: string } | null>(null);
  const savingHearts = useRef<Set<string>>(new Set()); // 저장 중인 표시는 새로고침 결과로 덮지 않음
  const loadMessageHearts = async (ids: (string | number)[]) => {
    if (ids.length === 0) return;
    let rows: { message_id: string | number; user_id: string; emoji?: string }[] | null = null;
    const first = await supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', ids);
    if (!first.error) rows = first.data;
    // 감정 표시(emoji) 칸이 아직 없으면(SQL 실행 전) 예전처럼 하트만
    else if (first.error.code === '42703' || /emoji/.test(first.error.message)) {
      const second = await supabase.from('message_reactions').select('message_id, user_id').in('message_id', ids);
      if (!second.error) rows = second.data;
    }
    if (!rows) return; // 하트 SQL 실행 전이면 조용히
    const next: Record<string, { user_id: string; emoji: string }[]> = {};
    rows.forEach(r => {
      const k = String(r.message_id);
      next[k] = [...(next[k] || []), { user_id: r.user_id, emoji: r.emoji || '❤️' }];
    });
    setMessageHearts(prev => {
      savingHearts.current.forEach(k => { next[k] = prev[k] || []; });
      return next;
    });
  };
  // 내 감정 표시를 정하기: 같은 것을 다시 고르면 취소
  const setMessageReaction = async (messageId: string | number, emoji: string) => {
    if (!user) return;
    const key = String(messageId);
    const before = messageHearts[key] || [];
    const mineBefore = before.find(r => r.user_id === user.id)?.emoji;
    const remove = mineBefore === emoji;
    setMessageHearts(prev => ({ ...prev, [key]: [...(prev[key] || []).filter(r => r.user_id !== user.id), ...(remove ? [] : [{ user_id: user.id, emoji }])] }));
    if (!remove) { setHeartPop({ id: key, emoji }); setTimeout(() => setHeartPop(p => (p?.id === key ? null : p)), 700); }
    savingHearts.current.add(key);
    const { error } = remove
      ? await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', user.id)
      : emoji === '❤️' && !mineBefore
        ? await supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.id }) // 하트는 감정 표시 SQL 전에도 됨
        : await supabase.from('message_reactions').upsert({ message_id: messageId, user_id: user.id, emoji }, { onConflict: 'message_id,user_id' });
    savingHearts.current.delete(key);
    if (error && error.code !== '23505') {
      setMessageHearts(prev => ({ ...prev, [key]: before }));
      if (error.code === '42P01' || error.code === 'PGRST205') alert('메시지 하트 기능을 준비 중이에요. (관리자: supabase/message-hearts.sql 실행 필요)');
      else if (error.code === '42703' || error.code === 'PGRST204' || /emoji/.test(error.message)) alert(MESSAGE_EXTRAS_HINT);
    }
  };
  const toggleMessageHeart = (messageId: string | number) => setMessageReaction(messageId, '❤️');
  // 한 번 누름과 두 번 누름 구분 (두 번 = 0.35초 안에 같은 메시지 → 하트).
  // 내 메시지를 한 번 누르거나, 어떤 메시지든 꾹 누르면 그 메시지 바로 위에 감정 표시, 아래에 메뉴(답장·고치기·삭제)
  const [messageSheet, setMessageSheet] = useState<Message | null>(null);
  const [messageAnchor, setMessageAnchor] = useState<MenuAnchor | null>(null); // 그 메시지 자리
  const openMessageMenu = (msg: Message, el: Element | null) => { setMessageAnchor(anchorOf(el)); setMessageSheet(msg); };
  // 한 번(내 메시지만)·두 번(하트)·꾹 누르기(메뉴)·옆으로 밀기(답장) — 단체 채팅방·댓글과 같은 손동작 (lib/use-press-gestures)
  const dmRequestRef = useRef(false); // 메시지 요청을 아직 수락하지 않음 → 하트·답장 안 됨 (읽은 것이 드러나지 않게)
  const dmGestures = usePressGestures<Message>({
    keyOf: m => String(m.id),
    onTap: (m, el) => { if (m.sender_id === user?.id) openMessageMenu(m, el); },
    onDoubleTap: m => { if (!dmRequestRef.current) toggleMessageHeart(m.id); },
    onLongPress: (m, el) => openMessageMenu(m, el),
    onSwipe: m => { if (!dmRequestRef.current) startReply(m); },
  });
  // 답장: 특정 메시지를 골라 그 메시지에 대한 답이라고 표시 / 고치기: 내 메시지 내용 바꾸기 (하루 안에)
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const canEditMessage = (m: Message) => m.sender_id === user?.id && !m.deleted_at && !isMediaOnlyText(m.content) && !parseSticker(m.content) && Date.now() - new Date(m.created_at).getTime() < 24 * 3600e3;
  const startReply = (m: Message) => { setMessageSheet(null); setEditingMessage(null); setReplyTo(m); setTimeout(() => messageInputRef.current?.focus(), 50); };
  const startEditMessage = (m: Message) => { setMessageSheet(null); setReplyTo(null); setEditingMessage(m); setMessageInput(chatText(m.content)); /* 이모티콘과 함께 보낸 글은 글만 고침 */ setTimeout(() => messageInputRef.current?.focus(), 50); };
  const cancelEditMessage = () => { setEditingMessage(null); setMessageInput(''); };
  // 답장 표시를 누르면 원래 메시지로 옮겨 잠깐 강조
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const jumpToMessage = (id: string | number) => {
    const el = document.getElementById(`dm-${id}`);
    if (!el) return;
    chatStick.atBottom.current = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashMessageId(String(id));
    setTimeout(() => setFlashMessageId(f => (f === String(id) ? null : f)), 1600);
  };
  // 내가 보낸 메시지를 모두에게서 지우기: 상대방이 아직 읽기 전에만 (원래 내용은 관리자만 볼 수 있게 서버가 따로 보관)
  const deleteMessage = async (msg: Message) => {
    const what = msg.image_url ? `이 ${isVideoUrl(msg.image_url) ? '동영상' : '사진'}을` : '이 메시지를';
    if (!(await askConfirm(`${what} 모두에게서 삭제할까요?\n상대방이 아직 읽지 않아서 상대방 화면에서도 지워져요.`))) return;
    setMessageSheet(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: 'delete', id: msg.id }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (res?.status === 409 && json.read) {
      // 메뉴를 연 사이에 상대방이 읽었으면: 내 화면에서만 지울지 묻는다
      if ((await askConfirm('그사이 상대방이 메시지를 읽어서 모두에게서 지울 수 없어요.\n내 화면에서만 지울까요?'))) dmHidden.hide(String(msg.id));
      if (currentChatUser) fetchChatMessages(currentChatUser.id);
      return;
    }
    if (!res?.ok) { alert(json.error || '삭제하지 못했어요.'); return; }
    setChatMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: '', image_url: null, deleted_at: new Date().toISOString() } : m));
    if (currentChatUser) fetchChatMessages(currentChatUser.id);
  };
  const [showDeletedMessages, setShowDeletedMessages] = useState(false); // 관리자: 지워진 메시지 보기
  const [showMediaStorage, setShowMediaStorage] = useState(false); // 관리자: 사진 저장소(R2)
  const [showLetters, setShowLetters] = useState(false);       // 사연 보내기 (관리자: 사연함)
  const [letterNewCount, setLetterNewCount] = useState(0);     // 관리자: 아직 안 읽은 사연 수
  const [anonUnread, setAnonUnread] = useState(0);             // 고민상담: 마지막으로 본 뒤 새 글 수
  const [anonFocusId, setAnonFocusId] = useState<string | null>(null); // 알림으로 연 고민글
  const [anonFocusReply, setAnonFocusReply] = useState<string | null>(null); // 그 글의 새 답글

  const sendMessage = async (e?: React.FormEvent, typed?: string) => {
    e?.preventDefault();
    const newMsg = (typed ?? messageInput).trim();
    if (!user || !currentChatUser || !newMsg) return;
    // 내 메시지 고치기
    if (editingMessage) {
      const target = editingMessage;
      const keep = chatStickerParts(target.content)?.sticker; // 함께 보낸 이모티콘은 그대로
      const content = keep ? joinChatSticker(newMsg, keep) : newMsg;
      const { error } = await supabase.rpc('edit_my_message', { p_id: String(target.id), p_content: content });
      if (error) {
        alert(error.code === 'PGRST202' || error.code === '42883' ? MESSAGE_EXTRAS_HINT : /[가-힣]/.test(error.message) ? error.message.replace(/^.*?: /, '') : `고치지 못했어요.\n(${error.message})`);
        return;
      }
      setChatMessages(prev => prev.map(m => (m.id === target.id ? { ...m, content, edited_at: new Date().toISOString() } : m)));
      setEditingMessage(null);
      setMessageInput('');
      return;
    }
    const reply = replyTo;
    setMessageInput('');
    setReplyTo(null);
    dmTyping.stop();
    const row = { sender_id: user.id, receiver_id: currentChatUser.id, content: newMsg, ...(reply ? { reply_to: reply.id } : {}) };
    let { data: sent, error } = await supabase.from('messages').insert(row).select('id').single();
    // 답장 칸이 아직 없으면(SQL 실행 전) 답장 표시 없이라도 보낸다
    if (error && reply && (error.code === '42703' || error.code === 'PGRST204')) {
      ({ data: sent, error } = await supabase.from('messages').insert({ sender_id: user.id, receiver_id: currentChatUser.id, content: newMsg }).select('id').single());
      if (!error) alert(MESSAGE_EXTRAS_HINT);
    }
    if (error) {
      setMessageInput(chatText(newMsg)); // 보내지 못한 내용은 입력창에 되돌려 둔다
      setReplyTo(reply);
      alert(`메시지를 보내지 못했습니다.\n(${error.message})`);
      return;
    }
    fetchChatMessages(currentChatUser.id);
    if (sent) sendPush('message', sent.id);
  };

  // 이모티콘 보내기: 입력칸 옆 😊 → 아래 이모티콘 칸 (쓰던 글은 그대로 둔다)
  const sendDmSticker = async (s: Sticker) => {
    if (!user || !currentChatUser) return;
    const to = currentChatUser.id;
    const reply = replyTo;
    setReplyTo(null);
    const content = stickerText(s);
    let { data: sent, error } = await supabase.from('messages').insert({ sender_id: user.id, receiver_id: to, content, ...(reply ? { reply_to: reply.id } : {}) }).select('id').single();
    if (error && reply && (error.code === '42703' || error.code === 'PGRST204')) {
      ({ data: sent, error } = await supabase.from('messages').insert({ sender_id: user.id, receiver_id: to, content }).select('id').single());
    }
    if (error) { setReplyTo(reply); alert(`이모티콘을 보내지 못했습니다.\n(${error.message})`); return; }
    chatStick.atBottom.current = true;
    fetchChatMessages(to);
    if (sent) sendPush('message', sent.id);
  };
  const dmSticker = useStickerPicker(sendDmSticker);
  const dmStickerTap = useCloseStickersOnTap(dmSticker); // 이모티콘 칸이 떠 있을 때 대화 칸을 톡 누르면 닫힘
  // 보내기: 고른 이모티콘이 있으면 입력칸의 글과 함께 한 메시지로(한 말풍선에 이모티콘 + 글), 글이 없으면 이모티콘만
  const submitDm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const picked = dmSticker.picked;
    if (picked && !editingMessage) {
      const rest = (messageInputRef.current?.value ?? messageInput).trim();
      if (!rest) { await dmSticker.sendPicked(); return; }
      dmSticker.setPicked(null);
      chatStick.atBottom.current = true;
      sendMessage(undefined, joinChatSticker(rest, picked));
      return;
    }
    sendMessage(e);
  };

  // 메시지로 사진·동영상 보내기 (여러 장이면 묶어서 / 한 장씩 고르기 — components/ChatMedia)
  const dmMedia = useChatMedia({
    userId: user?.id,
    getText: () => messageInput,
    clearText: () => setMessageInput(''),
    insert: async row => {
      const to = currentChatUser?.id;
      if (!user || !to) return { id: null, error: { message: '대화 상대가 없어요' } };
      const { data, error } = await supabase.from('messages').insert({ sender_id: user.id, receiver_id: to, ...row }).select('id').single();
      if (!error) fetchChatMessages(to); // 보내는 대로 하나씩 보이게
      return { id: data?.id ?? null, error };
    },
    onSent: id => sendPush('message', String(id)),
  });
  const sendingPhoto = dmMedia.sending;
  // 입력칸 엔터: 휴대폰·태블릿은 줄바꿈(보내기 단추로 전송), 컴퓨터는 보내기 · 글에 맞춰 늘어남 (lib/use-enter-send)
  const dmLastSend = useRef({ text: '', at: 0 });
  const dmEnter = useEnterSend(typed => {
    const now = Date.now();
    if (typed.trim() === dmLastSend.current.text && now - dmLastSend.current.at < 1000) return; // 엔터 한 번에 두 번 가지 않게
    dmLastSend.current = { text: typed.trim(), at: now };
    if (dmSticker.picked && !editingMessage) submitDm(); else sendMessage(undefined, typed);
  }, messageInput);
  const dmEnterRef = dmEnter.ref;
  const setDmInputEl = useCallback((el: HTMLTextAreaElement | null) => { messageInputRef.current = el; dmEnterRef(el); }, [dmEnterRef]);
  const dmRequest = activeTab === 'chat' && !!currentChatUser && isRequestThread(currentChatUser.id, chatMessages);
  // 실제 자판으로 대화방을 볼 때 입력칸 밖에서 엔터·글자 → 입력칸으로 (메시지 요청은 빼고)
  useTypeToInput(() => messageInputRef.current, activeTab === 'chat' && !dmRequest);
  dmRequestRef.current = dmRequest;
  // 입력 중 표시 (요청을 수락하기 전에는 내가 치는 것도 알리지 않음)
  const dmTyping = useTyping(activeTab === 'chat' && currentChatUser && user ? `dm:${[user.id, currentChatUser.id].sort().join(':')}` : null, user?.id, !dmRequest);
  // 메시지 요청 수락 · 거절 · 차단
  const acceptDmRequest = async () => {
    const p = currentChatUser;
    if (!p || !(await saveDmThread(p.id, { accepted_at: new Date().toISOString() }))) return;
    markMessagesRead(p.id); // 수락하면 그때 읽음 표시
    fetchChatPartners();
    showToast('수락했어요. 이제 답장할 수 있어요');
  };
  const declineDmRequest = async (alsoBlock = false) => {
    const p = currentChatUser;
    if (!p) return;
    if (!(await askConfirm(alsoBlock
      ? `${p.baptismal_name}님을 차단할까요?\n메시지 요청이 지워지고, 앞으로 메시지를 받지 않아요.`
      : `${p.baptismal_name}님의 메시지 요청을 거절할까요?\n대화방이 목록에서 사라져요. 상대방에게는 알리지 않아요.`))) return;
    if (!(await saveDmThread(p.id, { left_at: new Date().toISOString(), accepted_at: null }))) return;
    if (alsoBlock) await blockUser(p.id);
    setChatPartners(prev => prev.filter(x => x.id !== p.id));
    setUnreadMessages(prev => prev.filter(u => u.partner.id !== p.id));
    goToTab('messages');
  };
  // 메시지 목록에서 대화방 나가기 (1:1은 내 화면에서만 지움 · 단체방은 방에서 나감)
  const [swipedRow, setSwipedRow] = useState<string | null>(null); // 메시지 목록에서 옆으로 밀어 '나가기'가 나온 줄
  const leaveDmThread = async (p: { id: string; baptismal_name: string; isRequest?: boolean }) => {
    if (!(await askConfirm(`${p.baptismal_name}님과의 대화방에서 나갈까요?\n대화 내용이 내 화면에서 모두 지워져요. (상대방 화면에는 남아요)`))) return;
    const now = new Date().toISOString();
    // 수락했던 대화는 나중에 다시 메시지가 오면 바로 보이고, 요청이던 대화는 다시 요청으로
    if (!(await saveDmThread(p.id, { left_at: now, accepted_at: p.isRequest ? null : now }))) return;
    setChatPartners(prev => prev.filter(x => x.id !== p.id));
    setUnreadMessages(prev => prev.filter(u => u.partner.id !== p.id));
  };
  const leaveGroupFromList = async (g: GroupChatRow) => {
    if (!(await askConfirm(`'${g.name}' 채팅방에서 나갈까요?\n나가면 이 방의 대화를 더 볼 수 없어요.`))) return;
    const { error } = await supabase.rpc('leave_group_chat', { p_chat: g.id });
    if (error) { alert('나가지 못했어요. 잠시 후 다시 해 주세요.'); return; }
    setGroupChats(prev => prev.filter(x => x.id !== g.id));
  };

  // 꾹 눌러 고르는 카톡식 메뉴: 복사 · 선택 복사 · 책갈피 · 캡처 · 내 화면에서만 지우기 (components/ChatSheets·ChatCapture)
  const [selectCopy, setSelectCopy] = useState<string | null>(null);
  const [showDmBookmarks, setShowDmBookmarks] = useState(false);
  const dmRoom = currentChatUser ? `dm:${currentChatUser.id}` : null;
  const dmBookmarks = useBookmarks(user?.id, dmRoom);
  const dmHidden = useHiddenMessages(user?.id, dmRoom);
  const [captureAsk, setCaptureAsk] = useState<string | null>(null);        // 캡처를 누른 메시지
  const [dmCapture, setDmCapture] = useState<Set<string> | null>(null);     // 대화 골라서 캡처하는 중
  const [captured, setCaptured] = useState<{ blob: Blob; title: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const dmCaptureItem = (m: Message): CaptureItem => ({
    id: String(m.id),
    name: m.sender_id === user?.id ? undefined : currentChatUser?.baptismal_name || '상대',
    mine: m.sender_id === user?.id,
    time: m.created_at,
    text: m.deleted_at ? '삭제된 메시지' : isMediaOnlyText(m.content) ? '' : chatPreview(m.content),
    photos: m.deleted_at ? undefined : m.images?.length ? m.images : m.image_url && !isVideoUrl(m.image_url) ? [m.image_url] : undefined,
    video: !m.deleted_at && isVideoUrl(m.image_url),
  });
  const makeDmCapture = async (ids: string[]) => {
    const pick = chatMessages.filter(m => ids.includes(String(m.id)) && !dmHidden.hidden.has(String(m.id)));
    if (pick.length === 0) { alert('캡처할 메시지가 없어요.'); return; }
    setCapturing(true);
    try {
      setCaptured({ blob: await renderCapture(pick.map(dmCaptureItem), `${currentChatUser?.baptismal_name || '교우'}님과의 대화`, { mine: '#5f7d55', bg: '#f5f5f4' }), title: '가톨릭그램 대화' });
      setDmCapture(null);
    } catch { alert('캡처하지 못했어요. 잠시 후 다시 해 주세요.'); }
    finally { setCapturing(false); }
  };

  const handleKakaoLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao', options: { redirectTo: 'https://catholicgram-dey7.vercel.app/auth/signin-complete', skipBrowserRedirect: true, ...(switchingAccount ? { queryParams: { prompt: 'login' } } : {}) },
    });
    if (error || !data?.url) {
      alert('로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    window.location.href = data.url;
  };

  // 내 공간: 로그아웃 · 다른 계정으로 로그인 (로그아웃한 뒤 로그인 창을 열고, 카카오·구글·네이버 모두 계정을 새로 고르게 한다)
  const logout = async () => {
    if (!(await askConfirm('로그아웃할까요?'))) return;
    await signOutAndClear();
    goToHome();
  };
  const switchAccount = async () => {
    if (!(await askConfirm('지금 계정에서 로그아웃하고 다른 계정으로 로그인할까요?'))) return;
    await signOutAndClear();
    goToHome();
    setSwitchingAccount(true);
    setShowAuthModal(true);
  };

  const handleGoogleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: 'https://catholicgram-dey7.vercel.app/auth/signin-complete', skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error || !data?.url) {
      alert('로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    window.location.href = data.url;
  };

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!nicknameInput.trim() || !handleInput.trim() || !baptismalName.trim()) {
      setSetupError('닉네임, 고유 핸들, 이름+세례명을 모두 입력해주세요.');
      return;
    }

    const cleanHandle = handleInput.trim().replace(/^@/, '').toLowerCase();
    const nickname = nicknameInput.trim();
    setLoading(true);
    setSetupError('');

    const feastDay = isValidFeastDay(feastDayInput) ? feastDayInput : null;
    const birthday = isValidFeastDay(birthdayInput) ? birthdayInput : null;
    // 이메일은 보내지 않는다: 서버가 로그인 정보에서 채우고, 앱에서는 읽을 수 없다 (supabase/profiles-email-private.sql)
    const row = { id: user.id, baptismal_name: nickname, handle: cleanHandle };
    let { error } = await supabase.from('profiles').upsert([{ ...row, feast_day: feastDay, nickname_set: true, birthday }]);
    // 새 칼럼이 아직 없는 경우(SQL 실행 전)에는 있는 칼럼만 저장
    if (error?.code === 'PGRST204' || error?.code === '42703') ({ error } = await supabase.from('profiles').upsert([{ ...row, feast_day: feastDay, nickname_set: true }]));
    if (error?.code === 'PGRST204' || error?.code === '42703') ({ error } = await supabase.from('profiles').upsert([{ ...row, feast_day: feastDay }]));
    if (error?.code === 'PGRST204' || error?.code === '42703') ({ error } = await supabase.from('profiles').upsert([row]));

    if (!error) {
      // 실명은 비공개 표에, 내가 쓴 글/댓글의 작성자 이름은 새 닉네임으로
      await supabase.from('profile_private').upsert({ id: user.id, real_name: baptismalName.trim(), updated_at: new Date().toISOString() });
      await supabase.rpc('sync_my_author_name');
      setMyRealName(baptismalName.trim());
      setProfile(prev => ({ ...(prev || {}), id: user.id, baptismal_name: nickname, handle: cleanHandle, feast_day: feastDay, nickname_set: true, ...(prev?.birthday !== undefined || birthday ? { birthday } : {}) }));
      setNeedsProfileSetup(false);
      setProfileEditMode(false);
      fetchPosts();
    } else {
      setSetupError(error.code === '23505' ? '이미 사용 중인 핸들(@아이디)입니다. 다른 아이디를 입력해주세요.' : '저장하지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    setLoading(false);
  };

  // 설정 → 프로필 정보 수정
  const openProfileEdit = () => {
    if (!profile) return;
    setNicknameInput(profile.baptismal_name);
    setHandleInput(profile.handle || '');
    setBaptismalName(myRealName);
    setFeastDayInput(profile.feast_day || '');
    setBirthdayInput(profile.birthday || '');
    setSetupError('');
    setShowFancyName(false);
    setProfileEditMode(true);
    setShowSettings(false);
  };

  // 내가 누른 기도·공감 (누른 버튼은 색이 채워져 보임)
  useEffect(() => {
    if (!user?.id) { setMyPostReactions(new Set()); return; }
    supabase.from('post_reactions').select('post_id, reaction_type').eq('user_id', user.id).limit(2000)
      .then(({ data }) => setMyPostReactions(new Set((data || []).map(r => `${r.post_id}:${r.reaction_type}`))));
  }, [user?.id, posts.length]);

  // --- 글 목록: 한꺼번에 다 받지 않고 필요한 만큼만 (전송량 절약) ---
  // 받아 온 글은 posts 한곳에 모아 두고(홈·내 공간·영상·탐색이 함께 씀), 홈은 최근 글부터 30개씩 더 불러온다.
  const FEED_PAGE = 30;
  const [feedOldest, setFeedOldest] = useState<string | null>(null); // 홈에서 지금까지 불러온 가장 오래된 글 시각
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const authorCacheRef = useRef<Record<string, { avatar_url?: string; handle?: string; badge_type?: string; name?: string }>>({});

  // 글쓴이 정보(현재 닉네임·사진·뱃지)를 붙이고 댓글 수도 불러온다
  const decoratePosts = async (rows: Post[]): Promise<Post[]> => {
    const list = rows.filter(p => !(p as Post & { is_story?: boolean }).is_story); // 스토리는 피드·내 공간에 안 나옴
    if (list.length === 0) return [];
    fetchCommentCounts(list.map(p => p.id));
    const need = Array.from(new Set(list.map(p => p.user_id).filter(id => id && !authorCacheRef.current[id])));
    if (need.length > 0) {
      const { data } = await supabase.from('profiles').select('id, avatar_url, handle, badge_type, baptismal_name').in('id', need);
      (data || []).forEach((p: { id: string; avatar_url?: string; handle?: string; badge_type?: string; baptismal_name?: string }) => {
        authorCacheRef.current[p.id] = { avatar_url: p.avatar_url, handle: p.handle, badge_type: p.badge_type, name: p.baptismal_name };
      });
    }
    return list.map(p => {
      const a = authorCacheRef.current[p.user_id];
      return { ...p, author_name: a?.name || p.author_name, avatar_url: a?.avatar_url, handle: a?.handle, badge_type: a?.badge_type };
    });
  };
  // 모아 둔 글에 합치기 (같은 글은 새 내용으로). window 를 주면 그 시간 범위 안에서 사라진 글(지워진 글)은 뺀다
  const mergePosts = (list: Post[], window?: { from: string; ids: Set<string> }) => {
    setPosts(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      if (window) prev.forEach(p => { if (p.created_at >= window.from && !window.ids.has(p.id)) map.delete(p.id); });
      list.forEach(p => map.set(p.id, p));
      return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  };

  // 홈 첫 화면 (새로고침할 때도): 최근 글 30개
  const fetchPosts = async () => {
    fetchStories();
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(FEED_PAGE);
    if (!data) return;
    const rows = data as Post[];
    const oldest = rows.length ? rows[rows.length - 1].created_at : null;
    mergePosts(await decoratePosts(rows), oldest ? { from: oldest, ids: new Set(rows.map(r => r.id)) } : undefined);
    setFeedOldest(prev => (prev && oldest && prev < oldest ? prev : oldest)); // 이미 더 불러온 게 있으면 유지
    setFeedHasMore(prev => (rows.length < FEED_PAGE ? false : prev || true));
  };
  // 홈에서 아래로 내리면: 그보다 오래된 글 30개 더
  const loadMorePosts = async () => {
    if (!feedHasMore || feedLoadingMore || !feedOldest) return;
    setFeedLoadingMore(true);
    const { data } = await supabase.from('posts').select('*').lt('created_at', feedOldest).order('created_at', { ascending: false }).limit(FEED_PAGE);
    if (data) {
      const rows = data as Post[];
      mergePosts(await decoratePosts(rows));
      if (rows.length) setFeedOldest(rows[rows.length - 1].created_at);
      setFeedHasMore(rows.length >= FEED_PAGE);
    }
    setFeedLoadingMore(false);
  };
  // 한 사람의 공간: 그 사람 글만 (최근 300개)
  const fetchUserPosts = async (userId: string) => {
    const { data } = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(300);
    if (data) mergePosts(await decoratePosts(data as Post[]));
  };
  // 영상 탭: 영상 글만 (최근 100개)
  const fetchVideoPosts = async () => {
    const { data } = await supabase.from('posts').select('*').not('video_url', 'is', null).order('created_at', { ascending: false }).limit(100);
    if (data) mergePosts(await decoratePosts(data as Post[]));
  };
  // 태그됨: 그 사람(@아이디)이 언급된 글 (최근 100개)
  const fetchMentionPosts = async (handle: string) => {
    const { data } = await supabase.from('posts').select('*').ilike('content', `%@${handle}%`).order('created_at', { ascending: false }).limit(100);
    if (data) mergePosts(await decoratePosts(data as Post[]));
  };
  // 글 하나 (알림으로 연 오래된 글 등)
  const ensurePost = async (postId: string): Promise<Post | null> => {
    const { data } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
    if (!data) return null;
    const [p] = await decoratePosts([data as Post]);
    if (p) mergePosts([p]);
    return p || (data as Post);
  };

  // 스토리 (24시간 안, 게시글에 is_story 표시)
  const [storyPosts, setStoryPosts] = useState<Post[]>([]);
  const [storiesUnavailable, setStoriesUnavailable] = useState(false);
  const [storyOpenRequest, setStoryOpenRequest] = useState<string | null>(null);
  // 앱을 보고 있는 동안 스토리를 3분마다 새로 (새로 올라온 스토리가 보이게)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') fetchStories(); }, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const fetchStories = async () => {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { data, error } = await supabase.from('posts').select('*').eq('is_story', true).gt('created_at', since).order('created_at', { ascending: true }).limit(300);
    if (error) { setStoriesUnavailable(true); return; }
    setStoriesUnavailable(false);
    setStoryPosts((data || []) as Post[]);
    fetchCommentCounts((data || []).map(p => p.id));
  };
  const deleteStory = async (id: string) => {
    const result = await callPostApi({ action: 'delete', id });
    if (result.error) { alert(result.error); return false; }
    setStoryPosts(prev => prev.filter(p => p.id !== id));
    return true;
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    if (!content.trim() && selectedFiles.length === 0 && !selectedVideo && composerStickers.length === 0) return;
    setLoading(true);
    const uploadedUrls: string[] = [];
    for (const file of selectedFiles) {
      const compressed = await imageCompression(file, PHOTO_OPTIONS);
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.jpg`;
      try {
        uploadedUrls.push(await uploadMedia(compressed, { kind: 'posts', ext: 'jpg', contentType: 'image/jpeg', bucket: 'community-images', path: fileName }));
      } catch { /* 이 사진만 건너뜀 */ }
    }
    // 숏폼 영상: 미리보기 이미지 + 영상 올리기 (영상은 내 폴더에)
    let videoFields: { video_url: string; video_poster: string | null; video_overlays?: VideoOverlays | null } | null = null;
    if (selectedVideo) {
      setVideoStatus('영상 올리는 중...');
      const poster = await makeVideoPoster(selectedVideo);
      let posterUrl: string | null = null;
      if (poster) {
        const posterName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_poster.jpg`;
        posterUrl = await uploadMedia(poster, { kind: 'posters', ext: 'jpg', contentType: 'image/jpeg', bucket: 'community-images', path: posterName }).catch(() => null);
      }
      const ext = selectedVideo.type.includes('webm') ? 'webm' : selectedVideo.type.includes('quicktime') ? 'mov' : 'mp4';
      const videoName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      let videoUrl: string | null = null;
      let videoError: { message: string } | null = null;
      try {
        videoUrl = await uploadMedia(selectedVideo, { kind: 'videos', ext, contentType: selectedVideo.type || 'video/mp4', bucket: 'post-videos', path: videoName });
      } catch (err) { videoError = { message: err instanceof Error ? err.message : String(err) }; }
      setVideoStatus('');
      if (videoError || !videoUrl) {
        const msg = videoError?.message || '';
        alert(/bucket|not found/i.test(msg)
          ? '영상 기능을 준비 중이에요. (관리자: supabase/videos.sql 실행 필요)'
          : /size|large|exceed|413/i.test(msg)
            ? `영상이 너무 커요. ${MAX_VIDEO_MB}MB 이하로 줄여서 올려주세요.`
            : '영상을 올리지 못했어요. 잠시 후 다시 시도해주세요.');
        setLoading(false);
        return;
      }
      videoFields = {
        video_url: videoUrl,
        video_poster: posterUrl,
        ...(hasOverlays(composerOverlays) ? { video_overlays: composerOverlays } : {}),
      };
    }
    const author = profile?.baptismal_name || '교우';
    const row = { content: joinPostStickers(content, composerStickers), images: uploadedUrls, user_id: user.id, author_name: author, ...(videoFields || {}), ...(composerVisibility !== 'public' ? { visibility: composerVisibility } : {}) };
    let { data: created, error } = await supabase.from('posts').insert([composerMusic ? { ...row, music: composerMusic.value, music_title: composerMusic.title } : row]).select('id');
    // 음악 칼럼이 아직 없는 경우(SQL 실행 전)에는 음악 없이 올린다
    if (error && composerMusic && (error.code === 'PGRST204' || error.code === '42703')) {
      ({ data: created, error } = await supabase.from('posts').insert([row]).select('id'));
      alert('글은 올렸지만 음악은 저장하지 못했어요.\n(관리자: Supabase에서 supabase/music.sql 을 실행해야 음악이 저장됩니다)');
    }
    if (error && composerVisibility !== 'public' && (error.code === 'PGRST204' || error.code === '42703') && /visibility/.test(error.message)) {
      alert(VISIBILITY_SQL_HINT);
      setLoading(false);
      return;
    }
    if (error && videoFields && (error.code === 'PGRST204' || error.code === '42703')) {
      alert('영상 기능을 준비 중이에요. (관리자: supabase/videos.sql 실행 필요)');
      setLoading(false);
      return;
    }
    if (!error) {
      // 글에서 @태그한 사람에게 휴대폰 알림
      if (created?.[0]?.id && extractMentions(content).length > 0) sendPush('post', created[0].id);
      setContent(''); setSelectedFiles([]); setPreviewUrls([]); setComposerMusic(null); clearVideo(); setComposerStickers([]); setComposerStickerOpen(false);
      tray.forEach(t => URL.revokeObjectURL(t.url)); setTray([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowComposer(false);
      composerOpenRef.current = false;
      fetchPosts(); goToHome();
    }
    setLoading(false);
  };

  // 고른 음악(유튜브·배경음악)의 구간 표시·다시 고치기 (글쓰기·글 고치기·영상 꾸미기)
  const musicRangeLabel = (value: string) => {
    const m = parsePostMusic(value);
    return m && m.clip ? `${Math.floor(m.start / 60)}:${String(m.start % 60).padStart(2, '0')}부터 ${m.clip}초` : null;
  };
  // 구간을 고칠 수 있는 음악인지 (배경음악은 목록에 아직 있어야 함)
  const canAdjustMusic = (value: string) => {
    const m = parsePostMusic(value);
    return m?.kind === 'youtube' || (m?.kind === 'bgm' && bgmTracks.some(t => t.id === m.trackId));
  };
  const openMusicSegment = (target: 'composer' | 'edit', music: { value: string; title: string }) => {
    const m = parsePostMusic(music.value);
    if (!m) return;
    if (m.kind === 'youtube') setMusicSegment({ videoId: m.videoId, title: music.title, start: m.start, clip: m.clip });
    else {
      const track = bgmTracks.find(t => t.id === m.trackId);
      if (!track) return;
      setMusicSegment({ trackId: track.id, audioUrl: track.url, title: music.title, start: m.start, clip: m.clip });
    }
    setMusicPickerFor(target);
    setShowMusicPicker(true);
  };

  const fetchNotices = async () => {
    const query = (cols: string) => supabase.from('announcements').select(cols).order('created_at', { ascending: false }).limit(50);
    let { data, error } = await query('id, title, content, pinned, popup, pushed_at, created_at');
    // 팝업 칸이 아직 없으면(announcement-popup.sql 실행 전) 예전 방식으로
    if (error) ({ data, error } = await query('id, title, content, pinned, pushed_at, created_at'));
    setNotices((data || []) as unknown as Notice[]);
  };
  const hideNotice = (id: string) => {
    const next = [...hiddenNotices, id].slice(-100);
    setHiddenNotices(next);
    storageSet('noticeHidden', JSON.stringify(next));
  };
  // 홈 맨 위 공지·팝업 공지는 올린 뒤 하루 동안만 (지난 공지는 공지사항 목록에서 볼 수 있음)
  const homeNotice = notices.find(n => n.pinned && noticeShownNow(n) && !hiddenNotices.includes(n.id));
  // 앱에 들어오면 띄우는 팝업 공지: 가장 최근 것 하나, '다시 보지 않기' 전까지 들어올 때마다
  const popupNotice = notices.find(n => n.popup && noticeShownNow(n) && !hiddenNotices.includes(n.id) && !popupClosed.includes(n.id));
  const closePopup = (id: string) => setPopupClosed(prev => [...prev, id]);

  const isAdminRef = useRef(false);
  const fetchIntentions = async () => {
    // 올린 사람은 관리자만 안다: 교우는 보기(prayer_intentions_feed)로 이름 없이 읽는다 (supabase/intention-private.sql)
    if (!isAdminRef.current) {
      const { data, error } = await supabase.from('prayer_intentions_feed').select('id, title, content, created_at, is_mine')
        .eq('prayer_date', todayKst()).order('created_at', { ascending: true }).limit(300);
      if (!error) {
        setIntentions((data || []) as unknown as typeof intentions);
        loadIntentionPrayers((data || []).map(i => i.id as string));
        return;
      }
      // 보기가 아직 없으면(SQL 실행 전) 테이블에서 읽는다 (이름은 화면에 보이지 않음)
    }
    const query = (cols: string) => supabase.from('prayer_intentions').select(cols)
      .eq('prayer_date', todayKst()).order('created_at', { ascending: true }).limit(300);
    let { data, error } = await query('id, user_id, author_name, title, content, created_at');
    // title 칼럼이 아직 없으면(SQL 실행 전) 예전 칼럼만
    if (error) ({ data } = await query('id, user_id, author_name, content, created_at'));
    setIntentions((data || []) as unknown as typeof intentions);
    loadIntentionPrayers(((data || []) as unknown as { id: string }[]).map(i => i.id));
  };

  // 기도지향 "함께 기도합니다" 횟수와 내가 눌렀는지
  const [intentionPrayers, setIntentionPrayers] = useState<Record<string, { count: number; mine: boolean }>>({});
  const loadIntentionPrayers = async (ids: string[]) => {
    if (ids.length === 0) { setIntentionPrayers({}); return; }
    const { data, error } = await supabase.from('intention_prayers').select('intention_id, user_id').in('intention_id', ids);
    if (error) return; // SQL 실행 전이면 조용히 넘어감
    const next: Record<string, { count: number; mine: boolean }> = {};
    ids.forEach(id => { next[id] = { count: 0, mine: false }; });
    (data || []).forEach(r => {
      const e = next[r.intention_id];
      if (!e) return;
      e.count += 1;
      if (r.user_id === userIdRef.current) e.mine = true;
    });
    setIntentionPrayers(next);
  };
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;
  // 로그인 정보가 늦게 오면 '내가 눌렀는지'를 다시 계산
  useEffect(() => { if (user && intentions.length) loadIntentionPrayers(intentions.map(i => i.id)); }, [user?.id]);
  const toggleIntentionPrayer = async (intentionId: string) => {
    if (!user) { setShowAuthModal(true); return; }
    const cur = intentionPrayers[intentionId] || { count: 0, mine: false };
    const next = { count: Math.max(0, cur.count + (cur.mine ? -1 : 1)), mine: !cur.mine };
    setIntentionPrayers(prev => ({ ...prev, [intentionId]: next })); // 바로 보이게
    const { error } = cur.mine
      ? await supabase.from('intention_prayers').delete().eq('intention_id', intentionId).eq('user_id', user.id)
      : await supabase.from('intention_prayers').insert({ intention_id: intentionId, user_id: user.id });
    if (error && error.code !== '23505') {
      setIntentionPrayers(prev => ({ ...prev, [intentionId]: cur }));
      alert(error.code === '42P01' || error.code === 'PGRST205'
        ? '함께 기도하기 기능을 준비 중이에요. (관리자: supabase/intention-prayers.sql 실행 필요)'
        : '처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const myIntention = user ? intentions.find(i => i.is_mine === true || (i.is_mine === undefined && i.user_id === user.id)) : undefined;
  const visibleIntentions = intentions.filter(i => !i.blocked && !(i.user_id && blockedIds.has(i.user_id)));

  const saveIntention = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    const title = intentionTitleInput.trim().slice(0, 30);
    const content = intentionInput.trim().slice(0, 100);
    if (!title || !content) return;
    setIntentionSaving(true);
    const row = { user_id: user.id, author_name: profile?.baptismal_name || '교우', prayer_date: todayKst() };
    let { error } = await supabase.from('prayer_intentions').upsert({ ...row, title, content }, { onConflict: 'user_id,prayer_date' });
    // title 칼럼이 없으면 내용 앞에 기도지향을 붙여 저장
    if (error?.code === 'PGRST204' || error?.code === '42703') {
      ({ error } = await supabase.from('prayer_intentions').upsert({ ...row, content: `${title} — ${content}`.slice(0, 100) }, { onConflict: 'user_id,prayer_date' }));
    }
    setIntentionSaving(false);
    if (error) {
      alert(error.code === '42P01' || error.code === 'PGRST205'
        ? '기도지향 기능을 준비 중이에요. (관리자: supabase/prayer-intentions.sql 실행 필요)'
        : '기도지향을 올리지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }
    setIntentionInput('');
    setIntentionTitleInput('');
    setIntentionEditing(false);
    fetchIntentions();
  };

  const deleteIntention = async (id: string) => {
    if (!(await askConfirm('오늘의 기도지향을 내릴까요?'))) return;
    await supabase.from('prayer_intentions').delete().eq('id', id);
    fetchIntentions();
  };

  const fetchBgmTracks = async () => {
    const { data } = await supabase.from('bgm_tracks').select('id, title, artist, url, active, sort').eq('active', true).order('sort').order('created_at');
    // 관리자가 올린 곡 + 앱에 기본으로 들어 있는 곡
    setBgmTracks([...((data || []) as BgmTrack[]), ...BUILTIN_BGM]);
  };

  // 사진을 눌러 게시물을 열면 음악이 바로 재생된다.
  // (휴대폰 브라우저는 사용자가 누른 순간에만 소리 재생을 허용하므로 누른 즉시 재생을 시작)
  const openPostViewer = (post: Post, imageIndex = 0) => {
    setViewerTextOpen(false);
    setSelectedPostDetail(post);
    setDetailImageIndex(imageIndex);
    const music = parsePostMusic(post.music);
    if (music?.kind === 'bgm') {
      const track = bgmTracks.find(t => t.id === music.trackId);
      if (!track) return;
      if (!bgmAudioRef.current) bgmAudioRef.current = new Audio();
      const audio = bgmAudioRef.current;
      bgmRangeRef.current = { start: music.start, clip: music.clip };
      audio.src = track.url;
      audio.loop = true;
      // 고른 구간이 있으면 그 부분만 반복 (시작 위치는 곡 정보를 읽은 뒤 맞춤)
      audio.onloadedmetadata = () => { if (music.start) audio.currentTime = music.start; };
      audio.ontimeupdate = () => {
        const r = bgmRangeRef.current;
        if (r?.clip && (audio.currentTime > r.start + r.clip || audio.currentTime < r.start - 1)) audio.currentTime = r.start;
      };
      audio.play().then(() => setBgmPlaying(true)).catch(() => setBgmPlaying(false));
    }
  };
  const bgmRangeRef = useRef<{ start: number; clip?: number } | null>(null);

  const toggleBgm = () => {
    const audio = bgmAudioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().then(() => setBgmPlaying(true)).catch(() => {});
    else { audio.pause(); setBgmPlaying(false); }
  };

  const videoJobRef = useRef(0); // 고른 영상 차례 (뒤에서 용량을 줄이는 중에 빼거나 바꾸면 그 작업은 버린다)
  const clearVideo = () => {
    videoJobRef.current++;
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setSelectedVideo(null); setVideoPreviewUrl(null); setVideoStatus(''); setComposerOverlays(null); setShowVideoEditor(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  // 숏폼 영상 고르기: 1분 이하인지 확인하고, 너무 크면 화질을 줄여 본다
  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const info = await getVideoInfo(file).catch(() => null);
    if (!info) { alert('이 영상은 읽을 수 없어요. 다른 영상을 골라주세요.'); return; }
    if (info.duration > MAX_VIDEO_SECONDS + 0.5) { alert(`1분 이하의 영상만 올릴 수 있어요.\n(고른 영상: ${Math.round(info.duration)}초)`); return; }
    // 고르자마자 그 영상을 보여 준다. 영상은 사진 대신 하나만 (배경음악은 함께 넣을 수 있음)
    setSelectedFiles([]); setPreviewUrls([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    const job = ++videoJobRef.current;
    const previewUrl = URL.createObjectURL(file);
    setSelectedVideo(file);
    setVideoPreviewUrl(previewUrl);
    setComposerOverlays(null);
    setShowVideoEditor(true); // 고르자마자 꾸미기 화면
    if (file.size <= SHRINK_OVER_MB * 1024 * 1024) { setVideoStatus(''); return; }
    // 큰 영상은 720p 로 줄여서 올린다 (보는 사람마다 전송량이 들므로). 영상 길이만큼 걸리므로 뒤에서 줄이고,
    // 그동안 꾸미기·글쓰기를 할 수 있다. 다 줄면 '공유'가 켜진다. 줄이지 못하면 원본이 한도 안일 때만 그대로
    setVideoStatus('영상 용량을 줄이는 중... 0%');
    const stale = () => videoJobRef.current !== job;
    const shrunk = await shrinkVideo(file, r => { if (!stale()) setVideoStatus(`영상 용량을 줄이는 중... ${Math.round(r * 100)}%`); }, stale).catch(() => null);
    if (stale()) return; // 그사이 영상을 빼거나 다른 것으로 바꿈
    setVideoStatus('');
    const video = shrunk && shrunk.size < file.size ? shrunk : file;
    if (video.size > MAX_VIDEO_MB * 1024 * 1024) {
      alert(`영상이 너무 커요 (${Math.round(file.size / 1024 / 1024)}MB).\n휴대폰 카메라 설정에서 화질을 낮추거나(예: 720p), 더 짧게 찍어서 올려주세요.`);
      videoJobRef.current++;
      URL.revokeObjectURL(previewUrl);
      setSelectedVideo(null); setVideoPreviewUrl(null); setComposerOverlays(null); setShowVideoEditor(false);
      return;
    }
    setSelectedVideo(video); // 미리보기는 원본 그대로 (꾸미던 화면이 다시 불러와지지 않게)
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    // 사진은 최대 MAX_PHOTOS(10)장: 여러 번 나눠 골라도 이어서 추가됨
    const picked = Array.from(e.target.files);
    e.target.value = '';
    if (picked.length === 0) return;
    clearVideo();
    // 새 게시물 1단계: 고른 사진은 모두 아래 사진 칸에 미리보기로 모은다
    //  - 한 장만 골랐으면 그 사진을 고른 상태로
    //  - 사진첩에서 여러 장을 한꺼번에 골랐으면 '여러 장 선택'으로 저절로 바꾸고, 고른 사진을 모두(최대 장수까지) 게시물에
    if (showComposer && composerStep === 'pick') {
      const items = picked.slice(0, 60).map(f => ({ file: f, url: URL.createObjectURL(f) }));
      setTray(prev => [...items, ...prev].slice(0, 80));
      if (!composerMulti && items.length === 1) {
        setSelectedFiles([items[0].file]); setPreviewUrls([items[0].url]); setComposerPhotoIdx(0);
        return;
      }
      // 이미 '여러 장 선택' 중이면 고른 사진 뒤에 이어서, 아니면 이번에 고른 사진들로
      const kept = composerMulti ? selectedFiles.length : 0;
      const add = items.slice(0, Math.max(0, MAX_PHOTOS - kept));
      if (!composerMulti) setComposerMulti(true);
      if (add.length > 0) {
        setSelectedFiles(prev => [...(composerMulti ? prev : []), ...add.map(t => t.file)]);
        setPreviewUrls(prev => [...(composerMulti ? prev : []), ...add.map(t => t.url)]);
        setComposerPhotoIdx(composerMulti ? kept : 0);
      }
      if (items.length > add.length) {
        alert(add.length === 0
          ? `사진은 한 게시물에 ${MAX_PHOTOS}장까지예요.\n이미 ${MAX_PHOTOS}장을 골랐어요. 아래 사진 칸에서 뺀 뒤 다시 골라 주세요.`
          : `사진은 한 게시물에 ${MAX_PHOTOS}장까지예요.\n고른 사진 중 앞의 ${add.length}장을 넣었어요. 아래 사진 칸에서 바꿀 수 있어요.`);
      }
      return;
    }
    const room = MAX_PHOTOS - selectedFiles.length;
    if (picked.length > room) alert(`사진은 한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요.`);
    const added = picked.slice(0, Math.max(0, room));
    setSelectedFiles(prev => [...prev, ...added]);
    setPreviewUrls(prev => [...prev, ...added.map(f => URL.createObjectURL(f))]);
  };
  // 사진 칸에서 미리보기를 눌렀을 때: 한 장 모드는 그 사진으로 바꾸고, 여러 장 모드는 고르기/크게 보기/빼기
  const pickFromTray = (item: { file: File; url: string }) => {
    const pos = selectedFiles.indexOf(item.file);
    if (!composerMulti) { setSelectedFiles([item.file]); setPreviewUrls([item.url]); setComposerPhotoIdx(0); return; }
    const shown = Math.min(composerPhotoIdx, Math.max(0, selectedFiles.length - 1));
    if (pos < 0) {
      if (selectedFiles.length >= MAX_PHOTOS) { alert(`사진은 ${MAX_PHOTOS}장까지 고를 수 있어요.`); return; }
      setSelectedFiles(prev => [...prev, item.file]); setPreviewUrls(prev => [...prev, item.url]); setComposerPhotoIdx(selectedFiles.length);
    } else if (pos !== shown) {
      setComposerPhotoIdx(pos);
    } else {
      setSelectedFiles(prev => prev.filter((_, i) => i !== pos)); setPreviewUrls(prev => prev.filter((_, i) => i !== pos));
      setComposerPhotoIdx(i => Math.max(0, i >= pos ? i - 1 : i));
    }
  };
  const removeFile = (idx: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== idx));
    setPreviewUrls(previewUrls.filter((_, i) => i !== idx));
  };
  // 글 고치기·지우기는 서버(/api/posts)에서 본인 확인 후 처리
  const callPostApi = async (body: object): Promise<{ error?: string; ok?: boolean }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: '로그인이 필요합니다.' };
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res) return { error: '인터넷 연결을 확인해 주세요.' };
    const json = await res.json().catch(() => ({}));
    return res.ok ? json : { error: json.error || '처리하지 못했어요.' };
  };
  const handleDeletePost = async (postId: string) => {
    if (!(await askConfirm('이 글을 지울까요?\n사진·영상과 댓글도 함께 지워지고 되돌릴 수 없어요.'))) return;
    const result = await callPostApi({ action: 'delete', id: postId });
    if (result.error) { alert(result.error); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
    setSelectedPostDetail(prev => prev?.id === postId ? null : prev);
  };
  // 게시글 이모티콘 고르기 칸: 누르면 바로 글에 붙음 (한 글에 MAX_POST_STICKERS 개까지)
  const postStickerPicker = (open: boolean, setOpen: StickerPicker['setOpen'], list: Sticker[], setList: (f: (prev: Sticker[]) => Sticker[]) => void): StickerPicker => ({
    open, setOpen, picked: null, setPicked: () => {}, sendPicked: async () => {}, close: () => setOpen(false),
    pick: s => { if (list.length >= MAX_POST_STICKERS) { alert(`이모티콘은 한 글에 ${MAX_POST_STICKERS}개까지 넣을 수 있어요.`); return; } setList(prev => [...prev, s]); },
  });
  const startEditPost = (post: Post) => {
    setEditingPostId(post.id);
    const parts = splitPostStickers(post.content);
    setEditContent(parts.text);
    setEditStickers(parts.stickers);
    setEditOverlays(post.video_overlays || null);
    setEditVisibility(post.visibility || 'public');
    setEditMusic(post.music ? { value: post.music, title: post.music_title || '음악' } : null);
    setEditPhotos((post.images || []).map(url => ({ url })));
    setEditVisOpen(false);
    setEditSelIdx(0);
    setEditEmojiOpen(false);
  };
  // 게시글 수정: 글 칸이 글에 맞춰 늘어남
  const editTextRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const ta = editTextRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [editContent, editingPostId, showEditVideoEditor]);
  // 게시글 ⋯ 메뉴: 아래로 끌어 닫기, 공유하기·링크 복사 (?view= 로 열면 그 글을 크게)
  const postMenuSheet = useSheetDrag(() => setPostMenuId(null), !!postMenuId);
  // 공유 주소: /p/글id — 카카오톡 등의 미리 보기에 그 글의 사진·글이 나오고, 열면 앱의 그 글 크게 보기로 (app/p/[id])
  const postLink = (post: Post) => `${window.location.origin}/p/${post.id}`;
  const sharePost = async (post: Post) => {
    const url = postLink(post);
    if (navigator.share) {
      try { await navigator.share({ title: `${post.author_name}님의 글 · 가톨릭그램`, text: postPlainText(post.content).slice(0, 80), url }); return; }
      catch (e) { if ((e as Error)?.name === 'AbortError') return; }
    }
    if (await copyText(url)) showToast('링크를 복사했어요. 원하는 곳에 붙여 넣으세요');
    else window.prompt('이 주소를 복사하세요', url);
  };
  // 글 고치기: 사진 편집 열기 (원래 사진은 내려받아 파일로)
  const openEditPhotoEditor = async (idx: number, step: 'crop' | 'cover' = 'crop') => {
    const ph = editPhotos[idx];
    if (!ph) return;
    if (ph.file) { setEditPhotoEditor({ idx, file: ph.file, step }); return; }
    setEditPhotoLoading(true);
    try {
      const res = await fetch(ph.url, { mode: 'cors' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      setEditPhotoEditor({ idx, file: new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }), step });
    } catch {
      alert('사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setEditPhotoLoading(false);
    }
  };
  const addEditPhotos = (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - editPhotos.length;
    const picked = Array.from(files);
    if (picked.length > room) alert(`사진은 한 글에 ${MAX_PHOTOS}장까지 넣을 수 있어요.`);
    setEditPhotos(prev => [...prev, ...picked.slice(0, Math.max(0, room)).map(file => ({ url: URL.createObjectURL(file), file }))]);
  };
  // 공개 범위만 바로 바꾸기 (크게 보기·내 공간에서)
  const changePostVisibility = async (postId: string, visibility: Visibility) => {
    const result = await callPostApi({ action: 'update', id: postId, changes: { visibility } });
    if (result.error) { alert(result.error); return; }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, visibility } : p));
    setSelectedPostDetail(prev => prev && prev.id === postId ? { ...prev, visibility } : prev);
  };
  const handleUpdatePost = async (postId: string) => {
    const target = posts.find(p => p.id === postId);
    if (!target) return;
    const changes: Partial<Post> = { content: joinPostStickers(editContent.trim(), editStickers) };
    if (target.video_url) changes.video_overlays = hasOverlays(editOverlays) ? editOverlays : null;
    if (editVisibility !== (target.visibility || 'public')) changes.visibility = editVisibility;
    if ((editMusic?.value || null) !== (target.music || null)) {
      changes.music = editMusic?.value || null;
      changes.music_title = editMusic?.title || null;
    }
    setSavingEdit(true);
    // 사진이 바뀌었으면: 새로 넣거나 편집한 사진만 올리고 목록을 바꾼다
    const before = target.images || [];
    const photosChanged = !target.video_url && (editPhotos.length !== before.length || editPhotos.some((ph, i) => !!ph.file || ph.url !== before[i]));
    if (photosChanged) {
      const urls: string[] = [];
      for (const ph of editPhotos) {
        if (!ph.file) { urls.push(ph.url); continue; }
        try {
          const compressed = await imageCompression(ph.file, PHOTO_OPTIONS);
          urls.push(await uploadMedia(compressed, { kind: 'posts', ext: 'jpg', contentType: 'image/jpeg', bucket: 'community-images', path: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.jpg` }));
        } catch {
          setSavingEdit(false);
          alert('사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');
          return;
        }
      }
      changes.images = urls;
    }
    const result = await callPostApi({ action: 'update', id: postId, changes });
    setSavingEdit(false);
    if (result.error) { alert(result.error); return; }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...changes } : p));
    setSelectedPostDetail(prev => prev && prev.id === postId ? { ...prev, ...changes } : prev);
    editPhotos.forEach(ph => { if (ph.file) URL.revokeObjectURL(ph.url); });
    setEditingPostId(null);
  };
  // 사진·영상을 두 번 누르면 공감 (이미 공감했으면 그대로 두기)
  const likeByDoubleTap = (postId: string) => handleReaction(postId, 'like', true);

  const handleReaction = async (postId: string, type: 'pray' | 'like', onlyAdd = false) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    if (!posts.some((p) => p.id === postId) && !storyPosts.some(p => p.id === postId)) return;
    const { data: existing } = await supabase.from('post_reactions').select('id').eq('post_id', postId).eq('user_id', user.id).eq('reaction_type', type).maybeSingle();
    if (existing && onlyAdd) return;
    const { error } = existing
      ? await supabase.from('post_reactions').delete().eq('id', existing.id)
      : await supabase.from('post_reactions').insert({ post_id: postId, user_id: user.id, reaction_type: type });
    if (error) return;
    setMyPostReactions(prev => {
      const next = new Set(prev);
      if (existing) next.delete(`${postId}:${type}`); else next.add(`${postId}:${type}`);
      return next;
    });
    // 화면의 숫자에 ±1 하지 않고 글의 숫자 칸을 다시 읽는다
    // (숫자 칸은 DB 가 반응이 생기고 없어질 때 직접 센다 — supabase/security-hardening.sql.
    //  누가 어느 글에 반응했는지는 본인 것만 읽을 수 있다 — supabase/privacy-hardening.sql)
    const { data: fresh } = await supabase.from('posts').select('pray_count, like_count').eq('id', postId).maybeSingle();
    if (!fresh) return;
    const updateField = type === 'pray' ? { pray_count: fresh.pray_count ?? 0 } : { like_count: fresh.like_count ?? 0 };
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updateField } : p));
    setStoryPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updateField } : p));
  };
  const fetchNotifications = async (userId: string) => {
    const myHandle = myHandleRef.current;
    const { data: myPosts } = await supabase.from('posts').select('id, content, images, video_poster').eq('user_id', userId).order('created_at', { ascending: false }).limit(200); // 최근 글의 댓글만 알림
    setNotificationsLastSeen(storageGet(`notificationsLastSeen:${userId}`));
    setNotificationsClearedAt(storageGet(`notificationsClearedAt:${userId}`));
    try { setHiddenAlerts(new Set(JSON.parse(storageGet(`notificationsHidden:${userId}`) || '[]'))); } catch { /* 무시 */ }
    try { setReadAlerts(new Set(JSON.parse(storageGet(`notificationsRead:${userId}`) || '[]'))); } catch { /* 무시 */ }
    setFeastClearedAt(storageGet(`feastClearedAt:${userId}`));
    const postContent: Record<string, string> = Object.fromEntries((myPosts || []).map(p => [p.id, postPlainText(p.content)]));
    const mentionQuery = (table: 'posts' | 'comments', cols: string) => myHandle
      ? supabase.from(table).select(cols).ilike('content', `%@${myHandle}%`).neq('user_id', userId)
        .order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [] });
    const [{ data: onMyPosts }, { data: replies }, { data: postMentions }, { data: commentMentions }] = await Promise.all([
      myPosts && myPosts.length > 0
        ? supabase.from('comments').select('id, post_id, content, author_name, created_at')
          .in('post_id', myPosts.map(p => p.id)).neq('user_id', userId)
          .order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as Omit<CommentNotification, 'post_content'>[] }),
      // 다른 사람 글에서 나에게 단 답글 (칼럼이 없으면 빈 결과)
      supabase.from('comments').select('id, post_id, content, author_name, created_at')
        .eq('reply_to_user_id', userId).neq('user_id', userId)
        .order('created_at', { ascending: false }).limit(30),
      // 나를 @태그한 글과 댓글
      mentionQuery('posts', 'id, content, author_name, created_at'),
      mentionQuery('comments', 'id, post_id, content, author_name, created_at'),
    ]);
    const merged = new Map<string, CommentNotification>();
    (onMyPosts || []).forEach(c => merged.set(c.id, { ...c, post_content: postContent[c.post_id] }));
    (replies || []).forEach(c => merged.set(c.id, { ...c, post_content: postContent[c.post_id] || '', is_reply: true }));
    type Row = { id: string; post_id?: string; content: string; author_name: string; created_at: string };
    ((postMentions || []) as unknown as Row[]).filter(p => mentionsHandle(p.content, myHandle)).forEach(p =>
      merged.set(`mp:${p.id}`, { id: `mp:${p.id}`, post_id: p.id, content: postPlainText(p.content), author_name: p.author_name, created_at: p.created_at, post_content: postPlainText(p.content), mention: 'post' }));
    ((commentMentions || []) as unknown as Row[]).filter(c => mentionsHandle(c.content, myHandle)).forEach(c => {
      const prev = merged.get(c.id);
      merged.set(c.id, { ...(prev || { ...c, post_id: c.post_id || '', post_content: postContent[c.post_id || ''] || '' }), mention: 'comment' });
    });
    // 알림 줄 오른쪽에 그 글의 작은 사진 (무슨 사진에 단 댓글인지 보이게). 내 글이 아닌 글(답글·언급)은 한 번에 불러옴
    const thumbOf = (p: { images?: string[] | null; video_poster?: string | null }) => p.images?.[0] || p.video_poster || null;
    const postThumb: Record<string, string | null> = Object.fromEntries((myPosts || []).map(p => [p.id, thumbOf(p)]));
    const needThumb = Array.from(new Set(Array.from(merged.values()).map(n => n.post_id))).filter(id => id && !(id in postThumb));
    if (needThumb.length > 0) {
      const { data: others } = await supabase.from('posts').select('id, images, video_poster').in('id', needThumb.slice(0, 60));
      (others || []).forEach(p => { postThumb[p.id] = thumbOf(p); });
    }
    merged.forEach((n, key) => { if (postThumb[n.post_id]) merged.set(key, { ...n, post_image: postThumb[n.post_id] }); });
    // 익명 고민글 답글 (휴대폰 알림은 오는데 알림 목록에는 없던 것)
    type AnonRow = { id: string; post_id: string; content: string; created_at: string };
    const [{ data: myAnon }, { data: myAnonReplies }] = await Promise.all([
      supabase.from('anon_posts_feed').select('id, content').eq('is_mine', true).order('created_at', { ascending: false }).limit(50),
      supabase.from('anon_replies_feed').select('post_id').eq('is_mine', true).order('created_at', { ascending: false }).limit(100),
    ]);
    const anonContent: Record<string, string> = Object.fromEntries((myAnon || []).map(p => [p.id, p.content || '']));
    const repliedIds = Array.from(new Set((myAnonReplies || []).map(r => r.post_id as string))).filter(id => !(id in anonContent));
    const [{ data: onMyAnon }, { data: authorReplies }, { data: repliedPosts }] = await Promise.all([
      Object.keys(anonContent).length > 0
        ? supabase.from('anon_replies_feed').select('id, post_id, content, created_at').in('post_id', Object.keys(anonContent)).eq('is_mine', false)
          .order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as AnonRow[] }),
      repliedIds.length > 0
        ? supabase.from('anon_replies_feed').select('id, post_id, content, created_at').in('post_id', repliedIds).eq('is_post_author', true)
          .order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as AnonRow[] }),
      repliedIds.length > 0 ? supabase.from('anon_posts_feed').select('id, content').in('id', repliedIds) : Promise.resolve({ data: [] as { id: string; content: string }[] }),
    ]);
    (repliedPosts || []).forEach(p => { anonContent[p.id] = p.content || ''; });
    ((onMyAnon || []) as AnonRow[]).forEach(r => merged.set(`a:${r.id}`, { id: `a:${r.id}`, post_id: r.post_id, content: r.content, author_name: '익명 교우', created_at: r.created_at, post_content: anonContent[r.post_id] || '', anon: 'mine' }));
    ((authorReplies || []) as AnonRow[]).forEach(r => merged.set(`a:${r.id}`, { id: `a:${r.id}`, post_id: r.post_id, content: r.content, author_name: '고민글 작성자', created_at: r.created_at, post_content: anonContent[r.post_id] || '', anon: 'author' }));
    setNotifications(Array.from(merged.values()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40));
  };

  // 아직 읽지 않은 받은 메시지 (보낸 사람별로 묶음)
  const fetchUnreadMessages = async (userId: string) => {
    fetchGroupChats();
    const { data } = await supabase.from('messages').select('sender_id, content, created_at')
      .eq('receiver_id', userId).is('read_at', null)
      .order('created_at', { ascending: false }).limit(100);
    if (!data || data.length === 0) { setUnreadMessages([]); return; }
    const grouped = new Map<string, { count: number; lastMessage: string; lastAt: string }>();
    data.filter(m => afterLeft(m.sender_id, m.created_at)).forEach(m => {
      const g = grouped.get(m.sender_id);
      if (g) g.count += 1;
      else grouped.set(m.sender_id, { count: 1, lastMessage: chatPreview(m.content) || '삭제된 메시지', lastAt: m.created_at });
    });
    const { data: profiles } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type')
      .in('id', Array.from(grouped.keys()));
    setUnreadMessages((profiles || []).filter(p => grouped.has(p.id)).map(p => ({ partner: p, ...grouped.get(p.id)! }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
  };

  // 상대가 보낸 메시지를 읽음 처리
  // (대화방을 불러왔을 때 상대가 보낸 안 읽은 메시지가 있으면 호출됨)
  const markMessagesRead = async (partnerId: string) => {
    if (!user) return;
    setUnreadMessages(prev => prev.filter(u => u.partner.id !== partnerId));
    const { error } = await supabase.from('messages').update({ read_at: new Date().toISOString() })
      .eq('sender_id', partnerId).eq('receiver_id', user.id).is('read_at', null);
    if (error) console.error('읽음 처리 실패', error);
  };

  const toggleAlertSound = () => {
    const next = !alertSoundOn;
    setAlertSoundOn(next);
    storageSet('alertSound', next ? 'on' : 'off');
    if (next) playAlertSound();
  };

  // 고민상담 새 글 수 (마지막으로 고민상담을 본 뒤, 내 글 제외)
  const fetchAnonUnread = async (userId: string) => {
    const key = `anonSeenAt:${userId}`;
    const since = storageGet(key);
    if (!since) { storageSet(key, new Date().toISOString()); setAnonUnread(0); return; }
    const { count, error } = await supabase.from('anon_posts_feed').select('id', { count: 'exact', head: true }).gt('created_at', since).eq('is_mine', false);
    if (!error) setAnonUnread(count || 0);
  };
  // 사랑방 참여자 수: 메시지 목록을 보거나 사랑방에 있을 때만 실시간으로 센다.
  // 사랑방 안에 들어온 교우만 '참여자'로 표시(track)하고, 목록에서는 보기만 한다. 관리자가 몰래 들어오면 표시하지 않는다.
  const loungePresent = showLounge && !loungeStealth;
  showLoungeRef.current = loungePresent;
  const loungeWatching = !!user && (activeTab === 'messages' || showLounge);
  useEffect(() => {
    if (!loungeWatching || !user) { setLoungeOnlineIds([]); return; }
    const ch = supabase.channel('lounge-presence', { config: { presence: { key: user.id } } });
    ch.on('presence', { event: 'sync' }, () => setLoungeOnlineIds(Object.keys(ch.presenceState())))
      .subscribe(status => { if (status === 'SUBSCRIBED' && showLoungeRef.current) ch.track({ at: Date.now() }).catch(() => {}); });
    loungePresenceRef.current = ch;
    return () => { loungePresenceRef.current = null; supabase.removeChannel(ch); };
  }, [loungeWatching, user?.id]);
  useEffect(() => {
    const ch = loungePresenceRef.current;
    if (!ch) return;
    (loungePresent ? ch.track({ at: Date.now() }) : ch.untrack()).catch(() => {});
  }, [loungePresent]);
  // 사랑방: 마지막으로 본 뒤 다른 교우가 쓴 대화 수
  const fetchLoungeNew = async (userId: string) => {
    const since = storageGet(loungeSeenKey(userId));
    let q = supabase.from('lounge_messages').select('id', { count: 'exact', head: true }).neq('user_id', userId);
    // 사랑방은 매일 자정(한국 시간)에 새로 시작 → 오늘 대화만 센다
    const kst = new Date(Date.now() + 9 * 3600e3);
    const todayStart = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600e3).toISOString();
    q = q.gt('created_at', since && since > todayStart ? since : todayStart);
    const { count, error } = await q;
    setLoungeNew(error ? 0 : count || 0);
  };
  // 관리자: 새 사연 수
  const fetchLetterCount = async () => {
    if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return;
    const { count, error } = await supabase.from('letters').select('id', { count: 'exact', head: true }).eq('status', 'new');
    if (!error) setLetterNewCount(count || 0);
  };
  // 내가 선물받은 전용 이모티콘 (supabase/sticker-gifts.sql 실행 전이면 조용히 비움)
  const fetchStickerGrants = async (userId: string) => {
    const { data, error } = await supabase.from('sticker_grants').select('pack_id').eq('user_id', userId);
    const next = error ? [] : (data || []).map(r => r.pack_id as string).sort();
    setStickerGrants(prev => (prev.join() === next.join() ? prev : next));
  };
  // 선물 대상으로 뽑힌 내 사연 (supabase/letters-gift.sql 실행 전이면 비움). 자주 바뀌지 않아 5분에 한 번만
  const fetchGiftLetters = async (userId: string, force = false) => {
    if (!force && Date.now() - giftLettersAtRef.current < 5 * 60 * 1000) return;
    giftLettersAtRef.current = Date.now();
    const { data, error } = await supabase.from('letters').select('id').eq('user_id', userId).eq('gift', true);
    const next = error ? [] : (data || []).map(r => r.id as string).sort();
    setGiftLetters(prev => (prev.join() === next.join() ? prev : next));
  };
  const refreshAlerts = (userId: string, force = false) => {
    fetchStickerGrants(userId);
    fetchGiftLetters(userId, force);
    fetchAnonUnread(userId);
    fetchLetterCount();
    fetchBlocks(userId);
    fetchNotifications(userId);
    fetchUnreadMessages(userId);
    fetchFollowRequests(userId);
    fetchFeastFriends(userId);
  };

  // 알림은 3일만 보관: 그보다 오래된 댓글·답글·언급·팔로우 알림은 목록과 숫자에서 뺀다 (안 읽은 메시지는 그대로)
  const isAlertExpired = (at?: string) => !!at && Date.now() - new Date(at).getTime() > ALERT_KEEP_MS;
  const unreadCommentCount = !user ? 0 : notifications.filter(n =>
    !isAlertExpired(n.created_at) && !hiddenAlerts.has(`c:${n.id}`) && (!notificationsLastSeen || new Date(n.created_at) > new Date(notificationsLastSeen))
    && (!notificationsClearedAt || new Date(n.created_at) > new Date(notificationsClearedAt))
  ).length;
  const unreadMessageCount = !user ? 0 : unreadMessages.reduce((sum, u) => sum + u.count, 0);
  // 메시지 단추 숫자: 1:1 안 읽은 메시지 + 단체 채팅방 안 읽은 메시지 (알림(하트) 숫자에는 1:1만)
  const messageBadgeCount = unreadMessageCount + (!user ? 0 : groupChats.reduce((sum, g) => sum + (g.unread || 0), 0));
  const newFollowerCount = !user ? 0 : followRequests.filter(r =>
    r.created_at && !isAlertExpired(r.created_at) && (!notificationsLastSeen || new Date(r.created_at) > new Date(notificationsLastSeen))
    && (!notificationsClearedAt || new Date(r.created_at) > new Date(notificationsClearedAt))
  ).length;
  // 지운 알림인지
  const isAlertHidden = (key: string, at?: string) =>
    hiddenAlerts.has(key) || isAlertExpired(at) || (!!notificationsClearedAt && !!at && new Date(at) <= new Date(notificationsClearedAt));
  // 알림 표시 저장 (지운 알림 / 확인한 알림): 아직 목록을 안 불러왔어도(알림을 눌러 막 열린 경우) 저장된 것과 합친다
  const addAlertKeys = (kind: 'Hidden' | 'Read', keys: string[]) => {
    if (!user || keys.length === 0) return;
    (kind === 'Hidden' ? setHiddenAlerts : setReadAlerts)(prev => {
      let stored: string[] = [];
      try { stored = JSON.parse(storageGet(`notifications${kind}:${user.id}`) || '[]'); } catch { /* 무시 */ }
      const next = new Set([...stored, ...prev, ...keys]);
      storageSet(`notifications${kind}:${user.id}`, JSON.stringify(Array.from(next).slice(-500)));
      return next;
    });
  };
  const hideAlert = (key: string) => addAlertKeys('Hidden', [key]);
  // 알림을 눌러 확인해도 목록에는 남긴다 (흐리게) — 지우기 전까지, 3일이 지나면 저절로 사라짐
  const markAlertRead = (...keys: string[]) => addAlertKeys('Read', keys);
  // '확인한 알림 지우기': 눌러 본 알림만 지우고, 아직 확인하지 않은 알림은 남긴다. 오늘 축일 안내도 접는다
  const clearSeenAlerts = () => {
    if (!user) return;
    addAlertKeys('Hidden', Array.from(readAlerts));
    const now = new Date().toISOString();
    setFeastClearedAt(now);
    storageSet(`feastClearedAt:${user.id}`, now);
  };

  const listedFollows = followRequests.filter(r => !blockedIds.has(r.follower.id) && !isAlertHidden(`f:${r.id}`, r.created_at) && !hiddenAlerts.has(`fu:${r.follower.id}`));
  const listedComments = notifications.filter(n => !isAlertHidden(`c:${n.id}`, n.created_at));
  const listedMessages = unreadMessages.filter(u => !blockedIds.has(u.partner.id) && !(notificationsClearedAt && new Date(u.lastAt) <= new Date(notificationsClearedAt)));
  // '모두 지우기': 확인하지 않은 알림까지 지금까지 온 알림을 모두 지운다 (그 뒤에 오는 알림은 다시 보임).
  // 안 읽은 메시지는 알림 목록에서만 빠지고 메시지함에는 그대로 (읽음 표시를 보내지 않음)
  const clearAllAlerts = async () => {
    if (!user) return;
    if (!(await askConfirm({ title: '알림을 모두 지울까요?', message: '확인하지 않은 알림도 함께 지워져요.\n안 읽은 메시지는 메시지함에 그대로 남아요.', ok: '모두 지우기', danger: true }))) return;
    // 휴대폰 시계가 서버보다 조금 늦어도 지금 보이는 알림은 모두 지워지게, 가장 늦은 알림 시각과 비교
    const times = [Date.now(), ...listedComments.map(n => +new Date(n.created_at)), ...listedFollows.map(r => +new Date(r.created_at || 0)), ...listedMessages.map(u => +new Date(u.lastAt))];
    const at = new Date(Math.max(...times.filter(t => !Number.isNaN(t)))).toISOString();
    setNotificationsClearedAt(at);
    storageSet(`notificationsClearedAt:${user.id}`, at);
    setFeastClearedAt(at);
    storageSet(`feastClearedAt:${user.id}`, at);
  };
  const feastCleared = [feastClearedAt, notificationsClearedAt].some(at => !!at && todayKst(new Date(at)) === todayKst());

  // 생일·축일 알림: 오늘 알림 목록을 아직 안 열어봤으면 새 알림으로 센다
  const myCheer = cheerKindOf(profile);
  const isMyFeastToday = !!myCheer; // 내 생일 또는 축일
  const myCheerText = myCheer ? selfCheer(profile?.baptismal_name || '교우', myCheer) : null;
  const visibleFeastFriends = feastFriends.filter(f => !blockedIds.has(f.id));
  const friendCheer = (f: UserProfile): CheerKind => cheerKindOf(f) || 'feast';
  const feastAlertCount = !user || (notificationsLastSeen && todayKst(new Date(notificationsLastSeen)) === todayKst())
    ? 0 : visibleFeastFriends.length + (isMyFeastToday ? 1 : 0);
  const unreadCount = unreadCommentCount + listedMessages.reduce((sum, u) => sum + u.count, 0) + newFollowerCount + feastAlertCount;

  // 생일·축일 축하 메시지 보내기: 대화방을 열고 인사말을 미리 채워둔다
  const congratulateFeast = (friend: UserProfile) => {
    setShowNotifications(false);
    openChatRoom(friend);
    setMessageInput(cheerMessage(friend.baptismal_name, friendCheer(friend)));
  };

  const dismissFeastCard = () => {
    setFeastCardDismissed(true);
    if (user) storageSet(`feastCardDismissed:${user.id}`, todayKst());
  };

  const dismissFeastPrompt = () => {
    setFeastPromptDismissed(true);
    if (user) storageSet(`feastPromptDismissed:${user.id}`, '1');
  };
  const dismissTesterPrompt = () => {
    setTesterPromptDismissed(true);
    if (user) storageSet(`testerPromptDismissed:${user.id}`, '1');
  };
  // 테스터 모집 카드: 안드로이드 폰에서, 아직 신청 안 했고 닫지 않았을 때만 (신청 표가 아직 없으면 안 보임)
  useEffect(() => {
    if (!user) return;
    supabase.from('tester_signups').select('status').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      setIsAndroid(isAndroidDevice());
      setTesterPromptDismissed(storageGet(`testerPromptDismissed:${user.id}`) === '1');
      setTesterStatus(error ? null : ((data?.status as TesterStatus | undefined) || 'none'));
    });
  }, [user]);

  // 알림창: 사연함·고민상담과 같은 아래에서 올라오는 창(BottomSheet, 늘 같은 높이), 아래로 끌어 닫기.
  // 지운 알림 아래 줄들은 스르륵 올라온다 (useFlipList)
  const alertListRef = useFlipList<HTMLDivElement>(showNotifications);

  const openNotifications = () => {
    if (!user) return;
    setShowNotifications(true);
    setToast(null);
    // 목록을 열면 모두 읽음 처리 (빨간 숫자는 사라지고, 새 알림 표시는 이번 목록에서만 유지)
    const now = new Date().toISOString();
    storageSet(`notificationsLastSeen:${user.id}`, now);
    setTimeout(() => setNotificationsLastSeen(now), 0);
  };

  // 댓글 작성자들의 뱃지 정보를 불러온다
  const authorName = (c: Comment) =>
    (c.user_id && c.user_id === user?.id ? profile?.baptismal_name : undefined) || (c.user_id && authorByUser[c.user_id]?.name) || c.author_name;
  const authorHandle = (c: Comment) =>
    (c.user_id && c.user_id === user?.id ? profile?.handle : undefined) || (c.user_id ? authorByUser[c.user_id]?.handle : undefined);

  const loadCommentBadges = async (list: Comment[]) => {
    const ids = Array.from(new Set(list.flatMap(c => [c.user_id, c.reply_to_user_id]).filter((id): id is string => !!id)));
    if (ids.length === 0) return;
    const { data } = await supabase.from('profiles').select('id, badge_type, baptismal_name, handle, avatar_url').in('id', ids);
    if (!data) return;
    setBadgeByUser(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, p.badge_type])) }));
    setAuthorByUser(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, { name: p.baptismal_name, handle: p.handle || undefined, avatar: p.avatar_url || undefined }])) }));
  };

  // 홈에서 해당 글로 이동해 댓글을 펼친다
  // 알림에서: 그 글의 댓글 창을 열고, 댓글이 정해져 있으면 그 댓글로 옮겨 잠깐 강조
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  // 댓글 창이 어느 글(스토리)의 것인지 보여 주려고, 목록에 없는 글은 따로 불러 둔다 (지난 스토리 등)
  const [sheetPostExtra, setSheetPostExtra] = useState<Post | null>(null);
  // 알림으로 연 댓글 창은 맨 위에 '어느 글의 댓글인지' 보여 준다 (홈 피드 위에 댓글만 떠서 그 글로 안 간 것처럼 보이지 않게)
  const [sheetShowsPost, setSheetShowsPost] = useState(false);
  const openPostComments = async (postId: string, commentId?: string) => {
    setCommentSheetId(postId);
    setSheetShowsPost(true);
    if (!posts.some(p => p.id === postId) && !storyPosts.some(p => p.id === postId)) {
      supabase.from('posts').select('*').eq('id', postId).maybeSingle().then(({ data }) => {
        if (!data) return;
        if ((data as Post & { is_story?: boolean }).is_story) setSheetPostExtra(data as Post);
        else ensurePost(postId); // 알림으로 연 오래된 글
      });
    }
    setHighlightCommentId(commentId || null);
    await loadCommentsFor(postId);
    if (commentId) {
      setTimeout(() => document.getElementById(`comment-${commentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
      setTimeout(() => setHighlightCommentId(prev => (prev === commentId ? null : prev)), 3500);
    }
  };
  // 알림에서: 홈 피드의 그 글로 화면을 옮기고 잠깐 테두리로 강조 (크게 보기 창을 띄우지 않는다)
  // 피드에서 안 보이는 글(오래된 글·보기 거르기에 걸린 글)이어도 그 글은 피드에 넣어 보여 준다
  const [focusPostId, setFocusPostId] = useState<string | null>(null);
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const focusScrollRef = useRef<{ timers: ReturnType<typeof setTimeout>[]; stop: () => void } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFeedPost = (postId: string) => {
    if (currentScreenRef.current.tab !== 'home') goToHome();
    setFocusPostId(postId);
    setHighlightPostId(postId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightPostId(null), 4000);
    focusScrollRef.current?.stop();
    // 위쪽 사진들이 늦게 불러와지며 글 자리가 밀리므로 몇 번 맞춘다. 손으로 피드를 움직이면 그만 (댓글 창 안을 만지는 건 제외)
    const main = mainScrollRef.current;
    const onUser = (e: Event) => { if (!(e.target as Element | null)?.closest?.('[role="dialog"]')) stop(); };
    const stop = () => {
      timers.forEach(clearTimeout);
      main?.removeEventListener('touchstart', onUser);
      main?.removeEventListener('wheel', onUser);
    };
    const timers = [150, 500, 1100, 2000, 3000].map((ms, i) => setTimeout(() => {
      document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: i === 0 ? 'auto' : 'smooth', block: 'start' });
      if (i === 4) stop();
    }, ms));
    main?.addEventListener('touchstart', onUser, { passive: true });
    main?.addEventListener('wheel', onUser, { passive: true });
    focusScrollRef.current = { timers, stop };
  };
  // 글에서 언급된 알림 등: 그 글로 (지워진 글이면 댓글 창이라도)
  const openPostById = async (postId: string) => {
    if (storyPosts.some(p => p.id === postId)) { openPostComments(postId); return; }
    const p = posts.find(x => x.id === postId) || await ensurePost(postId);
    if (!p || (p as Post & { is_story?: boolean }).is_story) { openPostComments(postId); return; }
    focusFeedPost(postId);
  };

  // 공유한 글 링크·글에서 언급 알림(?view=): 그 글을 크게 보기로 바로 연다 (피드에 아직 없거나 아래쪽에 있어도)
  const openPostView = async (postId: string) => {
    if (storyPosts.some(p => p.id === postId)) { openPostComments(postId); return; }
    const p = posts.find(x => x.id === postId) || await ensurePost(postId);
    if (!p) { showToast('글을 찾을 수 없어요. 지워졌거나 볼 수 없는 글이에요'); return; }
    if ((p as Post & { is_story?: boolean }).is_story) { openPostComments(postId); return; }
    openPostViewer(p);
  };

  // 댓글 알림: 홈에서 그 글로 화면을 옮기고, 댓글이면 댓글 창을 바로 열어 그 댓글로 (스토리 댓글·지워진 글은 댓글 창만)
  const openPostFromAlert = async (postId: string, commentId?: string) => {
    if (storyPosts.some(p => p.id === postId)) { openPostComments(postId, commentId); return; }
    const p = posts.find(x => x.id === postId) || await ensurePost(postId);
    if (!p || (p as Post & { is_story?: boolean }).is_story) { openPostComments(postId, commentId); return; }
    focusFeedPost(postId);
    if (commentId) openPostComments(postId, commentId);
  };

  // 알림 누르기: 글에서 언급 → 피드의 그 글로, 댓글·답글·댓글 언급 → 그 글로 가서 댓글 창의 그 댓글
  const openNotification = (n: CommentNotification) => {
    setShowNotifications(false);
    markAlertRead(`c:${n.id}`);
    if (n.anon) { setAnonFocusId(n.post_id); setAnonFocusReply(n.id.slice(2)); setShowAnon(true); }
    else if (n.mention === 'post') openPostById(n.post_id);
    else openPostFromAlert(n.post_id, n.id);
  };

  // --- 휴대폰 푸시 알림 ---
  // 방금 작성한 댓글/메시지를 받는 사람에게 알림 발송 요청 (실패해도 무시)
  const sendPush = async (type: 'sticker_gift' | 'group_message' | 'tester_added' | 'letter_gift' | 'letter_reply' | 'lounge_call' | 'lounge_mention' | 'comment' | 'post' | 'anon_reply' | 'letter' | 'message' | 'follow' | 'feedback' | 'feedback_reply' | 'report' | 'report_reply', id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ type, id }),
    }).catch(() => {});
  };

  // 구독 저장: 앱을 열 때마다 기기 이름·마지막으로 연 때도 적는다 → 한 휴대폰에 앱이 둘이면 최근에 연 앱 하나에만 알림 (lib/push-devices)
  const savePushSubscription = async (sub: PushSubscription, userId: string) => {
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    const base = { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
    let { error } = await supabase.from('push_subscriptions').upsert(
      { ...base, device: (await pushDeviceKey()) || null, last_seen: new Date().toISOString() },
      { onConflict: 'endpoint' }
    );
    // supabase/push-devices.sql 실행 전이면 칸이 없으니 예전처럼
    if (error && (error.code === 'PGRST204' || error.code === '42703')) ({ error } = await supabase.from('push_subscriptions').upsert(base, { onConflict: 'endpoint' }));
    return !error;
  };

  const checkPushStatus = async (userId: string) => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus(ios && !standalone ? 'ios-needs-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') { setPushStatus('denied'); return; }
    const reg = await navigator.serviceWorker.getRegistration('/sw.js').catch(() => undefined);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub && Notification.permission === 'granted') {
      await savePushSubscription(sub, userId); // 로그인 계정이 바뀌었을 수 있으므로 갱신
      setPushStatus('on');
    } else {
      setPushStatus('off');
    }
  };

  // silent: 이미 알림이 허용된 경우(앱 설치 때 허용 등) 안내 없이 바로 구독
  const enablePush = async (silent = false) => {
    if (!user) return false;
    setPushBusy(true);
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') { setPushStatus(permission === 'denied' ? 'denied' : 'off'); return false; }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      if (await savePushSubscription(sub, user.id)) { setPushStatus('on'); return true; }
      if (!silent) alert('알림 설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
      return false;
    } catch {
      if (!silent) alert('알림을 켜지 못했습니다. 브라우저 알림 설정을 확인해주세요.');
      return false;
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setPushStatus('off');
    } finally {
      setPushBusy(false);
    }
  };

  // 앱을 열 때, 그리고 앱으로 돌아올 때(10분에 한 번) 구독을 다시 적는다 → 마지막으로 쓴 앱이 알림을 받음 (lib/push-devices)
  useEffect(() => {
    if (!user) return;
    checkPushStatus(user.id);
    let savedAt = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - savedAt < 10 * 60 * 1000) return;
      savedAt = Date.now();
      checkPushStatus(user.id);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user]);

  // 처음부터 알림이 오도록: 이미 허용돼 있으면 바로 구독, 아직 묻지 않았으면 안내 창을 띄운다
  // (브라우저는 사용자가 버튼을 눌러야 알림 허용 창을 보여주므로 안내 창의 버튼으로 요청)
  const pushPromptCheckedRef = useRef(false);
  useEffect(() => {
    if (!user || needsProfileSetup || pushStatus !== 'off' || pushPromptCheckedRef.current) return;
    pushPromptCheckedRef.current = true;
    if (Notification.permission === 'granted') { enablePush(true); return; }
    if (Notification.permission !== 'default') return;
    const key = `pushPromptAt:${user.id}`;
    const last = Number(storageGet(key) || 0);
    if (Date.now() - last < 3 * 24 * 3600e3) return; // '나중에'를 누르면 3일 뒤 다시 안내
    const timer = setTimeout(() => {
      storageSet(key, String(Date.now()));
      setShowPushPrompt(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [user, needsProfileSetup, pushStatus]);

  const acceptPushPrompt = async () => {
    setShowPushPrompt(false);
    if (await enablePush()) setToast({ key: 'push-on', icon: '🔔', title: '알림이 켜졌어요', body: '댓글·메시지·축일 소식을 휴대폰으로 알려드릴게요', action: () => {}, stay: true });
  };

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      visibleSinceRef.current = Date.now();
      // 앱이 다시 뜰 때(아이패드에서 알림을 누름 등) 화면이 옆으로 밀려 있으면 제자리로 (가로로 밀리는 화면은 없음)
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('pageshow', onVisible); };
  }, []);
  // 앱이 뒤에 있는 동안 알림이 왔는데 알림 대신 앱 아이콘을 눌러 돌아오면: 그사이 온 알림 중 가장 최근 것의 화면으로.
  // 알림을 눌러 돌아온 경우는 그 알림으로 이미 가므로 그대로, 글을 쓰는 중이면 쓰던 글을 지키려고 그대로
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      const since = hiddenAt;
      hiddenAt = 0;
      if (!since || Date.now() - since < 3000) return;
      setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        if (linkHandledAt > since || (lastOpenedLink && lastOpenedLink.at > since)) return;
        if (composerOpenRef.current) return;
        const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.value.trim()) return;
        openShownNotification(since);
      }, 1200);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  // 앱을 쓰는 동안 새로 도착한 알림 → 화면 위 배너 + 소리 + 진동 (앱이 뒤에 있는 동안 온 것은 빼고: visibleSinceRef)
  useEffect(() => {
    if (!user) return;
    const since = Math.max(sessionStartRef.current, visibleSinceRef.current);
    const isNew = (key: string, at?: string) => {
      if (seenAlertKeysRef.current.has(key)) return false;
      seenAlertKeysRef.current.add(key);
      return !!at && new Date(at).getTime() > since; // 앱을 연 뒤에 생긴 것만
    };
    type Candidate = { key: string; icon: string; title: string; body: string; action: () => void; at?: string };
    const fresh: Candidate[] = [];
    followRequests.forEach(r => {
      if (isNew(`f:${r.id}`, r.created_at)) fresh.push({ key: `f:${r.id}`, icon: '👤', title: '새 팔로워', body: `${r.follower.baptismal_name}님이 회원님을 팔로우하기 시작했어요`, action: () => goToProfile(r.follower.id), at: r.created_at });
    });
    unreadMessages.forEach(u => {
      const chattingNow = activeTab === 'chat' && currentChatUser?.id === u.partner.id;
      if (isNew(`m:${u.partner.id}:${u.lastAt}`, u.lastAt) && !chattingNow) fresh.push({ key: `m:${u.partner.id}`, icon: '✉️', title: `${u.partner.baptismal_name}님의 메시지`, body: u.lastMessage, action: () => openChatRoom(u.partner), at: u.lastAt });
    });
    notifications.forEach(n => {
      if (isNew(`c:${n.id}`, n.created_at)) fresh.push({ key: `c:${n.id}`, icon: n.mention ? '🏷️' : '💬', title: n.mention ? '회원님이 언급되었어요' : n.is_reply ? '새 답글' : '새 댓글', body: `${n.author_name}님: ${n.content}`, action: () => openNotification(n), at: n.created_at });
    });
    if (fresh.length === 0) return;
    // 방금 휴대폰 알림 내용을 배너로 띄웠으면 같은 소식을 또 띄우거나 소리 내지 않는다
    if (Date.now() - pushToastAtRef.current < 15000) return;
    // 가장 최근 것을 보여 주고, 여러 건이면 누를 때 알림 목록을 연다 (엉뚱한 한 건으로 가지 않게)
    const latest = [...fresh].sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0];
    setToast(fresh.length > 1 ? { ...latest, body: `${latest.body} 외 ${fresh.length - 1}건`, action: () => openNotifications() } : latest);
    if (alertSoundOn) playAlertSound();
    navigator.vibrate?.([150, 80, 150]);
  }, [notifications, unreadMessages, followRequests]);

  // 게시물 보기를 닫으면 음악도 멈춘다
  useEffect(() => {
    if (selectedPostDetail) return;
    bgmAudioRef.current?.pause();
    setTimeout(() => { setBgmPlaying(false); setViewerQueue(null); }, 0);
  }, [selectedPostDetail]);

  // 축일 카드/안내를 닫았는지 (축일 카드는 하루 단위)
  useEffect(() => {
    if (!user) return;
    setFeastCardDismissed(storageGet(`feastCardDismissed:${user.id}`) === todayKst());
    setFeastPromptDismissed(storageGet(`feastPromptDismissed:${user.id}`) === '1');
  }, [user]);

  // 생일·축일 알림 배너는 하루에 한 번만
  useEffect(() => {
    if (!user || needsProfileSetup || (!isMyFeastToday && visibleFeastFriends.length === 0)) return;
    const key = `feastToast:${user.id}`;
    if (storageGet(key) === todayKst()) return;
    storageSet(key, todayKst());
    const first = visibleFeastFriends[0];
    setToast(myCheer && myCheerText
      ? { key: 'feast:me', icon: CHEER_ICON[myCheer], title: myCheerText.title, body: myCheerText.body, action: () => goToHome() }
      : visibleFeastFriends.length === 1
        ? { key: `feast:${first.id}`, icon: CHEER_ICON[friendCheer(first)], title: `오늘은 ${first.baptismal_name}님의 ${CHEER_WORD[friendCheer(first)]}입니다`, body: '축하해 주세요! 🙏 눌러서 인사 보내기', action: () => congratulateFeast(first) }
        : { key: `feast:${first.id}`, icon: '🎉', title: `오늘은 ${first.baptismal_name}님 외 ${visibleFeastFriends.length - 1}명의 ${cheerWordOfMany(visibleFeastFriends.map(friendCheer))}입니다`, body: '축하해 주세요! 🙏 눌러서 보기', action: () => openNotifications() });
    if (alertSoundOn) playAlertSound();
  }, [user, needsProfileSetup, isMyFeastToday, feastFriends]);

  // 배너는 5초(휴대폰 알림 배너는 8초) 뒤 자동으로 사라짐
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.key.startsWith('push:') ? 8000 : 5000); // 알림 배너는 조금 더 오래
    return () => clearTimeout(t);
  }, [toast]);

  // 휴대폰 알림을 눌러 들어온 곳: 앱 알림 목록(♡)에서 그 알림을 지우고, 같은 곳을 가리키는 휴대폰 알림도 닫는다
  const dismissAlertsFor = (link: NonNullable<typeof deepLink>) => {
    // 앱 알림 목록(♡)에서는 지우지 않고 '확인함'으로만 표시한다 (지우기 전까지 남고, 3일이 지나면 저절로 사라짐)
    markAlertRead(...[
      link.comment && `c:${link.comment}`, link.view && `c:mp:${link.view}`,
      link.profile && `fu:${link.profile}`, link.reply && `c:a:${link.reply}`,
    ].filter((k): k is string => !!k));
    const keyOf = (l: typeof deepLink) => !l ? '' : l.post ? `post:${l.post}` : l.view ? `post:${l.view}` : l.story ? `story:${l.story}`
      : l.chat ? `chat:${l.chat}` : l.profile ? `profile:${l.profile}` : l.anon ? `anon:${l.anon}` : l.lounge ? `lounge:${l.lounge}` : l.group ? `group:${l.group}` : l.gift ? `gift:${l.gift}` : l.letters ? 'letters' : l.tester ? 'tester' : l.feedback ? 'feedback' : l.reports ? 'reports' : '';
    const key = keyOf(link);
    if (!key || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration('/sw.js').then(reg => reg?.getNotifications()).then(list => {
      (list || []).forEach(n => {
        const url = (n.data as { url?: string } | null)?.url;
        if (url && keyOf(deepLinkFromSearch(new URL(url, window.location.origin).search)) === key) n.close();
      });
    }).catch(() => {});
  };

  // 알림을 눌러 들어오면 위에 떠 있던 창부터 닫는다 (사랑방·글 크게 보기·사연함 등에 가려 이동하지 않은 것처럼 보이지 않게)
  // 글쓰기·글 고치기 창은 쓰던 내용이 있을 수 있어 그대로 둔다
  const closeOverlaysForLink = () => {
    setActionModalUser(null); setSelectedPostDetail(null); setSelectedImage(null); setAvatarPreview(null);
    setShowNotifications(false); setShowSettings(false); setShowFeedback(false); setReportTarget(null); setShowNotices(false);
    setShowIntentions(false); setFollowList(null); setShowAdminStats(false); setShowAdminUsage(false); setShowTesterSignup(false); setShowAdminTesters(false); setShowAdminMembers(false); setPostMenuId(null);
    setFabOpen(false); setFeedMenuOpen(false); setCommentSheetId(null); setStoryViewerOpen(false);
    setShowDeletedMessages(false); setShowMediaStorage(false); setShowLetters(false); setShowLounge(false); setShowMyComments(false);
    setOpenGroup(null); setShowNewChat(false); setShowAnon(false);
    setShowBgmAdmin(false); setShowSponsorAdmin(false); setShowInstallGuide(false); setShowFancyName(false); setStickerGiftFor(null);
    setShowDmBookmarks(false); setMessageSheet(null); setSelectCopy(null); setCaptureAsk(null); setCaptured(null); setDmCapture(null);
  };

  // 푸시 알림을 눌러 들어온 경우 해당 글/대화로 이동
  useEffect(() => {
    // 공지 알림은 로그인 없이도 열린다
    if (deepLink?.notice) { closeOverlaysForLink(); closePopup(deepLink.notice); setNoticeAdminMode(false); setNoticeOpenId(deepLink.notice); setShowNotices(true); setDeepLink(null); return; }
    // 공유한 글 링크도 로그인 없이 연다 (공개 글은 누구나 볼 수 있음)
    if (deepLink?.view && !user) { setDeepLink(null); closeOverlaysForLink(); if (currentScreenRef.current.tab !== 'home') goToHome(); openPostView(deepLink.view); return; }
    if (!deepLink || !user) return;
    setDeepLink(null);
    linkHandledAt = Date.now();
    linkLog('open', Object.entries(deepLink).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&'));
    dismissAlertsFor(deepLink);
    closeOverlaysForLink();
    // 글·댓글 알림은 홈 위에 연다 (뒤에 예전에 보던 교우 공간이 깔리지 않게)
    if ((deepLink.post || deepLink.view) && currentScreenRef.current.tab !== 'home') goToHome();
    if (deepLink.post) {
      openPostFromAlert(deepLink.post, deepLink.comment);
    } else if (deepLink.view) {
      openPostView(deepLink.view);
    } else if (deepLink.profile) {
      goToProfile(deepLink.profile);
    } else if (deepLink.anon) {
      setAnonFocusId(deepLink.anon);
      setAnonFocusReply(deepLink.reply || null);
      setShowAnon(true);
    } else if (deepLink.lounge) {
      setLoungeFocusId(deepLink.lounge);
      setShowLounge(true);
    } else if (deepLink.group) {
      // 단체 채팅방 알림: 뒤로가기를 하면 대화 목록으로 오도록 목록 위에 연다
      if (currentScreenRef.current.tab !== 'messages') navigate({ screen: true, tab: 'messages' });
      setMessagesView('group');
      openGroupChat(deepLink.group);
    } else if (deepLink.gift) {
      setForcedGift(deepLink.gift);
    } else if (deepLink.tester) {
      setShowTesterSignup(true);
    } else if (deepLink.letters) {
      setLettersStart('mine');
      setShowLetters(true);
    } else if (deepLink.story) {
      // 홈으로 가서 스토리를 새로 불러온 뒤 그 교우의 스토리를 연다
      if (currentScreenRef.current.tab !== 'home') goToHome();
      fetchStories();
      setStoryOpenRequest(deepLink.story);
    } else if (deepLink.chat) {
      supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', deepLink.chat).maybeSingle()
        // 알림으로 연 대화방도 뒤로가기를 하면 대화 목록으로 가도록 목록을 한 칸 깔고 연다 (상대를 못 찾으면 대화 목록)
        .then(({ data }) => {
          if (currentScreenRef.current.tab !== 'messages') navigate({ screen: true, tab: 'messages' });
          if (!data) return;
          openChatRoom(data);
          if (deepLink.cheer) setMessageInput(cheerMessage(data.baptismal_name || '교우', deepLink.cheer)); // 생일·축일 알림: 축하 인사를 채워 둠
        });
    } else if (deepLink.alerts) {
      openNotifications();
    } else if (deepLink.feedback) {
      // 관리자는 새 건의가 있는 받은 건의함, 회원은 답변이 달린 내 건의 목록으로
      setFeedbackView(isAdmin ? 'inbox' : 'mine');
      setShowFeedback(true);
    } else if (deepLink.reports) {
      setFeedbackView('reports');
      setShowFeedback(true);
    }
  }, [deepLink, user]);

  // 내 글에 달린 댓글 알림: 로그인 중에는 30초마다, 앱으로 돌아왔을 때 다시 확인
  useEffect(() => {
    if (!user) return;
    refreshAlerts(user.id, true);
    pushAlertRef.current = (url: string, title: string, body: string) => {
      refreshAlerts(user.id, url.includes('gift='));
      // 지금 그 사람과 대화 중이면 메시지마다 음성·배너는 생략
      if (viewingRef.current(url)) return;
      // 어디서 온 알림인지 앱 화면 위 배너로도 보여 준다 (컴퓨터에서는 휴대폰 알림이 구석에 조용히 떠서 놓치기 쉬움)
      // 제목 앞 그림(💌 새 사연, 🙋 관리자 호출 …)은 배너 그림으로 쓴다. 누르면 그 글·대화로.
      const m = title.match(/^(\S+)\s+(.+)$/);
      const hasIcon = !!m && !/[\p{L}\p{N}]/u.test(m[1]);
      pushToastAtRef.current = Date.now();
      setToast({
        key: `push:${Date.now()}`, icon: hasIcon ? m[1] : '🔔', title: hasIcon ? m[2] : title || '새 알림', body,
        action: () => { const link = deepLinkFromSearch(new URL(url, window.location.origin).search); if (link) setDeepLink(link); else goToHome(); },
      });
      if (storageGet('alertSound') !== 'off') playAlertSound();
    };
    // 휴대폰 알림(푸시)이 따로 오므로 1분마다만 확인, 앱이 뒤에 있으면 쉰다 (전송량 절약)
    const interval = setInterval(() => { if (document.visibilityState !== 'hidden') refreshAlerts(user.id); }, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshAlerts(user.id); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  // 먼저 안내 창을 띄운다. 안드로이드는 설치 중 'Play 프로텍트' 경고가 뜰 수 있어
  // '무시하고 설치'를 눌러야 한다는 점을 설치 전에 미리 알려준다.
  const handleInstallClick = () => setShowInstallGuide(true);

  // 처음 들어오면 홈 화면 추가 안내를 바로 띄운다 (닫으면 3일 뒤 다시)
  useEffect(() => {
    if (isStandalone || isKakaoInApp || needsProfileSetup || showAuthModal) return;
    const last = Number(storageGet('installPromptAt') || 0);
    if (Date.now() - last < 3 * 24 * 3600e3) return;
    const timer = setTimeout(() => {
      storageSet('installPromptAt', String(Date.now()));
      setShowInstallGuide(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isStandalone, isKakaoInApp, needsProfileSetup, showAuthModal]);

  // 안드로이드 크롬: 안내를 본 뒤 브라우저의 설치 창을 띄움
  const startNativeInstall = async () => {
    if (!installPrompt) return;
    setShowInstallGuide(false);
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (outcome === 'accepted') setIsStandalone(true);
  };

  const dismissInstallBanner = () => {
    setInstallBannerDismissed(true);
    storageSet('installBannerDismissed', '1');
  };

  const fetchCommentCounts = async (postIds: string[]) => {
    if (postIds.length === 0) return;
    const { data } = await supabase.from('comments').select('post_id').in('post_id', postIds);
    const counts: Record<string, number> = Object.fromEntries(postIds.map(id => [id, 0]));
    (data || []).forEach(c => { counts[c.post_id] = (counts[c.post_id] || 0) + 1; });
    setCommentCounts(prev => ({ ...prev, ...counts }));
  };

  // 댓글을 불러오며 댓글별 기도/공감 수도 함께
  const loadCommentsFor = async (postId: string) => {
    const { data } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (!data) return;
    setComments(prev => ({ ...prev, [postId]: data }));
    setCommentCounts(prev => ({ ...prev, [postId]: data.length }));
    loadCommentBadges(data);
    if (data.length === 0) return;
    const { data: reactions } = await supabase.from('comment_reactions').select('comment_id, user_id, reaction_type').in('comment_id', data.map(c => c.id));
    const next: typeof commentReactions = {};
    data.forEach(c => { next[c.id] = { n: {}, mine: [] }; });
    (reactions || []).forEach(r => {
      const entry = next[r.comment_id];
      if (!entry) return;
      entry.n[r.reaction_type] = (entry.n[r.reaction_type] || 0) + 1;
      if (r.user_id === user?.id) entry.mine.push(r.reaction_type);
    });
    setCommentReactions(prev => ({ ...prev, ...next }));
  };

  // type: like(❤️) · pray(🙏) · thumbs · smile · laugh · wow · sad — 누를 때마다 켜고 끈다
  const toggleCommentReaction = async (commentId: string, type: string) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    const mine = (commentReactions[commentId] || NO_REACTIONS).mine.includes(type);
    const apply = (on: boolean) => setCommentReactions(prev => {
      const c = prev[commentId] || NO_REACTIONS;
      if (c.mine.includes(type) === on) return prev;
      return { ...prev, [commentId]: { n: { ...c.n, [type]: Math.max(0, (c.n[type] || 0) + (on ? 1 : -1)) }, mine: on ? [...c.mine, type] : c.mine.filter(t => t !== type) } };
    });
    apply(!mine); // 먼저 화면에 반영
    if (!mine) {
      const emoji = Object.keys(COMMENT_REACTION_TYPES).find(e => COMMENT_REACTION_TYPES[e] === type) || '❤️';
      setCommentPop({ id: commentId, emoji });
      setTimeout(() => setCommentPop(p => (p?.id === commentId ? null : p)), 700);
    }
    const { error } = mine
      ? await supabase.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', user.id).eq('reaction_type', type)
      : await supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: user.id, reaction_type: type });
    if (error && error.code !== '23505') {
      apply(mine);
      if (error.code === '42P01' || error.code === 'PGRST205') alert('댓글 기도/공감 기능을 준비 중이에요. (관리자: supabase/comment-reactions.sql 실행 필요)');
      else if (error.code === '23514') alert('이 감정 표시를 준비 중이에요. (관리자: supabase/comment-reactions.sql 다시 실행 필요)');
    }
  };
  // 댓글도 메시지와 같은 손동작: 꾹 누르기 = 그 자리 메뉴(위에 감정, 아래에 답글·수정·삭제·신고), 두 번 누르기 = 공감(❤️), 옆으로 밀기 = 답글
  type SheetComment = Comment & { _rootId?: string };
  const [commentMenu, setCommentMenu] = useState<{ c: SheetComment; anchor: MenuAnchor | null } | null>(null);
  const [commentPop, setCommentPop] = useState<{ id: string; emoji: string } | null>(null);
  useEffect(() => { setCommentMenu(null); }, [commentSheetId]);
  const commentGestures = usePressGestures<SheetComment>({
    keyOf: c => c.id,
    onDoubleTap: c => toggleCommentReaction(c.id, 'like'),
    onLongPress: (c, el) => setCommentMenu({ c, anchor: anchorOf(el) }),
    onSwipe: c => { if (c.user_id) tagUserInComments(commentSheetId || c.post_id, c.user_id, authorName(c), c._rootId); },
  });

  // 댓글 창 열기 (인스타그램처럼 아래에서 올라옴). 열 때마다 새로 불러온다
  const toggleCommentBox = async (postId: string) => {
    setCommentSheetId(postId);
    setSheetShowsPost(false);
    await loadCommentsFor(postId);
  };
  // 내 댓글 수정 / 삭제 (관리자는 삭제 가능)
  const callCommentApi = async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: '로그인이 필요합니다.' };
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res) return { error: '네트워크 오류가 발생했어요.' };
    const json = await res.json().catch(() => ({}));
    return res.ok ? json : { error: json.error || '처리하지 못했어요.' };
  };

  const startEditComment = (c: Comment) => {
    const parts = splitPostStickers(c.content);
    setEditingCommentId(c.id); setEditCommentText(parts.text); setEditCommentStickers(parts.stickers);
  };
  const saveCommentEdit = async (c: Comment) => {
    const text = joinPostStickers(editCommentText.trim(), editCommentStickers);
    if (!text) return;
    const result = await callCommentApi({ action: 'edit', id: c.id, content: text });
    if (result.error) { alert(result.error); return; }
    setComments(prev => ({ ...prev, [c.post_id]: (prev[c.post_id] || []).map(x => x.id === c.id ? { ...x, content: result.content, edited_at: result.edited_at } : x) }));
    setEditingCommentId(null);
  };

  const deleteComment = async (c: Comment) => {
    if (!(await askConfirm('이 댓글을 삭제할까요?'))) return;
    const result = await callCommentApi({ action: 'delete', id: c.id });
    if (result.error) { alert(result.error); return; }
    setComments(prev => ({ ...prev, [c.post_id]: (prev[c.post_id] || []).filter(x => x.id !== c.id) }));
    setCommentCounts(prev => ({ ...prev, [c.post_id]: Math.max(0, (prev[c.post_id] || 1) - 1) }));
  };

  // 닉네임을 누르면 댓글창을 열고 그 사람을 태그한 채로 입력칸에 커서를 둔다
  // commentId: 이 댓글에 답글 달기 → 답글이 그 댓글 바로 밑에 붙음
  const tagUserInComments = async (postId: string, targetUserId: string, name: string, commentId?: string) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    if (targetUserId !== user.id || commentId) setReplyTargets(prev => ({ ...prev, [postId]: { userId: targetUserId, name, commentId } }));
    if (commentSheetId !== postId) await toggleCommentBox(postId);
    setTimeout(() => (document.getElementById(`comment-input-${postId}`) as HTMLTextAreaElement | null)?.focus(), 150);
  };

  // 방금 올린 댓글이 보이게 댓글 목록을 내리고 잠깐 칠함 (답글은 그 댓글 밑에 붙으므로 맨 아래가 아니라 그 자리로).
  // 이모티콘 칸·미리 보기가 닫히며 목록 높이가 바뀌므로 몇 번 맞춤
  const revealComment = (id: string) => {
    setHighlightCommentId(id);
    const fit = () => {
      const el = document.getElementById(`comment-${id}`);
      const box = el?.closest('.overflow-y-auto');
      if (!el || !box) return;
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      // 다 보이면 그대로, 아니면 가운데로 (답글이면 위의 댓글도 함께 보이게, 맨 아래 댓글은 끝까지만 내려감)
      if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return;
      box.scrollBy({ top: (r.top + r.bottom) / 2 - (b.top + b.bottom) / 2, behavior: 'smooth' });
    };
    [60, 350, 800].forEach(ms => setTimeout(fit, ms));
    setTimeout(() => setHighlightCommentId(prev => (prev === id ? null : prev)), 2500);
  };
  const commentSendingRef = useRef(new Set<string>()); // 엔터가 두 번 들어와도 한 번만 올리게
  // typed: 엔터로 올릴 때 방금 완성된 글자까지 든 입력칸 내용 · sticker: 함께 올릴 이모티콘 (글 끝에 한 줄로)
  const handleAddComment = async (postId: string, opts: { typed?: string; sticker?: Sticker | null } = {}) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    const text = opts.typed ?? commentInputs[postId] ?? '';
    const sticker = opts.sticker || null;
    if ((!text.trim() && !sticker) || commentSendingRef.current.has(postId)) return;
    commentSendingRef.current.add(postId);
    // 입력칸은 바로 비운다: 올리는 동안 이어서 친 글자가 나중에 지워지지 않게 (못 올리면 되돌림)
    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    const author = profile?.baptismal_name || '교우';
    const target = replyTargets[postId];
    const row = { post_id: postId, content: joinPostStickers(text.trim(), sticker ? [sticker] : []), user_id: user.id, author_name: author };
    const replyRow = target ? { ...row, reply_to_user_id: target.userId, reply_to_name: target.name } : row;
    let { data, error } = await supabase.from('comments')
      .insert([target?.commentId ? { ...replyRow, parent_id: target.commentId } : replyRow]).select();
    // 대댓글 칼럼(parent_id)이 아직 없으면(comment-threads.sql 실행 전) 그것만 빼고 저장
    if (error && target?.commentId && (error.code === 'PGRST204' || error.code === '42703')) {
      ({ data, error } = await supabase.from('comments').insert([replyRow]).select());
    }
    // 답글 칼럼이 아직 없으면(SQL 실행 전) 내용 앞에 @이름을 붙여 저장
    if (error && target && (error.code === 'PGRST204' || error.code === '42703')) {
      ({ data, error } = await supabase.from('comments').insert([{ ...row, content: `@${target.name} ${row.content}` }]).select());
    }
    commentSendingRef.current.delete(postId);
    if (error || !data?.[0]) {
      setCommentInputs(prev => ({ ...prev, [postId]: (prev[postId] || '').trim() ? prev[postId] : text }));
      if (sticker) commentSticker.setPicked(sticker);
      if (error) alert(`댓글을 남기지 못했어요.\n(${error.message})`);
      return;
    }
    setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data[0]] }));
    setCommentCounts(prev => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    setReplyTargets(prev => ({ ...prev, [postId]: null }));
    commentSticker.setOpen(false); // 다 쓰고 게시하면 이모티콘 칸도 닫음
    revealComment(data[0].id);
    sendPush('comment', data[0].id);
  };
  // 댓글 이모티콘: 고르면 입력칸 위에 크게 미리 보기 → 게시(또는 같은 이모티콘을 한 번 더)로 쓴 글과 함께 한 댓글로 올림
  const commentSticker = useStickerPicker(s => { if (commentSheetId) handleAddComment(commentSheetId, { sticker: s }); });
  // 댓글 창: × 말고도 손잡이·제목줄이나 (맨 위까지 올라간) 댓글 목록을 아래로 끌어내리면 닫힘 (lib/sheet-drag)
  const commentPull = useSheetDrag(() => setCommentSheetId(null), !!commentSheetId);
  const { setOpen: setCommentStickerOpen, setPicked: setCommentStickerPicked } = commentSticker;
  useEffect(() => { setCommentStickerOpen(false); setCommentStickerPicked(null); }, [commentSheetId, setCommentStickerOpen, setCommentStickerPicked]);
  const submitComment = (postId: string, typed?: string) => {
    const s = commentSticker.picked;
    if (s) commentSticker.setPicked(null);
    handleAddComment(postId, { typed, sticker: s });
  };
  // 댓글 입력칸 엔터: 휴대폰은 줄바꿈(게시 단추로 올림), 컴퓨터는 올리기 · 글에 맞춰 늘어남 (lib/use-enter-send)
  const commentLastSend = useRef({ text: '', at: 0 });
  const commentEnter = useEnterSend(typed => {
    if (!commentSheetId) return;
    const now = Date.now();
    if (typed.trim() === commentLastSend.current.text && now - commentLastSend.current.at < 1000) return; // 엔터 한 번에 두 번 올라가지 않게
    commentLastSend.current = { text: typed.trim(), at: now };
    submitComment(commentSheetId, typed);
  }, commentSheetId ? commentInputs[commentSheetId] || '' : '');

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => setAvatarFile(reader.result?.toString() || null));
      reader.readAsDataURL(e.target.files[0]);
    }
    e.target.value = ''; // 같은 사진을 다시 골라도 동작하도록
  };

  const handleCropSave = async () => {
    if (!croppedAreaPixels || !avatarFile || !user) return;
    setLoading(true);
    try {
      const croppedBlob = await getCroppedImg(avatarFile, croppedAreaPixels);
      const fileName = `${user.id}_${Date.now()}.jpg`;
      const publicUrl = await uploadMedia(croppedBlob, { kind: 'avatars', ext: 'jpg', contentType: 'image/jpeg', bucket: 'avatars', path: fileName });
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      if (updateError) throw updateError;
      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
      setViewingProfile(prev => prev && prev.id === user.id ? { ...prev, avatar_url: publicUrl } : prev);
      setAvatarFile(null);
      fetchPosts();
    } catch (err) { alert('사진 변경에 실패했습니다.'); }
    setLoading(false);
  };

  const isAdmin = !!(user?.email && ADMIN_EMAILS.includes(user.email));
  // 이모티콘을 쓸 수 있는 범위: 관리자 전용·코드로 준 선물(@아이디)·선물받은 것 (lib/stickers)
  useEffect(() => { setStickerAccess({ admin: isAdmin, handle: profile?.handle || null, grants: user ? stickerGrants : [] }); }, [isAdmin, profile?.handle, stickerGrants, user]);

  // 관리자의 선물: 선물받은 전용 이모티콘(sticker_grants·코드에 적은 @아이디) + 선물 대상으로 뽑힌 내 사연.
  // 아직 열지 않은 선물이 있으면 선물 상자를 띄운다 (연 것은 이 휴대폰에 기억, 열지 않고 닫으면 다음에 앱을 열 때 다시)
  const myGifts = useMemo<Gift[]>(() => {
    if (!user) return [];
    const packs = STICKER_PACKS.filter(p => p.access === 'gift' && (stickerGrants.includes(p.id) || isGiftHandle(p, profile?.handle)));
    return [
      ...packs.map(p => ({ key: `sticker:${p.id}`, kind: 'sticker' as const, packId: p.id })),
      ...giftLetters.map(id => ({ key: `letter:${id}`, kind: 'letter' as const, letterId: id })),
    ];
  }, [user, stickerGrants, profile?.handle, giftLetters]);
  useEffect(() => {
    if (!user) { setOpenedGifts(null); return; }
    try { setOpenedGifts(JSON.parse(storageGet(`giftsOpened:${user.id}`) || '[]')); } catch { setOpenedGifts([]); }
    try { setSnoozedGifts(JSON.parse(sessionStorage.getItem('giftsSnoozed') || '[]')); } catch { /* 무시 */ }
  }, [user]);
  // 테스터가 Play 스토어 테스트 앱으로 들어오면 신청 줄에 '앱을 연 때'를 적는다 → 관리자 테스터 화면에 '📱 앱 설치 확인'
  // (supabase/tester-installs.sql 실행 전이거나 신청하지 않은 교우면 아무 일 없음, 한 번 켤 때 한 번만)
  useEffect(() => {
    if (!user || appKind() !== 'play') return;
    try { if (sessionStorage.getItem('playOpenedMarked') === user.id) return; sessionStorage.setItem('playOpenedMarked', user.id); } catch { /* 무시 */ }
    supabase.rpc('mark_tester_play_opened').then(() => {}, () => {});
  }, [user]);
  // 알림으로 연 선물이 내 선물에 없으면(거둬들였거나 잘못된 주소) 잠시 뒤 잊는다
  useEffect(() => {
    if (!forcedGift || myGifts.some(g => g.key === forcedGift)) return;
    const t = setTimeout(() => setForcedGift(null), 8000);
    return () => clearTimeout(t);
  }, [forcedGift, myGifts]);
  const markGiftOpened = (key: string) => {
    if (!user) return;
    setActiveGift(key);
    setOpenedGifts(prev => {
      const next = [...new Set([...(prev || []), key])].slice(-200);
      storageSet(`giftsOpened:${user.id}`, JSON.stringify(next));
      return next;
    });
  };
  const closeGift = (gift: Gift) => {
    setForcedGift(null);
    setActiveGift(null);
    if (openedGifts?.includes(gift.key)) return;
    setSnoozedGifts(prev => {
      const next = [...prev, gift.key];
      try { sessionStorage.setItem('giftsSnoozed', JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  };
  isAdminRef.current = isAdmin;
  // 로그인(관리자 여부)이 정해지면 기도지향을 다시 읽는다 (관리자는 올린 사람까지)
  useEffect(() => { if (user) fetchIntentions(); }, [user?.id, isAdmin]);

  // 관리자 전용: 성직자/수도자 뱃지 지정
  const handleSetBadge = async (targetId: string, badge: string) => {
    const value = badge || null;
    const { data, error } = await supabase.from('profiles').update({ badge_type: value }).eq('id', targetId).select('id');
    // RLS로 막히면 오류 없이 0건이 수정되므로 결과 건수까지 확인
    if (error || !data || data.length === 0) {
      alert('뱃지를 저장하지 못했습니다. Supabase에서 관리자 수정 권한(RLS)을 확인해주세요.');
      return;
    }
    setViewingProfile(prev => prev && prev.id === targetId ? { ...prev, badge_type: value ?? undefined } : prev);
    if (targetId === user?.id) setProfile(prev => prev ? { ...prev, badge_type: value ?? undefined } : prev);
    setBadgeByUser(prev => ({ ...prev, [targetId]: value }));
    fetchPosts();
  };

  // --- 후원 배너 ---
  const fetchSponsorBanners = async () => {
    const { data } = await supabase.from('sponsor_banners').select('*')
      .order('priority', { ascending: false }).order('created_at', { ascending: false });
    setSponsorBanners((data || []) as SponsorBannerData[]);
  };
  // 관리자는 모든 배너를 받아오므로 '지금 진행 중'인 것만 노출
  const liveBanners = sponsorBanners.filter(b => {
    const now = Date.now();
    return b.active && (!b.starts_at || new Date(b.starts_at).getTime() <= now) && (!b.ends_at || new Date(b.ends_at).getTime() > now);
  });
  const topCandidates = liveBanners.filter(b => b.placement !== 'feed');
  const topBanner = topCandidates.length > 0
    ? (() => {
        const best = topCandidates.filter(b => b.priority === topCandidates[0].priority); // 가장 높은 우선순위끼리 번갈아
        return best[Math.floor(topBannerSeed * best.length)];
      })()
    : null;
  const feedBanners = liveBanners.filter(b => b.placement !== 'top');

  // 뒤로가기 처리: 열린 창이 있으면 창만 닫고, 없으면 이전 화면으로. 홈에서는 '한 번 더 누르면 종료'
  const otherModalOpen = !!(actionModalUser || stickerGiftFor || showAuthModal || avatarFile || selectedPostDetail || selectedImage
    || showNotifications || showSettings || showFeedback || reportTarget || showInstallGuide || showSponsorAdmin || showPushPrompt || showAdminMembers || showMusicPicker || showBgmAdmin || (profileEditMode && !needsProfileSetup) || showIntentions || showVideoEditor || showNotices || showComposer || !!editingPostId || !!followList || showAdminStats || showAdminUsage || showTesterSignup || showAdminTesters || !!postMenuId || fabOpen || !!commentSheetId || storyViewerOpen || !!avatarPreview || showDeletedMessages || showMediaStorage || showLetters || feedMenuOpen || showLounge || !!openGroup || showNewChat || !!messageSheet || showAnon || showMyComments);
  // 선물 상자: 알림을 눌러 연 선물은 바로, 아직 열지 않은 선물은 다른 창이 없을 때 (처음 정보 입력 중이 아닐 때)
  const shownGift = activeGift || forcedGift ? myGifts.find(g => g.key === (activeGift || forcedGift))
    : !otherModalOpen && !needsProfileSetup && openedGifts ? myGifts.find(g => !openedGifts.includes(g.key) && !snoozedGifts.includes(g.key)) : undefined;
  // 팝업 공지는 다른 창이 없을 때만, 처음 정보 입력 중이 아닐 때만
  const showPopupNotice = !!popupNotice && !otherModalOpen && !needsProfileSetup && !shownGift;
  const anyModalOpen = otherModalOpen || showPopupNotice || !!shownGift;
  // 창(사진 크게 보기 등)을 열면 뒤로가기 기록 한 칸을 쌓는다 → 스와이프로 뒤로 가면 창만 닫히고 화면은 그대로
  useEffect(() => {
    if (anyModalOpen) {
      if (historyReadyRef.current && !modalHistoryRef.current) {
        modalHistoryRef.current = true;
        window.history.pushState({ ...currentScreenRef.current, modal: true }, '');
      }
    } else if (modalHistoryRef.current) {
      // 단추로 닫힘 → 쌓아 둔 칸을 바로 걷어낸다 (그사이 다른 화면으로 옮겼으면 그 칸은 나중에 뒤로가기 때 건너뛴다)
      modalHistoryRef.current = false;
      const st = window.history.state as { modal?: true } | null;
      if (st && st.modal) { skipNextPopRef.current = true; window.history.back(); }
    }
  }, [anyModalOpen]);
  const closeAllModals = () => {
    // 사진 크게 보기·프로필 카드는 보던 창(글·댓글·사랑방 등) 위에 뜨므로 그것만 닫는다
    if (selectedImage) { setSelectedImage(null); return; }
    if (avatarPreview) { setAvatarPreview(null); return; } // 프로필 카드에서 크게 본 사진이면 사진만 닫고 카드는 그대로
    if (actionModalUser) { setActionModalUser(null); return; }
    if (shownGift) { closeGift(shownGift); return; }
    if (showPopupNotice && popupNotice) closePopup(popupNotice.id);
    setActionModalUser(null); setStickerGiftFor(null); setShowAuthModal(false); setAvatarFile(null); setSelectedPostDetail(null); setSelectedImage(null);
    setShowNotifications(false); setShowSettings(false); setShowFeedback(false); setReportTarget(null);
    setShowInstallGuide(false); setShowSponsorAdmin(false); setShowPushPrompt(false); setShowAdminMembers(false);
    setShowMusicPicker(false); setShowBgmAdmin(false); setProfileEditMode(false); setShowIntentions(false); setShowVideoEditor(false); setShowNotices(false);
    // 음악·영상 꾸미기 창이 위에 열려 있으면 그것만 닫고 글쓰기 창은 둔다
    // 문구 쓰기 단계에서 뒤로 → 사진 고르기 단계로
    if (!showMusicPicker && !showVideoEditor && editingPhotoIdx === null) { if (showComposer && composerStep === 'write') setComposerStep('pick'); else if (showComposer) leaveComposer(); }
    setFeedMenuOpen(false);
    setEditingPhotoIdx(null);
    if (showEditVideoEditor) setShowEditVideoEditor(false); else if (editPhotoEditor) setEditPhotoEditor(null); else setEditingPostId(null);
    setFollowList(null);
    setShowAdminStats(false);
    setShowAdminUsage(false);
    setShowTesterSignup(false);
    setShowAdminTesters(false);
    setPostMenuId(null);
    setFabOpen(false);
    setCommentSheetId(null);
    setStoryViewerOpen(false);
    setAvatarPreview(null);
    setShowDeletedMessages(false);
    setShowMediaStorage(false);
    setShowLetters(false);
    setShowMyComments(false);
    // 사랑방·단체 채팅방 위에 신고·교우 창이 열려 있으면 그것만 닫는다
    if (!reportTarget && !actionModalUser) { setShowLounge(false); setShowAnon(false); }
    if (!reportTarget && !actionModalUser && !showNewChat) setOpenGroup(null);
    setShowNewChat(false);
    setMessageSheet(null);
  };
  backHandlerRef.current = (e: PopStateEvent) => {
    const st = e.state as (ScreenState & { modal?: true }) | { guard: true } | null;
    const staleModalEntry = !!st && 'modal' in st;
    if (skipNextPopRef.current) { skipNextPopRef.current = false; return; }
    if (anyModalOpen) {
      closeAllModals();
      // 창을 열 때 쌓아 둔 칸이 빠진 것이면 그대로 끝 (기록을 다시 쌓지 않아야 브라우저가 앞 칸을 건너뛰지 않는다)
      if (modalHistoryRef.current) { modalHistoryRef.current = false; if (staleModalEntry) window.history.back(); return; }
      window.history.pushState(currentScreenRef.current, ''); // 화면은 그대로 유지
      return;
    }
    // 단추로 닫은 창의 빈 칸이면 한 칸 더 뒤로
    if (staleModalEntry) { window.history.back(); return; }
    if (st && 'guard' in st) {
      // 홈이 아니면 한 단계 위 화면으로: 대화방 → 대화 목록 → 내 공간 → 홈
      const cur = currentScreenRef.current;
      if (cur.tab !== 'home') {
        const parent: ScreenState = cur.tab === 'chat' ? { screen: true, tab: 'messages' }
          : cur.tab === 'messages' && user ? { screen: true, tab: 'profile', viewingUserId: user.id }
          : { screen: true, tab: 'home' };
        window.history.pushState(parent, '');
        applyScreen(parent);
        return;
      }
      if (Date.now() - exitArmedAtRef.current < 2000) { window.history.back(); return; } // 앱 종료
      exitArmedAtRef.current = Date.now();
      window.history.pushState(currentScreenRef.current, '');
      setToast({ key: `exit-${Date.now()}`, icon: '👋', title: '한 번 더 뒤로가기를 하면 종료돼요', body: '', action: () => {}, stay: true });
      return;
    }
    if (st && 'screen' in st) { applyScreen(st); return; }
    applyScreen({ screen: true, tab: 'home' });
  };

  // 글쓰기 추천 태그: 많이 쓰이는 태그 중 아직 글에 없는 것
  const usedInDraft = new Set((content.match(/#([0-9A-Za-z가-힣_]{1,30})/g) || []).map(t => t.slice(1).toLowerCase()));
  const composerTagSuggestions = popularHashtags(posts.map(p => p.content), 12).map(t => t.tag).filter(t => !usedInDraft.has(t)).slice(0, 8);

  const myPosts = posts.filter(post => post.user_id === viewingUserId);

  const mainScrollRef = useRef<HTMLElement>(null); // 앱 화면의 스크롤 영역
  // 키보드가 올라오면 실제로 보이는 높이에 맞춤 (키보드가 화면 높이를 줄이지 않는 휴대폰 대비)
  const [visibleHeight, setVisibleHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      // 입력칸에 글을 쓰는 중일 때만 키보드로 본다 (아이패드는 확대·도구 막대만으로도 보이는 높이가 줄어
      // 키보드가 없는데 화면이 줄어든 채 중간에 멈춰 보였음)
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      const keyboardOpen = typing && window.innerHeight - vv.height > 120;
      setVisibleHeight(keyboardOpen ? Math.round(vv.height) : null);
      if (keyboardOpen) window.scrollTo(0, 0);
    };
    vv.addEventListener('resize', onResize);
    // 입력칸에서 나오면(키보드 내림) 원래 높이로
    const onFocusOut = () => setTimeout(onResize, 150);
    document.addEventListener('focusout', onFocusOut);
    return () => { vv.removeEventListener('resize', onResize); document.removeEventListener('focusout', onFocusOut); };
  }, []);
  // 채팅 중 키보드가 올라오면 마지막 메시지가 보이게
  useEffect(() => {
    if (activeTab === 'chat') setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }), 50);
  }, [visibleHeight, activeTab]);
  const scrollToTop = () => mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  // 화면 스크롤은 홈과 같은 칸을 쓴다 → 홈에서 내려간 채로 내 공간(다른 교우 공간)을 열면 중간부터 보였음. 공간은 늘 맨 위에서 시작
  useLayoutEffect(() => {
    if (activeTab === 'profile') mainScrollRef.current?.scrollTo({ top: 0 });
  }, [activeTab, viewingUserId]);

  // 홈·탐색을 한 번 더 누르면(두 번 누르면) 맨 위로 올라가며 새로 고침
  const [refreshState, setRefreshState] = useState<'' | 'loading' | 'done'>('');
  const lastTabTap = useRef<{ tab: string; at: number }>({ tab: '', at: 0 });
  const refreshFeed = async () => {
    if (refreshState === 'loading') return;
    scrollToTop();
    setRefreshState('loading');
    await Promise.all([fetchPosts(), fetchIntentions(), fetchNotices()]).catch(() => {});
    setRefreshState('done');
    setTimeout(() => setRefreshState(''), 1200);
    window.scrollTo(0, 0); // 문서가 어긋나 있으면 제자리로 (아이패드)
  };
  // 위에서 아래로 당겨 새로고침 (앱 화면 맨 위에서만). 보고 있는 탭에 맞는 것도 함께 새로 불러온다
  const [anonKey, setAnonKey] = useState(0);
  const [pull, setPull] = useState(0); // 당긴 거리(px, 끌림 줄인 값)
  const PULL_TRIGGER = 70;
  const pullRefresh = () => {
    if (activeTab === 'anon') setAnonKey(k => k + 1);
    if (activeTab === 'profile' && viewingUserId) {
      // 공간: 이름·사진, 팔로워 수, 그 사람 글(사진 칸), 태그됨을 보고 있으면 태그된 글까지
      fetchViewingProfile(viewingUserId); fetchFollowData(viewingUserId); fetchUserPosts(viewingUserId);
      if (profileTab === 'tagged' && viewingProfile?.handle) fetchMentionPosts(viewingProfile.handle);
    }
    if (activeTab === 'messages') { fetchChatPartners(); if (user) { fetchUnreadMessages(user.id); fetchLoungeNew(user.id); } if (messagesView === 'allGroups') fetchAdminGroups(); }
    refreshFeed();
  };
  const pullCtx = useRef({ blocked: false, refresh: pullRefresh });
  pullCtx.current = { blocked: anyModalOpen || activeTab === 'chat' || activeTab === 'reels' || refreshState === 'loading', refresh: pullRefresh };
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    let dist = 0;
    // 글을 쓰는 중(입력칸을 누름·키보드가 올라옴)이거나 안쪽 칸이 스크롤된 상태에서 끌면 그 칸을 스크롤해야 한다
    // (그대로 새로고침하면 쓰던 글이 지워지고, 칸 안의 앞줄도 볼 수 없음)
    const isTextField = (n: Element | null) => !!n && (n.matches('textarea, [contenteditable="true"]')
      || (n instanceof HTMLInputElement && !/^(checkbox|radio|button|submit|reset|range|file|image|color)$/.test(n.type)));
    const typing = (t: EventTarget | null) => {
      if (isTextField(document.activeElement)) return true;
      for (let n = t instanceof Element ? t : null; n && n !== el; n = n.parentElement) {
        if (isTextField(n) || n.scrollTop > 0) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      start = null; dist = 0;
      if (pullCtx.current.blocked || el.scrollTop > 0 || e.touches.length !== 1 || typing(e.target)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x, dy = e.touches[0].clientY - start.y;
      if (el.scrollTop > 0 || (dist === 0 && Math.abs(dx) > Math.abs(dy))) { start = null; dist = 0; setPull(0); return; }
      dist = dy > 0 ? Math.min(110, dy * 0.5) : 0;
      // 우리가 당김을 처리하는 동안 아이폰·아이패드 사파리의 출렁임(화면 통째로 끌려 내려감)을 막음
      if (dist > 0 && e.cancelable) e.preventDefault();
      setPull(dist);
    };
    const onEnd = () => {
      if (start && dist >= PULL_TRIGGER) pullCtx.current.refresh();
      start = null; dist = 0;
      setPull(0);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const tapTab = (tab: 'home' | 'explore', go: () => void) => {
    const now = Date.now();
    const again = activeTab === tab || (lastTabTap.current.tab === tab && now - lastTabTap.current.at < 450);
    lastTabTap.current = { tab, at: now };
    if (activeTab !== tab) go();
    if (again) refreshFeed();
  };
  // 메시지·내 공간도 보고 있을 때 한 번 더 누르면 맨 위로 올라가며 새로 고침 (홈처럼)
  const tapTabRefresh = (on: boolean, go: () => void) => { if (on) pullRefresh(); else go(); };

  // 아래로 많이 내려가면 + 버튼 바로 위에 '맨 위로' 버튼 (앱 안쪽 스크롤 기준)
  const [showToTop, setShowToTop] = useState(false);
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const onScroll = () => setShowToTop(el.scrollTop > 900);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  // 글을 쓰는 중(입력칸에 커서가 있을 때)에는 '맨 위로'를 숨긴다 — 키보드 위로 떠서 입력칸을 가리지 않게
  const [typingField, setTypingField] = useState(false);
  useEffect(() => {
    const isField = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || el.isContentEditable
      || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes((el as HTMLInputElement).type)));
    const onIn = (e: FocusEvent) => { if (isField(e.target)) setTypingField(true); };
    const onOut = () => setTimeout(() => setTypingField(isField(document.activeElement)), 100);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, []);

  // 다른 탭으로 가면 + 메뉴 접기
  useEffect(() => { setFabOpen(false); }, [activeTab]);

  // 크게 보기 손가락 밀기: 사진 좌우로 밀면 다음 사진, (탐색에서 열었으면) 위로 밀면 다음 추천 글
  const [viewerQueue, setViewerQueue] = useState<string[] | null>(null);
  const viewerScrollRef = useRef<HTMLDivElement>(null);
  const viewerSideRef = useRef<HTMLDivElement>(null); // 가로로 든 아이패드: 오른쪽 글 칸 (따로 스크롤)
  const viewerTouch = useRef<{ x: number; y: number; atTop: boolean; atBottom: boolean; onImage: boolean } | null>(null);
  // 위아래로 밀 때 카드가 손가락을 따라 움직이고, 다음 글이 아래에서 이어서 올라옴
  const [viewerDrag, setViewerDrag] = useState(0);
  const [viewerAnimating, setViewerAnimating] = useState(false);
  const [viewerTextOpen, setViewerTextOpen] = useState(false); // 크게 보기 글: 처음엔 짧게, 누르면 전체
  const viewerCardRef = useRef<HTMLDivElement>(null);
  // 다음 글 미리보기가 지금 글 바로 아래(위)에 붙어서 따라오도록 하는 거리
  // 밀기 시작할 때 지금 카드의 위치 (다음 글 미리보기를 바로 아래에 16px 띄워 붙임)
  const viewerCardRect = useRef<{ top: number; bottom: number }>({ top: 100, bottom: 700 });
  const viewerGap = () => viewerCardRect.current.bottom - viewerCardRect.current.top + 16;
  const viewerNeighbor = (dir: 1 | -1) => {
    if (!viewerQueue || !selectedPostDetail) return null;
    const queue = viewerQueue.filter(id => posts.some(p => p.id === id));
    return posts.find(p => p.id === queue[queue.indexOf(selectedPostDetail.id) + dir]) || null;
  };
  const viewerStep = (dir: 1 | -1) => {
    const next = viewerNeighbor(dir);
    if (!next) { setViewerAnimating(true); setViewerDrag(0); return false; }
    const gap = viewerGap();
    setViewerAnimating(true);
    setViewerDrag(dir === 1 ? -gap : gap); // 지금 글이 위(아래)로 빠져나가고 바로 아래 붙어 있던 다음 글이 가운데로
    setTimeout(() => {
      bgmAudioRef.current?.pause();
      setBgmPlaying(false);
      setViewerAnimating(false);
      setViewerDrag(0);
      setViewerTextOpen(false);
      openPostViewer(next);
      viewerScrollRef.current?.scrollTo({ top: 0 });
      viewerSideRef.current?.scrollTo({ top: 0 });
    }, 260);
    return true;
  };
  const onViewerTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    // 손가락이 닿은 곳을 실제로 스크롤하는 칸 (가로로 든 아이패드는 오른쪽 글 칸, 아니면 전체)
    let el: HTMLElement | null = viewerScrollRef.current;
    for (let n = e.target as HTMLElement | null; n && n !== viewerCardRef.current; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2) { el = n; break; }
    }
    setViewerAnimating(false);
    const rect = viewerCardRef.current?.getBoundingClientRect();
    if (rect && viewerDrag === 0) viewerCardRect.current = { top: rect.top, bottom: rect.bottom };
    viewerTouch.current = {
      x: t.clientX, y: t.clientY,
      atTop: !el || el.scrollTop <= 2,
      atBottom: !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
      onImage: !!(e.target as HTMLElement).closest?.('[data-viewer-media]'),
    };
  };
  const onViewerTouchMove = (e: React.TouchEvent) => {
    const start = viewerTouch.current;
    if (!start || !viewerQueue) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (Math.abs(dy) < Math.abs(dx) * 1.2) return;
    if ((dy < 0 && start.atBottom && viewerNeighbor(1)) || (dy > 0 && start.atTop && viewerNeighbor(-1))) setViewerDrag(dy);
  };
  const onViewerTouchEnd = (e: React.TouchEvent) => {
    const start = viewerTouch.current;
    viewerTouch.current = null;
    if (!start || !selectedPostDetail) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    const images = selectedPostDetail.images || [];
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2 && start.onImage && images.length > 1 && !selectedPostDetail.video_url) {
      setDetailImageIndex(i => Math.max(0, Math.min(images.length - 1, i + (dx < 0 ? 1 : -1))));
      return;
    }
    if (viewerDrag !== 0 && Math.abs(dy) > 80) { viewerStep(dy < 0 ? 1 : -1); return; }
    if (viewerDrag !== 0) { setViewerAnimating(true); setViewerDrag(0); } // 덜 밀었으면 제자리로
  };

  // 크게 보기: 사진을 한 번 누르면 사진만 크게, 두 번 누르면 공감
  const [viewerBurst, setViewerBurst] = useState(0);
  const viewerDoubleTapLike = () => {
    if (!selectedPostDetail) return;
    setViewerBurst(Date.now());
    likeByDoubleTap(selectedPostDetail.id);
  };
  const viewerImageTap = useDoubleTap(() => {
    const images = selectedPostDetail?.images || [];
    if (images.length) setSelectedImage({ images, index: Math.min(detailImageIndex, images.length - 1) });
  }, viewerDoubleTapLike);

  // 기도·공감·댓글·메시지 버튼 (피드와 크게 보기에서 같이 씀)
  // showCounts=false: 피드처럼 숫자는 버튼 아래 줄에 따로 보여 줄 때
  const reactionButtons = (post: Post, onComment: () => void, showCounts = true) => (
    <>
      {(() => {
        const prayed = myPostReactions.has(`${post.id}:pray`);
        const liked = myPostReactions.has(`${post.id}:like`);
        return (
          <>
            {/* 글자 없이 그림만. 누르면 손·하트가 진한 색으로 꽉 채워짐 */}
            <button onClick={() => handleReaction(post.id, 'pray')} aria-pressed={prayed} aria-label={`기도 ${post.pray_count || 0}`} className={`flex items-center gap-1.5 ${prayed ? 'text-amber-900 font-bold' : 'text-stone-600'}`}>
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors ${prayed ? 'bg-amber-100 text-amber-700' : 'bg-amber-50 text-amber-700'}`}><Icon name="pray" fill={prayed} className="w-[1.375rem] h-[1.375rem]" /></span>
              {showCounts && post.pray_count > 0 && post.pray_count}
            </button>
            <button onClick={() => handleReaction(post.id, 'like')} aria-pressed={liked} aria-label={`공감 ${post.like_count || 0}`} className={`flex items-center gap-1.5 ${liked ? 'text-rose-700 font-bold' : 'text-stone-600'}`}>
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors ${liked ? 'bg-rose-100 text-rose-600' : 'bg-rose-50 text-rose-600'}`}><Icon name="heart" fill={liked} className="w-[1.375rem] h-[1.375rem]" /></span>
              {showCounts && post.like_count > 0 && post.like_count}
            </button>
          </>
        );
      })()}
      <button onClick={onComment} aria-label={`댓글 ${commentCounts[post.id] || 0}`} className="flex items-center gap-1.5 text-stone-600">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sky-50 text-sky-800"><Icon name="reply" className="w-[1.375rem] h-[1.375rem]" /></span>
        {/* 댓글 수는 언제나 말풍선 옆에 */}
        {commentCounts[post.id] ? <span className="text-[0.9375rem] font-bold text-sky-900">{commentCounts[post.id]}</span> : null}
      </button>
      {/* 글쓴이에게 바로 메시지 */}
      {user?.id !== post.user_id && (
        <button
          onClick={() => openChatRoom({ id: post.user_id, baptismal_name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type })}
          aria-label={`${post.author_name}님에게 메시지 보내기`}
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-700"
        >
          <Icon name="message" className="w-[1.375rem] h-[1.375rem]" />
        </button>
      )}
    </>
  );

  return (
    <main
      ref={mainScrollRef}
      // 페이지 전체가 아니라 앱 안쪽만 스크롤 → 휴대폰 브라우저가 스스로 띄우는 '맨 위로' 버튼이 나오지 않음
      style={visibleHeight ? { height: visibleHeight } : undefined}
      className={`w-full max-w-xl tablet:max-w-none mx-auto h-[100dvh] sm:border-x tablet:border-x-0 border-stone-200 bg-stone-50/30 flex flex-col font-sans relative ${activeTab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain [&>*]:shrink-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))]'}`}
    >
      
      {/* 헤더 */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-stone-200 px-3 sm:px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between gap-2 z-20">
        {activeTab === 'chat' ? (
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button onClick={() => window.history.back()} className="text-stone-600 hover:text-black" aria-label="뒤로">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            {/* 사진·이름을 누르면 그 교우 프로필 카드 (공간 방문하기·팔로우·소개, 사진은 카드에서 눌러 크게) */}
            <button type="button" disabled={!currentChatUser}
              onClick={() => currentChatUser && openProfileCard({ id: currentChatUser.id, name: currentChatUser.baptismal_name, avatar_url: currentChatUser.avatar_url, handle: currentChatUser.handle, badge_type: currentChatUser.badge_type })}
              className="flex items-center gap-2 min-w-0 text-left" aria-label={`${currentChatUser?.baptismal_name || '교우'}님 프로필 보기`}>
              {currentChatUser?.avatar_url ? (
                <img loading="lazy" src={currentChatUser.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-stone-200 shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold shrink-0">{initial(currentChatUser?.baptismal_name)}</div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <h1 className="font-bold text-stone-900 text-sm truncate">{currentChatUser?.baptismal_name}</h1>
                  <RoleBadge type={currentChatUser?.badge_type} />
                </div>
                <p className="text-[0.75rem] text-stone-400 truncate">@{currentChatUser?.handle}</p>
              </div>
            </button>
          </div>
        ) : null}
        {activeTab === 'chat' && currentChatUser ? (
          <div className="flex items-center">
            {dmBookmarks.list.length > 0 && <button onClick={() => setShowDmBookmarks(true)} className="w-10 h-10 flex items-center justify-center text-lg" aria-label={`책갈피 ${dmBookmarks.list.length}개 보기`}><Icon name="bookmark" fill className="w-6 h-6 text-amber-600" /></button>}
            <button onClick={() => openProfileCard({ id: currentChatUser.id, name: currentChatUser.baptismal_name, avatar_url: currentChatUser.avatar_url, handle: currentChatUser.handle, badge_type: currentChatUser.badge_type })} className="text-stone-500 hover:text-stone-900 px-2 text-lg font-bold" aria-label="더보기">⋯</button>
          </div>
        ) : (
          <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {/* 인스타그램처럼: 왼쪽 + · 가운데 이름 ▾ · 오른쪽 ♡ */}
            <div className="flex items-center">
              <button onClick={openComposer} className="w-10 h-10 -ml-1.5 flex items-center justify-center text-stone-900" aria-label="새 글 만들기">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-7 h-7"><path d="M12 4.5v15M4.5 12h15" /></svg>
              </button>
            </div>
            <div className="relative">
              <button onClick={() => { if (activeTab !== 'home') { goToHome(); return; } setFeedMenuOpen(o => !o); }} className="flex items-center gap-1" aria-label="보기 고르기" aria-expanded={feedMenuOpen}>
                <img loading="lazy" src="/icon-v2-192.png" alt="" className="w-6 h-6 rounded-md shadow-sm" />
                <h1 className="font-serif font-bold text-stone-900 tracking-tight text-[1.1875rem] whitespace-nowrap">가톨릭그램</h1>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`w-4 h-4 text-stone-700 transition-transform ${feedMenuOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {feedMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFeedMenuOpen(false)} />
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden z-40" role="menu">
                    {([['all', '전체 보기', 'stack'], ['media', '사진·영상만', 'image'], ['text', '글만', 'pencil']] as const).map(([key, label, icon]) => (
                      <button key={key} role="menuitem" onClick={() => { setFeedFilter(key); setFeedMenuOpen(false); window.scrollTo({ top: 0 }); }} className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-[1rem] text-stone-900 border-b border-stone-100 last:border-0 active:bg-stone-50">
                        <Icon name={icon} className="w-5 h-5 text-stone-700" />
                        <span className="flex-1">{label}</span>
                        {feedFilter === key && <span className="text-blue-600 font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end min-w-0">
              {user ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* 사연 보내기 (관리자에게만) — 관리자는 사연함 */}
                  <button onClick={() => { setLettersStart('write'); setShowLetters(true); }} className="relative text-[1.3125rem] leading-none" aria-label={isAdmin ? '사연함' : '사연 보내기'}>
                    💌
                    {isAdmin && letterNewCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{letterNewCount > 9 ? '9+' : letterNewCount}</span>
                    )}
                  </button>
                  {/* 고민상담 (익명 게시판) — 새 글 수 */}
                  <button onClick={() => setShowAnon(true)} className={`relative ${showAnon ? 'text-violet-700' : 'text-stone-800'} hover:text-stone-900`} aria-label={anonUnread > 0 ? `고민상담 새 글 ${anonUnread}개` : '고민상담'}>
                    <Icon name="dove" className="w-6 h-6" />
                    {anonUnread > 0 && activeTab !== 'anon' && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-violet-600 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{anonUnread > 9 ? '9+' : anonUnread}</span>
                    )}
                  </button>
                  {/* 알림 ♡ (인스타그램처럼 빨간 점) */}
                  <button onClick={openNotifications} className="relative text-stone-900" aria-label="알림">
                    <Icon name="bell" className="w-[1.625rem] h-[1.625rem]" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAuthModal(true)} className="text-xs font-semibold bg-stone-900 text-white px-3.5 py-1.5 rounded-full">로그인</button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 1. 홈 탭 */}
      {activeTab === 'home' && (
        <>
          {/* 스토리 동그라미 줄 (인스타그램처럼 맨 위) */}
          <Stories
            posts={storyPosts}
            unavailable={storiesUnavailable}
            openRequest={storyOpenRequest}
            onOpenHandled={() => setStoryOpenRequest(null)}
            pickRequest={storyPickRequest}
            onPosted={fetchStories}
            onDelete={deleteStory}
            myReactions={myPostReactions}
            commentCounts={commentCounts}
            onReact={(id, type) => handleReaction(id, type)}
            onComment={id => toggleCommentBox(id)}
            me={user && profile ? { id: user.id, name: profile.baptismal_name, avatar: profile.avatar_url } : null}
            followingIds={followingIds}
            blockedIds={blockedIds}
            isAdmin={isAdmin}
            viewerOpen={storyViewerOpen}
            setViewerOpen={setStoryViewerOpen}
            onOpenProfile={id => openProfileCard({ id })}
            onMessage={u => openChatRoom(u)}
            onNeedLogin={() => setShowAuthModal(true)}
            canPost={requireProfile}
          />
          {user && needsProfileSetup && setupDismissed && (
            <button onClick={() => setSetupDismissed(false)} className="w-full px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-left">
              <Icon name="eye" className="w-5 h-5 shrink-0" />
              <span className="flex-1 text-xs text-stone-700 leading-snug"><b>둘러보는 중이에요.</b> 프로필을 만들면 글·댓글·기도지향을 쓸 수 있어요.</span>
              <span className="text-xs font-bold bg-stone-900 text-white rounded-lg px-3 py-1.5 shrink-0">만들기</span>
            </button>
          )}
          {/* 관리자 공지 (홈 맨 위) */}
          {homeNotice && (
            <div className="flex items-center bg-amber-50 border-b border-amber-200">
              <button onClick={() => { setNoticeAdminMode(false); setNoticeOpenId(homeNotice.id); setShowNotices(true); }} className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left">
                <span className="shrink-0 text-xs font-bold text-white bg-amber-600 rounded-full px-2 py-0.5"><Icon name="megaphone" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />공지</span>
                <span className="text-sm font-bold text-stone-800 truncate">{homeNotice.title}</span>
              </button>
              <button onClick={() => hideNotice(homeNotice.id)} className="shrink-0 flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-stone-800 px-3 py-2.5" aria-label="공지 다시 안 보기">다시 안 보기 <span className="text-lg leading-none">×</span></button>
            </div>
          )}
          {/* 오늘의 기도지향: 한 줄로 계속 흘러감, 누르면 모아 보기 */}
          {visibleIntentions.length > 0 ? (
            <button onClick={() => { setShowIntentions(true); }} className="w-full flex items-center bg-gradient-to-r from-[#101a3f] to-[#1f2f66] text-[#fbe7b0] border-b border-[#c99330]/40 overflow-hidden" aria-label="오늘의 기도지향 모아 보기">
              <span className="shrink-0 pl-3 pr-2 py-2 text-xs font-bold bg-[#101a3f] z-10 shadow-[6px_0_8px_-4px_#101a3f]"><Icon name="pray" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-[#fbe7b0]" />오늘의 기도</span>
              <span className="flex-1 overflow-hidden whitespace-nowrap py-2">
                <span className="inline-block intention-marquee" style={{ ['--marquee-duration' as string]: `${Math.max(18, visibleIntentions.reduce((n, i) => n + (i.title || i.content).length, 0) * 0.4)}s` }}>
                  {[0, 1].map(copy => (
                    <span key={copy} className="pr-8">
                      {visibleIntentions.map(i => (
                        <span key={`${copy}-${i.id}`} onClick={() => setOpenIntentionId(i.id)} className="mr-8 text-[0.875rem]">
                          <span className="text-white/50 mr-2">✝</span>{i.title || i.content}
                        </span>
                      ))}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          ) : (
            <button onClick={() => setShowIntentions(true)} className="w-full px-3 py-2 text-left text-xs bg-gradient-to-r from-[#101a3f] to-[#1f2f66] text-[#fbe7b0] border-b border-[#c99330]/40">
              🙏 오늘의 첫 기도지향을 올려주세요 <span className="text-white/60">· 눌러서 바로 작성</span>
            </button>
          )}
          {!isStandalone && !installBannerDismissed && !isKakaoInApp && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
              <img loading="lazy" src="/icon-v2-192.png" alt="" className="w-8 h-8 rounded-lg" />
              <p className="flex-1 text-xs text-stone-700 leading-snug">
                <b>가톨릭그램</b>을 홈 화면에 추가하고<br />앱처럼 바로 열어보세요
              </p>
              <button onClick={handleInstallClick} className="bg-stone-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shrink-0">추가하기</button>
              <button onClick={dismissInstallBanner} className="text-stone-400 hover:text-stone-700 text-lg leading-none px-1" aria-label="닫기">×</button>
            </div>
          )}
          {topBanner && <SponsorBanner banner={topBanner} variant="top" />}
          {user && !feastCardDismissed && (isMyFeastToday || visibleFeastFriends.length > 0) && (
            <div className="mx-4 mt-3 p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-violet-50 border border-amber-200 shadow-sm relative">
              <button onClick={dismissFeastCard} className="absolute top-2 right-3 text-stone-400 hover:text-stone-700 text-lg leading-none" aria-label="닫기">×</button>
              {isMyFeastToday && (
                <div className="text-center pr-4">
                  <div className="flex justify-center"><IconBadge name="candle" tone="gold" size="lg" /></div>
                  <p className="font-serif font-bold text-stone-900 mt-1">{profile?.baptismal_name}님, {myCheerText?.title}</p>
                  <p className="text-sm text-stone-600 mt-1 leading-relaxed">{myCheer === 'birthday' ? <>태어나신 오늘,<br />주님의 축복이 가득하시길 기도합니다 🙏</> : myCheer === 'both' ? <>주님의 축복과 주보성인의 전구가<br />늘 함께하시길 기도합니다 🙏</> : <>주님의 은총과 주보성인의 전구가<br />늘 함께하시길 기도합니다 🙏</>}</p>
                </div>
              )}
              {visibleFeastFriends.length > 0 && (
                <div className={`flex flex-col gap-2 ${isMyFeastToday ? 'mt-3 pt-3 border-t border-amber-200' : ''}`}>
                  <p className="text-sm font-bold text-stone-800 pr-4"><Icon name="candle" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-amber-600" />오늘 {cheerWordOfMany(visibleFeastFriends.map(friendCheer))}인 교우</p>
                  {visibleFeastFriends.map(f => (
                    <div key={f.id} className="flex items-center gap-2.5">
                      <button onClick={() => goToProfile(f.id)} className="flex-1 flex items-center gap-2.5 min-w-0 text-left">
                        {f.avatar_url
                          ? <img loading="lazy" src={f.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-stone-200 shrink-0" />
                          : <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold shrink-0">{initial(f.baptismal_name)}</div>}
                        <span className="text-sm text-stone-800 truncate">{CHEER_ICON[friendCheer(f)]} <b>{f.baptismal_name}</b>님의 {CHEER_WORD[friendCheer(f)]}이에요</span>
                      </button>
                      <button onClick={() => congratulateFeast(f)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">축하하기</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {user && profile && !profile.feast_day && feastPromptDismissed === false && (
            <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-white border border-stone-200 flex items-center gap-3">
              <IconBadge name="candle" tone="gold" />
              <p className="flex-1 text-xs text-stone-700 leading-snug"><b>축일을 등록해보세요</b><br />축일에 축하 인사를 받고, 팔로워에게도 알려드려요</p>
              <button onClick={() => { setSettingsView('feast'); setShowSettings(true); }} className="bg-stone-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shrink-0">등록</button>
              <button onClick={dismissFeastPrompt} className="text-stone-400 hover:text-stone-700 text-lg leading-none px-1" aria-label="닫기">×</button>
            </div>
          )}
          {user && profile && isAndroid && testerStatus === 'none' && !testerPromptDismissed && (
            <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-white border border-emerald-200 flex items-center gap-3">
              <IconBadge name="phone" tone="green" />
              <p className="flex-1 text-xs text-stone-700 leading-snug"><b>안드로이드 앱 테스터를 모집해요</b><br />2주만 도와주시면 플레이 스토어에 올라가요 🙏</p>
              <button onClick={() => setShowTesterSignup(true)} className="bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shrink-0">신청</button>
              <button onClick={dismissTesterPrompt} className="text-stone-400 hover:text-stone-700 text-lg leading-none px-1" aria-label="닫기">×</button>
            </div>
          )}
          {/* 글쓰기: 인스타그램 '새 게시물'처럼 전체 화면 (닫거나 다른 화면으로 가면 쓰던 글은 '작성하던 게시글이 취소됩니다' 확인 후 버림) */}
          {showComposer && (() => {
            const canShare = !loading && !videoStatus && !!(content.trim() || selectedFiles.length > 0 || selectedVideo || composerStickers.length > 0);
            const shownIdx = Math.min(composerPhotoIdx, Math.max(0, previewUrls.length - 1));
            const insertToken = (token: string) => {
              setContent(c => (c && !/\s$/.test(c) ? `${c} ${token}` : `${c}${token}`));
              setTimeout(() => { const el = captionRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
            };
            const row = 'w-full flex items-center gap-3 px-4 py-3.5 text-left border-b border-stone-100 active:bg-stone-50';
            return (
          <div className={`fixed inset-0 z-[70] flex flex-col ${composerStep === 'pick' ? 'bg-black text-white' : 'bg-white'}`} role="dialog" aria-label="새 게시물">
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" id="photo-upload" />
            <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" id="photo-camera" />
            <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoChange} className="hidden" id="video-upload" />
            {composerStep === 'pick' ? (
              <>
                {/* 1단계 (인스타그램처럼 어두운 화면): ✕ · 새 게시물 · 다음 */}
                <div className="shrink-0 flex items-center justify-between px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
                  <button type="button" onClick={() => leaveComposer()} className="w-11 h-11 flex items-center justify-center text-white text-3xl leading-none" aria-label="닫기">×</button>
                  <h2 className="font-bold text-[1.125rem]">새 게시물</h2>
                  <button type="button" onClick={() => setComposerStep('write')} className="px-3 h-11 text-[1.0625rem] font-bold text-[#4a9dff]">다음</button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  {/* 크게 보기 (3×3 안내선) */}
                  <div className="relative w-full aspect-square max-h-[48dvh] mx-auto bg-[#111] flex items-center justify-center overflow-hidden">
                    {videoPreviewUrl ? (
                      <video src={videoPreviewUrl} muted playsInline loop autoPlay className="w-full h-full object-contain" />
                    ) : previewUrls.length > 0 ? (
                      <img src={previewUrls[shownIdx]} alt="미리보기" className="w-full h-full object-contain" />
                    ) : (
                      <label htmlFor="photo-upload" className="cursor-pointer flex flex-col items-center gap-3 text-white/80">
                        <span className="w-20 h-20 rounded-full border-2 border-white/60 flex items-center justify-center"><Icon name="camera" className="w-10 h-10" /></span>
                        <span className="text-[1.0625rem] font-bold">사진을 골라 주세요</span>
                        <span className="text-[0.875rem] text-white/50">사진 없이 글만 쓰려면 위의 &lsquo;다음&rsquo;</span>
                      </label>
                    )}
                    {(previewUrls.length > 0 || videoPreviewUrl) && (
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                        {Array.from({ length: 9 }).map((_, i) => <span key={i} className="border-[0.5px] border-white/35" />)}
                      </div>
                    )}
                    {previewUrls.length > 0 && !videoPreviewUrl && (
                      <button type="button" onClick={() => setEditingPhotoIdx(shownIdx)} className="absolute bottom-3 left-3 w-11 h-11 rounded-full bg-black/60 flex items-center justify-center text-white" aria-label="사진 자르기·가리기">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                      </button>
                    )}
                    {videoPreviewUrl && <button type="button" onClick={clearVideo} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white text-xl leading-none" aria-label="영상 빼기">×</button>}
                    {previewUrls.length > 1 && <span className="absolute top-3 right-3 text-[0.8125rem] font-bold text-white bg-black/55 rounded-full px-2.5 py-0.5">{shownIdx + 1}/{previewUrls.length}</span>}
                  </div>
                  {videoStatus && <p className="px-4 py-2 text-[0.8125rem] text-violet-200 font-bold bg-violet-900/40">{videoStatus} <span className="font-normal text-violet-200/70">· 그동안 꾸미기·글쓰기를 할 수 있어요</span></p>}
                  {/* 최근 ▾ · 여러 장 선택 */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <label htmlFor="photo-upload" className="cursor-pointer flex items-center gap-1 text-[1.0625rem] font-bold">
                      최근 항목
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M6 9l6 6 6-6" /></svg>
                    </label>
                    <button type="button" onClick={() => setComposerMulti(m => !m)} aria-pressed={composerMulti} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[0.875rem] font-bold ${composerMulti ? 'bg-[#4a9dff] text-white' : 'bg-white/15 text-white'}`}>
                      <Icon name="stack" className="w-4 h-4" />{composerMulti ? '여러 장 선택 중' : '여러 장 선택'}
                    </button>
                  </div>
                  {/* 사진 칸: 카메라 · 앨범 · 영상 · 고른 사진 */}
                  <div className="grid grid-cols-4 gap-[2px]">
                    <label htmlFor="photo-camera" className="cursor-pointer aspect-square bg-[#262626] flex flex-col items-center justify-center gap-1 text-white">
                      <Icon name="camera" className="w-8 h-8" /><span className="text-[0.75rem]">사진 찍기</span>
                    </label>
                    <label htmlFor="photo-upload" className="cursor-pointer aspect-square bg-[#3a3a3a] flex flex-col items-center justify-center gap-1 text-white">
                      <Icon name="image" className="w-8 h-8" /><span className="text-[0.75rem] font-bold">사진첩 열기</span>
                    </label>
                    <label htmlFor="video-upload" className="cursor-pointer aspect-square bg-[#262626] flex flex-col items-center justify-center gap-1 text-white">
                      <Icon name="video" className="w-8 h-8" /><span className="text-[0.75rem]">영상</span>
                    </label>
                    {/* 사진첩에서 고른 사진 미리보기 (최근 것이 앞에) */}
                    {tray.map(item => {
                      const pos = selectedFiles.indexOf(item.file);
                      const focused = pos >= 0 && pos === shownIdx;
                      return (
                        <button key={item.url} type="button" onClick={() => pickFromTray(item)} className="relative aspect-square" aria-label={pos >= 0 ? `고른 사진 ${pos + 1}` : '사진 고르기'} aria-pressed={pos >= 0}>
                          <img src={item.url} alt="" className="w-full h-full object-cover" />
                          {focused && <span className="pointer-events-none absolute inset-0 bg-white/35" />}
                          {composerMulti
                            ? <span className={`pointer-events-none absolute top-1.5 right-1.5 w-6 h-6 rounded-full border-2 border-white text-white text-[0.75rem] font-bold flex items-center justify-center ${pos >= 0 ? 'bg-[#4a9dff]' : 'bg-black/25'}`}>{pos >= 0 ? pos + 1 : ''}</span>
                            : pos >= 0 && <span className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-[#4a9dff]" />}
                        </button>
                      );
                    })}
                    {/* 이번에 찍은 사진 등 사진 칸에 없는 고른 사진 */}
                    {previewUrls.map((url, idx) => tray.some(t => t.file === selectedFiles[idx]) ? null : (
                      <div key={url} className="relative aspect-square">
                        <button type="button" onClick={() => setComposerPhotoIdx(idx)} className="w-full h-full" aria-label={`${idx + 1}번째 사진 크게 보기`}>
                          <img src={url} alt="" className={`w-full h-full object-cover ${idx === shownIdx ? 'opacity-60' : ''}`} />
                        </button>
                        {composerMulti && <span className="pointer-events-none absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#4a9dff] border-2 border-white text-white text-[0.75rem] font-bold flex items-center justify-center">{idx + 1}</span>}
                        <button type="button" onClick={() => { removeFile(idx); setComposerPhotoIdx(i => Math.max(0, i >= idx ? i - 1 : i)); }} className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-[0.875rem] leading-none" aria-label="사진 빼기">×</button>
                      </div>
                    ))}
                  </div>
                  <p className="px-4 pt-3 pb-4 text-[0.8125rem] text-white/50 leading-relaxed">
                    {tray.length === 0
                      ? <>📱 <b className="text-white/80">사진첩 열기</b>에서 사진을 <b className="text-white/80">여러 장 한꺼번에</b> 고르면 고른 사진이 모두 한 게시물에 올라가요 ({MAX_PHOTOS}장까지).</>
                      : composerMulti ? `누르는 순서대로 번호가 붙어요 · ${MAX_PHOTOS}장까지 · 큰 사진을 한 번 더 누르면 빠져요` : '올릴 사진을 누르세요 · 여러 장을 올리려면 위의 \u2018여러 장 선택\u2019'}
                  </p>
                </div>
                {/* 맨 아래: 게시물 · 스토리 · 영상 */}
                <div className="shrink-0 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex justify-center">
                  <div className="flex items-center gap-1 bg-[#262626]/95 rounded-full p-1 shadow-lg">
                    <span className="px-4 py-2 rounded-full bg-white/15 text-white text-[0.9375rem] font-bold">게시물</span>
                    <button type="button" onClick={() => { const pick = () => setStoryPickRequest(n => n + 1); if (leaveComposer(pick)) pick(); }} className="px-4 py-2 rounded-full text-white/75 text-[0.9375rem] font-bold">스토리</button>
                    <label htmlFor="video-upload" className="cursor-pointer px-4 py-2 rounded-full text-white/75 text-[0.9375rem] font-bold">영상</label>
                  </div>
                </div>
              </>
            ) : (
            <form onSubmit={handleCreatePost} className="flex-1 min-h-0 flex flex-col">
              {/* 2단계: ← · 새 게시물 · 공유 */}
              <div className="shrink-0 flex items-center justify-between px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 border-b border-stone-200">
                <button type="button" onClick={() => setComposerStep('pick')} className="w-11 h-11 flex items-center justify-center text-stone-800" aria-label="뒤로 (사진 고르기)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h2 className="font-bold text-[1.0625rem] text-stone-900">새 게시물</h2>
                <button type="submit" disabled={!canShare} className="px-3 h-11 text-[1rem] font-bold text-blue-600 disabled:text-stone-300">{loading ? '올리는 중' : '공유'}</button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {/* 사진·영상 크게 */}
                {videoPreviewUrl ? (
                  <div className="relative bg-black flex justify-center [container-type:inline-size]">
                    <video src={videoPreviewUrl} muted playsInline loop autoPlay className="w-full max-h-[55dvh] aspect-[4/5] object-contain" />
                    <OverlayLayer overlays={composerOverlays} />
                    <button type="button" onClick={() => setShowVideoEditor(true)} className="absolute bottom-3 left-3 px-3.5 py-2 rounded-full bg-white/90 text-stone-900 text-[0.875rem] font-bold shadow"><Icon name="sparkle" className="w-4 h-4 inline-block align-[-0.2em] mr-1" />영상 꾸미기</button>
                    <button type="button" onClick={clearVideo} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white text-xl leading-none" aria-label="영상 빼기">×</button>
                  </div>
                ) : previewUrls.length > 0 ? (
                  <>
                    <div className="relative bg-stone-100 flex justify-center">
                      <img src={previewUrls[shownIdx]} alt="미리보기" className="w-full max-h-[55dvh] aspect-[4/5] object-contain" />
                      {previewUrls.length > 1 && <span className="absolute top-3 right-3 text-[0.8125rem] font-bold text-white bg-black/50 rounded-full px-2.5 py-0.5">{shownIdx + 1}/{previewUrls.length}</span>}
                      <button type="button" onClick={() => setEditingPhotoIdx(shownIdx)} className="absolute bottom-3 left-3 px-3.5 py-2 rounded-full bg-white/90 text-stone-900 text-[0.875rem] font-bold shadow">✂️ 자르기·가리기</button>
                    </div>
                    <div className="flex gap-2 px-3 py-2.5 overflow-x-auto border-b border-stone-100">
                      {previewUrls.map((url, idx) => (
                        <div key={idx} className={`relative shrink-0 w-16 h-16 rounded-lg overflow-hidden ${idx === shownIdx ? 'ring-2 ring-blue-500' : ''}`}>
                          <button type="button" onClick={() => setComposerPhotoIdx(idx)} className="w-full h-full"><img src={url} alt="" className="w-full h-full object-cover" /></button>
                          <button type="button" onClick={() => { removeFile(idx); setComposerPhotoIdx(i => Math.max(0, i >= idx ? i - 1 : i)); }} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/65 text-white text-[0.8125rem] leading-none" aria-label="사진 빼기">×</button>
                        </div>
                      ))}
                      {previewUrls.length < MAX_PHOTOS && (
                        <label htmlFor="photo-upload" className="shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-stone-300 flex flex-col items-center justify-center text-stone-500 cursor-pointer">
                          <Icon name="plus" className="w-5 h-5" /><span className="text-[0.6875rem]">추가</span>
                        </label>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-stone-50 border-b border-stone-100 px-4 py-6 flex flex-col items-center gap-3">
                    <div className="flex gap-3 w-full max-w-sm">
                      <label htmlFor="photo-upload" className="flex-1 cursor-pointer rounded-2xl bg-white border border-stone-200 py-5 flex flex-col items-center gap-1.5 shadow-sm">
                        <Icon name="image" className="w-8 h-8 text-stone-800" /><span className="text-[0.9375rem] font-bold text-stone-800">사진 선택</span><span className="text-[0.75rem] text-stone-400">최대 {MAX_PHOTOS}장</span>
                      </label>
                      <label htmlFor="video-upload" className="flex-1 cursor-pointer rounded-2xl bg-white border border-stone-200 py-5 flex flex-col items-center gap-1.5 shadow-sm">
                        <Icon name="video" className="w-8 h-8 text-stone-800" /><span className="text-[0.9375rem] font-bold text-stone-800">영상 선택</span><span className="text-[0.75rem] text-stone-400">1분 이하</span>
                      </label>
                    </div>
                    <p className="text-[0.8125rem] text-stone-400">사진 없이 글만 써도 돼요</p>
                  </div>
                )}
                {videoStatus && <p className="px-4 py-2 text-[0.8125rem] text-violet-700 font-bold bg-violet-50"><Icon name="video" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />{videoStatus}</p>}

                {/* 프로필 사진 + 문구 입력 */}
                <div className="flex gap-3 px-4 pt-4 pb-2">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <span className="w-10 h-10 rounded-full bg-stone-200 text-stone-600 font-serif font-bold flex items-center justify-center shrink-0">{initial(profile?.baptismal_name, '교')}</span>}
                  <textarea ref={captionRef} value={content} onChange={(e) => setContent(e.target.value)} placeholder="문구 입력... (기도, 묵상, 감사한 일을 나눠 주세요)" rows={5} className="flex-1 min-w-0 py-2 text-[1rem] leading-relaxed bg-transparent resize-none focus:outline-none placeholder:text-stone-400" />
                </div>
                <div className="px-4">
                  {user && <MentionSuggest value={content} onChange={setContent} excludeId={user.id} />}
                </div>
                {user && composerTagSuggestions.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-3">
                    {composerTagSuggestions.map(t => (
                      <button key={t} type="button" onClick={() => insertToken(`#${t} `)} className="shrink-0 text-[0.8125rem] text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-3 py-1">#{t}</button>
                    ))}
                  </div>
                )}

                {/* 붙인 이모티콘 (× 로 빼기) */}
                {composerStickers.length > 0 && <div className="px-4 pb-3"><PostStickers stickers={composerStickers} size="w-24 h-24" onRemove={i => setComposerStickers(prev => prev.filter((_, j) => j !== i))} /></div>}

                {/* 인스타그램처럼 아래 목록 */}
                <div className="border-t border-stone-100">
                  <button type="button" onClick={() => setComposerStickerOpen(o => !o)} className={row} aria-expanded={composerStickerOpen}>
                    <Icon name="smiley" className="w-6 h-6 text-stone-800 shrink-0" />
                    <span className="flex-1 text-[0.9375rem] text-stone-900">이모티콘 넣기</span>
                    {composerStickers.length > 0 && <span className="text-[0.875rem] text-stone-500">{composerStickers.length}개</span>}
                    <span className="text-stone-400 text-xl">{composerStickerOpen ? '⌄' : '›'}</span>
                  </button>
                  {composerStickerOpen && <StickerPanel picker={postStickerPicker(composerStickerOpen, setComposerStickerOpen, composerStickers, setComposerStickers)} />}
                  <button type="button" onClick={() => setShowMusicPicker(true)} className={row}>
                    <Icon name="music" className="w-6 h-6 text-stone-800 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[0.9375rem] text-stone-900">음악 추가</span>
                      {composerMusic && <span className="block text-[0.8125rem] text-violet-700 truncate">{composerMusic.title}{musicRangeLabel(composerMusic.value) ? ` · ${musicRangeLabel(composerMusic.value)}` : ''}</span>}
                    </span>
                    <span className="text-stone-400 text-xl">›</span>
                  </button>
                  {composerMusic && (
                    <div className="flex gap-2 px-4 py-2 border-b border-stone-100 bg-violet-50/50">
                      {canAdjustMusic(composerMusic.value) && <button type="button" onClick={() => openMusicSegment('composer', composerMusic)} className="text-[0.8125rem] font-bold text-violet-700 bg-white border border-violet-200 rounded-lg px-3 py-1.5">구간 조절</button>}
                      <button type="button" onClick={() => setComposerMusic(null)} className="text-[0.8125rem] font-bold text-stone-600 bg-white border border-stone-200 rounded-lg px-3 py-1.5">음악 빼기</button>
                    </div>
                  )}
                  <button type="button" onClick={() => insertToken('@')} className={row}>
                    <Icon name="user" className="w-6 h-6 text-stone-800 shrink-0" />
                    <span className="flex-1 text-[0.9375rem] text-stone-900">사람 태그하기</span>
                    <span className="text-stone-400 text-xl">›</span>
                  </button>
                  <button type="button" onClick={() => insertToken('#')} className={row}>
                    <Icon name="tag" className="w-6 h-6 text-stone-800 shrink-0" />
                    <span className="flex-1 text-[0.9375rem] text-stone-900">해시태그 추가</span>
                    <span className="text-stone-400 text-xl">›</span>
                  </button>
                  <button type="button" onClick={() => setComposerVisOpen(o => !o)} className={row}>
                    <Icon name={VISIBILITY[composerVisibility].icon} className="w-6 h-6 text-stone-800 shrink-0" />
                    <span className="flex-1 text-[0.9375rem] text-stone-900">공개 범위</span>
                    <span className="text-[0.875rem] text-stone-500">{VISIBILITY[composerVisibility].label}</span>
                    <span className="text-stone-400 text-xl">{composerVisOpen ? '⌄' : '›'}</span>
                  </button>
                  {composerVisOpen && user && (
                    <div className="px-4 py-3 border-b border-stone-100">
                      <VisibilityPicker value={composerVisibility} onChange={v => { setComposerVisibility(v); storageSet('postVisibility', v); }} />
                    </div>
                  )}
                </div>
              </div>

              {/* 맨 아래 큰 공유 단추 */}
              <div className="shrink-0 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-stone-200 bg-white">
                <button type="submit" disabled={!canShare} className="w-full py-3.5 rounded-xl bg-blue-600 disabled:bg-stone-300 text-white text-[1rem] font-bold">{loading ? (videoStatus || '올리는 중...') : videoStatus ? `${videoStatus.replace('영상 용량을 줄이는 중...', '영상 준비 중')} · 끝나면 공유` : '공유'}</button>
              </div>
            </form>
            )}
            {/* 사진 자르기·가리기 */}
            {editingPhotoIdx !== null && selectedFiles[editingPhotoIdx] && (
              <PhotoEditor
                file={selectedFiles[editingPhotoIdx]}
                onCancel={() => setEditingPhotoIdx(null)}
                onDone={edited => {
                  const idx = editingPhotoIdx;
                  const oldFile = selectedFiles[idx]; const newUrl = URL.createObjectURL(edited);
                  setSelectedFiles(prev => prev.map((f, i) => (i === idx ? edited : f)));
                  setPreviewUrls(prev => prev.map((u, i) => { if (i !== idx) return u; URL.revokeObjectURL(u); return newUrl; }));
                  setTray(prev => prev.map(t => (t.file === oldFile ? { file: edited, url: newUrl } : t)));
                  setEditingPhotoIdx(null);
                }}
              />
            )}
          </div>
            );
          })()}

          <section className="flex-1 flex flex-col gap-2 bg-stone-200">
            {(() => {
              const hasMedia = (p: Post) => !!p.video_url || !!(p.images && p.images.length > 0);
              // 홈은 불러온 범위까지만 (다른 사람 공간에서 불러온 오래된 글이 중간에 끼지 않게)
              // 알림으로 찾아간 글은 불러온 범위·보기 거르기와 상관없이 보인다
              const filtered = posts.filter(post => !blockedIds.has(post.user_id)
                && (post.id === focusPostId || ((!feedHasMore || !feedOldest || post.created_at >= feedOldest)
                && (feedFilter === 'all' || (feedFilter === 'media' ? hasMedia(post) : !hasMedia(post))))));
              if (filtered.length === 0 && posts.length > 0) {
                return <div className="py-16 text-center text-sm text-stone-400">{feedFilter === 'media' ? '아직 사진·영상 글이 없어요.' : '아직 글만 쓴 나눔이 없어요.'}</div>;
              }
              // 홈은 누가 올렸든 최신순 (가장 최근 글이 맨 위)
              const shown = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              return shown.map((post, postIndex) => {
              const canDelete = user?.id === post.user_id || (user?.email && ADMIN_EMAILS.includes(user.email));
              // 게시글 FEED_BANNER_EVERY 개마다 후원 배너를 번갈아 끼움
              const slot = (postIndex + 1) % FEED_BANNER_EVERY === 0 ? (postIndex + 1) / FEED_BANNER_EVERY - 1 : -1;
              const inlineBanner = slot >= 0 && feedBanners.length > 0 ? feedBanners[slot % feedBanners.length] : null;
              return (
                <Fragment key={post.id}>
                <article id={`post-${post.id}`} className={`bg-gradient-to-b from-white to-stone-100 flex flex-col pb-4 sm:pb-5 shadow-[0_1px_0_rgb(var(--stone-300))] scroll-mt-[calc(4rem+env(safe-area-inset-top))] transition-shadow duration-700 ${highlightPostId === post.id ? 'ring-4 ring-inset ring-amber-300' : ''}`}>
                  {/* 인스타그램처럼: 맨 위 프로필·이름·⋯ → 사진 → 버튼 → 숫자 → 글 → 댓글 n개 → 시간 */}
                  <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5">
                    <button onClick={() => openProfileCard({ id: post.user_id, name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type })} className="shrink-0" aria-label={`${post.author_name}님 프로필`}>
                      {post.avatar_url
                        ? <img loading="lazy" src={post.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-stone-300" />
                        : <span className="w-9 h-9 rounded-full bg-stone-200 text-stone-600 text-sm font-serif font-bold flex items-center justify-center">{initial(post.author_name, '교')}</span>}
                    </button>
                    <div className="min-w-0 flex-1 flex flex-col items-start">
                      <button onClick={() => openProfileCard({ id: post.user_id, name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type })} className="max-w-full flex items-center gap-1 text-[0.9375rem] font-bold text-stone-900 text-left"><span className="truncate">{post.author_name}</span><RoleBadge type={post.badge_type} size="xs" showLabel={false} /></button>
                      {/* 음악: 누르면 크게 보기에서 재생 */}
                      {parsePostMusic(post.music) && (
                        <button onClick={() => openPostViewer(post)} className="max-w-full flex items-center gap-1 text-[0.75rem] text-stone-500"><Icon name="music" className="w-3 h-3 shrink-0" /><span className="truncate">{post.music_title || '음악'}</span></button>
                      )}
                    </div>
                    {post.visibility && post.visibility !== 'public' && <span className="shrink-0 text-[0.75rem] bg-stone-100 text-stone-600 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><Icon name={VISIBILITY[post.visibility].icon} className="w-3.5 h-3.5" />{VISIBILITY[post.visibility].label}</span>}
                    {/* 인스타그램처럼 아직 팔로우하지 않은 교우는 '팔로우' */}
                    {user && post.user_id !== user.id && !followingIds.has(post.user_id) && (
                      <button onClick={() => toggleFollow(post.user_id, 'none')} className="shrink-0 px-3.5 py-1.5 rounded-lg bg-stone-200/80 hover:bg-stone-300/80 text-[0.875rem] font-bold text-stone-900">팔로우</button>
                    )}
                    {(canDelete || user) && (
                      <button onClick={() => setPostMenuId(postMenuId === post.id ? null : post.id)} className="w-10 h-10 -mr-2 shrink-0 flex items-center justify-center rounded-full text-stone-700 hover:bg-stone-100" aria-label="더보기 (고치기·지우기)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-6 h-6"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                      </button>
                    )}
                  </div>
                  {/* 사진·영상 크게 (여러 장이면 옆으로 넘김) — 누르면 크게 보기 */}
                  {post.video_url && (
                    <PostVideo
                      src={post.video_url}
                      poster={post.video_poster}
                      overlays={post.video_overlays}
                      hasMusic={!!parsePostMusic(post.music)}
                      musicTitle={post.music_title}
                      onOpen={() => openPostViewer(post)}
                      onDoubleTap={() => likeByDoubleTap(post.id)}
                    />
                  )}
                  {!post.video_url && post.images && post.images.length > 0 && (
                    <PostPhotos
                      images={post.images}
                      onOpen={i => openPostViewer(post, i)} // 사진을 누르면 크게 보기(글·음악과 함께), 거기서 한 번 더 누르면 확대·이동
                      onDoubleTap={() => likeByDoubleTap(post.id)}
                      musicTitle={post.music_title}
                    />
                  )}

                  <div className="px-3 sm:px-4 flex flex-col gap-1.5">
                    {/* 기도·공감·댓글·메시지 버튼 (숫자는 아래 줄에) */}
                    <div className={`flex items-center gap-x-2.5 ${(post.images && post.images.length > 0) || post.video_url ? 'pt-2' : ''}`}>
                      {reactionButtons(post, () => toggleCommentBox(post.id), false)}
                    </div>
                    {(post.pray_count > 0 || post.like_count > 0 || (commentCounts[post.id] || 0) > 0) && (
                      <p className="text-[0.875rem] font-bold text-stone-900">
                        {[post.pray_count > 0 && `기도 ${post.pray_count}명`, post.like_count > 0 && `공감 ${post.like_count}명`, (commentCounts[post.id] || 0) > 0 && `댓글 ${commentCounts[post.id]}개`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {(() => {
                      // 사진·영상이 있는 글은 첫 줄, 글만 있는 글은 두 줄만 보이고 끝에 '... 더 보기' → 누르면 전체
                      const hasMedia = !!post.video_url || !!(post.images && post.images.length > 0);
                      const { text: shownText, stickers } = splitPostStickers(post.content);
                      return (
                      <>
                      {stickers.length > 0 && <PostStickers stickers={stickers} size={hasMedia ? 'w-24 h-24' : 'w-32 h-32'} />}
                      <ClampText
                        lines={hasMedia ? 1 : 2}
                        expanded={expandedPosts.has(post.id)}
                        onExpand={() => setExpandedPosts(prev => new Set(prev).add(post.id))}
                        onCollapse={() => setExpandedPosts(prev => { const next = new Set(prev); next.delete(post.id); return next; })}
                        className="text-stone-800 text-[1rem] whitespace-pre-wrap leading-relaxed"
                        prefixText={post.author_name}
                        prefix={
                          /* 글 앞에 굵은 이름: 누르면 그 사람의 공간으로 */
                          <button onClick={e => { e.stopPropagation(); openProfileCard({ id: post.user_id, name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type }); }} className="font-bold text-stone-900 mr-1.5">{post.author_name}</button>
                        }
                        text={shownText}
                        renderText={t => <HashtagText text={t} onTag={openHashtag} onMention={goToHandle} />}
                      />
                      </>
                      );
                    })()}


                    {(commentCounts[post.id] || 0) > 0 && (
                      <button onClick={() => toggleCommentBox(post.id)} className="self-start text-[0.9375rem] text-stone-500">댓글 {commentCounts[post.id]}개 모두 보기</button>
                    )}
                    <p className="text-[0.75rem] text-stone-400">{timeAgo(post.created_at)}</p>

                  </div>
                </article>
                {inlineBanner && <SponsorBanner banner={inlineBanner} variant="feed" />}
                </Fragment>
              );
            });
            })()}
            {posts.length > 0 && <LoadMore hasMore={feedHasMore} loading={feedLoadingMore} onMore={loadMorePosts} />}
          </section>
        </>
      )}

      {/* 2. 프로필 탭 */}
      {activeTab === 'profile' && (
        <section className="flex-1 bg-white flex flex-col">
          {/* 인스타그램처럼: 왼쪽 사진 + 오른쪽 숫자 → 이름·소개 → 버튼 → 아이콘 탭 → 3칸 바둑판 */}
          <div className="px-4 pt-5 pb-3 bg-white">
            <div className="flex items-center gap-5">
              {(() => {
                const avatar = viewingProfile?.avatar_url ? (
                  <img loading="lazy" src={viewingProfile.avatar_url} alt="프로필" className="w-[5.5rem] h-[5.5rem] rounded-full object-cover border border-stone-200" />
                ) : (
                  <div className="w-[5.5rem] h-[5.5rem] bg-stone-200 text-stone-600 rounded-full flex items-center justify-center text-4xl font-serif font-bold">
                    {initial(viewingProfile?.baptismal_name, '교')}
                  </div>
                );
                // 오늘이 생일·축일이면 사진 위 리본·아래 비둘기
                const days = spaceDays?.id === viewingUserId ? spaceDays : null;
                const celebrate = (node: React.ReactNode) => <CelebrateAvatar size={5.5} birthday={isTodayMonthDay(days?.birthday)} feast={isTodayMonthDay(days?.feast_day)}>{node}</CelebrateAvatar>;
                // 내 프로필: 사진을 누르면 프로필 사진 바꾸기
                return celebrate(viewingUserId === user?.id ? (
                  <label className="relative cursor-pointer shrink-0" aria-label="프로필 사진 바꾸기">
                    {avatar}
                    <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center border-2 border-white shadow"><Icon name="plus" className="w-4 h-4" /></span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                  </label>
                ) : viewingProfile?.avatar_url ? (
                  <button onClick={() => setAvatarPreview({ url: viewingProfile.avatar_url!, name: viewingProfile.baptismal_name })} className="shrink-0" aria-label="프로필 사진 크게 보기">{avatar}</button>
                ) : <div className="shrink-0">{avatar}</div>);
              })()}
              <div className="flex-1 grid grid-cols-3 text-center">
                <div><p className="text-lg font-bold text-stone-900">{myPosts.length}</p><p className="text-[0.8125rem] text-stone-600">게시물</p></div>
                <button onClick={() => openFollowList('followers')}><p className="text-lg font-bold text-stone-900">{followData.followers}</p><p className="text-[0.8125rem] text-stone-600">팔로워</p></button>
                <button onClick={() => openFollowList('following')}><p className="text-lg font-bold text-stone-900">{followData.following}</p><p className="text-[0.8125rem] text-stone-600">팔로잉</p></button>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center gap-1">
                <h2 className="text-[1rem] font-bold text-stone-900">{viewingProfile?.baptismal_name || '교우'}</h2>
                <RoleBadge type={viewingProfile?.badge_type} size="md" />
              </div>
              <p className="text-[0.8125rem] text-stone-400">@{viewingProfile?.handle || 'user'}</p>
              {/* 한 줄 소개: 내 공간이면 눌러서 쓰기·고치기 */}
              {bioDraft !== null ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  <textarea autoFocus value={bioDraft} onChange={e => setBioDraft(e.target.value.slice(0, 80))} rows={2} placeholder="예: 수원교구 ○○성당 / 매일 묵주기도 함께해요 🙏" className="w-full p-2.5 text-sm bg-white border border-stone-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">{bioDraft.length}/80</span>
                    <span className="flex gap-1.5">
                      <button onClick={() => setBioDraft(null)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">취소</button>
                      <button onClick={saveBio} className="px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold">저장</button>
                    </span>
                  </div>
                </div>
              ) : viewingBio ? (
                <p onClick={viewingUserId === user?.id ? () => setBioDraft(viewingBio) : undefined} className={`mt-1 text-[0.9375rem] text-stone-800 whitespace-pre-wrap leading-relaxed ${viewingUserId === user?.id ? 'cursor-pointer' : ''}`}>{viewingBio}</p>
              ) : viewingUserId === user?.id && (
                <button onClick={() => setBioDraft('')} className="mt-1 text-[0.8125rem] text-stone-500"><Icon name="pencil" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />나를 소개하는 한 마디 쓰기</button>
              )}
              {isAdmin && viewingRealName && (
                <p className="inline-block text-xs text-stone-500 mt-1 bg-stone-100 rounded-lg px-2 py-0.5"><Icon name="lock" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />실명: {viewingRealName} <span className="text-stone-400">(관리자만 보임)</span></p>
              )}
            </div>

            {/* 버튼: 두 칸씩 나란히 — 회색 단추(프로필 편집·메시지·내 댓글·설정), 테두리 단추(다른 계정으로 로그인·로그아웃) */}
            {(() => {
              const btn = 'flex-1 py-2 rounded-lg text-[0.875rem] font-bold bg-stone-100 text-stone-900 hover:bg-stone-200 transition-colors inline-flex items-center justify-center gap-1.5';
              const btnPrimary = 'flex-1 py-2 rounded-lg text-[0.875rem] font-bold bg-blue-500 text-white hover:bg-blue-600 transition-colors inline-flex items-center justify-center gap-1.5'; // 화면 색의 주요 색
              const ico = 'w-[1.1em] h-[1.1em] shrink-0';
              const sub = 'min-h-[2.25rem] px-2 py-1.5 rounded-lg border border-stone-200 text-[0.8125rem] font-bold text-stone-600 hover:bg-stone-50 inline-flex items-center justify-center gap-1.5 leading-tight';
              return viewingUserId === user?.id ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <button onClick={openProfileEdit} className={btnPrimary}><Icon name="pencil" className={ico} />프로필 편집</button>
                    <button onClick={() => goToTab('messages')} className={btn}>
                      <Icon name="message" className={ico} />메시지
                      {messageBadgeCount > 0 && <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{messageBadgeCount > 9 ? '9+' : messageBadgeCount}</span>}
                    </button>
                    <button onClick={() => setShowMyComments(true)} className={btn}><Icon name="reply" className={ico} />내 댓글</button>
                    <button onClick={() => { setSettingsView('main'); setShowSettings(true); }} className={btn}><Icon name="gear" className={ico} />설정</button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <button onClick={switchAccount} className={sub}><Icon name="users" className={ico} />다른 계정으로 로그인</button>
                    <button onClick={logout} className={sub}><Icon name="signout" className={ico} />로그아웃</button>
                  </div>
                  {/* 생일을 아직 안 적은 교우: 한 번 안내 (생일 칸이 있을 때만 — supabase/birthday.sql) */}
                  {profile?.birthday === null && !birthdayPromptHidden && (
                    <div className="mt-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3 flex items-center gap-3">
                      <span className="text-[1.75rem] leading-none" aria-hidden="true">🎂</span>
                      <button onClick={openProfileEdit} className="flex-1 min-w-0 text-left">
                        <p className="text-[0.9375rem] font-bold text-stone-900">생일을 알려 주세요</p>
                        <p className="text-[0.8125rem] text-stone-600 leading-snug">생일 날 프로필 사진 위에 축하 리본이 달려요</p>
                      </button>
                      <button onClick={openProfileEdit} className="shrink-0 px-3 py-2 rounded-xl bg-rose-500 text-white text-[0.875rem] font-bold">적기</button>
                      <button onClick={() => { storageSet(`birthdayPromptHidden:${user.id}`, '1'); setBirthdayPromptHidden(true); }} className="shrink-0 w-8 h-8 text-stone-400 text-xl leading-none" aria-label="생일 안내 닫기">×</button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {isAdmin && (
                      <>
                        <button onClick={() => setShowAdminMembers(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-900 inline-flex items-center gap-1"><Icon name="users" className="w-3.5 h-3.5" />회원 명단</button>
                        <button onClick={() => setShowAdminStats(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-sky-200 bg-sky-50 text-sky-900 inline-flex items-center gap-1"><Icon name="chart" className="w-3.5 h-3.5" />접속 통계</button>
                        <button onClick={() => setShowAdminUsage(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-sky-200 bg-sky-50 text-sky-900 inline-flex items-center gap-1"><Icon name="stack" className="w-3.5 h-3.5" />데이터 사용량</button>
                        <button onClick={() => setShowAdminTesters(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-900 inline-flex items-center gap-1"><Icon name="phone" className="w-3.5 h-3.5" />테스터 신청</button>
                        <button onClick={() => { setNoticeOpenId(null); setNoticeAdminMode(true); setShowNotices(true); }} className="px-3 py-1.5 rounded-full text-xs font-bold border border-violet-200 bg-violet-50 text-violet-900 inline-flex items-center gap-1"><Icon name="megaphone" className="w-3.5 h-3.5" />전체 공지</button>
                        <button onClick={() => setShowSponsorAdmin(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-amber-200 bg-amber-50 text-amber-800 inline-flex items-center gap-1"><Icon name="storefront" className="w-3.5 h-3.5" />광고 관리</button>
                        <button onClick={() => setShowDeletedMessages(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-stone-200 bg-stone-50 text-stone-700 inline-flex items-center gap-1"><Icon name="trash" className="w-3.5 h-3.5" />삭제된 메시지</button>
                        <button onClick={() => setShowMediaStorage(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200 bg-emerald-50 text-emerald-800 inline-flex items-center gap-1"><Icon name="image" className="w-3.5 h-3.5" />사진 저장소</button>
                        <button onClick={() => setShowLetters(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-rose-200 bg-rose-50 text-rose-800 inline-flex items-center gap-1">💌 사연함{letterNewCount > 0 && <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[0.6875rem] rounded-full flex items-center justify-center">{letterNewCount}</span>}</button>
                      </>
                    )}
                    <button onClick={() => setShowFeedback(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-stone-200 bg-white text-stone-700 inline-flex items-center gap-1"><Icon name="envelope" className="w-3.5 h-3.5" />{isAdmin ? '건의함' : '건의하기'}</button>
                    {!isStandalone && (
                      <button onClick={handleInstallClick} className="px-3 py-1.5 rounded-full text-xs font-bold border border-stone-200 bg-white text-stone-700 inline-flex items-center gap-1"><Icon name="phone" className="w-3.5 h-3.5" />홈 화면에 추가</button>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-3 flex gap-1.5">
                  <button onClick={() => toggleFollow(viewingUserId!, followData.status)} className={followData.status === 'none' ? 'flex-1 py-2 rounded-lg text-[0.875rem] font-bold bg-blue-500 text-white hover:bg-blue-600' : btn}>
                    {followData.status === 'none' ? '팔로우' : '팔로잉 ▾'}
                  </button>
                  <button onClick={() => viewingProfile && openChatRoom(viewingProfile)} disabled={!viewingProfile} className={btn}>메시지</button>
                </div>
              );
            })()}

            {isAdmin && viewingProfile && (
              <div className="mt-3 flex items-center gap-2 text-xs bg-white border border-stone-200 rounded-xl px-3 py-2">
                <span className="font-bold text-stone-600"><Icon name="crown" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-amber-600" />관리자 · 인증 뱃지</span>
                <select
                  value={viewingProfile.badge_type || ''}
                  onChange={(e) => handleSetBadge(viewingProfile.id, e.target.value)}
                  className="border border-stone-300 rounded-lg px-2 py-1 bg-white focus:outline-none"
                >
                  <option value="">없음</option>
                  {Object.entries(BADGES).map(([key, b]) => <option key={key} value={key}>{b.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* 아이콘 탭: 게시물 / 영상 / 태그됨 */}
          <div className="flex border-t border-stone-200 bg-white">
            {([['posts', '게시물', 'stack'], ['videos', '영상', 'video'], ['tagged', '태그됨', 'user']] as const).map(([key, label, icon]) => (
              <button key={key} onClick={() => setProfileTab(key)} aria-label={label} className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[0.75rem] font-bold border-t-2 -mt-px ${profileTab === key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400'}`}>
                <Icon name={icon} className="w-6 h-6" />{label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-0.5 bg-white">
            {(() => {
              const gridPosts = profileTab === 'posts'
                ? myPosts
                : profileTab === 'videos'
                ? myPosts.filter(p => p.video_url)
                : posts.filter(p => p.user_id !== viewingUserId && !blockedIds.has(p.user_id) && mentionsHandle(p.content, viewingProfile?.handle));
              return gridPosts.length === 0 ? (
              <div className="col-span-3 p-12 text-center text-stone-400 text-sm bg-white">{profileTab === 'posts' ? '게시물이 없습니다.' : profileTab === 'videos' ? '아직 올린 영상이 없어요.' : '아직 태그된 글이 없어요.'}</div>
            ) : (
              gridPosts.map((post) => (
                <div 
                  key={post.id} 
                  onClick={() => openPostViewer(post)} 
                  className="aspect-square bg-stone-100 relative group overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                >
                  {post.visibility && post.visibility !== 'public' && <span className="absolute top-1 left-1 z-10 text-[0.6875rem] bg-black/55 text-white rounded-full px-1.5 py-0.5"><Icon name={VISIBILITY[post.visibility].icon} className="w-3.5 h-3.5" /></span>}
                  {post.music && <span className="absolute top-1 right-1 z-10 text-xs bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center"><Icon name="music" className="w-3.5 h-3.5" /></span>}
                  {post.video_url
                    ? <span className="absolute bottom-1.5 right-1.5 z-10 text-white drop-shadow"><Icon name="play" fill className="w-5 h-5" /></span>
                    : (post.images?.length || 0) > 1 && <span className="absolute bottom-1.5 right-1.5 z-10 text-white drop-shadow"><Icon name="stack" fill className="w-5 h-5" /></span>}
                  {post.video_url ? (
                    post.video_poster
                      ? <img loading="lazy" src={post.video_poster} alt="영상" className="w-full h-full object-cover" />
                      : <video src={`${post.video_url}#t=0.5`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  ) : post.images && post.images.length > 0 ? (
                    <img loading="lazy" src={post.images[0]} alt="사진" className="w-full h-full object-cover" />
                  ) : (
                    (() => {
                      const { text, stickers } = splitPostStickers(post.content);
                      return stickers.length && !text.trim()
                        ? <img loading="lazy" src={stickers[0].src} alt={`이모티콘: ${stickers[0].label}`} className="w-full h-full object-contain p-3" />
                        : <div className="w-full h-full p-2 text-[0.75rem] text-stone-600 flex items-center justify-center text-center">{text}</div>;
                    })()
                  )}
                </div>
              ))
            );
            })()}
          </div>
        </section>
      )}

      {/* 탐색 탭 */}
      {activeTab === 'explore' && (
        <ExploreTab
          user={user}
          posts={posts.map(p => p.video_url && !(p.images && p.images.length) ? { ...p, images: p.video_poster ? [p.video_poster] : [], is_video: true } : p)}
          blockedIds={blockedIds}
          initialQuery={exploreQuery}
          onOpenProfile={id => openProfileCard({ id })}
          onOpenPost={(id, queue) => { const p = posts.find(x => x.id === id); if (p) { openPostViewer(p); setViewerQueue(queue); } }}
          onRequireLogin={() => setShowAuthModal(true)}
        />
      )}

      {/* 익명 고민상담 탭 */}
      {/* 영상(릴스): 영상 글만 화면 가득, 위로 밀면 다음 영상 */}
      {activeTab === 'reels' && (() => {
        const reels = posts.filter(p => p.video_url && !blockedIds.has(p.user_id));
        return (
          <div className="fixed inset-x-0 top-0 max-w-xl tablet:max-w-none mx-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 bg-black">
            <p className="absolute top-0 left-0 z-10 px-4 pt-[calc(0.875rem+env(safe-area-inset-top))] text-white text-xl font-bold drop-shadow pointer-events-none">영상</p>
            {reels.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-white/80 text-center px-6">
                <Icon name="video" className="w-12 h-12" />
                <p className="font-bold text-lg">아직 올라온 영상이 없어요</p>
                <p className="text-sm text-white/60">아래 ＋ 를 눌러 첫 영상을 올려 보세요</p>
              </div>
            ) : (
              <div className="h-full overflow-y-auto snap-y snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {reels.map(post => {
                  const prayed = myPostReactions.has(`${post.id}:pray`);
                  const liked = myPostReactions.has(`${post.id}:like`);
                  const music = parsePostMusic(post.music);
                  const side = 'flex flex-col items-center gap-1 text-white text-[0.8125rem] font-semibold drop-shadow';
                  return (
                    <section key={post.id} className="relative h-full snap-start snap-always overflow-hidden">
                      <ReelVideo
                        src={post.video_url!}
                        poster={post.video_poster}
                        overlays={post.video_overlays}
                        muted={reelsMuted}
                        onToggleMute={() => setReelsMuted(m => !m)}
                        onDoubleTap={() => likeByDoubleTap(post.id)}
                      />
                      {/* 오른쪽 버튼 */}
                      <div className="absolute right-2 bottom-28 flex flex-col items-center gap-5 z-10">
                        <button onClick={() => handleReaction(post.id, 'pray')} className={side} aria-label="기도"><Icon name="pray" fill={prayed} className={`w-8 h-8 ${prayed ? 'text-amber-300' : ''}`} />{post.pray_count || 0}</button>
                        <button onClick={() => handleReaction(post.id, 'like')} className={side} aria-label="공감"><Icon name="heart" fill={liked} className={`w-8 h-8 ${liked ? 'text-rose-500' : ''}`} />{post.like_count || 0}</button>
                        <button onClick={() => toggleCommentBox(post.id)} className={side} aria-label="댓글"><Icon name="reply" className="w-8 h-8" />{commentCounts[post.id] || 0}</button>
                        {user?.id !== post.user_id && (
                          <button onClick={() => openChatRoom({ id: post.user_id, baptismal_name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type })} className={side} aria-label="메시지"><Icon name="message" className="w-8 h-8" /></button>
                        )}
                        {user && <button onClick={() => setPostMenuId(post.id)} className={`${side} text-2xl leading-none`} aria-label="더보기 (고치기·지우기)">⋯</button>}
                      </div>
                      {/* 아래: 작성자·글·음악 */}
                      <div className="absolute left-0 right-14 bottom-0 z-10 px-4 pb-4 pt-16 bg-gradient-to-t from-black/75 via-black/30 to-transparent text-white flex flex-col gap-2">
                        <button onClick={() => openProfileCard({ id: post.user_id, name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type })} className="self-start flex items-center gap-2">
                          {post.avatar_url
                            ? <img loading="lazy" src={post.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-white/70" />
                            : <span className="w-9 h-9 rounded-full bg-white/25 text-white text-sm font-bold flex items-center justify-center">{initial(post.author_name, '교')}</span>}
                          <span className="font-bold text-[0.9375rem]">{post.author_name}</span>
                        </button>
                        {post.content && (
                          <button onClick={() => openPostViewer(post)} className="text-left text-[0.9375rem] leading-snug line-clamp-2 whitespace-pre-wrap">{postPlainText(post.content)}</button>
                        )}
                        {music && (
                          <button onClick={() => openPostViewer(post)} className="self-start max-w-full flex items-center gap-1.5 text-[0.8125rem] bg-white/15 backdrop-blur-sm rounded-full px-3 py-1"><Icon name="music" className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{post.music_title || '음악'} · 듣기</span></button>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 내 댓글: 내가 단 댓글 모아 보기 (나만 보임) */}
      {showMyComments && user && (
        <BottomSheet label="내 댓글" title="내 댓글" subtitle="내가 단 댓글을 모아 봤어요 · 나만 볼 수 있어요" onClose={() => setShowMyComments(false)} tone="bg-white">
          <MyComments userId={user.id} onOpen={(postId, commentId) => { setShowMyComments(false); openPostFromAlert(postId, commentId); }} />
        </BottomSheet>
      )}
      {showAnon && (
        <BottomSheet label="익명 고민상담" onClose={() => setShowAnon(false)} tone="bg-white">
        <AnonBoard key={anonKey} user={user} isAdmin={isAdmin} profileReady={!needsProfileSetup} onRequireLogin={() => user ? setSetupDismissed(false) : setShowAuthModal(true)} onReport={setReportTarget} focusPostId={anonFocusId} focusReplyId={anonFocusReply} onFocused={() => { setAnonFocusId(null); setAnonFocusReply(null); }} onReplied={id => sendPush('anon_reply', id)} onOpenProfile={id => openProfileCard({ id })} />
        </BottomSheet>
      )}

      {/* 3. 메시지 목록 탭 */}
      {showLounge && user && (
        <Lounge user={user} isAdmin={isAdmin} blockedIds={blockedIds} focusId={loungeFocusId} online={loungeOnline} onlineIds={loungeOnlineIds} onZoom={(images, index) => setSelectedImage({ images, index })}
          stealth={isAdmin && loungeStealth} onReveal={() => setLoungeStealth(false)}
          onCallAdmin={id => sendPush('lounge_call', id)}
          onMention={id => sendPush('lounge_mention', id)}
          onAnnounce={async id => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return '로그인이 필요해요.';
            const res = await fetch('/api/admin/lounge-call', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ id }) }).catch(() => null);
            const json = res ? await res.json().catch(() => ({})) : {};
            if (!res || !res.ok) return json.error || '알림을 보내지 못했어요.';
            return `📢 ${json.sent ?? 0}대의 휴대폰에 알림을 보냈어요`;
          }}
          onClose={() => { setShowLounge(false); setLoungeNew(0); setLoungeFocusId(null); setLoungeStealth(true); }}
          onOpenProfile={id => openProfileCard({ id })}
          onReport={t => setReportTarget(t)} />
      )}
      {/* 단체 채팅방 (관리자는 '모든 단체방'에서 몰래 읽기만) */}
      {openGroup && user && (
        <GroupChat key={openGroup.id} user={user} chatId={openGroup.id} adminView={openGroup.adminView && isAdmin} blockedIds={blockedIds} onZoom={(images, index) => setSelectedImage({ images, index })}
          onClose={() => { setOpenGroup(null); fetchGroupChats(); }}
          onOpenProfile={id => openProfileCard({ id })}
          onReport={t => setReportTarget(t)}
          onSent={id => sendPush('group_message', id)}
          onChanged={() => { fetchGroupChats(); if (openGroup.adminView) fetchAdminGroups(); }} />
      )}
      {showNewChat && user && (
        <NewChat user={user} mode="start" blockedIds={blockedIds}
          suggestions={chatPartners.map(p => ({ id: p.id, baptismal_name: p.baptismal_name, handle: p.handle, avatar_url: p.avatar_url, badge_type: p.badge_type }))}
          onClose={() => setShowNewChat(false)}
          onOpenDM={p => openChatRoom({ id: p.id, baptismal_name: p.baptismal_name, handle: p.handle || undefined, avatar_url: p.avatar_url || undefined, badge_type: p.badge_type || undefined })}
          onCreated={id => { fetchGroupChats(); openGroupChat(id); }} />
      )}
      {activeTab === 'messages' && (
        <section className="flex-1 bg-white flex flex-col">
          <div className="px-4 pt-4 pb-3 flex items-center gap-2">
            <button onClick={() => user && goToProfile(user.id)} className="text-stone-600 hover:text-black -ml-1" aria-label="내 공간으로">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="font-bold text-lg text-stone-900">메시지</h2>
            {/* 새 채팅: @아이디·이름으로 찾아 1:1 메시지, 또는 여러 교우와 단체 채팅방 */}
            <button onClick={() => { if (!user) { setShowAuthModal(true); return; } if (!requireProfile()) return; setShowNewChat(true); }}
              className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-stone-900 text-white text-[0.875rem] font-bold" aria-label="새 채팅">
              <Icon name="pencil" className="w-4 h-4" />새 채팅
            </button>
          </div>
          {/* 개인 / 단체(사랑방·단체 채팅방) 나눠 보기 (관리자는 모든 단체방도): 흰 칸이 미끄러지는 한 줄 칸 */}
          {(() => {
            const dmUnread = unreadMessageCount;
            const groupUnread = groupChats.reduce((sum, g) => sum + (g.unread || 0), 0) + loungeNew;
            const tabs: [typeof messagesView, string, number][] = [['dm', '개인', dmUnread], ['group', '단체', groupUnread], ...(isAdmin ? [['allGroups', '모든 단체방', 0] as [typeof messagesView, string, number]] : [])];
            const at = Math.max(0, tabs.findIndex(([k]) => k === messagesView));
            return (
              <div className="px-4 pb-3 border-b border-stone-100">
                <div className={`relative grid p-1 rounded-full bg-stone-100 ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`} role="tablist" aria-label="메시지 보기">
                  <span aria-hidden="true" className="absolute top-1 bottom-1 left-1 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out"
                    style={{ width: `calc((100% - 0.5rem) / ${tabs.length})`, transform: `translateX(${at * 100}%)` }} />
                  {tabs.map(([k, label, n]) => (
                    <button key={k} role="tab" aria-selected={messagesView === k} onClick={() => { setMessagesView(k); setSwipedRow(null); if (k === 'allGroups') fetchAdminGroups(); }}
                      aria-label={n > 0 ? `${label} 메시지 · 안 읽은 ${n}개` : `${label} 메시지`}
                      className={`relative z-[1] py-2 rounded-full text-[0.9375rem] tracking-tight inline-flex items-center justify-center gap-1.5 transition-colors ${messagesView === k ? 'text-stone-900 font-bold' : 'text-stone-500 font-medium'}`}>
                      {label}
                      {n > 0 && <span className="min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-red-500 text-white text-[0.6875rem] font-bold leading-none flex items-center justify-center">{n > 99 ? '99+' : n}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          {isAdmin && messagesView === 'allGroups' ? (
            // 관리자: 모든 단체 채팅방 (들어가서 읽어도 교우들에게 표시되지 않고, 글은 쓸 수 없음)
            <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
              <p className="px-4 py-3 text-[0.8125rem] text-stone-500 bg-stone-50 leading-snug">관리자만 보여요. 방에 들어가 읽어도 교우들에게 표시되지 않아요. (읽기만 할 수 있어요)</p>
              {adminGroups === null && <p className="p-10 text-center text-sm text-stone-400">불러오는 중...</p>}
              {adminGroups?.length === 0 && <p className="p-10 text-center text-sm text-stone-400">아직 단체 채팅방이 없어요.<br /><span className="text-xs">(처음이면 Supabase에서 <code>supabase/group-chats.sql</code> 실행 필요)</span></p>}
              {adminGroups?.map(g => (
                <button key={g.id} onClick={() => openGroupChat(g.id, true)} className="w-full p-4 flex items-start gap-3 hover:bg-stone-50 text-left">
                  <span className="w-12 h-12 rounded-full bg-stone-800 text-white flex items-center justify-center text-xl shrink-0">👥</span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <b className="text-stone-900 text-sm truncate">{g.name}</b>
                      <span className="shrink-0 text-xs text-stone-400">{g.member_count}명 · 글 {g.message_count}</span>
                      <span className="ml-auto shrink-0 text-[0.75rem] text-stone-400">{timeAgo(g.last_message_at)}</span>
                    </span>
                    <span className="block text-xs text-stone-500 truncate mt-0.5">{g.member_names || '참여한 교우 없음'}</span>
                    {g.last_message && <span className="block text-xs text-stone-700 line-clamp-1 mt-0.5">{g.last_sender}: {g.last_message}</span>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-stone-100" onScroll={() => { if (swipedRow) setSwipedRow(null); }}>
            {/* 모두의 사랑방: 모든 교우가 함께하는 실시간 대화방 (단체 메시지 칸 맨 위) */}
            {messagesView === 'group' && <button onClick={() => { if (!requireProfile()) return; setShowLounge(true); }} className="w-full p-4 flex items-center gap-3 bg-gradient-to-r from-amber-50 to-stone-50 hover:brightness-[0.98] text-left">
              <span className="w-12 h-12 rounded-full bg-blue-600 text-white text-2xl flex items-center justify-center shrink-0">💬</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-stone-900 text-[0.9375rem]">모두의 사랑방</span>
                <span className="block text-xs text-stone-600 mt-0.5">
                  {loungeOnline > 0
                    ? <><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle animate-pulse" /><b className="text-emerald-700">👥 지금 {loungeOnline}명 참여 중</b></>
                    : <>👥 지금 0명 · 먼저 들어가 인사를 건네 보세요</>}
                </span>
              </span>
              {loungeNew > 0
                ? <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[0.8125rem] font-bold rounded-full flex items-center justify-center shrink-0">{loungeNew > 99 ? '99+' : loungeNew}</span>
                : <span className="text-stone-400 text-xl shrink-0">›</span>}
            </button>}
            {(() => {
              // 개인: 1:1 대화 / 단체: 단체 채팅방 — 최근 대화 순
              const items = messagesView === 'group'
                ? groupChats.map(g => ({ at: g.last_message_at, group: g, partner: null }))
                : chatPartners.filter(partner => !blockedIds.has(partner.id)).map(partner => ({ at: partner.lastAt || '', group: null, partner }));
              // 메시지 요청은 맨 위에 따로 모은다
              items.sort((a, b) => Number(!!b.partner?.isRequest) - Number(!!a.partner?.isRequest) || b.at.localeCompare(a.at));
              const requestCount = items.filter(x => x.partner?.isRequest).length;
              if (items.length === 0) return (
                <div className="p-10 text-center text-stone-400 text-sm leading-relaxed">
                  {messagesView === 'group' ? '아직 들어가 있는 단체 채팅방이 없어요.' : '아직 주고받은 1:1 메시지가 없어요.'}<br />
                  <button onClick={() => { if (!requireProfile()) return; setShowNewChat(true); }} className="mt-3 px-4 py-2 rounded-full border border-stone-300 text-stone-700 text-[0.875rem] font-bold">✏️ {messagesView === 'group' ? '단체 채팅방 만들기' : '새 채팅 시작하기'}</button>
                </div>
              );
              // 왼쪽으로 밀면 빨간 '나가기' (components/SwipeRow)
              const swipe = (key: string, onLeave: () => void) => ({
                open: swipedRow === key, anyOpen: swipedRow !== null,
                onOpen: () => setSwipedRow(key), onClose: () => setSwipedRow(null), onAction: onLeave,
              });
              return <>{items.map(({ group: g, partner }, idx) => g ? (
                <SwipeRow key={`g-${g.id}`} {...swipe(`g-${g.id}`, () => leaveGroupFromList(g))}>
                <button onClick={() => openGroupChat(g.id)} className="w-full p-4 flex items-center gap-3 hover:bg-stone-50 transition-colors text-left">
                  <span className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center text-xl shrink-0">👥</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-stone-800 text-sm truncate">{g.name}</h3>
                      <span className="shrink-0 text-xs text-stone-400">{g.member_count}</span>
                    </div>
                    <p className={`text-xs mt-0.5 line-clamp-1 ${g.unread > 0 ? 'text-stone-900 font-bold' : 'text-stone-500'}`}>
                      {!g.last_message ? '단체 채팅방' : g.last_kind === 'system' ? g.last_message : `${g.last_sender}: ${chatPreview(g.last_message)}`}
                    </p>
                  </div>
                  {g.unread > 0
                    ? <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[0.8125rem] font-bold rounded-full flex items-center justify-center shrink-0">{g.unread > 99 ? '99+' : g.unread}</span>
                    : null}
                </button>
                </SwipeRow>
              ) : partner && (
            <div key={`dm-${partner.id}`}>
            {/* 메시지 요청 칸 머리 / 대화 칸 머리 */}
            {partner.isRequest && idx === 0 && <p className="px-4 py-2 bg-amber-50 text-[0.8125rem] font-bold text-amber-900 leading-snug">📩 메시지 요청 {requestCount}개 · 수락하기 전에는 읽어도 상대방이 몰라요</p>}
            {!partner.isRequest && idx === requestCount && requestCount > 0 && <p className="px-4 py-2 bg-stone-50 text-[0.8125rem] font-bold text-stone-500">대화</p>}
            <SwipeRow {...swipe(`dm-${partner.id}`, () => leaveDmThread(partner))}>
            <button onClick={() => openChatRoom(partner)} className="w-full p-4 flex items-center gap-3 hover:bg-stone-50 transition-colors text-left">
              {/* 사진만 누르면 프로필 카드 (카카오톡처럼), 줄의 나머지는 대화방 */}
              <span role="button" tabIndex={0} aria-label={`${partner.baptismal_name}님 프로필 보기`} className="shrink-0 rounded-full"
                onClick={e => { e.stopPropagation(); openProfileCard({ id: partner.id, name: partner.baptismal_name, avatar_url: partner.avatar_url, handle: partner.handle, badge_type: partner.badge_type }); }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openProfileCard({ id: partner.id, name: partner.baptismal_name, avatar_url: partner.avatar_url, handle: partner.handle, badge_type: partner.badge_type }); } }}>
                {partner.avatar_url ? (
                  <img loading="lazy" src={partner.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border border-stone-200" />
                ) : (
                  <span className="w-12 h-12 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-serif font-bold text-lg">{initial(partner.baptismal_name)}</span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-stone-800 text-sm">{partner.baptismal_name}</h3>
                  <RoleBadge type={partner.badge_type} />
                  {partner.isRequest && <span className="shrink-0 text-[0.6875rem] font-bold text-amber-800 bg-amber-100 rounded-full px-1.5 py-px">요청</span>}
                </div>
                <p className={`text-xs mt-0.5 line-clamp-1 ${unreadMessages.some(u => u.partner.id === partner.id) ? 'text-stone-900 font-bold' : 'text-stone-500'}`}>{partner.lastMessage || `@${partner.handle}`}</p>
              </div>
              {(() => {
                const n = unreadMessages.find(u => u.partner.id === partner.id)?.count || 0;
                return n > 0 ? <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[0.8125rem] font-bold rounded-full flex items-center justify-center shrink-0">{n > 99 ? '99+' : n}</span> : null;
              })()}
            </button>
            </SwipeRow>
            </div>
              ))}
              <p className="px-4 py-5 text-center text-[0.8125rem] text-stone-400">대화방을 왼쪽으로 밀면 나갈 수 있어요</p>
              </>;
            })()}
          </div>
          )}
        </section>
      )}

      {/* 4. 1:1 실시간 채팅방 탭 */}
      {activeTab === 'chat' && (
        // 채팅방: 화면 높이에 맞춰 메시지만 스크롤되고 입력창은 항상 맨 아래에 보임
        <section className="relative flex-1 min-h-0 flex flex-col bg-stone-100">
          {/* 위로 올려 보는 중: 오른쪽 아래 '최근 대화로' */}
          {!dmCapture && !dmSticker.open && !dmSticker.picked && !hasStickerSuggestion(messageInput) && <JumpToLatest listRef={chatStick.listRef} onJump={() => chatStick.toBottom(true)} className="bottom-[calc(5rem+env(safe-area-inset-bottom))]" />}
          <div ref={chatStick.listRef} {...dmStickerTap} className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain flex flex-col">
            {/* 내용이 적으면 입력창 바로 위에 붙어 보이게 (mt-auto) */}
            <div ref={chatStick.contentRef} className="mt-auto flex flex-col gap-3">
            {chatMessages.length === 0 ? (
              <div className="text-center text-stone-400 text-xs mt-10">첫 인사를 건네보세요.</div>
            ) : (
              chatMessages.map((msg, i) => {
                const isMe = msg.sender_id === user?.id;
                // 내가 보낸 메시지 중 상대가 읽은 마지막 메시지에만 '읽음' 표시
                const lastReadMineIndex = chatMessages.reduce((last, m, idx) => (m.sender_id === user?.id && m.read_at ? idx : last), -1);
                const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
                const mid = String(msg.id);
                if (dmHidden.hidden.has(mid)) return null; // 내 화면에서만 지운 메시지
                const picked = !!dmCapture?.has(mid);
                return (
                  <div key={msg.id} id={`dm-${msg.id}`} className={`relative flex items-end gap-1.5 ${isMe ? 'justify-end' : 'justify-start'} ${picked ? 'bg-amber-200/50 rounded-2xl -mx-2 px-2 py-1' : ''}`}>
                    {/* 대화 골라서 캡처하는 중: 줄을 누르면 고르기 */}
                    {dmCapture && (
                      <button type="button" onClick={() => setDmCapture(prev => { const n = new Set(prev); if (n.has(mid)) n.delete(mid); else n.add(mid); return n; })}
                        className="absolute inset-0 z-10 flex items-center" aria-pressed={picked} aria-label={picked ? '캡처에서 빼기' : '캡처할 메시지로 고르기'}>
                        <span className={`ml-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[0.8125rem] font-bold ${picked ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white/90 border-stone-400'}`}>{picked ? '✓' : ''}</span>
                      </button>
                    )}
                    {isMe && (
                      <div className="flex flex-col items-end text-[0.75rem] leading-tight shrink-0">
                        {!msg.read_at ? (
                          <span className="text-amber-500 font-bold" title="아직 읽지 않음">1</span>
                        ) : i === lastReadMineIndex ? (
                          <span className="text-stone-400">읽음</span>
                        ) : null}
                        {msg.edited_at && !msg.deleted_at && <span className="text-stone-400">수정됨</span>}
                        {dmBookmarks.has(mid) && <span aria-label="책갈피">🔖</span>}
                        <span className="text-stone-400">{time}</span>
                      </div>
                    )}
                    {msg.deleted_at ? (() => {
                      const original = isAdmin ? deletedOriginals[String(msg.id)] : undefined;
                      return (
                        <div className="max-w-[75%] px-4 py-2 rounded-2xl text-[0.9375rem] text-stone-400 bg-stone-100 border border-dashed border-stone-300">
                          <div className="italic inline-flex items-center gap-1.5"><Icon name="trash" className="w-4 h-4 shrink-0" />삭제된 메시지예요</div>
                          {/* 관리자에게만: 원래 내용 */}
                          {original && (
                            <div className="mt-1.5 pt-1.5 border-t border-dashed border-stone-300">
                              <p className="text-[0.75rem] font-bold text-red-500">원래 내용 · 관리자만 보여요</p>
                              {original.image_url && (isVideoUrl(original.image_url)
                                ? <video src={`${original.image_url}#t=0.1`} controls playsInline preload="metadata" className="mt-1 w-[min(55vw,14rem)] max-h-64 rounded-xl bg-black opacity-90" />
                                : <img loading="lazy" src={original.image_url} alt="지운 사진" onClick={() => zoomPhoto(original.image_url)} className="mt-1 max-w-[min(55vw,14rem)] max-h-64 rounded-xl object-cover cursor-zoom-in opacity-90" />
                              )}
                              {original.content && !(original.image_url && isMediaOnlyText(original.content)) && (
                                <p className="mt-0.5 text-stone-600 whitespace-pre-wrap break-words">{original.content}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })() : (() => {
                      const reactions = messageHearts[String(msg.id)] || [];
                      // 같은 감정끼리 모아서 (❤️ 2 😂 1)
                      const grouped = ALL_EMOJIS.map(e => ({ e, n: reactions.filter(r => r.emoji === e).length })).filter(x => x.n > 0);
                      const quoted = msg.reply_to != null ? chatMessages.find(m => String(m.id) === String(msg.reply_to)) : undefined;
                      const sticker = parseSticker(msg.content);
                      const withSticker = chatStickerParts(msg.content); // 글과 함께 보낸 이모티콘 → 이모티콘(말풍선 없이) + 글 말풍선, 숫자·시간은 하나
                      const tone = isMe ? 'bg-blue-500 text-white rounded-br-none' : 'bg-white text-stone-800 border border-stone-200 rounded-bl-none shadow-sm';
                      return (
                        <div className={`max-w-[75%] ${reactions.length ? 'mb-4' : ''}`}>
                          <div className="relative">
                          {/* 옆으로 미는 중: 드러나는 답장 표시 */}
                          {dmGestures.swipe?.id === String(msg.id) && <SwipeHint dx={dmGestures.swipe.dx} />}
                          <div
                            data-bubble
                            {...dmGestures.bind(msg)}
                            className={`relative px-4 py-2 rounded-2xl text-[1rem] whitespace-pre-wrap break-words select-none [-webkit-touch-callout:none] [touch-action:pan-y] cursor-pointer ${flashMessageId === String(msg.id) ? 'ring-4 ring-amber-300' : ''} ${sticker || withSticker ? `!px-0 !py-0 bg-transparent flex flex-col ${isMe ? 'items-end' : 'items-start'}` : tone}`}
                          >
                            {/* 답장: 어떤 메시지에 대한 답인지 (누르면 그 메시지로) */}
                            {msg.reply_to != null && (
                              <button type="button" onClick={e => { e.stopPropagation(); jumpToMessage(msg.reply_to!); }}
                                aria-label={`${quoted ? (quoted.sender_id === user?.id ? '내' : `${currentChatUser?.baptismal_name || '상대'}님`) : '이전'} 메시지에 답장 · 눌러서 원래 메시지 보기`}
                                className={`flex max-w-full items-center gap-1 text-left mb-0.5 text-[0.8125rem] leading-snug ${isMe && !sticker && !withSticker ? 'text-white/70' : 'text-stone-400'}`}>
                                {quoted && !quoted.deleted_at && <QuoteThumb m={quoted} />}
                                <span className="min-w-0 truncate">{!quoted ? '이전 대화의 메시지' : quoted.deleted_at ? '삭제된 메시지' : quoteLabel(quoted)}</span>
                                <span aria-hidden="true" className="shrink-0">↵</span>
                              </button>
                            )}
                            {/* 사진(묶음이면 바둑판)·동영상: 누르면 크게 보기·재생 (메뉴는 꾹 누르기로) */}
                            <ChatMediaView imageUrl={msg.image_url} images={msg.images} onOpen={(images, index) => setSelectedImage({ images, index })} className="-mx-2 -mt-0.5 mb-1" />
                            {sticker ? <StickerImage sticker={sticker} /> : withSticker ? <StickerWithText parts={withSticker} bubble={`px-4 py-2 rounded-2xl ${tone}`} /> : !(msg.image_url && isMediaOnlyText(msg.content)) && msg.content}
                          </div>
                          {/* 감정을 고르면 잠깐 크게 */}
                          {heartPop?.id === String(msg.id) && (
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center animate-[heartBurst_0.7s_ease-out_forwards]">
                              {heartPop.emoji === '❤️' ? <Icon name="heart" fill className="w-10 h-10 text-rose-500 drop-shadow" /> : <span className="text-4xl drop-shadow">{heartPop.emoji}</span>}
                            </span>
                          )}
                          {/* 메시지 밑 감정 표시 (누르면 고르기) */}
                          {grouped.length > 0 && (
                            <button
                              onClick={e => openMessageMenu(msg, e.currentTarget.parentElement?.querySelector('[data-bubble]') ?? e.currentTarget)}
                              aria-label={`감정 표시 ${grouped.map(g => `${g.e} ${g.n}`).join(', ')} · 눌러서 고르기`}
                              className={`absolute -bottom-4 ${isMe ? 'right-2' : 'left-2'} flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border border-stone-200 shadow-sm text-[0.8125rem] leading-none text-stone-600`}
                            >
                              {grouped.map(g => <span key={g.e} className="inline-flex items-center">{g.e === '❤️' ? <Icon name="heart" fill className="w-3.5 h-3.5 text-rose-500" /> : g.e}{g.n > 1 && <span className="ml-0.5 text-[0.75rem]">{g.n}</span>}</span>)}
                            </button>
                          )}
                          </div>
                        </div>
                      );
                    })()}
                    {!isMe && <span className="text-[0.75rem] leading-tight text-stone-400 shrink-0 flex flex-col">{msg.edited_at && !msg.deleted_at && <span>수정됨</span>}{dmBookmarks.has(mid) && <span aria-label="책갈피">🔖</span>}<span>{time}</span></span>}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
            </div>
          </div>
          <TypingIndicator typers={dmTyping.typers} lookup={id => (id === currentChatUser?.id ? { name: currentChatUser.baptismal_name, avatar: currentChatUser.avatar_url || null } : undefined)} />
          {/* 사진·동영상 보내는 중 (여러 개면 몇 번째인지) */}
          {dmMedia.bar}
          {dmMedia.choice}
          {dmCapture && <CaptureBar count={dmCapture.size} busy={capturing} onCancel={() => setDmCapture(null)} onDone={() => makeDmCapture(Array.from(dmCapture))} />}
          {/* 추천 이모티콘·고른 이모티콘: 대화 위에 떠서 보임 (대화창이 줄어들지 않게) */}
          {!dmCapture && !dmRequest && !editingMessage && <div className="relative h-0 shrink-0 z-20"><StickerAbove picker={dmSticker} text={messageInput} onTextChange={setMessageInput} /></div>}
          {!dmCapture && !dmRequest && (replyTo || editingMessage) && (() => {
            const m = (editingMessage || replyTo)!;
            return (
              <div className="shrink-0 px-3 pt-2 bg-white border-t border-stone-200 flex items-start gap-2">
                <div className="flex-1 min-w-0 border-l-4 border-blue-400 pl-2.5 py-0.5">
                  <p className="text-[0.8125rem] font-bold text-blue-700">{editingMessage ? '✏️ 메시지 고치는 중' : `↩️ ${m.sender_id === user?.id ? '내 메시지' : `${currentChatUser?.baptismal_name || '상대'}님 메시지`}에 답장`}</p>
                  <p className="text-[0.8125rem] text-stone-500 line-clamp-1">{quoteLabel(m)}</p>
                </div>
                {!editingMessage && <QuoteThumb m={m} size="w-11 h-11" />}
                <button type="button" onClick={() => { if (editingMessage) cancelEditMessage(); else { setReplyTo(null); dmSticker.setPicked(null); } }} className="w-9 h-9 shrink-0 flex items-center justify-center text-stone-400 text-2xl leading-none" aria-label={editingMessage ? '고치기 그만두기' : '답장 그만두기'}>×</button>
              </div>
            );
          })()}
          {/* 메시지 요청: 수락하기 전에는 답장할 수 없고, 읽었는지 상대방이 알 수 없다 */}
          {dmRequest && !dmCapture && (
            <div className="shrink-0 bg-white border-t border-stone-200 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" role="region" aria-label="메시지 요청">
              <p className="font-bold text-[1rem] text-stone-900">📩 {currentChatUser?.baptismal_name}님의 메시지 요청</p>
              <p className="text-[0.8125rem] text-stone-500 mt-0.5 leading-snug">수락하면 답장할 수 있어요. 수락하기 전에는 메시지를 읽었는지 상대방이 알 수 없어요.</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <button onClick={acceptDmRequest} className="py-3 rounded-xl bg-stone-900 text-white font-bold">수락</button>
                <button onClick={() => declineDmRequest()} className="py-3 rounded-xl border-2 border-stone-200 text-stone-700 font-bold">거절</button>
                <button onClick={() => declineDmRequest(true)} className="py-3 rounded-xl border-2 border-red-200 text-red-600 font-bold">차단</button>
              </div>
            </div>
          )}
          {!dmCapture && !dmRequest && <form onSubmit={submitDm} className={`shrink-0 p-3 ${dmSticker.open ? '' : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]'} bg-white flex items-end gap-2 ${replyTo || editingMessage ? '' : 'border-t border-stone-200'}`}>
            {/* 사진 보내기 */}
            <label className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${sendingPhoto ? 'bg-stone-200 text-stone-400' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`} aria-label="사진·동영상 보내기 (여러 개 한꺼번에 고를 수 있어요)">
              {sendingPhoto ? <span className="w-4 h-4 rounded-full border-2 border-stone-400 border-t-transparent animate-spin" /> : <Icon name="camera" className="w-5 h-5" />}
              <input type="file" accept="image/*,video/*" multiple className="hidden" disabled={sendingPhoto} onChange={dmMedia.onPick} />
            </label>
            <StickerButton open={dmSticker.open} disabled={!!editingMessage} onClick={() => { dmSticker.setOpen(!dmSticker.open); leaveInputForPanel(messageInputRef.current); }} />
            {/* 엔터는 줄바꿈 (휴대폰), 보내기 단추로 전송 */}
            <textarea ref={setDmInputEl} rows={1} autoCorrect="on" autoCapitalize="sentences" spellCheck enterKeyHint={dmEnter.enterKeyHint} aria-label="메시지 입력" value={messageInput} onChange={(e) => { setMessageInput(e.target.value); dmTyping.notify(e.target.value); }} onKeyDown={dmEnter.onKeyDown} onFocus={() => { closePanelOnInputFocus(() => dmSticker.setOpen(false)); [150, 450].forEach(ms => setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }), ms)); }} placeholder={editingMessage ? '고칠 내용을 적어 주세요' : '메시지 입력...'} className="flex-1 min-w-0 max-h-32 resize-none bg-stone-100 border-none rounded-[1.25rem] px-4 py-2.5 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} disabled={!messageInput.trim() && !dmSticker.picked} className="shrink-0 bg-blue-500 text-white w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-blue-600 transition-colors">
              <Icon name="sendRight" className="w-[1.375rem] h-[1.375rem]" />
            </button>
          </form>}
          {dmSticker.open && !dmCapture && !dmRequest && !editingMessage && <StickerPanel picker={dmSticker} />}
          {captureAsk && (
            <CaptureChoice onClose={() => setCaptureAsk(null)}
              onPick={() => { setDmCapture(new Set([captureAsk])); setCaptureAsk(null); }}
              onScreen={() => { setCaptureAsk(null); makeDmCapture(visibleIds(chatStick.listRef.current, 'dm-')); }} />
          )}
          {captured && <CapturePreview blob={captured.blob} title={captured.title} onClose={() => setCaptured(null)} />}
          {selectCopy !== null && <SelectCopySheet text={selectCopy} onClose={() => setSelectCopy(null)} />}
          {showDmBookmarks && (
            <BookmarkSheet items={dmBookmarks.list} onClose={() => setShowDmBookmarks(false)} onRemove={dmBookmarks.remove}
              onJump={id => { setShowDmBookmarks(false); if (document.getElementById(`dm-${id}`)) setTimeout(() => jumpToMessage(id), 50); else alert('지금 불러온 대화에 없는 메시지예요.'); }} />
          )}
          {/* 메시지를 꾹 누르면(내 메시지는 한 번 눌러도): 그 메시지 바로 위에 감정 표시, 아래에 복사 · 선택 복사 · 답장 · 고치기 · 책갈피 · 캡처 · 삭제 */}
          {messageSheet && (() => {
            const m = messageSheet;
            const mine = m.sender_id === user?.id;
            const myEmoji = (messageHearts[String(m.id)] || []).find(r => r.user_id === user?.id)?.emoji;
            const close = () => setMessageSheet(null);
            const mid = String(m.id);
            const text = isMediaOnlyText(m.content) || parseSticker(m.content) ? '' : chatText(m.content); // 이모티콘과 함께 보낸 글은 글만 복사
            return (
              <MessageMenu anchor={messageAnchor} alignRight={mine} emojis={dmRequest ? undefined : MESSAGE_EMOJIS} moreEmojis={MORE_EMOJIS} selected={myEmoji ? [myEmoji] : []}
                onEmoji={e => setMessageReaction(m.id, e)} onClose={close}
                actions={[
                  ...(text ? [
                    { label: '복사', run: async () => { close(); showToast((await copyText(text)) ? '복사했어요' : '복사하지 못했어요'); } },
                    { label: '선택 복사', run: () => { close(); setSelectCopy(text); } },
                  ] : []),
                  ...(dmRequest ? [] : [{ label: '답장', run: () => startReply(m) }]),
                  ...(canEditMessage(m) ? [{ label: '고치기', run: () => startEditMessage(m) }] : []),
                  { label: dmBookmarks.has(mid) ? '책갈피 해제' : '책갈피 설정', run: () => { close(); dmBookmarks.toggle({ id: mid, text: text || (parseSticker(m.content) ? m.content : isVideoUrl(m.image_url) ? '🎬 동영상' : '📷 사진'), name: mine ? '나' : currentChatUser?.baptismal_name || '상대', at: m.created_at }); } },
                  { label: '캡처', run: () => { close(); setCaptureAsk(mid); } },
                  // 내 메시지를 상대방이 아직 안 읽었으면 '모두에게서 삭제'도 (읽은 뒤에는 내 화면에서만)
                  ...(mine && !m.read_at && !m.deleted_at ? [{ label: '모두에게서 삭제', run: () => deleteMessage(m), danger: true }] : []),
                  { label: '내 화면에서만 삭제', run: async () => { close(); if ((await askConfirm('이 메시지를 내 화면에서 지울까요?\n상대방 화면에는 그대로 남아요.'))) dmHidden.hide(mid); }, danger: true },
                ]} />
            );
          })()}
        </section>
      )}

      {/* 사용자 액션 팝업 메뉴 */}
      {/* 교우 프로필 카드: 프로필 사진을 크게 + 방문하기 (보던 창 위에 뜸) */}
      {actionModalUser && (() => {
        const u = actionModalUser;
        const chattingWith = activeTab === 'chat' && currentChatUser?.id === u.id;
        const blocked = blockedIds.has(u.id);
        return (
          <div className="fixed inset-0 bg-black/70 z-[93] flex items-end sm:items-center justify-center animate-fade-in" onClick={() => setActionModalUser(null)}>
            <div className="relative bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl overflow-hidden pb-[env(safe-area-inset-bottom)]" onClick={e => e.stopPropagation()} role="dialog" aria-label={`${u.baptismal_name || '교우'}님 프로필`}>
              <button onClick={() => setActionModalUser(null)} className="absolute right-2 top-2 w-11 h-11 flex items-center justify-center text-stone-500 text-3xl leading-none" aria-label="닫기">×</button>
              <div className="px-6 pt-8 pb-5 flex flex-col items-center text-center">
                <CelebrateAvatar size={13} birthday={actionUserDays?.id === u.id && isTodayMonthDay(actionUserDays.birthday)} feast={actionUserDays?.id === u.id && isTodayMonthDay(actionUserDays.feast_day)}>
                  {u.avatar_url
                    ? <button type="button" onClick={() => setAvatarPreview({ url: u.avatar_url!, name: u.baptismal_name })} className="rounded-full" aria-label="프로필 사진 크게 보기"><img src={u.avatar_url} alt={`${u.baptismal_name}님 프로필 사진`} className="w-52 h-52 max-w-[64vw] max-h-[64vw] rounded-full object-cover border-4 border-white shadow-lg ring-1 ring-stone-300" /></button>
                    : <span className="w-52 h-52 max-w-[64vw] max-h-[64vw] rounded-full bg-stone-200 text-stone-600 text-7xl font-serif font-bold flex items-center justify-center border-4 border-white shadow-lg">{initial(u.baptismal_name, '교')}</span>}
                </CelebrateAvatar>
                <div className="mt-4 flex items-center gap-1.5 max-w-full">
                  <h3 className="text-[1.375rem] font-bold text-stone-900 truncate">{u.baptismal_name || '…'}</h3>
                  <RoleBadge type={u.badge_type} />
                </div>
                {u.handle && <p className="text-[0.875rem] text-stone-400">@{u.handle}</p>}
                {actionUserBio && <p className="mt-2 text-[0.9375rem] text-stone-600 leading-relaxed whitespace-pre-wrap break-words max-w-full">{actionUserBio}</p>}
                <button onClick={() => { closeOverlaysForLink(); goToProfile(u.id); }} className="mt-5 w-full py-3.5 rounded-2xl bg-blue-600 text-white text-[1.0625rem] font-bold shadow-sm active:brightness-95">
                  🏠 {u.baptismal_name ? `${u.baptismal_name}님 공간 ` : ''}방문하기
                </button>
                {!blocked && (
                  <div className={`mt-2.5 w-full grid gap-2 ${chattingWith ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <button onClick={() => toggleFollow(u.id, actionUserFollowStatus)} className={`py-3 rounded-2xl text-[0.9375rem] font-bold ${actionUserFollowStatus === 'none' ? 'bg-white border-2 border-blue-600 text-blue-600' : 'bg-white border border-stone-300 text-stone-700'}`}>
                      {actionUserFollowStatus === 'none' ? '팔로우' : actionUserFollowStatus === 'pending' ? '팔로우 요청됨' : '팔로잉 ✓'}
                    </button>
                    {!chattingWith && (
                      <button onClick={() => { closeOverlaysForLink(); openChatRoom(u); }} className="py-3 rounded-2xl bg-white border border-stone-300 text-stone-700 text-[0.9375rem] font-bold">
                        <Icon name="message" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />메시지
                      </button>
                    )}
                  </div>
                )}
                {isAdmin && u.id !== user?.id && (
                  <button onClick={() => setStickerGiftFor({ id: u.id, name: u.baptismal_name || '교우', handle: u.handle })} className="mt-2.5 w-full py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-[0.9375rem] font-bold">
                    🎁 이모티콘 선물
                  </button>
                )}
                <div className="mt-4 flex items-center justify-center gap-5 text-[0.8125rem] text-stone-400">
                  <button onClick={() => { setActionModalUser(null); setReportTarget({ type: 'user', id: u.id, userId: u.id, userName: u.baptismal_name, preview: `${u.baptismal_name} @${u.handle || ''}` }); }} className="py-1">신고하기</button>
                  {blocked
                    ? <button onClick={() => { unblockUser(u.id); setActionModalUser(null); }} className="py-1">차단 해제</button>
                    : <button onClick={() => confirmBlock(u)} className="py-1 text-red-400">차단하기</button>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 관리자: 전용 이모티콘 선물 (components/StickerGift) */}
      {shownGift && (
        <GiftBox gift={shownGift} onOpened={markGiftOpened} onClose={() => closeGift(shownGift)}
          onShowLetters={() => { closeGift(shownGift); setLettersStart('mine'); setShowLetters(true); }} />
      )}
      {stickerGiftFor && isAdmin && <StickerGift user={stickerGiftFor} onClose={() => setStickerGiftFor(null)} onGifted={id => sendPush('sticker_gift', id)} />}

      {/* 후원 배너 관리 (관리자) */}
      {showSponsorAdmin && isAdmin && (
        <SponsorAdmin onClose={() => setShowSponsorAdmin(false)} onChanged={fetchSponsorBanners} />
      )}

      {/* 신고 */}
      {reportTarget && (
        <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onBlock={blockUser} onSent={id => sendPush('report', id)} />
      )}

      {/* 설정 (차단 목록, 약관, 탈퇴) */}
      {showSettings && user && (
        <SettingsModal user={user} onClose={() => setShowSettings(false)} onUnblock={unblockUser}
          feastDay={profile?.feast_day || ''} baptismalName={myRealName || profile?.baptismal_name || ''} onFeastDayChange={updateMyFeastDay}
          onEditProfile={openProfileEdit}
          onOpenNotices={() => { setShowSettings(false); setNoticeAdminMode(false); setNoticeOpenId(null); setShowNotices(true); }}
          initialView={settingsView}
          onOpenMembers={isAdmin ? () => { setShowSettings(false); setShowAdminMembers(true); } : undefined}
          onOpenBgm={isAdmin ? () => { setShowSettings(false); setShowBgmAdmin(true); } : undefined}
          onOpenTester={testerStatus !== null ? () => { setShowSettings(false); setShowTesterSignup(true); } : undefined}
          onOpenStats={isAdmin ? () => { setShowSettings(false); setShowAdminStats(true); } : undefined} />
      )}

      {/* 오늘의 기도지향 모아 보기 */}
      {showIntentions && (
        <BottomSheet bare label="오늘의 기도지향" onClose={() => setShowIntentions(false)} z="z-[80]" tone="bg-white" head="bg-gradient-to-r from-[#101a3f] to-[#1f2f66] [&_span]:bg-white/40">
          <div className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
            <div className="px-4 pb-4 pt-2 bg-gradient-to-r from-[#101a3f] to-[#1f2f66] text-white flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#fbe7b0]"><Icon name="pray" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />오늘의 기도지향 ({visibleIntentions.length})</h2>
                <p className="text-xs text-white/60 mt-0.5">{new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' })} · 자정에 새로 시작돼요</p>
              </div>
              <button onClick={() => setShowIntentions(false)} className="text-white/70 font-bold text-lg px-1">×</button>
            </div>
            <div className="overflow-y-auto">
            {/* 내 기도지향 쓰기 */}
            <div id="my-intention" className="px-4 pb-4 pt-1 bg-gradient-to-br from-[#16244f] to-[#1f2f66] text-white">
              {!user ? (
                <button onClick={() => { setShowIntentions(false); setShowAuthModal(true); }} className="w-full py-3 rounded-xl bg-[#e8b85a] text-[#101a3f] text-sm font-bold">로그인하고 기도지향 올리기</button>
              ) : (<>
              {myIntention && !intentionEditing ? (
                <div className="flex flex-col gap-2">
                  <div className="text-sm bg-white/10 rounded-xl p-3 leading-relaxed">
                    {myIntention.title && <p className="font-bold text-[#fbe7b0] mb-1">{myIntention.title}</p>}
                    <p>{myIntention.content}</p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setIntentionTitleInput(myIntention.title || ''); setIntentionInput(myIntention.content); setIntentionEditing(true); }} className="text-xs px-3 py-1.5 rounded-lg border border-white/30">고치기</button>
                    <button onClick={() => deleteIntention(myIntention.id)} className="text-xs px-3 py-1.5 rounded-lg border border-white/30">내리기</button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-white/70 mb-1">오늘 하루 동안 홈 맨 위에 흘러가며 교우들이 함께 기도해요.</p>
              )}
              {(!myIntention || intentionEditing) && (
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-xs font-bold text-[#fbe7b0]">기도지향 <span className="font-normal text-white/60">(30자 · 홈 맨 위에 흘러가요)</span></label>
                  <div className="relative">
                    <input
                      value={intentionTitleInput}
                      onChange={e => setIntentionTitleInput(e.target.value.slice(0, 30))}
                      maxLength={30}
                      placeholder="예: 어머니의 쾌유를 위하여"
                      className="w-full p-3 pr-14 text-sm rounded-xl text-stone-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#e8b85a]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.75rem] text-stone-400">{intentionTitleInput.length}/30</span>
                  </div>
                  <label className="text-xs font-bold text-[#fbe7b0] mt-1">기도 내용 <span className="font-normal text-white/60">(100자 · 누르면 보여요)</span></label>
                  <textarea
                    value={intentionInput}
                    onChange={e => setIntentionInput(e.target.value.slice(0, 100))}
                    rows={3}
                    maxLength={100}
                    placeholder="예: 다음 주 수술을 앞둔 어머니께서 두려움 없이 잘 회복하시도록 함께 기도해주세요."
                    className="w-full p-3 text-sm rounded-xl text-stone-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#e8b85a]"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">{intentionInput.length}/100</span>
                    <span className="flex gap-2">
                    {myIntention && <button onClick={() => setIntentionEditing(false)} className="text-sm px-3 py-2 rounded-xl border border-white/30">취소</button>}
                    <button onClick={saveIntention} disabled={!intentionTitleInput.trim() || !intentionInput.trim() || intentionSaving} className="text-sm px-4 py-2 rounded-xl bg-[#e8b85a] text-[#101a3f] font-bold disabled:opacity-40">
                      {intentionSaving ? '올리는 중...' : myIntention ? '고쳐서 올리기' : '기도지향 올리기'}
                    </button>
                    </span>
                  </div>
                </div>
              )}
              </>)}
            </div>
            <div className="divide-y divide-stone-100">
              {visibleIntentions.length === 0 ? (
                <div className="p-10 text-center text-sm text-stone-400">아직 오늘 올라온 기도지향이 없어요.</div>
              ) : visibleIntentions.map(i => {
                // 목록에는 제목만, 누르면 기도 내용이 펼쳐짐
                const open = openIntentionId === i.id;
                return (
                <div key={i.id} className={`flex flex-col ${open ? 'bg-amber-50/50' : ''}`}>
                  <button onClick={() => setOpenIntentionId(open ? null : i.id)} aria-expanded={open} className="w-full px-4 py-3.5 flex items-center gap-3 text-left">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center shrink-0"><Icon name="pray" fill={open} className="w-5 h-5" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[0.9375rem] font-bold text-[#1f2f66] truncate">{i.title || i.content}</span>
                      <span className="block text-xs text-stone-500 mt-0.5">
                        {myIntention?.id === i.id ? '내 기도지향 · ' : isAdmin && i.author_name ? <><b className="text-amber-800">👤 {i.author_name}</b> <span className="text-amber-700/70">(관리자만 보여요)</span> · </> : ''}
                        {new Date(i.created_at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </span>
                    {(intentionPrayers[i.id]?.count || 0) > 0 && (
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[0.8125rem] font-bold ${intentionPrayers[i.id]?.mine ? 'text-amber-700' : 'text-stone-500'}`}>
                        <Icon name="pray" fill={intentionPrayers[i.id]?.mine} className="w-4 h-4" />{intentionPrayers[i.id].count}
                      </span>
                    )}
                    <span className={`text-stone-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 flex flex-col gap-2">
                      <p className="text-[1rem] text-stone-800 leading-relaxed whitespace-pre-wrap bg-white border border-amber-100 rounded-xl px-3.5 py-3">{i.content}</p>
                      {/* 읽고 나서 "함께 기도합니다" (한 번 더 누르면 취소) */}
                      {(() => {
                        const pr = intentionPrayers[i.id] || { count: 0, mine: false };
                        return (
                          <button
                            onClick={() => toggleIntentionPrayer(i.id)}
                            aria-pressed={pr.mine}
                            className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-[1rem] font-bold transition-colors ${pr.mine ? 'bg-amber-600 text-white' : 'bg-white border-2 border-amber-300 text-amber-800'}`}
                          >
                            <Icon name="pray" fill={pr.mine} className="w-6 h-6" />
                            {pr.mine ? '함께 기도했어요' : '함께 기도합니다'}
                            {pr.count > 0 && <span className={`ml-1 min-w-[1.75rem] px-2 py-0.5 rounded-full text-[0.875rem] ${pr.mine ? 'bg-white/25' : 'bg-amber-100'}`}>{pr.count}</span>}
                          </button>
                        );
                      })()}
                      {/* 올린 사람은 관리자만 */}
                      {isAdmin && i.user_id && user?.id !== i.user_id && (
                        <div className="flex items-center justify-between">
                          <button onClick={() => { const uid = i.user_id!; setShowIntentions(false); goToProfile(uid); }} className="text-xs font-bold text-stone-600">👤 {i.author_name || '교우'}님 공간 가기 <span className="font-normal text-stone-400">(관리자만 보여요)</span></button>
                          <button onClick={() => deleteIntention(i.id)} className="text-xs text-red-500">삭제</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* 댓글 창: 인스타그램처럼 아래에서 올라옴 */}
      {commentSheetId && (() => {
        const sid = commentSheetId;
        const sheetPost = posts.find(p => p.id === sid) || storyPosts.find(p => p.id === sid) || (sheetPostExtra?.id === sid ? sheetPostExtra : undefined);
        const sheetIsStory = !!(sheetPost as (Post & { is_story?: boolean }) | undefined)?.is_story;
        const storyStillUp = sheetIsStory && !!sheetPost && Date.now() - new Date(sheetPost.created_at).getTime() < 24 * 3600e3;
        // 대댓글은 그 댓글 바로 밑에 (한 단계로 모아서). 예전 답글은 답한 사람의 바로 앞 댓글 밑으로
        const list = (() => {
          const all = [...(comments[sid] || [])].filter(c => !c.user_id || !blockedIds.has(c.user_id))
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          const byId = new Map(all.map(c => [c.id, c]));
          const parentOf = (c: Comment, i: number): Comment | undefined => {
            if (c.parent_id) return byId.get(c.parent_id);
            if (!c.reply_to_user_id) return undefined;
            for (let k = i - 1; k >= 0; k--) if (all[k].user_id === c.reply_to_user_id) return all[k];
            return undefined;
          };
          const rootId = new Map<string, string>();
          all.forEach((c, i) => {
            const parent = parentOf(c, i);
            rootId.set(c.id, parent ? (rootId.get(parent.id) || parent.id) : c.id);
          });
          const roots = all.filter(c => rootId.get(c.id) === c.id);
          return roots.flatMap(r => [r, ...all.filter(c => c.id !== r.id && rootId.get(c.id) === r.id)])
            .map(c => ({ ...c, _isReply: rootId.get(c.id) !== c.id, _rootId: rootId.get(c.id)! }));
        })();
        const avatarOf = (uid?: string | null, name?: string) => {
          const url = uid ? (uid === user?.id ? profile?.avatar_url : authorByUser[uid]?.avatar) : undefined;
          return url
            ? <img loading="lazy" src={url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
            : <span className="w-9 h-9 rounded-full bg-stone-200 text-stone-600 text-sm font-serif font-bold flex items-center justify-center shrink-0">{initial(name, '교')}</span>;
        };
        return (
          <div className="fixed inset-0 z-[80] bg-black/45 flex items-end sm:items-center justify-center animate-fade-in" onClick={() => setCommentSheetId(null)}>
            <div ref={commentPull.sheetRef} className="w-full max-w-xl tablet:max-w-3xl h-[92dvh] sm:h-[88dvh] bg-white rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} role="dialog" aria-label="댓글">
              <div {...commentPull.handleProps} className="shrink-0 pt-2.5 pb-3 border-b border-stone-200 relative touch-none cursor-grab">
                <span className="block mx-auto w-10 h-1.5 rounded-full bg-stone-300" />
                <p className="text-center font-bold text-stone-900 mt-2">댓글{(() => { const n = (comments[sid] || []).filter(c => !c.user_id || !blockedIds.has(c.user_id)).length; return n > 0 ? ` ${n}개` : ''; })()}</p>
                <button onClick={() => setCommentSheetId(null)} className="absolute right-3 top-3 w-10 h-10 flex items-center justify-center text-stone-500 text-2xl leading-none" aria-label="닫기">×</button>
              </div>
              {/* 스토리 댓글이면: 어떤 스토리인지 (24시간 안이면 바로 다시 보기) */}
              {sheetIsStory && sheetPost && (
                <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-stone-200 bg-stone-100">
                  {sheetPost.images?.[0] && <img loading="lazy" src={sheetPost.images[0]} alt="" className="w-11 h-14 rounded-lg object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.875rem] font-bold text-stone-800 truncate">{sheetPost.user_id === user?.id ? '내 스토리' : `${sheetPost.author_name}님의 스토리`}</p>
                    <p className="text-[0.75rem] text-stone-500 truncate">{postPlainText(sheetPost.content) || timeAgo(sheetPost.created_at)}{!storyStillUp && ' · 24시간이 지나 내려간 스토리'}</p>
                  </div>
                  {storyStillUp && (
                    <button onClick={() => { setCommentSheetId(null); if (currentScreenRef.current.tab !== 'home') goToHome(); setStoryOpenRequest(sheetPost.user_id); }} className="shrink-0 px-3 py-1.5 rounded-full bg-stone-800 text-white text-[0.8125rem] font-bold">스토리 보기</button>
                  )}
                </div>
              )}
              {/* 알림으로 열었으면: 어느 글의 댓글인지 (누르면 창을 닫고 피드의 그 글로) */}
              {!sheetIsStory && sheetShowsPost && sheetPost && (
                <button onClick={() => { setCommentSheetId(null); focusFeedPost(sheetPost.id); }} className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-stone-200 bg-stone-100 text-left" aria-label="이 글 보기">
                  {sheetPost.images?.[0] || sheetPost.video_poster
                    ? <img loading="lazy" src={sheetPost.images?.[0] || sheetPost.video_poster || ''} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    : <span className="w-12 h-12 rounded-lg bg-stone-200 flex items-center justify-center text-xl shrink-0">📝</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.875rem] font-bold text-stone-800 truncate">{sheetPost.user_id === user?.id ? '내 글' : `${sheetPost.author_name}님의 글`} · {timeAgo(sheetPost.created_at)}</p>
                    <p className="text-[0.8125rem] text-stone-600 line-clamp-2 break-words">{postPlainText(sheetPost.content) || (sheetPost.video_url ? '영상' : '사진')}</p>
                  </div>
                  <span className="shrink-0 px-3 py-1.5 rounded-full bg-stone-800 text-white text-[0.8125rem] font-bold">글 보기</span>
                </button>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-4">
                {list.length === 0 && (
                  <div className="py-16 text-center">
                    <p className="font-bold text-stone-800 text-lg">아직 댓글이 없어요</p>
                    <p className="text-sm text-stone-500 mt-1">첫 댓글을 남겨 보세요</p>
                  </div>
                )}
                {list.map(c => {
                  const r = commentReactions[c.id] || NO_REACTIONS;
                  const pray = r.n.pray || 0, like = r.n.like || 0, myPray = r.mine.includes('pray'), myLike = r.mine.includes('like');
                  // 꾹 눌러 고른 다른 감정 (👍 2 😂 1 …)
                  const extras = REACTION_EMOJIS.map(e => ({ e, n: r.n[COMMENT_REACTION_TYPES[e]] || 0 })).filter(x => x.e !== '❤️' && x.e !== '🙏' && x.n > 0);
                  const { text: cText, stickers: cStickers } = splitPostStickers(c.content); // 글 끝의 이모티콘 줄은 그림으로
                  const nameLine = (
                    <p className="text-[0.8125rem] flex items-center gap-1 flex-wrap">
                      <b className="text-stone-900">{authorName(c)}</b>
                      {c.user_id && <RoleBadge type={badgeByUser[c.user_id] ?? (c.user_id === user?.id ? profile?.badge_type : undefined)} size="xs" showLabel={false} />}
                      <span className="text-stone-400">{timeAgo(c.created_at)}{c.edited_at && ' · 수정됨'}</span>
                    </p>
                  );
                  return (
                    <div key={c.id} id={`comment-${c.id}`} className={`flex gap-3 rounded-xl transition-colors duration-700 ${c._isReply ? 'ml-11' : ''} ${highlightCommentId === c.id ? 'bg-amber-100/80 -mx-2 px-2 py-1.5' : ''}`}>
                      <button onClick={() => { if (c.user_id) openProfileCard({ id: c.user_id, name: authorName(c) }); }} className="shrink-0 self-start" aria-label={`${authorName(c)}님 프로필`}>{avatarOf(c.user_id, authorName(c))}</button>
                      <div className="flex-1 min-w-0">
                        {editingCommentId === c.id ? (
                          <div className="flex flex-col gap-1.5 mt-1">
                            {nameLine}
                            <textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} rows={2} autoFocus className="w-full text-[0.9375rem] border border-stone-300 rounded-lg px-2.5 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
                            <PostStickers stickers={editCommentStickers} size="w-24 h-24" onRemove={i => setEditCommentStickers(prev => prev.filter((_, j) => j !== i))} />
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => setEditingCommentId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">취소</button>
                              <button onClick={() => saveCommentEdit(c)} disabled={!editCommentText.trim() && editCommentStickers.length === 0} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold disabled:opacity-40">저장</button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            {/* 옆으로 미는 중: 드러나는 답글 표시 */}
                            {commentGestures.swipe?.id === c.id && <SwipeHint dx={commentGestures.swipe.dx} />}
                            <div data-comment {...commentGestures.bind(c)} className="relative select-none [-webkit-touch-callout:none] [touch-action:pan-y] cursor-pointer">
                              {nameLine}
                              {(cText || c.reply_to_name) && (
                                <p className="text-[0.9375rem] text-stone-800 leading-relaxed whitespace-pre-wrap break-words">
                                  {c.reply_to_name && <span className="text-blue-600 font-bold mr-1">@{(c.reply_to_user_id && authorByUser[c.reply_to_user_id]?.name) || c.reply_to_name}</span>}
                                  <HashtagText text={cText} onTag={t => { setCommentSheetId(null); openHashtag(t); }} onMention={h => { setCommentSheetId(null); goToHandle(h); }} />
                                </p>
                              )}
                              {cStickers.length > 0 && <div className="mt-1"><PostStickers stickers={cStickers} size="w-28 h-28" /></div>}
                            </div>
                            {/* 감정을 고르면 잠깐 크게 */}
                            {commentPop?.id === c.id && (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center animate-[heartBurst_0.7s_ease-out_forwards]">
                                {commentPop.emoji === '❤️' ? <Icon name="heart" fill className="w-9 h-9 text-rose-500 drop-shadow" /> : <span className="text-4xl drop-shadow">{commentPop.emoji}</span>}
                              </span>
                            )}
                          </div>
                        )}
                        {editingCommentId !== c.id && (
                          <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-[0.8125rem] font-semibold text-stone-500">
                            {user && c.user_id && <button onClick={() => tagUserInComments(sid, c.user_id!, authorName(c), c._rootId)}>답글 달기</button>}
                            <button onClick={() => toggleCommentReaction(c.id, 'pray')} className={`inline-flex items-center gap-1 ${myPray ? 'text-amber-700' : ''}`}><Icon name="pray" fill={myPray} className="w-4 h-4" />기도{pray > 0 && ` ${pray}`}</button>
                            {extras.length > 0 && (
                              <button onClick={e => setCommentMenu({ c, anchor: anchorOf(e.currentTarget.closest('[id^="comment-"]')?.querySelector('[data-comment]') ?? e.currentTarget) })}
                                aria-label={`감정 표시 ${extras.map(x => `${x.e} ${x.n}`).join(', ')} · 눌러서 고르기`}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border border-stone-200 font-normal text-stone-600 leading-none">
                                {extras.map(x => <span key={x.e}>{x.e}{x.n > 1 && <span className="ml-0.5 text-[0.75rem]">{x.n}</span>}</span>)}
                              </button>
                            )}
                            {user && c.user_id === user.id && <button onClick={() => startEditComment(c)}>수정</button>}
                            {user && (c.user_id === user.id || isAdmin || sheetPost?.user_id === user.id) && <button onClick={() => deleteComment(c)} className="text-red-500">삭제</button>}
                            {user && c.user_id !== user.id && <button onClick={() => setReportTarget({ type: 'comment', id: c.id, userId: c.user_id, userName: c.author_name, preview: postPlainText(c.content) })} className="text-stone-400">신고</button>}
                          </div>
                        )}
                      </div>
                      {/* 오른쪽 하트 (공감) */}
                      <button onClick={() => toggleCommentReaction(c.id, 'like')} className="shrink-0 self-start pt-1 w-8 flex flex-col items-center text-[0.75rem] text-stone-500" aria-label={`공감 ${like}`}>
                        <Icon name="heart" fill={myLike} className={`w-[1.125rem] h-[1.125rem] ${myLike ? 'text-rose-500' : 'text-stone-400'}`} />
                        {like > 0 && like}
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* 댓글을 꾹 누르면: 그 댓글 바로 위에 감정 표시(여러 개 고를 수 있음), 아래에 답글 · 수정 · 삭제 · 신고 */}
              {commentMenu && (() => {
                const c = commentMenu.c;
                const mineC = !!user && c.user_id === user.id;
                const close = () => setCommentMenu(null);
                return (
                  <MessageMenu anchor={commentMenu.anchor} alignRight={false} label="댓글 메뉴" onClose={close}
                    emojis={REACTION_EMOJIS} selected={REACTION_EMOJIS.filter(e => (commentReactions[c.id] || NO_REACTIONS).mine.includes(COMMENT_REACTION_TYPES[e]))}
                    onEmoji={e => toggleCommentReaction(c.id, COMMENT_REACTION_TYPES[e])}
                    actions={[
                      ...(c.user_id ? [{ label: '↩️ 답글 달기', run: () => { close(); tagUserInComments(sid, c.user_id!, authorName(c), c._rootId); } }] : []),
                      ...(mineC ? [{ label: '✏️ 수정', run: () => { close(); startEditComment(c); } }] : []),
                      ...(user && !mineC ? [{ label: '🚨 신고', run: () => { close(); setReportTarget({ type: 'comment', id: c.id, userId: c.user_id, userName: c.author_name, preview: postPlainText(c.content) }); } }] : []),
                      ...(user && (mineC || isAdmin || sheetPost?.user_id === user.id) ? [{ label: '🗑 삭제', run: () => { close(); deleteComment(c); }, danger: true }] : []),
                    ]} />
                );
              })()}
              {/* 추천 이모티콘·고른 이모티콘: 댓글 위에 떠서 보임 */}
              {user && <div className="relative h-0 shrink-0 z-20"><StickerAbove picker={commentSticker} text={commentInputs[sid] || ''} onTextChange={v => setCommentInputs(prev => ({ ...prev, [sid]: v }))} sendLabel="게시" /></div>}
              {/* 입력칸 */}
              <div className={`shrink-0 border-t border-stone-200 px-3 pt-2 ${commentSticker.open ? 'pb-2' : 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]'} bg-white flex flex-col gap-1.5`}>
                {replyTargets[sid] && (
                  <div className="flex items-center gap-2 text-[0.8125rem] bg-stone-100 text-stone-600 rounded-lg px-3 py-1.5">
                    <span className="flex-1 min-w-0 truncate"><b className="text-stone-800">{replyTargets[sid]!.name}</b>님에게 답글 남기는 중</span>
                    <button onClick={() => { setReplyTargets(prev => ({ ...prev, [sid]: null })); commentSticker.setPicked(null); }} className="text-stone-400 text-lg leading-none px-1" aria-label="답글 취소">×</button>
                  </div>
                )}
                {user && <MentionSuggest value={commentInputs[sid] || ''} onChange={v => setCommentInputs(prev => ({ ...prev, [sid]: v }))} excludeId={user.id} />}
                <div className="flex items-end gap-2">
                  {user && <span className="shrink-0 mb-1">{avatarOf(user.id, profile?.baptismal_name)}</span>}
                  {/* 한 줄 입력칸(input) 대신 textarea: 휴대폰 자판 위에 열쇠·카드·위치 자동 완성 줄이 뜨지 않음 */}
                  <div className="flex-1 min-w-0 flex items-end border border-stone-300 rounded-[1.375rem] bg-white focus-within:ring-2 focus-within:ring-stone-300">
                    <textarea
                      id={`comment-input-${sid}`}
                      ref={commentEnter.ref}
                      rows={1}
                      autoComplete="off"
                      enterKeyHint={commentEnter.enterKeyHint}
                      value={commentInputs[sid] || ''}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [sid]: e.target.value }))}
                      onKeyDown={commentEnter.onKeyDown}
                      onFocus={() => closePanelOnInputFocus(() => commentSticker.setOpen(false))}
                      placeholder={replyTargets[sid] ? `${replyTargets[sid]!.name}님에게 답글...` : sheetPost ? `${sheetPost.author_name}님에게 댓글 남기기...` : '댓글 달기...'}
                      aria-label="댓글 입력"
                      className="flex-1 min-w-0 max-h-32 resize-none bg-transparent pl-4 pr-1 py-2.5 text-[0.9375rem] leading-5 focus:outline-none"
                    />
                    {user && <StickerButton open={commentSticker.open} className="w-9 h-9 m-0.5" onClick={() => { commentSticker.setOpen(!commentSticker.open); leaveInputForPanel(document.getElementById(`comment-input-${sid}`)); }} />}
                  </div>
                  <button onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={() => submitComment(sid)} disabled={!(commentInputs[sid] || '').trim() && !commentSticker.picked} className="shrink-0 px-3 py-2.5 text-[0.9375rem] font-bold text-blue-600 disabled:text-blue-300">게시</button>
                </div>
              </div>
              {user && commentSticker.open && <StickerPanel picker={commentSticker} />}
            </div>
          </div>
        );
      })()}

      {/* 팝업 공지: 앱에 들어오면 한 번 뜸. 닫기 = 다음에 또, 다시 보지 않기 = 이 공지는 그만 */}
      {showPopupNotice && popupNotice && (
        <div className="fixed inset-0 z-[88] bg-black/55 flex items-center justify-center p-5 animate-fade-in" onClick={() => closePopup(popupNotice.id)}>
          <div className="w-full max-w-sm max-h-[80dvh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="공지">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 border-b border-stone-200">
              <IconBadge name="megaphone" tone="gold" />
              <div className="min-w-0">
                <p className="text-[0.75rem] font-bold text-amber-700">공지</p>
                <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">{popupNotice.title}</h2>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <p className="text-[1rem] text-stone-800 whitespace-pre-wrap leading-relaxed">{popupNotice.content}</p>
            </div>
            <div className="flex border-t border-stone-200">
              <button onClick={() => hideNotice(popupNotice.id)} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-500 border-r border-stone-200">다시 보지 않기</button>
              <button onClick={() => closePopup(popupNotice.id)} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-900">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 공지사항 */}
      {showNotices && (
        <NoticeBoard
          key={`${noticeOpenId || 'list'}-${noticeAdminMode}`}
          notices={notices}
          isAdmin={isAdmin && noticeAdminMode}
          initialOpenId={noticeOpenId}
          hiddenIds={hiddenNotices}
          onHide={id => { hideNotice(id); setShowNotices(false); }}
          onClose={() => setShowNotices(false)}
          onChanged={fetchNotices}
        />
      )}

      {/* 숏폼 영상 꾸미기 */}
      {showAdminStats && isAdmin && <AdminStats onClose={() => setShowAdminStats(false)} />}
      {showAdminUsage && isAdmin && <AdminUsage onClose={() => setShowAdminUsage(false)} />}
      {showAdminTesters && isAdmin && <AdminTesters onClose={() => setShowAdminTesters(false)} sendPush={sendPush} />}
      {showTesterSignup && user && <TesterSignup user={user} onClose={() => setShowTesterSignup(false)} onStatusChange={setTesterStatus} />}
      {showDeletedMessages && isAdmin && <DeletedMessages onClose={() => setShowDeletedMessages(false)} />}
      {showMediaStorage && isAdmin && <MediaStorage onClose={() => setShowMediaStorage(false)} />}
      {showLetters && user && (
        <LettersModal
          user={user}
          authorName={profile?.baptismal_name || '교우'}
          authorHandle={profile?.handle}
          isAdmin={isAdmin}
          startView={lettersStart}
          onGift={id => sendPush('letter_gift', id)}
          onStickerGifted={id => sendPush('sticker_gift', id)}
          onMessage={async uid => {
            const { data } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', uid).maybeSingle();
            if (!data) { alert('교우를 찾지 못했어요.'); return; }
            setShowLetters(false);
            openChatRoom(data);
          }}
          onOpenProfile={t => openProfileCard({ id: t.id, name: t.name, handle: t.handle })}
          onReplied={id => sendPush('letter_reply', id)}
          onClose={() => setShowLetters(false)}
          onSent={id => sendPush('letter', id)}
          onChanged={fetchLetterCount}
        />
      )}

      {/* 팔로워·팔로잉 목록 */}
      {followList && (
        <BottomSheet bare label="팔로워·팔로잉" onClose={() => setFollowList(null)} z="z-[75]" tone="bg-white">
          <section className="flex-1 min-h-0 flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-stone-900">{followList.mode === 'followers' ? '팔로워' : '팔로잉'}{followList.items && ` ${followList.items.length}명`}</h2>
              <button onClick={() => setFollowList(null)} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-1" aria-label="닫기">×</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
              {!followList.items && <div className="p-10 text-center text-sm text-stone-400">불러오는 중...</div>}
              {followList.items?.length === 0 && <div className="p-10 text-center text-sm text-stone-400">{followList.mode === 'followers' ? '아직 팔로워가 없어요.' : '아직 팔로우한 사람이 없어요.'}</div>}
              {followList.items?.map(p => (
                <button key={p.id} onClick={() => openProfileCard({ id: p.id, name: p.baptismal_name, avatar_url: p.avatar_url, handle: p.handle, badge_type: p.badge_type })} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-stone-50">
                  {p.avatar_url
                    ? <img loading="lazy" src={p.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover border border-stone-200" />
                    : <span className="w-11 h-11 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-serif font-bold">{initial(p.baptismal_name)}</span>}
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-bold text-stone-800 text-sm">{p.baptismal_name}<RoleBadge type={p.badge_type} size="xs" /></span>
                    <span className="block text-xs text-stone-400">@{p.handle}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </BottomSheet>
      )}

      {/* 게시글 수정: 위 × · 제목 · 저장 / 작성자 / 사진 줄(고르기·길게 눌러 순서 바꾸기, 자르기·가리기·삭제) / 본문 칸(이모티콘·해시태그) / 추가 설정(교우 태그·음악·공개 범위) */}
      {editingPostId && !showEditVideoEditor && (() => {
        const target = posts.find(p => p.id === editingPostId);
        if (!target) return null;
        const thumb = target.video_poster || target.images?.[0];
        const before = target.images || [];
        const orig = splitPostStickers(target.content);
        const dirty = joinPostStickers(editContent, editStickers) !== joinPostStickers(orig.text, orig.stickers) || editVisibility !== (target.visibility || 'public')
          || (editMusic?.value || null) !== (target.music || null)
          || (!target.video_url && (editPhotos.length !== before.length || editPhotos.some((ph, i) => !!ph.file || ph.url !== before[i])))
          || (!!target.video_url && JSON.stringify(editOverlays || null) !== JSON.stringify(target.video_overlays || null));
        const closeEdit = async () => { if (dirty && !(await askConfirm('고친 내용이 저장되지 않아요. 그래도 닫을까요?'))) return; setEditingPostId(null); };
        const canSave = !savingEdit && !!(editContent.trim() || editPhotos.length > 0 || target.video_url || editStickers.length > 0);
        const sel = Math.min(editSelIdx, Math.max(0, editPhotos.length - 1));
        const tagged = Array.from(new Set(extractMentions(editContent)));
        // 글 끝에 # 또는 @ 를 붙이고 바로 이어서 쓰게 (누른 그 자리에서 자판이 올라오도록 바로 초점)
        const insertAtEnd = (mark: string) => {
          const ta = editTextRef.current;
          if (!ta) return;
          const v = ta.value;
          ta.focus();
          ta.setRangeText(v && !/\s$/.test(v) ? ` ${mark}` : mark, v.length, v.length, 'end');
          setEditContent(ta.value);
        };
        const removeSelected = () => {
          const ph = editPhotos[sel];
          if (!ph) return;
          setEditPhotos(prev => prev.filter((_, i) => i !== sel));
          if (ph.file) URL.revokeObjectURL(ph.url);
          setEditSelIdx(i => Math.max(0, Math.min(i, editPhotos.length - 2)));
        };
        const movePhoto = (from: number, to: number) => {
          setEditPhotos(prev => { const next = [...prev]; const [m] = next.splice(from, 1); next.splice(to, 0, m); return next; });
          setEditSelIdx(to);
        };
        const chevron = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-stone-400 shrink-0" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;
        const row = 'w-full min-h-[3.75rem] px-4 py-3 flex items-center gap-4 text-left active:bg-stone-50';
        const tool = 'inline-flex items-center gap-2 py-2 text-[1rem] text-stone-800 disabled:opacity-40';
        return (
          <div className="fixed inset-0 z-[75] bg-black/50 flex items-stretch sm:items-center justify-center">
            <section role="dialog" aria-label="게시글 수정" className="bg-stone-50 w-full h-full sm:h-[90dvh] sm:max-w-xl sm:rounded-3xl overflow-hidden flex flex-col">
              <header className="relative shrink-0 h-16 px-2 flex items-center justify-between border-b border-stone-200 bg-white">
                <button onClick={closeEdit} className="w-12 h-12 flex items-center justify-center text-stone-800" aria-label="닫기">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
                <h2 className="absolute left-1/2 -translate-x-1/2 font-bold text-[1.1875rem] text-stone-900 pointer-events-none">게시글 수정</h2>
                <button onClick={() => handleUpdatePost(target.id)} disabled={!canSave} className="h-11 px-5 mr-1 rounded-xl bg-blue-500 text-white font-bold text-[1rem] disabled:opacity-40">{savingEdit ? '저장 중…' : '저장'}</button>
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[calc(2rem+env(safe-area-inset-bottom))]">
                {/* 작성자 */}
                <div className="px-4 py-4 flex items-center gap-3">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover border border-stone-200 shrink-0" />
                    : <span className="w-11 h-11 rounded-full bg-stone-200 text-stone-600 font-serif font-bold flex items-center justify-center shrink-0">{initial(profile?.baptismal_name, '교')}</span>}
                  <span className="min-w-0 truncate text-[1.0625rem] text-stone-900">{profile?.handle || target.author_name}</span>
                </div>
                {target.video_url ? (
                  thumb && <img src={thumb} alt="" className="mx-4 w-[calc(100%-2rem)] max-h-[40dvh] object-cover rounded-xl bg-black" />
                ) : (
                  <>
                    <div className="px-4 pb-2 flex items-center justify-between">
                      <h3 className="font-bold text-[1.0625rem] text-stone-900">사진 {editPhotos.length}장</h3>
                      {editPhotos.length < MAX_PHOTOS && (
                        <label className="inline-flex items-center gap-1.5 text-[0.9375rem] text-stone-600 cursor-pointer">
                          <span className="w-7 h-7 rounded-full border-2 border-stone-500 flex items-center justify-center"><Icon name="plus" className="w-4 h-4" /></span>사진 추가
                          <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addEditPhotos(e.target.files); e.target.value = ''; }} />
                        </label>
                      )}
                    </div>
                    {editPhotos.length > 0 ? (
                      <>
                        <PhotoStrip photos={editPhotos} selected={sel} onSelect={setEditSelIdx} onMove={movePhoto} />
                        {/* 고른 사진에 할 일 */}
                        <div className="px-4 mt-2 flex items-center gap-6">
                          <button type="button" onClick={() => openEditPhotoEditor(sel, 'crop')} disabled={editPhotoLoading} className={tool}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M18 22V8a2 2 0 0 0-2-2H2" /></svg>자르기
                          </button>
                          <button type="button" onClick={() => openEditPhotoEditor(sel, 'cover')} disabled={editPhotoLoading} className={tool}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true"><circle cx="11" cy="7.5" r="3.5" /><path d="M4 20c0-3.6 3.1-6 7-6 1.3 0 2.5.3 3.5.8" strokeDasharray="2 2.4" /><circle cx="18.5" cy="17.5" r="2.5" strokeDasharray="1.6 1.6" /></svg>가리기
                          </button>
                          <button type="button" onClick={removeSelected} className={`${tool} ml-auto`}>
                            <Icon name="trash" className="w-6 h-6" />삭제
                          </button>
                        </div>
                        <p className="px-4 text-[0.8125rem] text-stone-400">{editPhotoLoading ? '사진을 불러오는 중...' : '길게 눌러 순서 변경'}</p>
                      </>
                    ) : (
                      <p className="mx-4 py-6 rounded-xl border border-dashed border-stone-300 text-center text-[0.9375rem] text-stone-400">사진이 없어요. 오른쪽 위 &lsquo;사진 추가&rsquo;로 넣을 수 있어요</p>
                    )}
                  </>
                )}
                {/* 본문 */}
                <div className="mx-4 mt-5 rounded-2xl border border-stone-200 bg-white overflow-hidden">
                  <p className="px-4 pt-3 text-[0.875rem] font-bold text-stone-500">본문</p>
                  <textarea ref={editTextRef} value={editContent} onChange={e => setEditContent(e.target.value)} rows={4} placeholder="문구를 입력하세요..." aria-label="글 내용"
                    className="block w-full min-h-[7rem] px-4 pt-2 pb-3 text-[1.0625rem] leading-relaxed text-stone-900 bg-transparent resize-none focus:outline-none placeholder:text-stone-400" />
                  {user && <div className="px-4"><MentionSuggest value={editContent} onChange={setEditContent} excludeId={user.id} /></div>}
                  {/* 붙인 이모티콘 (× 로 빼기) */}
                  {editStickers.length > 0 && <div className="px-4 pb-3"><PostStickers stickers={editStickers} size="w-24 h-24" onRemove={i => setEditStickers(prev => prev.filter((_, j) => j !== i))} /></div>}
                  {editEmojiOpen && (
                    <>
                      <div className="px-2 pb-2 flex flex-wrap gap-0.5" role="group" aria-label="이모티콘 넣기">
                        {['🙏', '✝️', '❤️', '😊', '🥰', '🌸', '🕊️', '⛪', '📿', '✨', '🎉', '🌿'].map(e => (
                          <button key={e} type="button" onClick={() => setEditContent(c => c + e)} className="w-11 h-11 rounded-full text-[1.5rem] active:bg-stone-100">{e}</button>
                        ))}
                      </div>
                      <StickerPanel picker={postStickerPicker(editEmojiOpen, setEditEmojiOpen, editStickers, setEditStickers)} />
                    </>
                  )}
                  <div className="flex items-center border-t border-stone-100 px-2">
                    <button type="button" onClick={() => setEditEmojiOpen(o => !o)} aria-pressed={editEmojiOpen} className={`inline-flex items-center gap-2 px-3 py-3 text-[0.9375rem] ${editEmojiOpen ? 'text-amber-700 font-bold' : 'text-stone-600'}`}>
                      <Icon name="smiley" className="w-6 h-6" />이모티콘
                    </button>
                    <span className="w-px h-5 bg-stone-200" aria-hidden="true" />
                    <button type="button" onClick={() => insertAtEnd('#')} className="inline-flex items-center gap-2 px-3 py-3 text-[0.9375rem] text-stone-600">
                      <span className="text-[1.375rem] font-bold leading-none" aria-hidden="true">#</span>해시태그
                    </button>
                  </div>
                </div>
                {/* 추가 설정 */}
                <h3 className="px-4 mt-6 mb-2 font-bold text-[1.0625rem] text-stone-900">추가 설정</h3>
                <div className="mx-4 rounded-2xl border border-stone-200 bg-white overflow-hidden divide-y divide-stone-100">
                  <button type="button" onClick={() => insertAtEnd('@')} className={row}>
                    <Icon name="user" className="w-6 h-6 text-stone-800 shrink-0" />
                    <span className="flex-1 text-[1.0625rem] text-stone-900">교우 태그</span>
                    <span className="shrink-0 max-w-[45%] truncate text-[0.9375rem] text-stone-500">{tagged.length ? `${tagged.length}명` : '선택 안 함'}</span>
                    {chevron}
                  </button>
                  <div>
                    <button type="button" onClick={() => { setMusicSegment(null); setMusicPickerFor('edit'); setShowMusicPicker(true); }} className={row}>
                      <Icon name="music" className="w-6 h-6 text-stone-800 shrink-0" />
                      <span className="flex-1 text-[1.0625rem] text-stone-900">음악</span>
                      <span className="shrink-0 max-w-[50%] truncate text-[0.9375rem] text-stone-500">{editMusic ? editMusic.title : '추가 안 함'}</span>
                      {chevron}
                    </button>
                    {editMusic && (
                      <div className="px-4 pb-3 -mt-1 pl-14 flex items-center gap-2">
                        {musicRangeLabel(editMusic.value) && <span className="text-[0.8125rem] text-stone-500">{musicRangeLabel(editMusic.value)}</span>}
                        {canAdjustMusic(editMusic.value) && <button type="button" onClick={() => openMusicSegment('edit', editMusic)} className="px-3 py-1.5 rounded-full bg-stone-100 text-[0.8125rem] font-bold text-stone-700">구간 조절</button>}
                        <button type="button" onClick={() => setEditMusic(null)} className="px-3 py-1.5 rounded-full border border-stone-200 text-[0.8125rem] text-stone-500">빼기</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <button type="button" onClick={() => setEditVisOpen(v => !v)} className={row} aria-expanded={editVisOpen}>
                      <Icon name={VISIBILITY[editVisibility].icon} className="w-6 h-6 text-stone-800 shrink-0" />
                      <span className="flex-1 text-[1.0625rem] text-stone-900">공개 범위</span>
                      <span className="shrink-0 text-[0.9375rem] text-stone-500">{VISIBILITY[editVisibility].label}</span>
                      <span className={`transition-transform ${editVisOpen ? 'rotate-90' : ''}`}>{chevron}</span>
                    </button>
                    {editVisOpen && <div className="px-4 pb-3"><VisibilityPicker value={editVisibility} onChange={setEditVisibility} /></div>}
                  </div>
                  {target.video_url && (
                    <button type="button" onClick={() => setShowEditVideoEditor(true)} className={row}>
                      <Icon name="video" className="w-6 h-6 text-stone-800 shrink-0" />
                      <span className="flex-1 text-[1.0625rem] text-stone-900">영상 위 글자·이모티콘</span>
                      <span className="shrink-0 text-[0.9375rem] text-stone-500">{hasOverlays(editOverlays) ? '있음' : '없음'}</span>
                      {chevron}
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        );
      })()}
      {/* 글 고치기: 사진 자르기·가리기 */}
      {editingPostId && editPhotoEditor && (
        <PhotoEditor
          file={editPhotoEditor.file}
          startStep={editPhotoEditor.step}
          onCancel={() => setEditPhotoEditor(null)}
          onDone={edited => {
            const { idx } = editPhotoEditor;
            setEditPhotos(prev => prev.map((ph, i) => { if (i !== idx) return ph; if (ph.file) URL.revokeObjectURL(ph.url); return { url: URL.createObjectURL(edited), file: edited }; }));
            setEditPhotoEditor(null);
          }}
        />
      )}
      {editingPostId && showEditVideoEditor && (() => {
        const target = posts.find(p => p.id === editingPostId);
        if (!target?.video_url) return null;
        return (
          <VideoEditor
            src={target.video_url}
            initial={editOverlays}
            musicTitle={editMusic?.title}
            musicRange={editMusic ? musicRangeLabel(editMusic.value) : null}
            onAdjustMusic={editMusic && canAdjustMusic(editMusic.value) ? () => openMusicSegment('edit', editMusic) : undefined}
            onOpenMusic={() => { setMusicSegment(null); setMusicPickerFor('edit'); setShowMusicPicker(true); }}
            onRemoveMusic={() => setEditMusic(null)}
            onDone={o => { setEditOverlays(o); setShowEditVideoEditor(false); }}
            onCancel={() => setShowEditVideoEditor(false)}
          />
        );
      })()}

      {showVideoEditor && videoPreviewUrl && (
        <VideoEditor
          src={videoPreviewUrl}
          initial={composerOverlays}
          musicTitle={composerMusic?.title}
          musicRange={composerMusic ? musicRangeLabel(composerMusic.value) : null}
          onAdjustMusic={composerMusic && canAdjustMusic(composerMusic.value) ? () => openMusicSegment('composer', composerMusic) : undefined}
          onOpenMusic={() => { setMusicSegment(null); setShowMusicPicker(true); }}
          onRemoveMusic={() => setComposerMusic(null)}
          onDone={o => { setComposerOverlays(o); setShowVideoEditor(false); }}
          onCancel={() => setShowVideoEditor(false)}
        />
      )}

      {/* 글쓰기: 음악 고르기 */}
      {showMusicPicker && (
        <MusicPicker tracks={bgmTracks} initialSegment={musicSegment} onClose={() => { setShowMusicPicker(false); setMusicPickerFor('composer'); setMusicSegment(null); }} onSelect={m => { if (musicPickerFor === 'edit') setEditMusic({ value: m.value, title: m.title }); else setComposerMusic(m); setShowMusicPicker(false); setMusicPickerFor('composer'); setMusicSegment(null); }} />
      )}

      {/* 관리자: 배경음악 관리 */}
      {showBgmAdmin && isAdmin && (
        <BgmAdmin onClose={() => setShowBgmAdmin(false)} onChanged={fetchBgmTracks} />
      )}

      {/* 관리자: 회원 관리 */}
      {showAdminMembers && isAdmin && (
        <AdminMembers
          onClose={() => setShowAdminMembers(false)}
          onMessage={m => { setShowAdminMembers(false); openChatRoom(m); }}
          onOpenProfile={id => { setShowAdminMembers(false); goToProfile(id); }}
        />
      )}

      {/* 운영자 건의함 */}
      {showFeedback && user && (
        <FeedbackModal user={user} isAdmin={isAdmin} initialView={feedbackView} onClose={() => { setShowFeedback(false); setFeedbackView(null); }} sendPush={sendPush} />
      )}

      {/* 앱 사용 중 새 알림 배너 */}
      {toast && (
        // 맨 위 단추(＋·♡ 알림)를 가리지 않게 머리말 아래에 띄운다
        <div className="fixed top-[calc(4.5rem+env(safe-area-inset-top))] left-0 right-0 z-[95] flex justify-center px-3 pointer-events-none">
          <button
            onClick={() => { const { action, stay } = toast; setToast(null); if (!stay) closeOverlaysForLink(); action(); }} // 보던 창(테스터 목록 등)은 닫고 그 화면으로
            className="pointer-events-auto w-full max-w-md bg-white/95 backdrop-blur border border-stone-200 shadow-xl rounded-2xl px-4 py-3 flex items-center gap-3 text-left animate-[toastIn_0.25s_ease-out]"
          >
            <span className="text-2xl shrink-0">{toast.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[0.9375rem] font-bold text-stone-900 truncate">{toast.title}</span>
              {toast.body && <span className="block text-xs text-stone-600 truncate">{toast.body}</span>}
            </span>
            {!toast.key.startsWith('exit') && <span className="text-[0.8125rem] text-blue-600 font-bold shrink-0">보기</span>}
          </button>
        </div>
      )}

      {/* 새 버전 안내 띠: 켜 둔 채로 쓰던 기기에서 새 기능을 받으려면 한 번 새로 고침 */}
      {updateReady && !toast && !anyModalOpen && (
        <div className="fixed top-[calc(4.5rem+env(safe-area-inset-top))] left-0 right-0 z-[94] flex justify-center px-3 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-md bg-white/95 backdrop-blur border border-violet-200 shadow-xl rounded-2xl pl-4 pr-2 py-2.5 flex items-center gap-3 animate-[toastIn_0.25s_ease-out]">
            <span className="text-2xl shrink-0">✨</span>
            <span className="flex-1 min-w-0">
              <span className="block text-[0.9375rem] font-bold text-stone-900">앱이 새로 바뀌었어요</span>
              <span className="block text-xs text-stone-600">새로 고침을 누르면 새 기능이 보여요</span>
            </span>
            <button onClick={async () => { await supabase.auth.getSession().catch(() => {}); window.location.reload(); }} className="shrink-0 bg-violet-600 text-white text-sm font-bold rounded-xl px-3 py-2">새로 고침</button>
            <button onClick={() => { updateDismissedRef.current = true; setUpdateReady(false); }} className="shrink-0 text-stone-400 text-2xl leading-none px-1.5" aria-label="나중에">×</button>
          </div>
        </div>
      )}

      {/* 처음 들어왔을 때 알림 켜기 안내 */}
      {showPushPrompt && !showInstallGuide && (
        <div className="fixed inset-0 bg-black/60 z-[75] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowPushPrompt(false)}>
          <div className="bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4 pb-safe text-center" onClick={e => e.stopPropagation()}>
            <IconBadge name="bell" tone="gold" size="lg" />
            <h2 className="font-bold text-lg text-stone-900">휴대폰 알림을 켜주세요</h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              내 글에 달린 댓글, 새 메시지,<br />교우들의 축일 소식을 바로 알려드려요.
            </p>
            <p className="text-sm font-bold text-stone-900 bg-yellow-100 rounded-xl px-3 py-2">
              다음 창에서 <u>허용</u>을 눌러주세요 👍
            </p>
            <button onClick={acceptPushPrompt} disabled={pushBusy} className="w-full bg-stone-900 text-white py-3.5 rounded-xl text-base font-bold">알림 받기</button>
            <button onClick={() => setShowPushPrompt(false)} className="text-sm text-stone-400">나중에</button>
          </div>
        </div>
      )}

      {/* 홈 화면 추가 방법 안내 */}
      {/* 홈 화면에 추가하기: 쓰는 브라우저에 맞춘 단계 + 메뉴 단추 자리를 가리키는 화살표 (components/InstallGuide) */}
      {showInstallGuide && <InstallGuide isIOS={isIOS} canInstall={!!installPrompt} onInstall={startNativeInstall} onClose={() => setShowInstallGuide(false)} />}

      {/* 댓글 알림 목록 */}
      {showNotifications && (
        <BottomSheet bare label="알림" onClose={() => setShowNotifications(false)} z="z-[70]">
          <div className="flex-1 min-h-0 flex flex-col pb-safe">
            <div className="shrink-0 px-4 pb-3 pt-1 border-b border-stone-100 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-900">알림</h2>
              <div className="flex items-center gap-2">
                <button onClick={toggleAlertSound} className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 text-stone-600">
                  {alertSoundOn ? <><Icon name="speaker" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />소리 켜짐</> : <><Icon name="mute" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />소리 꺼짐</>}
                </button>
                <button onClick={() => setShowNotifications(false)} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1" aria-label="알림 닫기">×</button>
              </div>
              </div>
              {/* 지우기: 확인한(눌러 본) 알림만 / 확인하지 않은 알림까지 모두 */}
              <div className="flex gap-2">
                <button onClick={clearSeenAlerts} className="flex-1 text-xs py-1.5 rounded-lg border border-stone-200 text-stone-600"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />확인한 알림 지우기</button>
                <button onClick={clearAllAlerts} className="flex-1 text-xs py-1.5 rounded-lg border border-red-200 text-red-600"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />모두 지우기</button>
              </div>
            </div>
            {pushStatus !== 'checking' && pushStatus !== 'unsupported' && (
              <div className="shrink-0 px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-3">
                <IconBadge name="phone" tone="sky" />
                <div className="flex-1 text-xs text-stone-700 leading-snug">
                  {pushStatus === 'on' && <><b>휴대폰 알림 켜짐</b><br />앱을 닫아도 댓글·메시지 알림이 와요</>}
                  {pushStatus === 'off' && <><b>휴대폰 알림 받기</b><br />앱을 닫아도 댓글·메시지 알림을 받아요</>}
                  {pushStatus === 'denied' && <><b>알림이 차단되어 있어요</b><br />휴대폰 설정에서 이 사이트(앱)의 알림을 허용해주세요</>}
                  {pushStatus === 'ios-needs-install' && <><b>아이폰은 홈 화면 앱에서만</b> 알림을 받을 수 있어요<br />먼저 홈 화면에 추가한 뒤 그 아이콘으로 열어주세요</>}
                </div>
                {pushStatus === 'on' && <button onClick={disablePush} disabled={pushBusy} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 shrink-0">끄기</button>}
                {pushStatus === 'off' && <button onClick={() => enablePush()} disabled={pushBusy} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">{pushBusy ? '설정 중...' : '켜기'}</button>}
                {pushStatus === 'ios-needs-install' && <button onClick={() => { setShowNotifications(false); setShowInstallGuide(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">방법 보기</button>}
              </div>
            )}
            <div ref={alertListRef} className="relative flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
              {isMyFeastToday && !feastCleared && (
                <div data-flip-key="feast-me" className="p-4 bg-amber-50/60">
                  <p className="text-[0.9375rem] text-stone-800">{myCheer && CHEER_ICON[myCheer]} <b>{profile?.baptismal_name}</b>님, 오늘 {myCheerText?.title}</p>
                  <p className="text-xs text-stone-600 mt-1">{myCheerText?.body.replace(/^.*?님, /, '')}</p>
                </div>
              )}
              {!feastCleared && visibleFeastFriends.map(f => (
                <div key={`feast-${f.id}`} data-flip-key={`feast-${f.id}`} className="p-4 flex items-center gap-3 bg-amber-50/60">
                  <button onClick={() => { setShowNotifications(false); goToProfile(f.id); }} className="flex-1 text-left min-w-0 text-[0.9375rem] text-stone-800">
                    {CHEER_ICON[friendCheer(f)]} 오늘은 <b>{f.baptismal_name}</b>님의 {CHEER_WORD[friendCheer(f)]}입니다
                    <span className="block text-xs text-stone-500 mt-0.5">축하해 주세요!</span>
                  </button>
                  <button onClick={() => congratulateFeast(f)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">축하하기</button>
                </div>
              ))}
              {listedFollows.map(r => (
                <div key={r.id} data-flip-key={`f:${r.id}`} className={`p-4 flex items-center gap-3 ${readAlerts.has(`f:${r.id}`) || readAlerts.has(`fu:${r.follower.id}`) ? 'opacity-55' : r.created_at && notificationsLastSeen && new Date(r.created_at) <= new Date(notificationsLastSeen) ? '' : 'bg-blue-50/40'}`}>
                  <button onClick={() => { markAlertRead(`f:${r.id}`); setShowNotifications(false); goToProfile(r.follower.id); }} className="flex-1 flex items-center gap-2.5 text-left min-w-0">
                    {r.follower.avatar_url ? (
                      <img loading="lazy" src={r.follower.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-stone-200 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold shrink-0">{initial(r.follower.baptismal_name)}</div>
                    )}
                    <p className="text-[0.9375rem] text-stone-800 min-w-0">
                      <Icon name="userPlus" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-sky-600" /><b className="inline-flex items-center gap-1">{r.follower.baptismal_name}<RoleBadge type={r.follower.badge_type} size="xs" showLabel={false} /></b>님이 회원님을 팔로우하기 시작했어요
                    </p>
                  </button>
                  {r.iFollow
                    ? <span className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-400 shrink-0">팔로잉</span>
                    : <button onClick={() => followBack(r)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white font-bold shrink-0">맞팔로우</button>}
                  <button onClick={() => hideAlert(`f:${r.id}`)} className="text-stone-300 hover:text-stone-600 text-lg leading-none px-1 shrink-0" aria-label="이 알림 지우기">×</button>
                </div>
              ))}
              {listedMessages.map(u => (
                <button key={`msg-${u.partner.id}`} data-flip-key={`msg-${u.partner.id}`} onClick={() => { setShowNotifications(false); openChatRoom(u.partner); }} className="w-full p-4 text-left hover:bg-stone-50 transition-colors flex flex-col gap-1 bg-amber-50/40">
                  <p className="text-[0.9375rem] text-stone-800">
                    <Icon name="envelope" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-violet-600" /><b>{u.partner.baptismal_name}</b>님이 메시지를 보냈습니다 <span className="ml-1 text-[0.75rem] bg-red-500 text-white rounded-full px-1.5 py-px font-bold">{u.count}</span>
                  </p>
                  <p className="text-xs text-stone-600 line-clamp-1">&ldquo;{u.lastMessage}&rdquo;</p>
                  <p className="text-[0.8125rem] text-stone-400">{new Date(u.lastAt).toLocaleString('ko-KR')}</p>
                </button>
              ))}
              {listedComments.length === 0 && listedFollows.length === 0 && listedMessages.length === 0 && (feastCleared || (visibleFeastFriends.length === 0 && !isMyFeastToday)) ? (
                <div className="p-10 text-center text-stone-400 text-sm">새 알림이 없습니다.</div>
              ) : (
                listedComments.map(n => (
                  <div key={n.id} data-flip-key={`c:${n.id}`} className={`relative ${readAlerts.has(`c:${n.id}`) ? 'opacity-55' : ''}`}>
                  <button onClick={() => hideAlert(`c:${n.id}`)} className="absolute top-3 right-3 z-10 text-stone-300 hover:text-stone-600 text-lg leading-none px-1" aria-label="이 알림 지우기">×</button>
                  <button onClick={() => openNotification(n)} className="w-full p-4 pr-10 text-left hover:bg-stone-50 transition-colors flex items-center gap-3">
                    <span className="flex-1 min-w-0 flex flex-col gap-1">
                    <p className="text-[0.9375rem] text-stone-800">
                      {n.anon ? <Icon name="reply" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-sky-600" /> : n.mention ? <Icon name="tag" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-amber-600" /> : <Icon name="chat" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-emerald-600" />}{n.anon === 'mine' ? <><b>익명 교우</b>가 회원님의 고민글에 답글을 남겼어요</> : n.anon === 'author' ? <><b>고민글 작성자</b>가 답글을 남겼어요</> : <><b>{n.author_name}</b>님이 {n.mention === 'post' ? '글에서 회원님을 언급했어요' : n.mention === 'comment' ? '댓글에서 회원님을 언급했어요' : n.is_reply ? '회원님에게 답글을 남겼습니다' : '회원님의 글에 댓글을 남겼습니다'}</>}
                    </p>
                    <p className="text-xs text-stone-600 line-clamp-2">&ldquo;{postPlainText(n.content)}&rdquo;</p>
                    <p className="text-[0.8125rem] text-stone-400 truncate">
                      {new Date(n.created_at).toLocaleString('ko-KR')} · {n.post_content || '사진 게시물'}
                    </p>
                    </span>
                    {/* 그 글의 사진 (무슨 사진에 단 댓글인지) */}
                    {n.post_image && <img loading="lazy" src={n.post_image} alt="" className="w-12 h-12 shrink-0 rounded-lg object-cover bg-stone-100" />}
                  </button>
                  </div>
                ))
              )}
              {/* 문제 찾기용 (관리자만): 알림을 눌렀을 때 어떤 길로 열렸는지 */}
              {isAdmin && <div className="p-4">
                <button onClick={async () => {
                  if (linkLogText !== null) { setLinkLogText(null); return; }
                  const t = (ms: number) => new Date(ms).toLocaleTimeString('en-GB');
                  let sw: { at: number; [k: string]: unknown }[] = [];
                  try { const r = await (await caches.open('catholicgram-sw-meta')).match('/__clicklog'); if (r) sw = await r.json(); } catch { /* 무시 */ }
                  let app: { at: number; kind: string; detail: string }[] = [];
                  try { app = JSON.parse(storageGet('linkLog') || '[]'); } catch { /* 무시 */ }
                  const lines = [
                    ...sw.map(e => ({ at: e.at, text: `[알림누름] ${Object.entries(e).filter(([k]) => k !== 'at').map(([k, v]) => `${k}=${v}`).join(' ')}` })),
                    ...app.map(e => ({ at: e.at, text: `[앱] ${e.kind} ${e.detail}` })),
                  ].sort((a, b) => a.at - b.at).slice(-30).map(l => `${t(l.at)} ${l.text}`);
                  setLinkLogText(lines.join('\n') || '기록이 없어요');
                }} className="text-[0.75rem] text-stone-400 underline">알림 이동 기록 {linkLogText !== null ? '닫기' : '보기'} (문제 확인용)</button>
                <button onClick={async () => {
                  const target = posts.find(p => !blockedIds.has(p.user_id));
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!target || !session) return;
                  fetch('/api/push/notify', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ type: 'test', id: target.id }) }).catch(() => {});
                  linkLog('test', `글 ${target.id.slice(0, 8)} (${target.author_name})`);
                  alert('10초 뒤에 알림이 와요.\n\n· 휴대폰: 홈 버튼을 눌러 앱을 잠깐 내려 두세요. (앱을 끄지는 마세요)\n· 컴퓨터: 이 창을 그대로 두면 화면 위에 알림 배너가 떠요.\n\n알림(배너)을 누르면 최근 댓글이 달린 글이 열리고, 그 댓글로 화면이 바로 가는지 봐 주세요.');
                }} className="ml-3 text-[0.75rem] text-blue-600 underline">테스트 알림 보내기</button>
                {linkLogText !== null && <pre className="mt-2 p-2 bg-stone-50 border border-stone-200 rounded-lg text-[0.6875rem] leading-snug text-stone-700 whitespace-pre-wrap break-all">{linkLogText}</pre>}
              </div>}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* 로그인 모달 */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => { setShowAuthModal(false); setSwitchingAccount(false); }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-5 border border-stone-200" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <img loading="lazy" src="/icon-v2-192.png" alt="" className="w-14 h-14 rounded-2xl shadow-md mx-auto" />
              <h2 className="font-serif font-bold text-xl text-stone-900 mt-2">가톨릭그램</h2>
              <p className="text-xs text-stone-500 mt-1.5">{switchingAccount ? '로그인할 다른 계정을 골라 주세요' : '카카오·구글·네이버 계정으로 간편하게 시작하세요'}</p>
            </div>

            {canOpenOutside ? (
              // 공유받은 글을 카카오톡 안에서 보다가 댓글을 달려고 하면 여기로 온다: 로그인해 둔 앱·브라우저로 이 화면을 연다
              <div className="text-[0.8125rem] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed text-center">
                <p>지금은 다른 앱 안의 창이라 로그인이 안 되어 있어요.<br />가톨릭그램을 쓰고 계시면 아래 단추로 여세요.</p>
                <button type="button" onClick={() => { const href = outsideHref(selectedPostDetail ? `/?view=${encodeURIComponent(selectedPostDetail.id)}` : window.location.href); if (href) window.location.href = href; }}
                  className="mt-2 w-full py-3 rounded-xl bg-stone-900 text-white font-bold text-[0.9375rem]">로그인해 둔 가톨릭그램으로 열기</button>
              </div>
            ) : isKakaoInApp && (
              <p className="text-[0.8125rem] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed text-center">
                카카오톡 안에서는 로그인이 안 될 수 있어요.<br />
                오른쪽 아래 <b>⋯</b> 버튼 → <b>다른 브라우저로 열기</b>를 눌러주세요.
              </p>
            )}

            {storageBlocked && (
              <p className="text-[0.8125rem] text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 leading-relaxed text-center">
                브라우저 설정 때문에 로그인 정보를 저장할 수 없어요.<br />
                아이폰 <b>설정 → Safari → 모든 쿠키 차단</b>을 끄거나, 개인정보 보호 브라우징을 끄고 다시 시도해주세요.<br />
                (또는 Chrome에서 열어주세요)
              </p>
            )}
            
            <div className="flex flex-col gap-3 mt-2">
              <button 
                onClick={handleKakaoLogin} 
                className="w-full flex items-center justify-center gap-3 bg-[#FEE500] text-black/85 py-3 rounded-xl text-sm font-semibold hover:bg-[#FDD800] transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 3C6.477 3 2 6.452 2 10.71c0 2.72 1.764 5.114 4.417 6.386l-1.127 4.144c-.066.24.237.424.444.258l4.8-3.328c.47.054.957.082 1.466.082 5.523 0 10-3.452 10-7.71C22 6.452 17.523 3 12 3z"/></svg>
                카카오로 시작하기
              </button>
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white text-stone-800 py-3 rounded-xl text-sm font-semibold border border-stone-300 hover:bg-stone-50 transition-colors"
              >
                <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                Google로 시작하기
              </button>
              <a
                href={switchingAccount ? '/api/auth/naver/start?switch=1' : '/api/auth/naver/start'}
                className="w-full flex items-center justify-center gap-3 bg-[#03C75A] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#02b350] transition-colors"
              >
                <span className="w-5 h-5 flex items-center justify-center font-black text-base leading-none">N</span>
                네이버로 시작하기
              </a>
            </div>

            <div className="flex justify-center pt-2">
              <button onClick={() => setShowAuthModal(false)} className="text-xs text-stone-400 hover:text-stone-600">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 사진 자르기 모달 */}
      {avatarFile && (
        <div data-no-pinch className="fixed inset-0 z-[80] bg-black flex flex-col animate-fade-in">
          <div className="relative flex-1">
            <Cropper
              image={avatarFile}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="p-5 bg-white flex justify-between items-center pb-safe">
            <button onClick={() => setAvatarFile(null)} className="text-stone-500 font-medium text-sm">취소</button><p className="text-xs text-stone-400">손가락으로 확대/이동</p><button onClick={handleCropSave} disabled={loading} className="text-blue-500 font-bold text-sm">{loading ? '적용중...' : '확인'}</button>
          </div>
        </div>
      )}

      {/* 프로필 게시물 상세 보기 팝업 (사진 + 캡션) */}
      {selectedPostDetail && (
        // 아이패드(tablet)는 가운데 작은 카드 대신 화면 가득, 가로로 들면 사진 왼쪽 · 글 오른쪽 (tablet-land)
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-2 sm:p-4 tablet:p-0 animate-fade-in" onClick={() => setSelectedPostDetail(null)}>
          {/* 다음(이전) 추천 글 미리보기: 밀면 아래(위)에서 따라 올라옴 */}
          {viewerDrag !== 0 && (() => {
            const peek = viewerNeighbor(viewerDrag < 0 ? 1 : -1);
            if (!peek) return null;
            const thumb = peek.video_poster || peek.images?.[0];
            const { top, bottom } = viewerCardRect.current;
            const H = typeof window !== 'undefined' ? window.innerHeight : 800;
            const pos = viewerDrag < 0 ? { top: bottom + 16 + viewerDrag } : { bottom: H - (top - 16 + viewerDrag) };
            return (
              <div
                className="pointer-events-none absolute left-2 right-2 sm:left-4 sm:right-4 tablet:left-0 tablet:right-0 mx-auto max-w-xl tablet:max-w-none bg-white rounded-3xl tablet:rounded-none overflow-hidden shadow-2xl"
                style={{ ...pos, transition: viewerAnimating ? 'top 0.26s ease-out, bottom 0.26s ease-out' : 'none' }}
              >
                <div className="p-4 flex items-center gap-2.5 border-b border-stone-100">
                  {peek.avatar_url ? <img loading="lazy" src={peek.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold">{initial(peek.author_name)}</span>}
                  <span className="text-xs font-bold text-stone-800">{peek.author_name}</span>
                </div>
                {thumb ? <div className="bg-black flex justify-center"><img loading="lazy" src={thumb} alt="" className="max-w-full max-h-[60dvh] object-contain" /></div> : <p className="p-5 text-sm text-stone-700 line-clamp-4">{postPlainText(peek.content)}</p>}
              </div>
            );
          })()}
          <div
            ref={viewerCardRef}
            className="bg-white w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92dvh] tablet:max-w-none tablet:h-[100dvh] tablet:max-h-none tablet:rounded-none tablet:shadow-none"
            style={{ transform: `translateY(${viewerDrag}px)`, transition: viewerAnimating ? 'transform 0.26s ease-out' : 'none' }}
            onClick={e => e.stopPropagation()}
            onTouchStart={onViewerTouchStart}
            onTouchMove={onViewerTouchMove}
            onTouchEnd={onViewerTouchEnd}
          >
            <div className="p-4 tablet:pt-[calc(0.75rem+env(safe-area-inset-top))] tablet:pb-3 border-b border-stone-100 flex items-center justify-between shrink-0">
              <button onClick={() => { const d = selectedPostDetail; openProfileCard({ id: d.user_id, name: d.author_name, avatar_url: d.avatar_url, handle: d.handle, badge_type: d.badge_type }); }} className="flex items-center gap-2.5 text-left">
                {selectedPostDetail.avatar_url ? (
                  <img loading="lazy" src={selectedPostDetail.avatar_url} alt="프로필" className="w-8 h-8 rounded-full object-cover border border-stone-200" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">{initial(selectedPostDetail.author_name, '교')}</div>
                )}
                <div>
                  <span className="text-xs font-bold text-stone-800 inline-flex items-center gap-1">{selectedPostDetail.author_name}<RoleBadge type={selectedPostDetail.badge_type} size="xs" /></span>
                  <span className="text-[0.75rem] text-stone-400 block">@{selectedPostDetail.handle || 'user'}</span>
                </div>
              </button>
              <button onClick={() => setSelectedPostDetail(null)} className="text-stone-400 hover:text-stone-700 p-1 tablet:w-11 tablet:h-11 tablet:text-3xl tablet:leading-none font-bold text-lg" aria-label="닫기">×</button>
            </div>
            
            {(() => { const side = !!(selectedPostDetail.video_url || selectedPostDetail.images?.length); return (
            <div ref={viewerScrollRef} className={`overflow-y-auto overscroll-contain flex-1 min-h-0 flex flex-col ${side ? 'tablet-land:flex-row tablet-land:overflow-hidden' : ''}`}>
              {selectedPostDetail.video_url && (
                <div className="bg-black tablet-land:flex-1 tablet-land:min-w-0 tablet-land:flex tablet-land:items-center tablet-land:justify-center" data-viewer-media><VideoViewer src={selectedPostDetail.video_url} poster={selectedPostDetail.video_poster} overlays={selectedPostDetail.video_overlays} onDoubleTap={() => likeByDoubleTap(selectedPostDetail.id)} /></div>
              )}
              {!selectedPostDetail.video_url && selectedPostDetail.images && selectedPostDetail.images.length > 0 && (
                <div className="w-full bg-black flex items-center justify-center relative select-none tablet-land:w-auto tablet-land:flex-1 tablet-land:min-w-0" data-viewer-media>
                  {(() => {
                    const src = selectedPostDetail.images[Math.min(detailImageIndex, selectedPostDetail.images.length - 1)];
                    const r = viewerRatios[src];
                    const frame = frameRatio(r);
                    return (
                      <img loading="lazy"
                        src={src}
                        alt="게시물 사진"
                        onClick={viewerImageTap}
                        onLoad={e => { const nr = naturalRatio(e.currentTarget); if (nr) setViewerRatios(prev => (prev[src] === nr ? prev : { ...prev, [src]: nr })); }}
                        // 글이 있으면 사진을 조금 낮춰 글이 한 화면에 함께 보이게 (아이패드 전체 화면은 더 크게, 가로로 들면 화면 높이에 맞춤)
                        style={{ aspectRatio: String(frame), objectFit: photoFit(r, frame), ['--frame' as string]: frame }}
                        className={(selectedPostDetail.content || '').trim()
                          ? 'w-[min(100%,calc(52dvh*var(--frame)))] tablet:w-[min(100%,calc(64dvh*var(--frame)))] tablet-land:w-[min(100%,calc((100dvh_-_5rem)*var(--frame)))]'
                          : 'w-[min(100%,calc(70dvh*var(--frame)))] tablet:w-[min(100%,calc(76dvh*var(--frame)))] tablet-land:w-[min(100%,calc((100dvh_-_5rem)*var(--frame)))]'}
                      />
                    );
                  })()}
                  <HeartBurst show={viewerBurst} />
                  {selectedPostDetail.images.length > 1 && (
                    <>
                      {detailImageIndex > 0 && <button onClick={() => setDetailImageIndex(i => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/45 text-white text-2xl leading-none flex items-center justify-center" aria-label="이전 사진">‹</button>}
                      {detailImageIndex < selectedPostDetail.images.length - 1 && <button onClick={() => setDetailImageIndex(i => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/45 text-white text-2xl leading-none flex items-center justify-center" aria-label="다음 사진">›</button>}
                    </>
                  )}
                  {selectedPostDetail.images.length > 1 && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                      {selectedPostDetail.images.map((_, i) => (
                        <button key={i} onClick={() => setDetailImageIndex(i)} className={`w-2.5 h-2.5 rounded-full ${i === detailImageIndex ? 'bg-white' : 'bg-white/40'}`} aria-label={`${i + 1}번째 사진`} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div ref={viewerSideRef} className={`flex flex-col ${side ? 'tablet-land:w-[26rem] tablet-land:shrink-0 tablet-land:overflow-y-auto tablet-land:overscroll-contain tablet-land:border-l tablet-land:border-stone-100' : ''}`}>
              {(() => {
                const music = parsePostMusic(selectedPostDetail.music);
                if (!music) return null;
                if (music.kind === 'youtube') {
                  return <YouTubePlayer key={selectedPostDetail.id} videoId={music.videoId} start={music.start} clip={music.clip} title={selectedPostDetail.music_title} />;
                }
                const track = bgmTracks.find(t => t.id === music.trackId);
                if (!track) return <p className="px-4 py-2.5 text-xs text-stone-400 bg-stone-50"><Icon name="music" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />이 음악은 더 이상 제공되지 않아요</p>;
                return (
                  <button onClick={toggleBgm} className="flex items-center gap-3 px-4 py-2.5 bg-violet-50 border-b border-violet-100 text-left">
                    <span className="w-9 h-9 rounded-full bg-violet-700 text-white flex items-center justify-center shrink-0"><Icon name={bgmPlaying ? 'pause' : 'play'} fill className="w-4 h-4" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-stone-800 truncate">{selectedPostDetail.music_title || track.title}</span>
                      <span className="block text-xs text-stone-500">{bgmPlaying ? '재생 중' : '눌러서 듣기'}{music.clip ? ` · ${Math.floor(music.start / 60)}:${String(music.start % 60).padStart(2, '0')}부터 ${music.clip}초` : ''}</span>
                    </span>
                  </button>
                );
              })()}
              {/* 크게 보기에서도 바로 기도·공감·댓글·메시지 */}
              {(() => {
                const live = posts.find(p => p.id === selectedPostDetail.id) || selectedPostDetail;
                return (
                  <div className="px-4 pt-3 flex items-center gap-x-3 gap-y-2 flex-wrap text-[0.875rem] font-medium">
                    {reactionButtons(live, () => { setSelectedPostDetail(null); openPostComments(live.id); })}
                  </div>
                );
              })()}
              <div id="viewer-post-text" className="px-5 pb-5 tablet:pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 flex flex-col gap-2">
                {/* 글은 처음엔 여섯 줄까지, 더 길면 '더 보기' */}
                <PostStickers stickers={splitPostStickers(selectedPostDetail.content).stickers} size="w-32 h-32" />
                <ClampText
                  key={selectedPostDetail.id}
                  lines={6}
                  expanded={viewerTextOpen}
                  onExpand={() => setViewerTextOpen(true)}
                  onCollapse={() => setViewerTextOpen(false)}
                  className="text-stone-900 text-[1rem] whitespace-pre-wrap leading-relaxed"
                  text={splitPostStickers(selectedPostDetail.content).text}
                  renderText={t => <HashtagText text={t} onTag={openHashtag} onMention={h => { setSelectedPostDetail(null); goToHandle(h); }} />}
                />
                <span className="text-[0.8125rem] text-stone-400 mt-1">{new Date(selectedPostDetail.created_at).toLocaleString('ko-KR')}</span>
                {/* 내 글이면 여기서 공개 범위를 바로 바꿀 수 있음 */}
                {user?.id === selectedPostDetail.user_id && (
                  <div className="mt-3 pt-3 border-t border-stone-100 flex flex-col gap-2">
                    <VisibilityPicker value={selectedPostDetail.visibility || 'public'} onChange={v => changePostVisibility(selectedPostDetail.id, v)} />
                    <div className="flex gap-1.5">
                      <button onClick={() => { const p = posts.find(x => x.id === selectedPostDetail.id) || selectedPostDetail; setSelectedPostDetail(null); startEditPost(p); }} className="flex-1 py-2 rounded-xl border border-stone-300 text-[0.8125rem] font-bold text-stone-700 inline-flex items-center justify-center"><Icon name="pencil" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />글 고치기</button>
                      <button onClick={() => handleDeletePost(selectedPostDetail.id)} className="flex-1 py-2 rounded-xl border border-red-200 text-[0.8125rem] font-bold text-red-600 inline-flex items-center justify-center"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />지우기</button>
                    </div>
                  </div>
                )}

              </div>
              </div>
            </div>
            ); })()}
          </div>
          {/* 반투명 안내: 위로 밀면 다음 추천 */}
          {viewerQueue && viewerDrag === 0 && viewerNeighbor(1) && (
            <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col items-center gap-0.5 px-4 py-2 rounded-full bg-white/20 border border-white/30 backdrop-blur-md text-white text-[0.8125rem] font-semibold shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 animate-bounce"><path d="M6 15l6-6 6 6" /></svg>
              위로 밀면 다음 추천
            </div>
          )}
        </div>
      )}

      {/* 프로필 사진 크게 보기 (인스타그램처럼 동그랗게 크게) */}
      {avatarPreview && (
        <div className="fixed inset-0 z-[95] bg-black/85 flex flex-col items-center justify-center gap-5 p-6 animate-fade-in" onClick={() => setAvatarPreview(null)} role="dialog" aria-label="프로필 사진">
          <img loading="lazy" src={avatarPreview.url} alt={`${avatarPreview.name}님 프로필 사진`} className="w-[min(80vw,22rem)] aspect-square rounded-full object-cover shadow-2xl border-4 border-white/20" />
          <p className="text-white text-xl font-bold">{avatarPreview.name}</p>
          <button onClick={() => setAvatarPreview(null)} className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 w-11 h-11 flex items-center justify-center text-white text-3xl leading-none" aria-label="닫기">×</button>
        </div>
      )}

      {selectedImage && <PhotoZoom images={selectedImage.images} start={selectedImage.index} onClose={() => setSelectedImage(null)} />}

      {/* 최초 로그인 시 이름(세례명) + 고유 핸들 강제 입력 모달 */}
      {user && ((needsProfileSetup && !setupDismissed) || profileEditMode) && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[90]">
          <div className="relative bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl flex flex-col gap-4 border border-stone-200 max-h-[92dvh] overflow-y-auto">
            {needsProfileSetup && !profileEditMode && (
              <button type="button" onClick={() => setSetupDismissed(true)} className="absolute top-3 right-4 text-stone-400 hover:text-stone-700 text-2xl leading-none" aria-label="닫고 둘러보기">×</button>
            )}
            <div className="text-center">
              <IconBadge name="dove" tone="violet" size="lg" />
              <h2 className="font-serif font-bold text-lg text-stone-900 mt-2">{profileEditMode ? '프로필 정보 수정' : profile?.handle ? '닉네임을 정해주세요' : '환영합니다!'}</h2>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                다른 교우에게는 <b>닉네임</b>과 <b>@핸들</b>만 보여요.<br />이름과 세례명은 <b>관리자만</b> 볼 수 있어요.
              </p>
            </div>
            <form onSubmit={handleProfileSetup} className="flex flex-col gap-3 mt-2">
              <div>
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left">닉네임 <span className="font-normal text-stone-400">(모두에게 보여요)</span></label>
                <input
                  type="text"
                  placeholder="예: 기쁨의미카엘"
                  value={nicknameInput}
                  // 20글자까지: 꾸민 글자·이모지는 두 칸짜리라 maxLength 대신 글자 수로 자른다
                  onChange={(e) => setNicknameInput(Array.from(e.target.value).slice(0, 20).join(''))}
                  required
                  className="w-full p-3 text-sm font-medium border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50"
                />
                <button type="button" onClick={() => setShowFancyName(v => !v)} className="mt-2 text-[0.8125rem] font-bold text-violet-700 flex items-center gap-1">
                  ✍️ 영어 이름 필기체로 꾸미기 <span className="text-stone-400 font-normal">{showFancyName ? '▲' : '▼'}</span>
                </button>
                {showFancyName && (
                  <div className="mt-2 p-3 rounded-xl bg-violet-50 border border-violet-100">
                    {hasLatin(nicknameInput) ? (
                      <>
                        <p className="text-xs text-stone-500 mb-2">마음에 드는 모양을 누르세요</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[...FANCY_STYLES.map(f => ({ label: f.label, text: toFancy(nicknameInput, f.id) })), { label: '원래대로', text: toPlain(nicknameInput) }].map(o => (
                            <button key={o.label} type="button" onClick={() => setNicknameInput(o.text)} aria-label={o.label}
                              className={`p-2 rounded-lg border bg-white text-left ${nicknameInput === o.text ? 'border-violet-500 ring-2 ring-violet-200' : 'border-stone-200'}`}>
                              <span className="block text-lg text-stone-900 truncate">{o.text}</span>
                              <span className="block text-[0.75rem] text-stone-500">{o.label}{nicknameInput === o.text ? ' ✓' : ''}</span>
                            </button>
                          ))}
                        </div>
                        <p className="text-[0.75rem] text-stone-400 mt-2 leading-snug">영어 글자만 바뀌고 한글은 그대로예요. 오래된 휴대폰에서는 네모(□)로 보일 수 있어요.</p>
                      </>
                    ) : (
                      <p className="text-xs text-stone-600 leading-relaxed">닉네임 칸에 영어로 이름을 쓰면 여기서 필기체로 바꿀 수 있어요.<br />예: <b>Maria</b> → 𝓜𝓪𝓻𝓲𝓪</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left">나만의 고유 핸들 (@아이디)</label>
                <div className="flex items-center bg-stone-50 border border-stone-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-stone-400">
                  <span className="pl-3.5 text-stone-400 text-sm font-medium">@</span>
                  <input
                    type="text"
                    placeholder="예: michael_hong"
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    required
                    className="w-full p-3 pl-1 text-sm font-medium bg-transparent border-none focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left">이름 + 세례명 <span className="font-normal text-stone-400">(<Icon name="lock" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 mr-0.5" />관리자만 봐요)</span></label>
                <input
                  type="text"
                  placeholder="예: 홍길동 미카엘"
                  value={baptismalName}
                  onChange={(e) => setBaptismalName(e.target.value)}
                  required
                  className="w-full p-3 text-sm font-medium border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50"
                />
              </div>

              <div>
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left">🎂 나의 생일 <span className="font-normal text-stone-400">(월·일, 선택)</span></label>
                <FeastDayPicker value={birthdayInput} onChange={setBirthdayInput} what="생일" />
                <p className="text-[0.75rem] text-stone-400 mt-1.5 leading-snug">생일 날 프로필 사진 위에 &lsquo;오늘 생일이에요&rsquo; 리본이 달리고, 나를 팔로우하는 교우에게 축하해 달라는 알림이 가요. 태어난 해는 받지 않아요.</p>
              </div>

              <div>
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left"><Icon name="candle" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />나의 축일 <span className="font-normal text-stone-400">(선택)</span></label>
                <FeastDayPicker value={feastDayInput} onChange={setFeastDayInput} name={baptismalName} />
                <p className="text-[0.75rem] text-stone-400 mt-1.5 leading-snug">축일에 축하 인사를 받고, 프로필 사진 아래에 &lsquo;오늘 축일이에요&rsquo; 비둘기가 날아와요. 잘 모르시면 비워두고 나중에 ⚙️ 설정에서 입력할 수 있어요.</p>
              </div>

              {setupError && <p className="text-red-500 text-xs text-center">{setupError}</p>}
              
              <button 
                type="submit" 
                disabled={loading || !nicknameInput.trim() || !baptismalName.trim() || !handleInput.trim()}
                className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors mt-2"
              >
                {loading ? '저장 중...' : profileEditMode ? '저장' : '가톨릭그램 시작하기'}
              </button>
              {profileEditMode && !needsProfileSetup && (
                <button type="button" onClick={() => setProfileEditMode(false)} className="text-sm text-stone-400 self-center">취소</button>
              )}
              {needsProfileSetup && !profileEditMode && (
                <button type="button" onClick={() => setSetupDismissed(true)} className="text-sm text-stone-500 underline self-center py-1">나중에 하고 먼저 둘러볼게요</button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* 게시글 ⋯ 메뉴 (인스타그램처럼): 위에 네모 단추 셋, 아래에 그림+글 줄. 아래로 끌거나 바깥을 누르면 닫힘 */}
      {postMenuId && (() => {
        const post = posts.find(p => p.id === postMenuId);
        if (!post) return null;
        const mine = user?.id === post.user_id;
        const canDelete = mine || isAdmin;
        const close = () => setPostMenuId(null);
        const tile = 'flex flex-col items-center gap-1.5 text-[0.875rem] text-stone-800';
        const tileBox = 'w-full h-[4.25rem] rounded-2xl bg-stone-100 flex items-center justify-center active:bg-stone-200';
        const row = 'w-full px-6 py-3.5 flex items-center gap-4 text-left text-[1.0625rem] active:bg-stone-50';
        return (
          <div className="fixed inset-0 bg-black/45 z-[75] flex items-end sm:items-center justify-center animate-fade-in" onClick={close}>
            <div ref={postMenuSheet.sheetRef} role="dialog" aria-label={`${post.author_name}님의 글 메뉴`} className="bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl overflow-hidden pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pt-5" onClick={e => e.stopPropagation()}>
              <div {...postMenuSheet.handleProps} className="sm:hidden pt-2.5 pb-4 flex justify-center touch-none cursor-grab" aria-hidden="true"><span className="w-10 h-1.5 rounded-full bg-stone-300" /></div>
              <div className="grid grid-cols-3 gap-3 px-5">
                <button onClick={() => { close(); openPostViewer(post); }} className={tile}><span className={tileBox}><Icon name="expand" className="w-7 h-7" /></span>크게 보기</button>
                <button onClick={() => { close(); sharePost(post); }} className={tile}><span className={tileBox}><Icon name="share" className="w-7 h-7" /></span>공유하기</button>
                <button onClick={async () => { close(); if (await copyText(postLink(post))) showToast('링크를 복사했어요'); else window.prompt('이 주소를 복사하세요', postLink(post)); }} className={tile}><span className={tileBox}><Icon name="link" className="w-7 h-7" /></span>링크 복사</button>
              </div>
              <div className="mt-4 pt-1 border-t border-stone-100">
                {mine && <button onClick={() => { close(); startEditPost(post); }} className={`${row} text-stone-900`}><Icon name="pencil" className="w-6 h-6 shrink-0" />수정</button>}
                {!mine && <button onClick={() => { close(); goToProfile(post.user_id); }} className={`${row} text-stone-900`}><Icon name="user" className="w-6 h-6 shrink-0" />{post.author_name}님 공간 가기</button>}
                {user && !mine && <button onClick={() => { close(); setReportTarget({ type: 'post', id: post.id, userId: post.user_id, userName: post.author_name, preview: postPlainText(post.content) }); }} className={`${row} text-red-600`}><Icon name="siren" className="w-6 h-6 shrink-0" />신고하기</button>}
                {canDelete && <button onClick={() => { close(); handleDeletePost(post.id); }} className={`${row} text-red-600`}><Icon name="trash" className="w-6 h-6 shrink-0" />삭제</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 맨 위로: 하단 가운데 + 버튼 바로 위 */}
      {showToTop && !typingField && !fabOpen && activeTab !== 'chat' && activeTab !== 'reels' && (
        <button
          onClick={() => scrollToTop()}
          className="fixed z-[38] left-1/2 -translate-x-1/2 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] flex items-center gap-1 pl-3 pr-4 py-2 rounded-full bg-white/95 backdrop-blur border border-stone-200 shadow-lg text-sm font-bold text-stone-700 animate-fade-in"
          aria-label="맨 위로"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          맨 위로
        </button>
      )}

      {/* 새로 고침 표시 */}
      {/* 당겨서 새로고침 표시 */}
      {pull > 0 && (
        <div className="fixed left-1/2 z-50 pointer-events-none flex flex-col items-center gap-1" style={{ top: 'calc(3.5rem + env(safe-area-inset-top))', transform: `translate(-50%, ${pull - 20}px)` }}>
          <span className={`w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-colors ${pull >= PULL_TRIGGER ? 'bg-stone-900 text-white' : 'bg-white text-stone-600'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{ transform: `rotate(${Math.min(1, pull / PULL_TRIGGER) * 180}deg)` }}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
          </span>
          <span className="text-[0.75rem] font-bold text-stone-600 bg-white/90 rounded-full px-2 py-0.5 shadow">{pull >= PULL_TRIGGER ? '놓으면 새로고침' : '당겨서 새로고침'}</span>
        </div>
      )}
      {refreshState && (
        <div className="fixed left-1/2 -translate-x-1/2 top-[calc(4rem+env(safe-area-inset-top))] z-50 px-4 py-2 rounded-full bg-stone-900/85 text-white text-sm font-semibold shadow-lg flex items-center gap-2 pointer-events-none">
          {refreshState === 'loading'
            ? <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />새로 고치는 중...</>
            : <>✓ 새로 고쳤어요</>}
        </div>
      )}

      {/* 하단 네비게이션 */}
      {activeTab !== 'chat' && (
        <nav className={`fixed bottom-0 left-0 right-0 max-w-xl tablet:max-w-none mx-auto border-t flex items-center justify-around z-40 pb-safe ${activeTab === 'reels' ? 'bg-black border-white/10' : 'bg-white border-stone-200'}`}>
          {(() => {
            // 인스타그램처럼: 홈 · 영상 · 메시지 · 탐색 · 내 공간 (새 글은 왼쪽 위 +)
            const dark = activeTab === 'reels';
            const tone = (on: boolean) => on ? (dark ? 'text-white' : 'text-blue-600') : (dark ? 'text-white/55' : 'text-stone-400'); // 지금 화면은 화면 색의 주요 색
            const cls = 'flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors';
            const meOn = activeTab === 'profile' && viewingUserId === user?.id;
            const msgOn = activeTab === 'messages';
            return (
              <>
                <button onClick={() => tapTab('home', goToHome)} className={`${cls} ${tone(activeTab === 'home')}`}>
                  <Icon name="house" fill={activeTab === 'home'} className="w-7 h-7" />
                  <span className="text-[0.75rem] font-medium">홈</span>
                </button>
                <button onClick={() => goToTab('reels')} className={`${cls} ${tone(activeTab === 'reels')}`}>
                  <Icon name="video" fill={activeTab === 'reels'} className="w-7 h-7" />
                  <span className="text-[0.75rem] font-medium">영상</span>
                </button>
                <button onClick={() => { if (!user) { setShowAuthModal(true); return; } tapTabRefresh(msgOn, () => goToTab('messages')); }} className={`${cls} ${tone(msgOn)}`} aria-label={messageBadgeCount > 0 ? `메시지 (안 읽은 ${messageBadgeCount}개)` : '메시지'}>
                  <span className="relative">
                    <Icon name="message" fill={msgOn} className="w-7 h-7" />
                    {messageBadgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center border-2 border-white">{messageBadgeCount > 9 ? '9+' : messageBadgeCount}</span>
                    )}
                  </span>
                  <span className="text-[0.75rem] font-medium">메시지</span>
                </button>
                <button onClick={() => tapTab('explore', () => { setExploreQuery(''); goToTab('explore'); })} className={`${cls} ${tone(activeTab === 'explore')}`}>
                  <Icon name="search" fill={activeTab === 'explore'} className="w-7 h-7" />
                  <span className="text-[0.75rem] font-medium">탐색</span>
                </button>
                <button onClick={() => { if (!user) setShowAuthModal(true); else tapTabRefresh(meOn, () => goToProfile(user.id)); }} className={`${cls} ${tone(meOn)}`}>
                  {profile?.avatar_url
                    ? <img loading="lazy" src={profile.avatar_url} alt="" className={`w-7 h-7 rounded-full object-cover ${meOn ? (dark ? 'ring-2 ring-white' : 'ring-2 ring-stone-900') : ''}`} />
                    : <Icon name="user" fill={meOn} className="w-7 h-7" />}
                  <span className="text-[0.75rem] font-medium">내 공간</span>
                </button>
              </>
            );
          })()}
        </nav>
      )}
    </main>
  );
}