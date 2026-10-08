'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import imageCompression from 'browser-image-compression';
import { User } from '@supabase/supabase-js';
import Cropper from 'react-easy-crop';
import AnonBoard from '@/components/AnonBoard';
import RoleBadge, { BADGES } from '@/components/RoleBadge';
import ExploreTab from '@/components/ExploreTab';
import HashtagText from '@/components/HashtagText';
import MentionSuggest from '@/components/MentionSuggest';
import NoticeBoard, { type Notice } from '@/components/NoticeBoard';
import { extractMentions, mentionsHandle } from '@/lib/mentions';
import { popularHashtags } from '@/lib/hashtags';
import { recordInterest } from '@/lib/interests';
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from '@/lib/push';
import { playAlertSound, unlockAlertSound } from '@/lib/alert-sound';
import { ADMIN_EMAILS } from '@/lib/admin';
import FeedbackModal from '@/components/FeedbackModal';
import ReportDialog, { ReportTarget } from '@/components/ReportDialog';
import SettingsModal from '@/components/SettingsModal';
import AdminMembers from '@/components/AdminMembers';
import MusicPicker, { type SelectedMusic, type MusicSegmentTarget } from '@/components/MusicPicker';
import BgmAdmin from '@/components/BgmAdmin';
import PostPhotos from '@/components/PostPhotos';
import YouTubePlayer from '@/components/YouTubePlayer';
import PostVideo, { VideoViewer } from '@/components/PostVideo';
import ReelVideo from '@/components/ReelVideo';
import Stories from '@/components/Stories';
import HeartBurst from '@/components/HeartBurst';
import { useDoubleTap } from '@/lib/double-tap';
import VideoEditor, { OverlayLayer, hasOverlays, type VideoOverlays } from '@/components/VideoOverlays';
import { MAX_VIDEO_MB, MAX_VIDEO_SECONDS, getVideoInfo, makeVideoPoster, shrinkVideo } from '@/lib/video';
import { type BgmTrack, BUILTIN_BGM, parsePostMusic } from '@/lib/music';
import SponsorBanner from '@/components/SponsorBanner';
import SponsorAdmin from '@/components/SponsorAdmin';
import { FEED_BANNER_EVERY, type SponsorBannerData } from '@/lib/sponsor';
import FeastDayPicker from '@/components/FeastDayPicker';
import Icon, { IconBadge, type IconName } from '@/components/Icon';
import ClampText from '@/components/ClampText';
import AdminStats from '@/components/AdminStats';
import { startVisitTracking } from '@/lib/visit';
import { formatFeastDay, isValidFeastDay, todayFeastKeys, todayKst } from '@/lib/feast';

// Safari에서 '모든 쿠키 차단'이나 일부 개인정보 보호 설정이 켜져 있으면
// localStorage 접근 자체가 오류를 내서 화면 전체가 멈출 수 있으므로 안전하게 감싼다.
// 알림 주소(?post=…, ?chat=…, ?alerts=1, ?feedback=1)에서 열어야 할 화면
const deepLinkFromSearch = (search: string) => {
  const params = new URLSearchParams(search);
  const post = params.get('post') || undefined;
  const chat = params.get('chat') || undefined;
  const alerts = params.get('alerts') === '1';
  const feedback = params.get('feedback') === '1';
  const notice = params.get('notice') || undefined;
  const reports = params.get('reports') === '1';
  const comment = params.get('comment') || undefined; // post 와 함께: 그 댓글로
  const view = params.get('view') || undefined;       // 글 크게 보기 (글에서 언급됐을 때)
  const profile = params.get('profile') || undefined; // 그 교우의 공간 (새 팔로워)
  return post || chat || alerts || feedback || notice || reports || view || profile ? { post, chat, alerts, feedback, notice, reports, comment, view, profile } : null;
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
const consumePendingLink = async () => {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(PENDING_CACHE);
    const res = await cache.match('/__pending');
    if (!res) return;
    const pending = await res.json() as { url?: string; at?: number };
    await cache.delete('/__pending');
    if (pending.url && pending.at && Date.now() - pending.at < 2 * 60 * 1000) pendingLinkHandler?.(pending.url);
  } catch { /* 무시 */ }
};

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
interface CommentNotification { id: string; post_id: string; post_content: string; content: string; author_name: string; created_at: string; is_reply?: boolean; mention?: 'post' | 'comment'; }
interface Message { id: string; sender_id: string; receiver_id: string; content: string; created_at: string; read_at?: string | null; }
// baptismal_name: 화면에 보이는 '닉네임' (실명인 이름+세례명은 profile_private.real_name 에 비공개로 보관)
interface UserProfile { id: string; baptismal_name: string; avatar_url?: string; handle?: string; badge_type?: string; feast_day?: string | null; nickname_set?: boolean; }

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
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error('Canvas is empty')); }, 'image/jpeg', 0.9);
  });
}

const MAX_PHOTOS = 5; // 한 글에 올릴 수 있는 사진 수

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
  const [showNotifications, setShowNotifications] = useState(false);
  const [isKakaoInApp, setIsKakaoInApp] = useState(false);
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
  const [deepLink, setDeepLink] = useState<{ post?: string; chat?: string; alerts?: boolean; feedback?: boolean; notice?: string; reports?: boolean; comment?: string; view?: string; profile?: string } | null>(null);
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
  const [nicknameInput, setNicknameInput] = useState('');   // 공개 닉네임 (baptismalName 은 비공개 실명)
  const [profileEditMode, setProfileEditMode] = useState(false); // 설정에서 프로필 정보 수정 중
  const [myRealName, setMyRealName] = useState('');
  const [viewingRealName, setViewingRealName] = useState(''); // 관리자만
  // 댓글 답글 대상 (게시물별)
  // 게시물별 댓글 수, 댓글별 🙏/❤️ (mine: 내가 누른 것)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentReactions, setCommentReactions] = useState<Record<string, { pray: number; like: number; myPray: boolean; myLike: boolean }>>({});
  const [openIntentionId, setOpenIntentionId] = useState<string | null>(null); // 기도지향 목록에서 펼쳐 본 것
  // 오늘의 기도지향 (한국 시간 기준 오늘 것만)
  const [intentions, setIntentions] = useState<{ id: string; user_id: string; author_name: string | null; title?: string | null; content: string; created_at: string }[]>([]);
  const [showIntentions, setShowIntentions] = useState(false);
  const [intentionTitleInput, setIntentionTitleInput] = useState(''); // 기도지향 (30자)
  const [intentionInput, setIntentionInput] = useState('');            // 기도 내용 (100자)
  const [intentionEditing, setIntentionEditing] = useState(false);
  const [intentionSaving, setIntentionSaving] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [replyTargets, setReplyTargets] = useState<Record<string, { userId: string; name: string; commentId?: string } | null>>({});
  // 오늘 축일인 팔로잉 교우들 + 축일 카드 닫음 여부(하루 단위)
  const [feastFriends, setFeastFriends] = useState<UserProfile[]>([]);
  const [feastCardDismissed, setFeastCardDismissed] = useState(true);
  const [feastPromptDismissed, setFeastPromptDismissed] = useState(true);
  const [settingsView, setSettingsView] = useState<'main' | 'feast'>('main');
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
  const [feedFilter] = useState<'all' | 'media' | 'text'>('all');
  const [reelsMuted, setReelsMuted] = useState(true); // 영상 탭: 소리 (모든 영상 공통)
  const [storyViewerOpen, setStoryViewerOpen] = useState(false); // 스토리 화면 가득 보기
  const [avatarPreview, setAvatarPreview] = useState<{ url: string; name: string } | null>(null); // 프로필 사진 크게 보기 // 홈 피드: 인스타그램처럼 전체
  const [showComposer, setShowComposer] = useState(false); // 글쓰기 창 (+ 버튼으로 열기)
  const [fabOpen, setFabOpen] = useState(false); // + 버튼 메뉴 펼침
  const [showAdminStats, setShowAdminStats] = useState(false); // 관리자: 접속 통계
  // 접속 통계 기록 (앱 열기·나가기)
  useEffect(() => startVisitTracking(), []);
  const [myPostReactions, setMyPostReactions] = useState<Set<string>>(new Set()); // 내가 누른 기도·공감 ('글id:pray')
  const [editContent, setEditContent] = useState('');
  const [editOverlays, setEditOverlays] = useState<VideoOverlays | null>(null); // 영상 글 고치기: 글자·이모티콘
  const [showEditVideoEditor, setShowEditVideoEditor] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editVisibility, setEditVisibility] = useState<Visibility>('public');
  const [editMusic, setEditMusic] = useState<{ value: string; title: string } | null>(null); // 글 고치기: 음악
  const [musicSegment, setMusicSegment] = useState<MusicSegmentTarget | null>(null); // 고른 곡의 구간만 다시 고치기
  const [musicPickerFor, setMusicPickerFor] = useState<'composer' | 'edit'>('composer');

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [exploreQuery, setExploreQuery] = useState('');
  const currentScreenRef = useRef<ScreenState>({ screen: true, tab: 'home' });
  const backHandlerRef = useRef<(e: PopStateEvent) => void>(() => {});
  const exitArmedAtRef = useRef(0);
  const historyReadyRef = useRef(false); // 첫 터치 뒤에 뒤로가기용 기록을 깔았는지
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [viewingBio, setViewingBio] = useState(''); // 내 공간 한 줄 소개
  const [bioDraft, setBioDraft] = useState<string | null>(null); // 소개 고치는 중이면 글자
  const [profileTab, setProfileTab] = useState<'posts' | 'videos' | 'tagged'>('posts');
  const [followList, setFollowList] = useState<{ mode: 'followers' | 'following'; items: UserProfile[] | null } | null>(null);
  const [followData, setFollowData] = useState<{ followers: number; following: number; status: FollowStatus }>({ followers: 0, following: 0, status: 'none' });

  const [actionModalUser, setActionModalUser] = useState<UserProfile | null>(null);
  const [actionUserFollowStatus, setActionUserFollowStatus] = useState<FollowStatus>('none');
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<UnreadFrom[]>([]);
  // 앱 사용 중 새 알림을 화면 위에 잠깐 보여주는 배너
  const [toast, setToast] = useState<{ key: string; icon: string; title: string; body: string; action: () => void } | null>(null);
  const [alertSoundOn, setAlertSoundOn] = useState(true);
  const seenAlertKeysRef = useRef<Set<string>>(new Set());
  const sessionStartRef = useRef<number>(0);

  const [chatPartners, setChatPartners] = useState<(UserProfile & { lastMessage?: string; lastAt?: string })[]>([]);
  const [currentChatUser, setCurrentChatUser] = useState<UserProfile | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestViewingUserIdRef = useRef<string | null>(null);

  const [avatarFile, setAvatarFile] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // 🌟 TS7006 타입 에러 방지를 위해 매개변수에 명시적 타입 지정
  const onCropComplete = (croppedArea: any, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels);
  };

  useEffect(() => {
    // 카카오톡 인앱 브라우저(특히 아이폰)에서는 로그인 버튼이 동작하지 않는 경우가 있어
    // 기본 브라우저(Safari/Chrome)로 다시 열도록 한다.
    if (/KAKAOTALK/i.test(navigator.userAgent)) {
      setIsKakaoInApp(true);
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
    }
    if (!isStorageAvailable()) setStorageBlocked(true);

    // 네이버 로그인 실패 안내
    const loginError = new URLSearchParams(window.location.search).get('login_error');
    if (loginError) {
      window.history.replaceState(null, '', window.location.pathname);
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
        if (e.data?.type !== 'open-url') return;
        e.ports?.[0]?.postMessage('ok');
        clearPendingLink();
        const link = deepLinkFromSearch(new URL(e.data.url, window.location.origin).search);
        if (link) setDeepLink(link); else goToHome();
      });
    }

    // 알림음: 설정 불러오기, 첫 터치 때 오디오 활성화
    sessionStartRef.current = Date.now();
    setAlertSoundOn(storageGet('alertSound') !== 'off');
    const unlock = () => unlockAlertSound();
    window.addEventListener('pointerdown', unlock, { once: true });

    pendingLinkHandler = (url: string) => {
      const link = deepLinkFromSearch(new URL(url, window.location.origin).search);
      if (link) setDeepLink(link);
    };
    const initialLink = deepLinkFromSearch(window.location.search);
    if (initialLink) {
      setDeepLink(initialLink);
      window.history.replaceState(null, '', '/');
      clearPendingLink();
    } else consumePendingLink(); // 알림을 눌러 열었는데 주소에 목적지가 없으면(새로고침 등) 적어 둔 곳으로

    const savedTab = storageGet('activeTab') as Tab | null;
    const savedUserId = storageGet('viewingUserId');
    const savedChatUserId = storageGet('chatUserId');

    // 마지막으로 보던 화면으로 시작
    let startScreen: ScreenState = { screen: true, tab: 'home' };
    if (savedTab === 'chat' || savedTab === 'messages') startScreen = { screen: true, tab: 'messages' };
    else if (savedTab === 'profile' && savedUserId) startScreen = { screen: true, tab: 'profile', viewingUserId: savedUserId };
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
          .then(({ data }) => { if (data) navigate({ screen: true, tab: 'chat', chatUser: data }); });
      }
    }, 0);
    if (savedUserId) setViewingUserId(savedUserId);
    const onPopState = (e: PopStateEvent) => backHandlerRef.current(e);
    window.addEventListener('popstate', onPopState);

    checkUser();
    fetchPosts();
    fetchBgmTracks();
    fetchIntentions();
    fetchNotices();
    try { setHiddenNotices(JSON.parse(storageGet('noticeHidden') || '[]')); } catch { /* 무시 */ }
    const savedVisibility = storageGet('postVisibility');
    if (savedVisibility === 'followers' || savedVisibility === 'private') setComposerVisibility(savedVisibility);
    const intentionTimer = setInterval(fetchIntentions, 60 * 1000);

    // 앱을 닫았다가(다른 앱으로 갔다가) 다시 열면: 새 버전이면 새로고침, 아니면 글·기도지향·공지를 새로 불러오기
    let hiddenAt = 0;
    const onAppResume = async () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < 15 * 1000) { setTimeout(consumePendingLink, 400); return; } // 아주 잠깐이면 그대로
      hiddenAt = 0;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await res.json();
        if (version && version !== 'dev' && version !== process.env.NEXT_PUBLIC_APP_VERSION) {
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
    fetchSponsorBanners();
    const bannerTimer = setInterval(fetchSponsorBanners, 10 * 60 * 1000);

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
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
      activationEvents.forEach(ev => window.removeEventListener(ev, setupHistory, { capture: true }));
      clearInterval(intentionTimer);
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
    } else if (activeTab === 'messages') {
      fetchChatPartners();
      if (user) fetchUnreadMessages(user.id);
    }
  }, [activeTab, viewingUserId, user]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTab === 'chat' && currentChatUser && user) {
      fetchChatMessages(currentChatUser.id);
      interval = setInterval(() => fetchChatMessages(currentChatUser.id), 3000);
    }
    return () => clearInterval(interval);
  }, [activeTab, currentChatUser, user]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // --- 화면 이동 + 뒤로가기 ---
  const applyScreen = (st: ScreenState) => {
    currentScreenRef.current = st;
    if (st.tab === 'chat' && !st.chatUser) { setActiveTab('messages'); storageSet('activeTab', 'messages'); return; }
    setActiveTab(st.tab);
    storageSet('activeTab', st.tab);
    if (st.tab === 'profile' && st.viewingUserId) { setViewingUserId(st.viewingUserId); storageSet('viewingUserId', st.viewingUserId); }
    if (st.tab === 'chat' && st.chatUser) { setCurrentChatUser(st.chatUser); storageSet('chatUserId', st.chatUser.id); }
  };

  // 새 화면으로 이동하면서 이동 기록을 남긴다 (같은 화면이면 기록을 늘리지 않음)
  const navigate = (st: ScreenState) => {
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
    const { data } = await supabase.from('profiles').select('id').eq('handle', handle.toLowerCase()).maybeSingle();
    if (data) goToProfile(data.id);
    else alert(`@${handle} 회원을 찾을 수 없어요.`);
  };

  const goToProfile = (targetUserId: string) => {
    navigate({ screen: true, tab: 'profile', viewingUserId: targetUserId });
    setActionModalUser(null);
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) fetchProfile(user.id);
  };

  const fetchProfile = async (userId: string) => {
    let { data, error } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type, feast_day, nickname_set').eq('id', userId).single();
    // 새 칼럼이 아직 없는 경우(SQL 실행 전)에도 동작하도록
    if (error && error.code !== 'PGRST116') {
      ({ data, error } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type, feast_day').eq('id', userId).single());
    }
    if (error && error.code !== 'PGRST116') {
      ({ data, error } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', userId).single());
    }
    const { data: priv } = await supabase.from('profile_private').select('real_name').eq('id', userId).maybeSingle();
    const realName = priv?.real_name || '';
    setMyRealName(realName);
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
    if (currentStatus === 'accepted' && !window.confirm('팔로우를 취소하시겠습니까?')) return;
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

  const confirmBlock = (target: UserProfile) => {
    if (window.confirm(`${target.baptismal_name}님을 차단할까요?\n서로의 글과 댓글이 보이지 않고, 메시지를 받지 않으며 서로 팔로우할 수 없습니다.`)) blockUser(target.id);
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

  // 오늘이 축일인 팔로잉 교우
  const fetchFeastFriends = async (userId: string) => {
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', userId).eq('status', 'accepted');
    const ids = (follows || []).map(f => f.following_id);
    if (ids.length === 0) { setFeastFriends([]); return; }
    const { data } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type, feast_day')
      .in('id', ids).in('feast_day', todayFeastKeys());
    setFeastFriends((data || []) as UserProfile[]);
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

  const handleAvatarClick = async (postUser: { id: string, name: string, avatar_url?: string, handle?: string, badge_type?: string }) => {
    if (!user) { setShowAuthModal(true); return; }
    if (postUser.id === user.id) {
      goToProfile(user.id);
      return;
    }
    setActionUserFollowStatus(await getFollowStatus(postUser.id));
    setActionModalUser({ id: postUser.id, baptismal_name: postUser.name, avatar_url: postUser.avatar_url, handle: postUser.handle, badge_type: postUser.badge_type });
  };

  const fetchChatPartners = async () => {
    if (!user) return;
    const { data } = await supabase.from('messages').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false });
    if (!data || data.length === 0) { setChatPartners([]); return; }

    // 상대별 가장 최근 메시지 (data는 최신순)
    const latest = new Map<string, { content: string; created_at: string }>();
    data.forEach(m => {
      const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (partnerId && !latest.has(partnerId)) latest.set(partnerId, { content: m.content, created_at: m.created_at });
    });

    const { data: profiles } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').in('id', Array.from(latest.keys()));
    const list = (profiles || []).map(p => ({ ...p, lastMessage: latest.get(p.id)?.content, lastAt: latest.get(p.id)?.created_at }));
    list.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
    setChatPartners(list);
  };

  const openChatRoom = (partner: UserProfile) => {
    if (!user) { setShowAuthModal(true); return; }
    setSelectedPostDetail(null); // 크게 보기에서 메시지를 누른 경우 닫기
    if (!requireProfile()) return;
    if (partner.id === user.id) return;
    if (currentChatUser?.id !== partner.id) setChatMessages([]); // 이전 상대와의 대화가 잠깐 보이지 않도록
    navigate({ screen: true, tab: 'chat', chatUser: partner });
    setActionModalUser(null);
  };

  const fetchChatMessages = async (partnerId: string) => {
    if (!user) return;
    const { data, error } = await supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    if (data) {
      setChatMessages(data);
      if (data.some(m => m.sender_id === partnerId && !m.read_at)) markMessagesRead(partnerId);
    }
    else if (error) console.error('메시지를 불러오지 못했습니다', error);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentChatUser || !messageInput.trim()) return;
    const newMsg = messageInput.trim();
    setMessageInput('');
    const { data: sent, error } = await supabase.from('messages')
      .insert({ sender_id: user.id, receiver_id: currentChatUser.id, content: newMsg })
      .select('id').single();
    if (error) {
      setMessageInput(newMsg); // 보내지 못한 내용은 입력창에 되돌려 둔다
      alert(`메시지를 보내지 못했습니다.\n(${error.message})`);
      return;
    }
    fetchChatMessages(currentChatUser.id);
    if (sent) sendPush('message', sent.id);
  };

  const handleKakaoLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao', options: { redirectTo: 'https://catholicgram-dey7.vercel.app/auth/signin-complete', skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      alert('로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    window.location.href = data.url;
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
    const row = { id: user.id, baptismal_name: nickname, handle: cleanHandle, email: user.email };
    let { error } = await supabase.from('profiles').upsert([{ ...row, feast_day: feastDay, nickname_set: true }]);
    // 새 칼럼이 아직 없는 경우(SQL 실행 전)에는 있는 칼럼만 저장
    if (error?.code === 'PGRST204' || error?.code === '42703') ({ error } = await supabase.from('profiles').upsert([{ ...row, feast_day: feastDay }]));
    if (error?.code === 'PGRST204' || error?.code === '42703') ({ error } = await supabase.from('profiles').upsert([row]));

    if (!error) {
      // 실명은 비공개 표에, 내가 쓴 글/댓글의 작성자 이름은 새 닉네임으로
      await supabase.from('profile_private').upsert({ id: user.id, real_name: baptismalName.trim(), updated_at: new Date().toISOString() });
      await supabase.rpc('sync_my_author_name');
      setMyRealName(baptismalName.trim());
      setProfile(prev => ({ ...(prev || {}), id: user.id, baptismal_name: nickname, handle: cleanHandle, feast_day: feastDay, nickname_set: true }));
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
    setSetupError('');
    setProfileEditMode(true);
    setShowSettings(false);
  };

  // 내가 누른 기도·공감 (누른 버튼은 색이 채워져 보임)
  useEffect(() => {
    if (!user?.id) { setMyPostReactions(new Set()); return; }
    supabase.from('post_reactions').select('post_id, reaction_type').eq('user_id', user.id).limit(2000)
      .then(({ data }) => setMyPostReactions(new Set((data || []).map(r => `${r.post_id}:${r.reaction_type}`))));
  }, [user?.id, posts.length]);

  const fetchPosts = async () => {
    const { data: allPosts } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    fetchStories();
    if (!allPosts) return;
    const postsData = allPosts.filter(p => !p.is_story); // 스토리는 피드·내 공간에 안 나옴
    fetchCommentCounts(postsData.map(p => p.id));
    // 게시물 작성자의 프로필만 가져오기
    const authorIds = Array.from(new Set(postsData.map(p => p.user_id).filter(Boolean)));
    const { data: profilesData } = authorIds.length > 0
      ? await supabase.from('profiles').select('id, avatar_url, handle, badge_type, baptismal_name').in('id', authorIds)
      : { data: [] };
    if (profilesData) {
      const profileMap = Object.fromEntries(profilesData.map((p: any) => [p.id, { avatar_url: p.avatar_url, handle: p.handle, badge_type: p.badge_type, name: p.baptismal_name }]));
      setPosts(postsData.map(p => ({ 
        ...p, 
        author_name: profileMap[p.user_id]?.name || p.author_name, // 현재 닉네임
        avatar_url: profileMap[p.user_id]?.avatar_url,
        handle: profileMap[p.user_id]?.handle,
        badge_type: profileMap[p.user_id]?.badge_type
      })));
    }
  };

  // 스토리 (24시간 안, 게시글에 is_story 표시)
  const [storyPosts, setStoryPosts] = useState<Post[]>([]);
  const [storiesUnavailable, setStoriesUnavailable] = useState(false);
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
    if (!content.trim() && selectedFiles.length === 0 && !selectedVideo) return;
    setLoading(true);
    const uploadedUrls: string[] = [];
    for (const file of selectedFiles) {
      const compressed = await imageCompression(file, { maxSizeMB: 1.5, maxWidthOrHeight: 1920, useWebWorker: true });
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.jpg`;
      const { error: uploadError } = await supabase.storage.from('community-images').upload(fileName, compressed);
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('community-images').getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }
    }
    // 숏폼 영상: 미리보기 이미지 + 영상 올리기 (영상은 내 폴더에)
    let videoFields: { video_url: string; video_poster: string | null; video_overlays?: VideoOverlays | null } | null = null;
    if (selectedVideo) {
      setVideoStatus('영상 올리는 중...');
      const poster = await makeVideoPoster(selectedVideo);
      let posterUrl: string | null = null;
      if (poster) {
        const posterName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_poster.jpg`;
        const { error: posterError } = await supabase.storage.from('community-images').upload(posterName, poster, { contentType: 'image/jpeg' });
        if (!posterError) posterUrl = supabase.storage.from('community-images').getPublicUrl(posterName).data.publicUrl;
      }
      const ext = selectedVideo.type.includes('webm') ? 'webm' : selectedVideo.type.includes('quicktime') ? 'mov' : 'mp4';
      const videoName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const { error: videoError } = await supabase.storage.from('post-videos').upload(videoName, selectedVideo, { contentType: selectedVideo.type || 'video/mp4' });
      setVideoStatus('');
      if (videoError) {
        alert(/bucket|not found/i.test(videoError.message)
          ? '영상 기능을 준비 중이에요. (관리자: supabase/videos.sql 실행 필요)'
          : /size|large|exceed/i.test(videoError.message)
            ? `영상이 너무 커요. ${MAX_VIDEO_MB}MB 이하로 줄여서 올려주세요.`
            : '영상을 올리지 못했어요. 잠시 후 다시 시도해주세요.');
        setLoading(false);
        return;
      }
      videoFields = {
        video_url: supabase.storage.from('post-videos').getPublicUrl(videoName).data.publicUrl,
        video_poster: posterUrl,
        ...(hasOverlays(composerOverlays) ? { video_overlays: composerOverlays } : {}),
      };
    }
    const author = profile?.baptismal_name || '교우';
    const row = { content, images: uploadedUrls, user_id: user.id, author_name: author, ...(videoFields || {}), ...(composerVisibility !== 'public' ? { visibility: composerVisibility } : {}) };
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
      setContent(''); setSelectedFiles([]); setPreviewUrls([]); setComposerMusic(null); clearVideo();
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowComposer(false);
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
  const homeNotice = notices.find(n => n.pinned && !hiddenNotices.includes(n.id));
  // 앱에 들어오면 띄우는 팝업 공지: 가장 최근 것 하나, '다시 보지 않기' 전까지 들어올 때마다
  const popupNotice = notices.find(n => n.popup && !hiddenNotices.includes(n.id) && !popupClosed.includes(n.id));
  const closePopup = (id: string) => setPopupClosed(prev => [...prev, id]);

  const fetchIntentions = async () => {
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

  const myIntention = user ? intentions.find(i => i.user_id === user.id) : undefined;
  const visibleIntentions = intentions.filter(i => !blockedIds.has(i.user_id));

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
    if (!window.confirm('오늘의 기도지향을 내릴까요?')) return;
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

  const clearVideo = () => {
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
    let video: Blob = file;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setVideoStatus('영상 용량을 줄이는 중... 0%');
      const shrunk = await shrinkVideo(file, r => setVideoStatus(`영상 용량을 줄이는 중... ${Math.round(r * 100)}%`));
      setVideoStatus('');
      if (!shrunk || shrunk.size > MAX_VIDEO_MB * 1024 * 1024) {
        alert(`영상이 너무 커요 (${Math.round(file.size / 1024 / 1024)}MB).\n휴대폰 카메라 설정에서 화질을 낮추거나(예: 720p), 더 짧게 찍어서 올려주세요.`);
        return;
      }
      video = shrunk;
    }
    // 영상은 사진 대신 하나만 (배경음악은 함께 넣을 수 있음)
    setSelectedFiles([]); setPreviewUrls([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setSelectedVideo(video);
    setVideoPreviewUrl(URL.createObjectURL(video));
    setComposerOverlays(null);
    setShowVideoEditor(true); // 고르자마자 꾸미기 화면
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    // 사진은 최대 5장: 여러 번 나눠 골라도 이어서 추가됨
    const picked = Array.from(e.target.files);
    e.target.value = '';
    if (picked.length === 0) return;
    clearVideo();
    const room = MAX_PHOTOS - selectedFiles.length;
    if (picked.length > room) alert(`사진은 한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요.`);
    const added = picked.slice(0, Math.max(0, room));
    setSelectedFiles(prev => [...prev, ...added]);
    setPreviewUrls(prev => [...prev, ...added.map(f => URL.createObjectURL(f))]);
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
    if (!window.confirm('이 글을 지울까요?\n사진·영상과 댓글도 함께 지워지고 되돌릴 수 없어요.')) return;
    const result = await callPostApi({ action: 'delete', id: postId });
    if (result.error) { alert(result.error); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
    setSelectedPostDetail(prev => prev?.id === postId ? null : prev);
  };
  const startEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setEditContent(post.content || '');
    setEditOverlays(post.video_overlays || null);
    setEditVisibility(post.visibility || 'public');
    setEditMusic(post.music ? { value: post.music, title: post.music_title || '음악' } : null);
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
    const changes: Partial<Post> = { content: editContent.trim() };
    if (target.video_url) changes.video_overlays = hasOverlays(editOverlays) ? editOverlays : null;
    if (editVisibility !== (target.visibility || 'public')) changes.visibility = editVisibility;
    if ((editMusic?.value || null) !== (target.music || null)) {
      changes.music = editMusic?.value || null;
      changes.music_title = editMusic?.title || null;
    }
    setSavingEdit(true);
    const result = await callPostApi({ action: 'update', id: postId, changes });
    setSavingEdit(false);
    if (result.error) { alert(result.error); return; }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...changes } : p));
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
    // 화면의 숫자에 ±1 하지 않고 post_reactions 테이블에서 실제 개수를 다시 세어 저장
    // (여러 사람이 동시에 눌러도 값이 어긋나지 않음)
    const { count } = await supabase.from('post_reactions').select('*', { count: 'exact', head: true }).eq('post_id', postId).eq('reaction_type', type);
    const newCount = count ?? 0;
    const updateField = type === 'pray' ? { pray_count: newCount } : { like_count: newCount };
    await supabase.from('posts').update(updateField).eq('id', postId);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updateField } : p));
    setStoryPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updateField } : p));
  };
  const fetchNotifications = async (userId: string) => {
    const myHandle = myHandleRef.current;
    const { data: myPosts } = await supabase.from('posts').select('id, content').eq('user_id', userId);
    setNotificationsLastSeen(storageGet(`notificationsLastSeen:${userId}`));
    setNotificationsClearedAt(storageGet(`notificationsClearedAt:${userId}`));
    try { setHiddenAlerts(new Set(JSON.parse(storageGet(`notificationsHidden:${userId}`) || '[]'))); } catch { /* 무시 */ }
    const postContent: Record<string, string> = Object.fromEntries((myPosts || []).map(p => [p.id, p.content || '']));
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
      merged.set(`mp:${p.id}`, { id: `mp:${p.id}`, post_id: p.id, content: p.content, author_name: p.author_name, created_at: p.created_at, post_content: p.content, mention: 'post' }));
    ((commentMentions || []) as unknown as Row[]).filter(c => mentionsHandle(c.content, myHandle)).forEach(c => {
      const prev = merged.get(c.id);
      merged.set(c.id, { ...(prev || { ...c, post_id: c.post_id || '', post_content: postContent[c.post_id || ''] || '' }), mention: 'comment' });
    });
    setNotifications(Array.from(merged.values()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40));
  };

  // 아직 읽지 않은 받은 메시지 (보낸 사람별로 묶음)
  const fetchUnreadMessages = async (userId: string) => {
    const { data } = await supabase.from('messages').select('sender_id, content, created_at')
      .eq('receiver_id', userId).is('read_at', null)
      .order('created_at', { ascending: false }).limit(100);
    if (!data || data.length === 0) { setUnreadMessages([]); return; }
    const grouped = new Map<string, { count: number; lastMessage: string; lastAt: string }>();
    data.forEach(m => {
      const g = grouped.get(m.sender_id);
      if (g) g.count += 1;
      else grouped.set(m.sender_id, { count: 1, lastMessage: m.content, lastAt: m.created_at });
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

  const refreshAlerts = (userId: string) => {
    fetchBlocks(userId);
    fetchNotifications(userId);
    fetchUnreadMessages(userId);
    fetchFollowRequests(userId);
    fetchFeastFriends(userId);
  };

  const unreadCommentCount = !user ? 0 : notifications.filter(n =>
    !notificationsLastSeen || new Date(n.created_at) > new Date(notificationsLastSeen)
  ).length;
  const unreadMessageCount = !user ? 0 : unreadMessages.reduce((sum, u) => sum + u.count, 0);
  const newFollowerCount = !user ? 0 : followRequests.filter(r =>
    r.created_at && (!notificationsLastSeen || new Date(r.created_at) > new Date(notificationsLastSeen))
  ).length;
  // 지운 알림인지
  const isAlertHidden = (key: string, at?: string) =>
    hiddenAlerts.has(key) || (!!notificationsClearedAt && !!at && new Date(at) <= new Date(notificationsClearedAt));
  const hideAlert = (key: string) => {
    if (!user) return;
    setHiddenAlerts(prev => {
      const next = new Set(prev); next.add(key);
      storageSet(`notificationsHidden:${user.id}`, JSON.stringify(Array.from(next).slice(-500)));
      return next;
    });
  };
  const clearSeenAlerts = () => {
    if (!user) return;
    const now = new Date().toISOString();
    setNotificationsClearedAt(now);
    storageSet(`notificationsClearedAt:${user.id}`, now);
  };

  const listedFollows = followRequests.filter(r => !blockedIds.has(r.follower.id) && !isAlertHidden(`f:${r.id}`, r.created_at));
  const listedComments = notifications.filter(n => !isAlertHidden(`c:${n.id}`, n.created_at));
  const feastCleared = !!notificationsClearedAt && todayKst(new Date(notificationsClearedAt)) === todayKst();

  // 축일 알림: 오늘 알림 목록을 아직 안 열어봤으면 새 알림으로 센다
  const isMyFeastToday = !!profile?.feast_day && todayFeastKeys().includes(profile.feast_day);
  const visibleFeastFriends = feastFriends.filter(f => !blockedIds.has(f.id));
  const feastAlertCount = !user || (notificationsLastSeen && todayKst(new Date(notificationsLastSeen)) === todayKst())
    ? 0 : visibleFeastFriends.length + (isMyFeastToday ? 1 : 0);
  const unreadCount = unreadCommentCount + unreadMessageCount + newFollowerCount + feastAlertCount;

  // 축일 축하 메시지 보내기: 대화방을 열고 인사말을 미리 채워둔다
  const congratulateFeast = (friend: UserProfile) => {
    setShowNotifications(false);
    openChatRoom(friend);
    setMessageInput(`${friend.baptismal_name}님, 축일 축하드려요! 🎉 주님의 은총이 가득하시길 기도할게요 🙏`);
  };

  const dismissFeastCard = () => {
    setFeastCardDismissed(true);
    if (user) storageSet(`feastCardDismissed:${user.id}`, todayKst());
  };

  const dismissFeastPrompt = () => {
    setFeastPromptDismissed(true);
    if (user) storageSet(`feastPromptDismissed:${user.id}`, '1');
  };

  const openNotifications = () => {
    if (!user) return;
    setShowNotifications(true);
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
  const openPostComments = async (postId: string, commentId?: string) => {
    setCommentSheetId(postId);
    setHighlightCommentId(commentId || null);
    await loadCommentsFor(postId);
    if (commentId) {
      setTimeout(() => document.getElementById(`comment-${commentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
      setTimeout(() => setHighlightCommentId(prev => (prev === commentId ? null : prev)), 3500);
    }
  };
  // 알림에서: 글 자체를 크게 보기 (피드에 없으면 불러와서)
  const openPostById = async (postId: string) => {
    const known = posts.find(p => p.id === postId) || storyPosts.find(p => p.id === postId);
    if (known) { openPostViewer(known); return; }
    const { data } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
    if (data) openPostViewer(data as Post); else openPostComments(postId);
  };

  // 알림 누르기: 글에서 언급 → 그 글 크게 보기, 댓글·답글·댓글 언급 → 그 글의 댓글 창에서 그 댓글로
  const openNotification = (n: CommentNotification) => {
    setShowNotifications(false);
    if (n.mention === 'post') openPostById(n.post_id);
    else openPostComments(n.post_id, n.id);
  };

  // --- 휴대폰 푸시 알림 ---
  // 방금 작성한 댓글/메시지를 받는 사람에게 알림 발송 요청 (실패해도 무시)
  const sendPush = async (type: 'comment' | 'post' | 'message' | 'follow' | 'feedback' | 'feedback_reply' | 'report' | 'report_reply', id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ type, id }),
    }).catch(() => {});
  };

  const savePushSubscription = async (sub: PushSubscription, userId: string) => {
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' }
    );
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

  useEffect(() => {
    if (user) checkPushStatus(user.id);
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
    if (await enablePush()) setToast({ key: 'push-on', icon: '🔔', title: '알림이 켜졌어요', body: '댓글·메시지·축일 소식을 휴대폰으로 알려드릴게요', action: () => {} });
  };

  // 앱을 쓰는 동안 새로 도착한 알림 → 화면 위 배너 + 소리 + 진동
  useEffect(() => {
    if (!user) return;
    const since = sessionStartRef.current;
    const isNew = (key: string, at?: string) => {
      if (seenAlertKeysRef.current.has(key)) return false;
      seenAlertKeysRef.current.add(key);
      return !!at && new Date(at).getTime() > since; // 앱을 연 뒤에 생긴 것만
    };
    type Candidate = { key: string; icon: string; title: string; body: string; action: () => void };
    const fresh: Candidate[] = [];
    followRequests.forEach(r => {
      if (isNew(`f:${r.id}`, r.created_at)) fresh.push({ key: `f:${r.id}`, icon: '👤', title: '새 팔로워', body: `${r.follower.baptismal_name}님이 회원님을 팔로우하기 시작했어요`, action: () => goToProfile(r.follower.id) });
    });
    unreadMessages.forEach(u => {
      const chattingNow = activeTab === 'chat' && currentChatUser?.id === u.partner.id;
      if (isNew(`m:${u.partner.id}:${u.lastAt}`, u.lastAt) && !chattingNow) fresh.push({ key: `m:${u.partner.id}`, icon: '✉️', title: `${u.partner.baptismal_name}님의 메시지`, body: u.lastMessage, action: () => openChatRoom(u.partner) });
    });
    notifications.forEach(n => {
      if (isNew(`c:${n.id}`, n.created_at)) fresh.push({ key: `c:${n.id}`, icon: n.mention ? '🏷️' : '💬', title: n.mention ? '회원님이 언급되었어요' : n.is_reply ? '새 답글' : '새 댓글', body: `${n.author_name}님: ${n.content}`, action: () => openNotification(n) });
    });
    if (fresh.length === 0) return;
    const latest = fresh[0];
    setToast(fresh.length > 1 ? { ...latest, body: `${latest.body} 외 ${fresh.length - 1}건` } : latest);
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

  // 축일 알림 배너는 하루에 한 번만
  useEffect(() => {
    if (!user || needsProfileSetup || (!isMyFeastToday && visibleFeastFriends.length === 0)) return;
    const key = `feastToast:${user.id}`;
    if (storageGet(key) === todayKst()) return;
    storageSet(key, todayKst());
    const first = visibleFeastFriends[0];
    setToast(isMyFeastToday
      ? { key: 'feast:me', icon: '🎉', title: '축일을 축하드립니다!', body: `${profile?.baptismal_name}님, 주님의 은총과 주보성인의 전구가 늘 함께하시길 기도합니다 🙏`, action: () => goToHome() }
      : { key: `feast:${first.id}`, icon: '🎉', title: `오늘은 ${first.baptismal_name}님의 축일이에요`, body: visibleFeastFriends.length > 1 ? `외 ${visibleFeastFriends.length - 1}명도 축일이에요. 축하 메시지를 보내보세요` : '축하 메시지를 보내보세요', action: () => openNotifications() });
    if (alertSoundOn) playAlertSound();
  }, [user, needsProfileSetup, isMyFeastToday, feastFriends]);

  // 배너는 5초 뒤 자동으로 사라짐
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // 푸시 알림을 눌러 들어온 경우 해당 글/대화로 이동
  useEffect(() => {
    // 공지 알림은 로그인 없이도 열린다
    if (deepLink?.notice) { closePopup(deepLink.notice); setNoticeAdminMode(false); setNoticeOpenId(deepLink.notice); setShowNotices(true); setDeepLink(null); return; }
    if (!deepLink || !user) return;
    setDeepLink(null);
    if (deepLink.post) {
      openPostComments(deepLink.post, deepLink.comment);
    } else if (deepLink.view) {
      openPostById(deepLink.view);
    } else if (deepLink.profile) {
      goToProfile(deepLink.profile);
    } else if (deepLink.chat) {
      supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', deepLink.chat).maybeSingle()
        // 알림으로 연 대화방도 뒤로가기를 하면 대화 목록으로 가도록 목록을 한 칸 깔고 연다 (상대를 못 찾으면 대화 목록)
        .then(({ data }) => { if (currentScreenRef.current.tab !== 'messages') navigate({ screen: true, tab: 'messages' }); if (data) openChatRoom(data); });
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
    refreshAlerts(user.id);
    const interval = setInterval(() => refreshAlerts(user.id), 20000);
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
    data.forEach(c => { next[c.id] = { pray: 0, like: 0, myPray: false, myLike: false }; });
    (reactions || []).forEach(r => {
      const entry = next[r.comment_id];
      if (!entry) return;
      if (r.reaction_type === 'pray') { entry.pray += 1; if (r.user_id === user?.id) entry.myPray = true; }
      else { entry.like += 1; if (r.user_id === user?.id) entry.myLike = true; }
    });
    setCommentReactions(prev => ({ ...prev, ...next }));
  };

  const toggleCommentReaction = async (commentId: string, type: 'pray' | 'like') => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    const current = commentReactions[commentId] || { pray: 0, like: 0, myPray: false, myLike: false };
    const mine = type === 'pray' ? current.myPray : current.myLike;
    const apply = (on: boolean) => setCommentReactions(prev => {
      const c = prev[commentId] || { pray: 0, like: 0, myPray: false, myLike: false };
      return { ...prev, [commentId]: type === 'pray'
        ? { ...c, myPray: on, pray: Math.max(0, c.pray + (on ? 1 : -1)) }
        : { ...c, myLike: on, like: Math.max(0, c.like + (on ? 1 : -1)) } };
    });
    apply(!mine); // 먼저 화면에 반영
    const { error } = mine
      ? await supabase.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', user.id).eq('reaction_type', type)
      : await supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: user.id, reaction_type: type });
    if (error && error.code !== '23505') {
      apply(mine);
      if (error.code === '42P01' || error.code === 'PGRST205') alert('댓글 기도/공감 기능을 준비 중이에요. (관리자: supabase/comment-reactions.sql 실행 필요)');
    }
  };

  // 댓글 창 열기 (인스타그램처럼 아래에서 올라옴). 열 때마다 새로 불러온다
  const toggleCommentBox = async (postId: string) => {
    setCommentSheetId(postId);
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

  const saveCommentEdit = async (c: Comment) => {
    const text = editCommentText.trim();
    if (!text) return;
    const result = await callCommentApi({ action: 'edit', id: c.id, content: text });
    if (result.error) { alert(result.error); return; }
    setComments(prev => ({ ...prev, [c.post_id]: (prev[c.post_id] || []).map(x => x.id === c.id ? { ...x, content: result.content, edited_at: result.edited_at } : x) }));
    setEditingCommentId(null);
  };

  const deleteComment = async (c: Comment) => {
    if (!window.confirm('이 댓글을 삭제할까요?')) return;
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
    setTimeout(() => (document.getElementById(`comment-input-${postId}`) as HTMLInputElement | null)?.focus(), 150);
  };

  const handleAddComment = async (postId: string) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    const text = commentInputs[postId];
    if (!text || !text.trim()) return;
    const author = profile?.baptismal_name || '교우';
    const target = replyTargets[postId];
    const row = { post_id: postId, content: text.trim(), user_id: user.id, author_name: author };
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
    if (!error && data?.[0]) {
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data[0]] }));
      setCommentCounts(prev => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      setReplyTargets(prev => ({ ...prev, [postId]: null }));
      sendPush('comment', data[0].id);
    }
  };

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
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, croppedBlob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
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
  const otherModalOpen = !!(actionModalUser || showAuthModal || avatarFile || selectedPostDetail || selectedImage
    || showNotifications || showSettings || showFeedback || reportTarget || showInstallGuide || showSponsorAdmin || showPushPrompt || showAdminMembers || showMusicPicker || showBgmAdmin || (profileEditMode && !needsProfileSetup) || showIntentions || showVideoEditor || showNotices || showComposer || !!editingPostId || !!followList || showAdminStats || !!postMenuId || fabOpen || !!commentSheetId || storyViewerOpen || !!avatarPreview);
  // 팝업 공지는 다른 창이 없을 때만, 처음 정보 입력 중이 아닐 때만
  const showPopupNotice = !!popupNotice && !otherModalOpen && !needsProfileSetup;
  const anyModalOpen = otherModalOpen || showPopupNotice;
  const closeAllModals = () => {
    if (showPopupNotice && popupNotice) closePopup(popupNotice.id);
    setActionModalUser(null); setShowAuthModal(false); setAvatarFile(null); setSelectedPostDetail(null); setSelectedImage(null);
    setShowNotifications(false); setShowSettings(false); setShowFeedback(false); setReportTarget(null);
    setShowInstallGuide(false); setShowSponsorAdmin(false); setShowPushPrompt(false); setShowAdminMembers(false);
    setShowMusicPicker(false); setShowBgmAdmin(false); setProfileEditMode(false); setShowIntentions(false); setShowVideoEditor(false); setShowNotices(false);
    // 음악·영상 꾸미기 창이 위에 열려 있으면 그것만 닫고 글쓰기 창은 둔다
    if (!showMusicPicker && !showVideoEditor) setShowComposer(false);
    if (showEditVideoEditor) setShowEditVideoEditor(false); else setEditingPostId(null);
    setFollowList(null);
    setShowAdminStats(false);
    setPostMenuId(null);
    setFabOpen(false);
    setCommentSheetId(null);
    setStoryViewerOpen(false);
    setAvatarPreview(null);
  };
  backHandlerRef.current = (e: PopStateEvent) => {
    const st = e.state as ScreenState | { guard: true } | null;
    if (anyModalOpen) {
      closeAllModals();
      window.history.pushState(currentScreenRef.current, ''); // 화면은 그대로 유지
      return;
    }
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
      setToast({ key: `exit-${Date.now()}`, icon: '👋', title: '한 번 더 뒤로가기를 하면 종료돼요', body: '', action: () => {} });
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
    if (activeTab === 'profile' && viewingUserId) { fetchViewingProfile(viewingUserId); fetchFollowData(viewingUserId); }
    if (activeTab === 'messages') { fetchChatPartners(); if (user) fetchUnreadMessages(user.id); }
    refreshFeed();
  };
  const pullCtx = useRef({ blocked: false, refresh: pullRefresh });
  pullCtx.current = { blocked: anyModalOpen || activeTab === 'chat' || activeTab === 'reels' || refreshState === 'loading', refresh: pullRefresh };
  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    let dist = 0;
    const onStart = (e: TouchEvent) => {
      start = null; dist = 0;
      if (pullCtx.current.blocked || el.scrollTop > 0 || e.touches.length !== 1) return;
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

  // 다른 탭으로 가면 + 메뉴 접기
  useEffect(() => { setFabOpen(false); }, [activeTab]);

  // 크게 보기 손가락 밀기: 사진 좌우로 밀면 다음 사진, (탐색에서 열었으면) 위로 밀면 다음 추천 글
  const [viewerQueue, setViewerQueue] = useState<string[] | null>(null);
  const viewerScrollRef = useRef<HTMLDivElement>(null);
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
    }, 260);
    return true;
  };
  const onViewerTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    const el = viewerScrollRef.current;
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

  // 크게 보기: 사진을 두 번 누르면 공감 (한 번 누르면 아무 일 없음)
  const [viewerBurst, setViewerBurst] = useState(0);
  const viewerDoubleTapLike = () => {
    if (!selectedPostDetail) return;
    setViewerBurst(Date.now());
    likeByDoubleTap(selectedPostDetail.id);
  };
  const viewerImageTap = useDoubleTap(() => {}, viewerDoubleTapLike);

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
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sky-50 text-sky-800"><Icon name="chat" className="w-[1.375rem] h-[1.375rem]" /></span>
        {showCounts && commentCounts[post.id] ? commentCounts[post.id] : null}
      </button>
      {/* 글쓴이에게 바로 메시지 */}
      {user?.id !== post.user_id && (
        <button
          onClick={() => openChatRoom({ id: post.user_id, baptismal_name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type })}
          aria-label={`${post.author_name}님에게 메시지 보내기`}
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-700"
        >
          <Icon name="send" className="w-[1.25rem] h-[1.25rem]" />
        </button>
      )}
    </>
  );

  return (
    <main
      ref={mainScrollRef}
      // 페이지 전체가 아니라 앱 안쪽만 스크롤 → 휴대폰 브라우저가 스스로 띄우는 '맨 위로' 버튼이 나오지 않음
      style={visibleHeight ? { height: visibleHeight } : undefined}
      className={`w-full max-w-xl mx-auto h-[100dvh] sm:border-x border-stone-200 bg-stone-50/30 flex flex-col font-sans relative ${activeTab === 'chat' ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain [&>*]:shrink-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))]'}`}
    >
      
      {/* 헤더 */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-stone-200 px-3 sm:px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between gap-2 z-20">
        {activeTab === 'chat' ? (
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button onClick={() => window.history.back()} className="text-stone-600 hover:text-black" aria-label="뒤로">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {currentChatUser?.avatar_url ? (
                <button onClick={() => setAvatarPreview({ url: currentChatUser.avatar_url!, name: currentChatUser.baptismal_name })} className="shrink-0" aria-label="프로필 사진 크게 보기">
                  <img src={currentChatUser.avatar_url} alt="프로필" className="w-8 h-8 rounded-full object-cover border border-stone-200" />
                </button>
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold shrink-0">{currentChatUser?.baptismal_name?.[0]}</div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <h1 className="font-bold text-stone-900 text-sm truncate">{currentChatUser?.baptismal_name}</h1>
                  <RoleBadge type={currentChatUser?.badge_type} />
                </div>
                <p className="text-[0.75rem] text-stone-400 truncate">@{currentChatUser?.handle}</p>
              </div>
            </div>
          </div>
        ) : null}
        {activeTab === 'chat' && currentChatUser ? (
          <button onClick={() => handleAvatarClick({ id: currentChatUser.id, name: currentChatUser.baptismal_name, avatar_url: currentChatUser.avatar_url, handle: currentChatUser.handle, badge_type: currentChatUser.badge_type })} className="text-stone-500 hover:text-stone-900 px-2 text-lg font-bold" aria-label="더보기">⋯</button>
        ) : (
          <>
            <div className="flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0" onClick={goToHome}>
              <img src="/icon-v2-192.png" alt="" className="w-7 h-7 rounded-lg shadow-sm" />
              <h1 className="font-serif font-bold text-stone-900 tracking-tight text-lg whitespace-nowrap">가톨릭그램</h1>
            </div>
            <div className="min-w-0">
              {user ? (
                <div className="flex items-center gap-4 min-w-0">
                  {/* 고민상담 (익명 게시판) */}
                  <button onClick={() => goToTab('anon')} className={`${activeTab === 'anon' ? 'text-violet-700' : 'text-stone-700'} hover:text-stone-900`} aria-label="고민상담">
                    <Icon name="dove" className="w-6 h-6" />
                  </button>
                  <button onClick={openNotifications} className="relative text-stone-700 hover:text-stone-900" aria-label="알림">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                  </button>
                  {/* 메시지 (인스타그램처럼 오른쪽 위) */}
                  <button onClick={() => goToTab('messages')} className="relative text-stone-700 hover:text-stone-900" aria-label="메시지">
                    <Icon name="send" className="w-6 h-6" />
                    {unreadMessageCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
                    )}
                  </button>
                  {/* 휴대폰에서는 내 공간 → 설정에서 로그아웃 */}
                  <button onClick={() => supabase.auth.signOut()} className="hidden sm:inline text-[0.8125rem] text-stone-400 hover:text-stone-700 whitespace-nowrap">로그아웃</button>
                </div>
              ) : (
                <button onClick={() => setShowAuthModal(true)} className="text-xs font-semibold bg-stone-900 text-white px-3.5 py-1.5 rounded-full">로그인</button>
              )}
            </div>
          </>
        )}
      </header>

      {/* 1. 홈 탭 */}
      {activeTab === 'home' && (
        <>
          {/* 스토리 동그라미 줄 (인스타그램처럼 맨 위) */}
          <Stories
            posts={storyPosts}
            unavailable={storiesUnavailable}
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
            onOpenProfile={goToProfile}
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
                <span className="inline-block intention-marquee" style={{ ['--marquee-duration' as string]: `${Math.max(18, visibleIntentions.reduce((n, i) => n + (i.title || i.content).length + (i.author_name || '').length, 0) * 0.4)}s` }}>
                  {[0, 1].map(copy => (
                    <span key={copy} className="pr-8">
                      {visibleIntentions.map(i => (
                        <span key={`${copy}-${i.id}`} onClick={() => setOpenIntentionId(i.id)} className="mr-8 text-[0.875rem]">
                          <b className="text-white">{i.author_name || '교우'}</b> · {i.title || i.content}
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
              <img src="/icon-v2-192.png" alt="" className="w-8 h-8 rounded-lg" />
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
                  <p className="font-serif font-bold text-stone-900 mt-1">{profile?.baptismal_name}님, 축일을 축하드립니다!</p>
                  <p className="text-sm text-stone-600 mt-1 leading-relaxed">주님의 은총과 주보성인의 전구가<br />늘 함께하시길 기도합니다 🙏</p>
                </div>
              )}
              {visibleFeastFriends.length > 0 && (
                <div className={`flex flex-col gap-2 ${isMyFeastToday ? 'mt-3 pt-3 border-t border-amber-200' : ''}`}>
                  <p className="text-sm font-bold text-stone-800 pr-4"><Icon name="candle" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-amber-600" />오늘 축일인 교우</p>
                  {visibleFeastFriends.map(f => (
                    <div key={f.id} className="flex items-center gap-2.5">
                      <button onClick={() => goToProfile(f.id)} className="flex-1 flex items-center gap-2.5 min-w-0 text-left">
                        {f.avatar_url
                          ? <img src={f.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-stone-200 shrink-0" />
                          : <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold shrink-0">{f.baptismal_name[0]}</div>}
                        <span className="text-sm text-stone-800 truncate"><b>{f.baptismal_name}</b>님의 축일이에요</span>
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
          {/* 글쓰기 창: 오른쪽 아래 + 버튼을 눌렀을 때만 열림 (닫아도 쓰던 글은 남아 있음) */}
          {showComposer && (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center" onClick={() => setShowComposer(false)}>
          <section className="bg-white w-full sm:w-[30rem] max-w-xl max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-stone-900">새 나눔 쓰기</h2>
              <button type="button" onClick={() => setShowComposer(false)} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-1" aria-label="닫기">×</button>
            </div>
            <form onSubmit={handleCreatePost} className="flex flex-col gap-3">
              <textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)} placeholder={user ? "오늘 마음속 기도나 묵상을 들려주세요... (#해시태그, @아이디로 교우 태그)" : '로그인 후 나눌 수 있습니다.'} rows={5} className="w-full p-3.5 text-sm bg-stone-50/70 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
              {user && <MentionSuggest value={content} onChange={setContent} excludeId={user.id} />}
              {user && content.length > 0 && composerTagSuggestions.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
                  <span className="text-[0.75rem] text-stone-500 shrink-0">추천 태그</span>
                  {composerTagSuggestions.map(t => (
                    <button key={t} type="button" onClick={() => setContent(c => `${c.trimEnd()} #${t} `)} className="shrink-0 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-1">#{t}</button>
                  ))}
                </div>
              )}
              {composerMusic && (
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                  <Icon name="music" className="w-4 h-4 text-violet-700" />
                  <span className="flex-1 min-w-0 text-xs font-bold text-stone-700 truncate">{composerMusic.title}</span>
                  {canAdjustMusic(composerMusic.value) && (
                    <button type="button" onClick={() => openMusicSegment('composer', composerMusic)} className="shrink-0 text-[0.75rem] font-bold text-violet-700 bg-white border border-violet-200 rounded-lg px-2 py-1">{musicRangeLabel(composerMusic.value) || '구간'} · 조절</button>
                  )}
                  <button type="button" onClick={() => setComposerMusic(null)} className="text-stone-400 hover:text-stone-700 text-base leading-none px-1" aria-label="음악 빼기">×</button>
                </div>
              )}
              {videoStatus && <p className="text-xs text-violet-700 font-bold"><Icon name="film" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />{videoStatus}</p>}
              {videoPreviewUrl && (
                <div className="flex items-end gap-2">
                <div className="relative w-32 rounded-xl overflow-hidden shadow-sm bg-black [container-type:inline-size]">
                  <video src={videoPreviewUrl} muted playsInline loop autoPlay className="w-full aspect-[4/5] object-cover" />
                  <OverlayLayer overlays={composerOverlays} />
                  <span className="absolute bottom-1 left-1 text-[0.6875rem] text-white bg-black/50 rounded px-1"><Icon name="film" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />숏폼</span>
                  <button type="button" onClick={clearVideo} className="absolute top-1 right-1 bg-black/60 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">×</button>
                </div>
                <button type="button" onClick={() => setShowVideoEditor(true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-800 border border-violet-100"><Icon name="sparkle" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />꾸미기</button>
                </div>
              )}
              {previewUrls.length > 0 && (
                <div className="flex gap-2 pt-1">
                  {previewUrls.map((url, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden shadow-sm">
                      <img src={url} alt="미리보기" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeFile(idx)} className="absolute top-0 right-0 bg-black/60 text-white w-4 h-4 flex items-center justify-center text-[0.75rem]">×</button>
                    </div>
                  ))}
                </div>
              )}
              {user && <VisibilityPicker value={composerVisibility} onChange={v => { setComposerVisibility(v); storageSet('postVisibility', v); }} />}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" id="photo-upload" />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label htmlFor="photo-upload" className="cursor-pointer text-xs font-semibold text-stone-600 bg-stone-100 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5">
                      <Icon name="camera" className="w-[1.125rem] h-[1.125rem] text-stone-700" />사진
                    </label>
                    {user && (
                      <>
                        <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoChange} className="hidden" id="video-upload" />
                        <label htmlFor="video-upload" className="cursor-pointer text-xs font-semibold text-stone-600 bg-stone-100 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5">
                          <Icon name="film" className="w-[1.125rem] h-[1.125rem] text-stone-700" />영상
                        </label>
                      </>
                    )}
                    {user && (
                      <button type="button" onClick={() => setShowMusicPicker(true)} className="text-xs font-semibold text-stone-600 bg-stone-100 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5">
                        <Icon name="music" className="w-[1.125rem] h-[1.125rem] text-violet-700" />음악
                      </button>
                    )}
                  </div>
                </div>
                <button type="submit" disabled={loading || !!videoStatus || (!content.trim() && selectedFiles.length === 0 && !selectedVideo)} className="bg-stone-900 text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-stone-800 disabled:opacity-40 whitespace-nowrap shrink-0">{loading ? (videoStatus || '올리는 중...') : '나눔 올리기'}</button>
              </div>
            </form>
          </section>
          </div>
          )}

          <section className="flex-1 flex flex-col gap-2 bg-[#efe6d6]">
            {(() => {
              const hasMedia = (p: Post) => !!p.video_url || !!(p.images && p.images.length > 0);
              const filtered = posts.filter(post => !blockedIds.has(post.user_id)
                && (feedFilter === 'all' || (feedFilter === 'media' ? hasMedia(post) : !hasMedia(post))));
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
                <article id={`post-${post.id}`} className="bg-gradient-to-b from-[#fdfaf5] to-[#f7f0e4] flex flex-col pb-4 sm:pb-5 shadow-[0_1px_0_#e6d9c3]">
                  {/* 인스타그램처럼: 맨 위 프로필·이름·⋯ → 사진 → 버튼 → 숫자 → 글 → 댓글 n개 → 시간 */}
                  <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5">
                    <button onClick={() => goToProfile(post.user_id)} className="shrink-0" aria-label={`${post.author_name}님 공간`}>
                      {post.avatar_url
                        ? <img src={post.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-[#e6d9c3]" />
                        : <span className="w-9 h-9 rounded-full bg-stone-200 text-stone-600 text-sm font-serif font-bold flex items-center justify-center">{post.author_name?.[0] || '교'}</span>}
                    </button>
                    <div className="min-w-0 flex-1 flex flex-col items-start">
                      <button onClick={() => goToProfile(post.user_id)} className="max-w-full flex items-center gap-1 text-[0.9375rem] font-bold text-stone-900 text-left"><span className="truncate">{post.author_name}</span><RoleBadge type={post.badge_type} size="xs" showLabel={false} /></button>
                      {/* 음악: 누르면 크게 보기에서 재생 */}
                      {parsePostMusic(post.music) && (
                        <button onClick={() => openPostViewer(post)} className="max-w-full flex items-center gap-1 text-[0.75rem] text-stone-500"><Icon name="music" className="w-3 h-3 shrink-0" /><span className="truncate">{post.music_title || '음악'}</span></button>
                      )}
                    </div>
                    {post.visibility && post.visibility !== 'public' && <span className="shrink-0 text-[0.75rem] bg-stone-100 text-stone-600 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><Icon name={VISIBILITY[post.visibility].icon} className="w-3.5 h-3.5" />{VISIBILITY[post.visibility].label}</span>}
                    {(canDelete || user) && (
                      <button onClick={() => setPostMenuId(postMenuId === post.id ? null : post.id)} className="w-10 h-10 -mr-2 shrink-0 flex items-center justify-center rounded-full text-xl leading-none text-stone-600 hover:bg-stone-100" aria-label="더보기 (고치기·지우기)">⋯</button>
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
                      onOpen={i => openPostViewer(post, i)}
                      onDoubleTap={() => likeByDoubleTap(post.id)}
                      musicTitle={post.music_title}
                    />
                  )}

                  <div className="px-3 sm:px-4 flex flex-col gap-1.5">
                    {/* 기도·공감·댓글·메시지 버튼 (숫자는 아래 줄에) */}
                    <div className={`flex items-center gap-x-2.5 ${(post.images && post.images.length > 0) || post.video_url ? 'pt-2' : ''}`}>
                      {reactionButtons(post, () => toggleCommentBox(post.id), false)}
                    </div>
                    {(post.pray_count > 0 || post.like_count > 0) && (
                      <p className="text-[0.875rem] font-bold text-stone-900">
                        {[post.pray_count > 0 && `기도 ${post.pray_count}명`, post.like_count > 0 && `공감 ${post.like_count}명`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {(() => {
                      // 사진·영상이 있는 글은 첫 줄, 글만 있는 글은 두 줄만 보이고 끝에 '... 더 보기' → 누르면 전체
                      const hasMedia = !!post.video_url || !!(post.images && post.images.length > 0);
                      return (
                      <ClampText
                        lines={hasMedia ? 1 : 2}
                        expanded={expandedPosts.has(post.id)}
                        onExpand={() => setExpandedPosts(prev => new Set(prev).add(post.id))}
                        onCollapse={() => setExpandedPosts(prev => { const next = new Set(prev); next.delete(post.id); return next; })}
                        className="text-stone-800 text-[1rem] whitespace-pre-wrap leading-relaxed"
                        prefixText={post.author_name}
                        prefix={
                          /* 글 앞에 굵은 이름: 누르면 그 사람의 공간으로 */
                          <button onClick={e => { e.stopPropagation(); goToProfile(post.user_id); }} className="font-bold text-stone-900 mr-1.5">{post.author_name}</button>
                        }
                        text={post.content || ''}
                        renderText={t => <HashtagText text={t} onTag={openHashtag} onMention={goToHandle} />}
                      />
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
                  <img src={viewingProfile.avatar_url} alt="프로필" className="w-[5.5rem] h-[5.5rem] rounded-full object-cover border border-stone-200" />
                ) : (
                  <div className="w-[5.5rem] h-[5.5rem] bg-stone-200 text-stone-600 rounded-full flex items-center justify-center text-4xl font-serif font-bold">
                    {viewingProfile?.baptismal_name ? viewingProfile.baptismal_name[0] : '교'}
                  </div>
                );
                // 내 프로필: 사진을 누르면 프로필 사진 바꾸기
                return viewingUserId === user?.id ? (
                  <label className="relative cursor-pointer shrink-0" aria-label="프로필 사진 바꾸기">
                    {avatar}
                    <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center border-2 border-white shadow"><Icon name="plus" className="w-4 h-4" /></span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                  </label>
                ) : viewingProfile?.avatar_url ? (
                  <button onClick={() => setAvatarPreview({ url: viewingProfile.avatar_url!, name: viewingProfile.baptismal_name })} className="shrink-0" aria-label="프로필 사진 크게 보기">{avatar}</button>
                ) : <div className="shrink-0">{avatar}</div>;
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

            {/* 버튼: 회색 넓은 단추 */}
            {(() => {
              const btn = 'flex-1 py-2 rounded-lg text-[0.875rem] font-bold bg-stone-100 text-stone-900 hover:bg-stone-200 transition-colors inline-flex items-center justify-center gap-1.5';
              return viewingUserId === user?.id ? (
                <>
                  <div className="mt-3 flex gap-1.5">
                    <button onClick={openProfileEdit} className={btn}>프로필 편집</button>
                    <button onClick={() => goToTab('messages')} className={`${btn} relative`}>
                      메시지
                      {unreadMessageCount > 0 && <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>}
                    </button>
                    <button onClick={() => { setSettingsView('main'); setShowSettings(true); }} className="w-10 shrink-0 rounded-lg bg-stone-100 text-stone-900 hover:bg-stone-200 flex items-center justify-center" aria-label="설정"><Icon name="gear" className="w-5 h-5" /></button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {isAdmin && (
                      <>
                        <button onClick={() => setShowAdminStats(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-sky-200 bg-sky-50 text-sky-900 inline-flex items-center gap-1"><Icon name="chart" className="w-3.5 h-3.5" />접속 통계</button>
                        <button onClick={() => { setNoticeOpenId(null); setNoticeAdminMode(true); setShowNotices(true); }} className="px-3 py-1.5 rounded-full text-xs font-bold border border-violet-200 bg-violet-50 text-violet-900 inline-flex items-center gap-1"><Icon name="megaphone" className="w-3.5 h-3.5" />전체 공지</button>
                        <button onClick={() => setShowSponsorAdmin(true)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-amber-200 bg-amber-50 text-amber-800 inline-flex items-center gap-1"><Icon name="storefront" className="w-3.5 h-3.5" />광고 관리</button>
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
            {([['posts', '게시물', 'stack'], ['videos', '영상', 'film'], ['tagged', '태그됨', 'user']] as const).map(([key, label, icon]) => (
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
                      ? <img src={post.video_poster} alt="영상" className="w-full h-full object-cover" />
                      : <video src={`${post.video_url}#t=0.5`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  ) : post.images && post.images.length > 0 ? (
                    <img src={post.images[0]} alt="사진" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full p-2 text-[0.75rem] text-stone-600 flex items-center justify-center text-center">{post.content}</div>
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
          onOpenProfile={goToProfile}
          onOpenPost={(id, queue) => { const p = posts.find(x => x.id === id); if (p) { openPostViewer(p); setViewerQueue(queue); } }}
          onRequireLogin={() => setShowAuthModal(true)}
        />
      )}

      {/* 익명 고민상담 탭 */}
      {/* 영상(릴스): 영상 글만 화면 가득, 위로 밀면 다음 영상 */}
      {activeTab === 'reels' && (() => {
        const reels = posts.filter(p => p.video_url && !blockedIds.has(p.user_id));
        return (
          <div className="fixed inset-x-0 top-0 max-w-xl mx-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 bg-black">
            <p className="absolute top-0 left-0 z-10 px-4 pt-[calc(0.875rem+env(safe-area-inset-top))] text-white text-xl font-bold drop-shadow pointer-events-none">영상</p>
            {reels.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-white/80 text-center px-6">
                <Icon name="film" className="w-12 h-12" />
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
                        <button onClick={() => toggleCommentBox(post.id)} className={side} aria-label="댓글"><Icon name="chat" className="w-8 h-8" />{commentCounts[post.id] || 0}</button>
                        {user?.id !== post.user_id && (
                          <button onClick={() => openChatRoom({ id: post.user_id, baptismal_name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type })} className={side} aria-label="메시지"><Icon name="send" className="w-7 h-7" /></button>
                        )}
                        {user && <button onClick={() => setPostMenuId(post.id)} className={`${side} text-2xl leading-none`} aria-label="더보기 (고치기·지우기)">⋯</button>}
                      </div>
                      {/* 아래: 작성자·글·음악 */}
                      <div className="absolute left-0 right-14 bottom-0 z-10 px-4 pb-4 pt-16 bg-gradient-to-t from-black/75 via-black/30 to-transparent text-white flex flex-col gap-2">
                        <button onClick={() => goToProfile(post.user_id)} className="self-start flex items-center gap-2">
                          {post.avatar_url
                            ? <img src={post.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-white/70" />
                            : <span className="w-9 h-9 rounded-full bg-white/25 text-white text-sm font-bold flex items-center justify-center">{post.author_name?.[0] || '교'}</span>}
                          <span className="font-bold text-[0.9375rem]">{post.author_name}</span>
                        </button>
                        {post.content && (
                          <button onClick={() => openPostViewer(post)} className="text-left text-[0.9375rem] leading-snug line-clamp-2 whitespace-pre-wrap">{post.content}</button>
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

      {activeTab === 'anon' && (
        <AnonBoard key={anonKey} user={user} isAdmin={isAdmin} profileReady={!needsProfileSetup} onRequireLogin={() => user ? setSetupDismissed(false) : setShowAuthModal(true)} onReport={setReportTarget} />
      )}

      {/* 3. 메시지 목록 탭 */}
      {activeTab === 'messages' && (
        <section className="flex-1 bg-white flex flex-col">
          <div className="p-4 border-b border-stone-200 flex items-center gap-2">
            <button onClick={() => user && goToProfile(user.id)} className="text-stone-600 hover:text-black -ml-1" aria-label="내 공간으로">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="font-bold text-lg text-stone-900">메시지</h2>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
            {chatPartners.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-sm">아직 주고받은 메시지가 없습니다.</div>
            ) : (
              chatPartners.filter(partner => !blockedIds.has(partner.id)).map(partner => (
                <button key={partner.id} onClick={() => openChatRoom(partner)} className="w-full p-4 flex items-center gap-3 hover:bg-stone-50 transition-colors text-left">
                  {partner.avatar_url ? (
                    <img src={partner.avatar_url} alt="프로필" className="w-12 h-12 rounded-full object-cover border border-stone-200" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-serif font-bold text-lg">{partner.baptismal_name[0]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-stone-800 text-sm">{partner.baptismal_name}</h3>
                      <RoleBadge type={partner.badge_type} />
                    </div>
                    <p className={`text-xs mt-0.5 line-clamp-1 ${unreadMessages.some(u => u.partner.id === partner.id) ? 'text-stone-900 font-bold' : 'text-stone-500'}`}>{partner.lastMessage || `@${partner.handle}`}</p>
                  </div>
                  {(() => {
                    const n = unreadMessages.find(u => u.partner.id === partner.id)?.count || 0;
                    return n > 0 ? <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[0.8125rem] font-bold rounded-full flex items-center justify-center shrink-0">{n > 99 ? '99+' : n}</span> : null;
                  })()}
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {/* 4. 1:1 실시간 채팅방 탭 */}
      {activeTab === 'chat' && (
        // 채팅방: 화면 높이에 맞춰 메시지만 스크롤되고 입력창은 항상 맨 아래에 보임
        <section className="flex-1 min-h-0 flex flex-col bg-stone-100">
          <div className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain flex flex-col gap-3">
            {chatMessages.length === 0 ? (
              <div className="text-center text-stone-400 text-xs mt-10">첫 인사를 건네보세요.</div>
            ) : (
              chatMessages.map((msg, i) => {
                const isMe = msg.sender_id === user?.id;
                // 내가 보낸 메시지 중 상대가 읽은 마지막 메시지에만 '읽음' 표시
                const lastReadMineIndex = chatMessages.reduce((last, m, idx) => (m.sender_id === user?.id && m.read_at ? idx : last), -1);
                const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
                return (
                  <div key={msg.id} className={`flex items-end gap-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {isMe && (
                      <div className="flex flex-col items-end text-[0.75rem] leading-tight shrink-0">
                        {!msg.read_at ? (
                          <span className="text-amber-500 font-bold" title="아직 읽지 않음">1</span>
                        ) : i === lastReadMineIndex ? (
                          <span className="text-stone-400">읽음</span>
                        ) : null}
                        <span className="text-stone-400">{time}</span>
                      </div>
                    )}
                    <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-[1rem] ${isMe ? 'bg-blue-500 text-white rounded-br-none' : 'bg-white text-stone-800 border border-stone-200 rounded-bl-none shadow-sm'}`}>
                      {msg.content}
                    </div>
                    {!isMe && <span className="text-[0.75rem] text-stone-400 shrink-0">{time}</span>}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="shrink-0 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white border-t border-stone-200 flex gap-2">
            <input type="text" value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onFocus={() => [150, 450].forEach(ms => setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }), ms))} placeholder="메시지 입력..." className="flex-1 bg-stone-100 border-none rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="submit" disabled={!messageInput.trim()} className="bg-blue-500 text-white w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 hover:bg-blue-600 transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </form>
        </section>
      )}

      {/* 사용자 액션 팝업 메뉴 */}
      {actionModalUser && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={() => setActionModalUser(null)}>
          <div className="bg-white w-full sm:w-80 rounded-t-3xl sm:rounded-3xl overflow-hidden pb-safe" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-stone-100 flex items-center gap-3">
              {actionModalUser.avatar_url ? (
                <img src={actionModalUser.avatar_url} alt="프로필" className="w-12 h-12 rounded-full object-cover border border-stone-200" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-serif font-bold text-lg">{actionModalUser.baptismal_name[0]}</div>
              )}
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-stone-900">{actionModalUser.baptismal_name}</h3>
                  <RoleBadge type={actionModalUser.badge_type} />
                </div>
                <p className="text-xs text-stone-400">@{actionModalUser.handle}</p>
              </div>
            </div>
            <div className="flex flex-col">
              <button onClick={() => goToProfile(actionModalUser.id)} className="w-full p-4 text-sm font-medium text-left hover:bg-stone-50 border-b border-stone-100 transition-colors">
                <Icon name="user" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />프로필(공간) 보러가기
              </button>
              <button onClick={() => { toggleFollow(actionModalUser.id, actionUserFollowStatus); }} className="w-full p-4 text-sm font-medium text-left hover:bg-stone-50 border-b border-stone-100 transition-colors">
                {actionUserFollowStatus === 'none' ? <><Icon name="userPlus" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />팔로우하기</> : <><Icon name="userMinus" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />팔로우 취소</>}
              </button>
              <button onClick={() => openChatRoom(actionModalUser)} className="w-full p-4 text-sm font-medium text-left text-blue-600 hover:bg-blue-50 border-b border-stone-100 transition-colors">
                <Icon name="send" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />개인 메시지(DM) 보내기
              </button>
              <button onClick={() => { const u = actionModalUser; setActionModalUser(null); setReportTarget({ type: 'user', id: u.id, userId: u.id, userName: u.baptismal_name, preview: `${u.baptismal_name} @${u.handle || ''}` }); }} className="w-full p-4 text-sm font-medium text-left text-stone-600 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                <Icon name="siren" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />신고하기
              </button>
              {blockedIds.has(actionModalUser.id) ? (
                <button onClick={() => { unblockUser(actionModalUser.id); setActionModalUser(null); }} className="w-full p-4 text-sm font-medium text-left text-stone-600 hover:bg-stone-50 transition-colors">
                  <Icon name="unlock" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />차단 해제
                </button>
              ) : (
                <button onClick={() => confirmBlock(actionModalUser)} className="w-full p-4 text-sm font-medium text-left text-red-600 hover:bg-red-50 transition-colors">
                  <Icon name="prohibit" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />차단하기
                </button>
              )}
              <button onClick={() => setActionModalUser(null)} className="w-full p-4 text-sm font-bold text-center text-stone-400 hover:bg-stone-50 transition-colors bg-stone-50/50 mt-2">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

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
          onOpenStats={isAdmin ? () => { setShowSettings(false); setShowAdminStats(true); } : undefined} />
      )}

      {/* 오늘의 기도지향 모아 보기 */}
      {showIntentions && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowIntentions(false)}>
          <div className="bg-white w-full sm:w-96 max-h-[85dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-gradient-to-br from-[#101a3f] to-[#1f2f66] text-white flex items-center justify-between">
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
                      <span className="block text-xs text-stone-500 mt-0.5">{i.author_name || '교우'} · {new Date(i.created_at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}</span>
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
                      <div className="flex items-center justify-between">
                        <button onClick={() => { setShowIntentions(false); goToProfile(i.user_id); }} className="text-xs font-bold text-stone-600">👤 {i.author_name || '교우'}님 공간 가기</button>
                        {isAdmin && user?.id !== i.user_id && <button onClick={() => deleteIntention(i.id)} className="text-xs text-red-500">삭제</button>}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 댓글 창: 인스타그램처럼 아래에서 올라옴 */}
      {commentSheetId && (() => {
        const sid = commentSheetId;
        const sheetPost = posts.find(p => p.id === sid) || storyPosts.find(p => p.id === sid);
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
            ? <img src={url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
            : <span className="w-9 h-9 rounded-full bg-stone-200 text-stone-600 text-sm font-serif font-bold flex items-center justify-center shrink-0">{name?.[0] || '교'}</span>;
        };
        return (
          <div className="fixed inset-0 z-[80] bg-black/45 flex items-end justify-center animate-fade-in" onClick={() => setCommentSheetId(null)}>
            <div className="w-full max-w-xl h-[78dvh] bg-[#fdfaf5] rounded-t-3xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} role="dialog" aria-label="댓글">
              <div className="shrink-0 pt-2.5 pb-3 border-b border-[#eadfcb] relative">
                <span className="block mx-auto w-10 h-1.5 rounded-full bg-stone-300" />
                <p className="text-center font-bold text-stone-900 mt-2">댓글</p>
                <button onClick={() => setCommentSheetId(null)} className="absolute right-3 top-3 w-10 h-10 flex items-center justify-center text-stone-500 text-2xl leading-none" aria-label="닫기">×</button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-4">
                {list.length === 0 && (
                  <div className="py-16 text-center">
                    <p className="font-bold text-stone-800 text-lg">아직 댓글이 없어요</p>
                    <p className="text-sm text-stone-500 mt-1">첫 댓글을 남겨 보세요</p>
                  </div>
                )}
                {list.map(c => {
                  const r = commentReactions[c.id] || { pray: 0, like: 0, myPray: false, myLike: false };
                  return (
                    <div key={c.id} id={`comment-${c.id}`} className={`flex gap-3 rounded-xl transition-colors duration-700 ${c._isReply ? 'ml-11' : ''} ${highlightCommentId === c.id ? 'bg-amber-100/80 -mx-2 px-2 py-1.5' : ''}`}>
                      <button onClick={() => { if (c.user_id) { setCommentSheetId(null); goToProfile(c.user_id); } }} className="shrink-0 self-start" aria-label={`${authorName(c)}님 공간`}>{avatarOf(c.user_id, authorName(c))}</button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.8125rem] flex items-center gap-1 flex-wrap">
                          <b className="text-stone-900">{authorName(c)}</b>
                          {c.user_id && <RoleBadge type={badgeByUser[c.user_id] ?? (c.user_id === user?.id ? profile?.badge_type : undefined)} size="xs" showLabel={false} />}
                          <span className="text-stone-400">{timeAgo(c.created_at)}{c.edited_at && ' · 수정됨'}</span>
                        </p>
                        {editingCommentId === c.id ? (
                          <div className="flex flex-col gap-1.5 mt-1">
                            <textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} rows={2} autoFocus className="w-full text-[0.9375rem] border border-stone-300 rounded-lg px-2.5 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
                            <div className="flex justify-end gap-1.5">
                              <button onClick={() => setEditingCommentId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">취소</button>
                              <button onClick={() => saveCommentEdit(c)} disabled={!editCommentText.trim()} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold disabled:opacity-40">저장</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[0.9375rem] text-stone-800 leading-relaxed whitespace-pre-wrap break-words">
                            {c.reply_to_name && <span className="text-blue-600 font-bold mr-1">@{(c.reply_to_user_id && authorByUser[c.reply_to_user_id]?.name) || c.reply_to_name}</span>}
                            <HashtagText text={c.content} onTag={t => { setCommentSheetId(null); openHashtag(t); }} onMention={h => { setCommentSheetId(null); goToHandle(h); }} />
                          </p>
                        )}
                        {editingCommentId !== c.id && (
                          <div className="mt-1 flex items-center gap-3 text-[0.8125rem] font-semibold text-stone-500">
                            {user && c.user_id && <button onClick={() => tagUserInComments(sid, c.user_id!, authorName(c), c._rootId)}>답글 달기</button>}
                            <button onClick={() => toggleCommentReaction(c.id, 'pray')} className={`inline-flex items-center gap-1 ${r.myPray ? 'text-amber-700' : ''}`}><Icon name="pray" fill={r.myPray} className="w-4 h-4" />기도{r.pray > 0 && ` ${r.pray}`}</button>
                            {user && c.user_id === user.id && <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content); }}>수정</button>}
                            {user && (c.user_id === user.id || isAdmin || sheetPost?.user_id === user.id) && <button onClick={() => deleteComment(c)} className="text-red-500">삭제</button>}
                            {user && c.user_id !== user.id && <button onClick={() => setReportTarget({ type: 'comment', id: c.id, userId: c.user_id, userName: c.author_name, preview: c.content })} className="text-stone-400">신고</button>}
                          </div>
                        )}
                      </div>
                      {/* 오른쪽 하트 (공감) */}
                      <button onClick={() => toggleCommentReaction(c.id, 'like')} className="shrink-0 self-start pt-1 w-8 flex flex-col items-center text-[0.75rem] text-stone-500" aria-label={`공감 ${r.like}`}>
                        <Icon name="heart" fill={r.myLike} className={`w-[1.125rem] h-[1.125rem] ${r.myLike ? 'text-rose-500' : 'text-stone-400'}`} />
                        {r.like > 0 && r.like}
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* 입력칸 */}
              <div className="shrink-0 border-t border-[#eadfcb] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-[#fdfaf5] flex flex-col gap-1.5">
                {replyTargets[sid] && (
                  <div className="flex items-center gap-2 text-[0.8125rem] bg-stone-100 text-stone-600 rounded-lg px-3 py-1.5">
                    <span className="flex-1 min-w-0 truncate"><b className="text-stone-800">{replyTargets[sid]!.name}</b>님에게 답글 남기는 중</span>
                    <button onClick={() => setReplyTargets(prev => ({ ...prev, [sid]: null }))} className="text-stone-400 text-lg leading-none px-1" aria-label="답글 취소">×</button>
                  </div>
                )}
                {user && <MentionSuggest value={commentInputs[sid] || ''} onChange={v => setCommentInputs(prev => ({ ...prev, [sid]: v }))} excludeId={user.id} />}
                <div className="flex items-center gap-2">
                  {user && avatarOf(user.id, profile?.baptismal_name)}
                  <input
                    id={`comment-input-${sid}`}
                    type="text"
                    value={commentInputs[sid] || ''}
                    onChange={e => setCommentInputs(prev => ({ ...prev, [sid]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleAddComment(sid)}
                    placeholder={replyTargets[sid] ? `${replyTargets[sid]!.name}님에게 답글...` : sheetPost ? `${sheetPost.author_name}님에게 댓글 남기기...` : '댓글 달기...'}
                    className="flex-1 min-w-0 text-[0.9375rem] border border-stone-300 rounded-full px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
                  />
                  <button onClick={() => handleAddComment(sid)} disabled={!(commentInputs[sid] || '').trim()} className="shrink-0 px-3 py-2 text-[0.9375rem] font-bold text-blue-600 disabled:text-blue-300">게시</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 팝업 공지: 앱에 들어오면 한 번 뜸. 닫기 = 다음에 또, 다시 보지 않기 = 이 공지는 그만 */}
      {showPopupNotice && popupNotice && (
        <div className="fixed inset-0 z-[88] bg-black/55 flex items-center justify-center p-5 animate-fade-in" onClick={() => closePopup(popupNotice.id)}>
          <div className="w-full max-w-sm max-h-[80dvh] bg-[#fdfaf5] rounded-3xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="공지">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2.5 border-b border-[#eadfcb]">
              <IconBadge name="megaphone" tone="gold" />
              <div className="min-w-0">
                <p className="text-[0.75rem] font-bold text-amber-700">공지</p>
                <h2 className="text-[1.0625rem] font-bold text-stone-900 leading-snug">{popupNotice.title}</h2>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <p className="text-[1rem] text-stone-800 whitespace-pre-wrap leading-relaxed">{popupNotice.content}</p>
            </div>
            <div className="flex border-t border-[#eadfcb]">
              <button onClick={() => hideNotice(popupNotice.id)} className="flex-1 py-4 text-[0.9375rem] font-bold text-stone-500 border-r border-[#eadfcb]">다시 보지 않기</button>
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

      {/* 팔로워·팔로잉 목록 */}
      {followList && (
        <div className="fixed inset-0 bg-black/50 z-[75] flex items-end sm:items-center justify-center" onClick={() => setFollowList(null)}>
          <section className="bg-white w-full sm:w-96 h-[75dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-stone-900">{followList.mode === 'followers' ? '팔로워' : '팔로잉'}{followList.items && ` ${followList.items.length}명`}</h2>
              <button onClick={() => setFollowList(null)} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-1" aria-label="닫기">×</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
              {!followList.items && <div className="p-10 text-center text-sm text-stone-400">불러오는 중...</div>}
              {followList.items?.length === 0 && <div className="p-10 text-center text-sm text-stone-400">{followList.mode === 'followers' ? '아직 팔로워가 없어요.' : '아직 팔로우한 사람이 없어요.'}</div>}
              {followList.items?.map(p => (
                <button key={p.id} onClick={() => { setFollowList(null); goToProfile(p.id); }} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-stone-50">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover border border-stone-200" />
                    : <span className="w-11 h-11 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-serif font-bold">{p.baptismal_name?.[0]}</span>}
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-bold text-stone-800 text-sm">{p.baptismal_name}<RoleBadge type={p.badge_type} size="xs" /></span>
                    <span className="block text-xs text-stone-400">@{p.handle}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* 글 고치기: 글·이모티콘, 영상이면 영상 위 글자·이모티콘도 */}
      {editingPostId && !showEditVideoEditor && (() => {
        const target = posts.find(p => p.id === editingPostId);
        if (!target) return null;
        const thumb = target.video_poster || target.images?.[0];
        return (
          <div className="fixed inset-0 bg-black/50 z-[75] flex items-end sm:items-center justify-center" onClick={() => setEditingPostId(null)}>
            <section className="bg-white w-full sm:w-[30rem] max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl flex flex-col gap-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-stone-900">글 고치기</h2>
                <button onClick={() => setEditingPostId(null)} className="text-stone-400 hover:text-stone-700 font-bold text-2xl leading-none px-1" aria-label="닫기">×</button>
              </div>
              {thumb && <img src={thumb} alt="" className="w-20 h-20 rounded-xl object-cover border border-stone-200" />}
              <textarea autoFocus value={editContent} onChange={e => setEditContent(e.target.value)} rows={6} placeholder="내용을 고쳐 주세요" className="w-full p-3.5 text-[1rem] bg-stone-50/70 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
              {user && <MentionSuggest value={editContent} onChange={setEditContent} excludeId={user.id} />}
              {/* 이모티콘 바로 넣기 */}
              <div className="flex flex-wrap gap-1">
                {['🙏', '✝️', '❤️', '😊', '🥰', '🌸', '🕊️', '⛪', '📿', '✨', '🎉', '🌿'].map(e => (
                  <button key={e} type="button" onClick={() => setEditContent(c => c + e)} className="w-10 h-10 rounded-xl bg-stone-100 text-xl">{e}</button>
                ))}
              </div>
              <VisibilityPicker value={editVisibility} onChange={setEditVisibility} />
              {/* 음악 넣기·바꾸기·빼기 */}
              {editMusic ? (
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                  <span className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"><Icon name="music" className="w-[1.125rem] h-[1.125rem]" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-stone-700 truncate">{editMusic.title}</span>
                    {musicRangeLabel(editMusic.value) && <span className="block text-[0.75rem] text-violet-700">{musicRangeLabel(editMusic.value)}</span>}
                  </span>
                  {canAdjustMusic(editMusic.value) && (
                    <button type="button" onClick={() => openMusicSegment('edit', editMusic)} className="text-xs px-2.5 py-1.5 rounded-lg bg-violet-600 text-white font-bold">구간 조절</button>
                  )}
                  <button type="button" onClick={() => { setMusicSegment(null); setMusicPickerFor('edit'); setShowMusicPicker(true); }} className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-200 text-violet-700 font-bold">바꾸기</button>
                  <button type="button" onClick={() => setEditMusic(null)} className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-500">빼기</button>
                </div>
              ) : (
                <button type="button" onClick={() => { setMusicPickerFor('edit'); setShowMusicPicker(true); }} className="self-start inline-flex items-center gap-2 text-sm font-semibold text-violet-800 bg-violet-50 border border-violet-100 px-3.5 py-2.5 rounded-xl">
                  <Icon name="music" className="w-[1.125rem] h-[1.125rem]" />음악 넣기
                </button>
              )}
              {target.video_url && (
                <button type="button" onClick={() => setShowEditVideoEditor(true)} className="self-start inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 bg-stone-100 px-3.5 py-2.5 rounded-xl">
                  <Icon name="film" className="w-[1.125rem] h-[1.125rem]" />영상 위 글자·이모티콘 고치기{hasOverlays(editOverlays) && ' ✓'}
                </button>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingPostId(null)} className="flex-1 py-3 rounded-xl border border-stone-300 text-sm text-stone-600">취소</button>
                <button onClick={() => handleUpdatePost(target.id)} disabled={savingEdit || (!editContent.trim() && !target.images?.length && !target.video_url)} className="flex-1 py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40">{savingEdit ? '저장 중...' : '고치기'}</button>
              </div>
            </section>
          </div>
        );
      })()}
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
        <div className="fixed top-2 left-0 right-0 z-[95] flex justify-center px-3 pointer-events-none">
          <button
            onClick={() => { const a = toast.action; setToast(null); a(); }}
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
      {showInstallGuide && (
        <div className="fixed inset-0 bg-black/60 z-[75] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowInstallGuide(false)}>
          <div className="bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4 pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <img src="/icon-v2-192.png" alt="" className="w-12 h-12 rounded-xl" />
              <div>
                <h2 className="font-bold text-stone-900">{!isIOS && installPrompt ? '가톨릭그램 앱 설치하기' : '홈 화면에 추가하기'}</h2>
                <p className="text-xs text-stone-500">{isIOS ? '홈 화면에 추가해야 휴대폰 알림도 받을 수 있어요' : '앱처럼 아이콘을 눌러 바로 열 수 있어요'}</p>
              </div>
            </div>
            {isIOS ? (
              <ol className="text-sm text-stone-700 flex flex-col gap-2.5 list-decimal pl-5">
                <li><b>Safari</b>로 이 페이지를 열어주세요 (Chrome은 오른쪽 위 공유 버튼)</li>
                <li>화면 아래(또는 위)의 <b>공유 버튼</b> <span className="inline-block border border-stone-300 rounded px-1 text-xs">⬆︎</span> 을 누르세요 (안 보이면 <b>⋯</b> 버튼 → <b>공유</b>)</li>
                <li>목록을 내려 <b>홈 화면에 추가</b>를 누르세요</li>
                <li>오른쪽 위 <b>추가</b>를 누르면 완료!</li>
              </ol>
            ) : (
              <>
                {!installPrompt && (
                  <ol className="text-sm text-stone-700 flex flex-col gap-2.5 list-decimal pl-5">
                    <li><b>Chrome</b>: 오른쪽 위 <b>⋮</b> 메뉴 → <b>홈 화면에 추가</b> 또는 <b>앱 설치</b></li>
                    <li><b>삼성 인터넷</b>: 아래 <b>≡</b> 메뉴 → <b>현재 페이지 추가</b> → <b>홈 화면</b></li>
                  </ol>
                )}
                <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 flex flex-col gap-2">
                  <p className="text-[1.0625rem] font-bold text-red-700">⚠️ 설치 중 경고 창이 뜨면</p>
                  <p className="text-sm text-stone-800 leading-relaxed">
                    &lsquo;Play 프로텍트&rsquo; 등의 경고가 뜰 수 있어요.<br />
                    큰 <b>[확인]</b> 버튼을 누르면 <b className="text-red-700">설치가 취소</b>됩니다.
                  </p>
                  <p className="text-[1.0625rem] font-bold text-stone-900 bg-yellow-200 rounded-lg px-3 py-2 text-center">
                    👉 아래쪽 작은 글씨 <u>무시하고 설치</u>를 눌러주세요
                  </p>
                  <p className="text-xs text-stone-500 text-center">(안 보이면 <b>자세히</b>를 먼저 누르세요)</p>
                </div>
              </>
            )}
            {!isIOS && installPrompt ? (
              <div className="flex gap-2">
                <button onClick={() => setShowInstallGuide(false)} className="px-4 py-3 rounded-xl text-sm font-medium text-stone-500 border border-stone-200">나중에</button>
                <button onClick={startNativeInstall} className="flex-1 bg-stone-900 text-white py-3.5 rounded-xl text-base font-bold">📲 지금 설치하기</button>
              </div>
            ) : (
              <button onClick={() => setShowInstallGuide(false)} className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-bold">확인</button>
            )}
          </div>
        </div>
      )}

      {/* 댓글 알림 목록 */}
      {showNotifications && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowNotifications(false)}>
          <div className="bg-white w-full sm:w-96 max-h-[80dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-bold text-stone-900">알림</h2>
              <div className="flex items-center gap-2">
                <button onClick={clearSeenAlerts} className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 text-stone-600"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />확인한 알림 지우기</button>
                <button onClick={toggleAlertSound} className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 text-stone-600">
                  {alertSoundOn ? <><Icon name="speaker" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />소리 켜짐</> : <><Icon name="mute" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />소리 꺼짐</>}
                </button>
                <button onClick={() => setShowNotifications(false)} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
              </div>
            </div>
            {pushStatus !== 'checking' && pushStatus !== 'unsupported' && (
              <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-3">
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
            <div className="overflow-y-auto divide-y divide-stone-100">
              {isMyFeastToday && !feastCleared && (
                <div className="p-4 bg-amber-50/60">
                  <p className="text-[0.9375rem] text-stone-800">🎉 <b>{profile?.baptismal_name}</b>님, 오늘 축일을 축하드립니다!</p>
                  <p className="text-xs text-stone-600 mt-1">주님의 은총과 주보성인의 전구가 늘 함께하시길 기도합니다 🙏</p>
                </div>
              )}
              {!feastCleared && visibleFeastFriends.map(f => (
                <div key={`feast-${f.id}`} className="p-4 flex items-center gap-3 bg-amber-50/60">
                  <button onClick={() => { setShowNotifications(false); goToProfile(f.id); }} className="flex-1 text-left min-w-0 text-[0.9375rem] text-stone-800">
                    🎉 오늘은 <b>{f.baptismal_name}</b>님의 축일이에요
                  </button>
                  <button onClick={() => congratulateFeast(f)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">축하하기</button>
                </div>
              ))}
              {listedFollows.map(r => (
                <div key={r.id} className={`p-4 flex items-center gap-3 ${r.created_at && notificationsLastSeen && new Date(r.created_at) <= new Date(notificationsLastSeen) ? '' : 'bg-blue-50/40'}`}>
                  <button onClick={() => { setShowNotifications(false); goToProfile(r.follower.id); }} className="flex-1 flex items-center gap-2.5 text-left min-w-0">
                    {r.follower.avatar_url ? (
                      <img src={r.follower.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-stone-200 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold shrink-0">{r.follower.baptismal_name[0]}</div>
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
              {unreadMessages.filter(u => !blockedIds.has(u.partner.id)).map(u => (
                <button key={`msg-${u.partner.id}`} onClick={() => { setShowNotifications(false); openChatRoom(u.partner); }} className="w-full p-4 text-left hover:bg-stone-50 transition-colors flex flex-col gap-1 bg-amber-50/40">
                  <p className="text-[0.9375rem] text-stone-800">
                    <Icon name="envelope" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-violet-600" /><b>{u.partner.baptismal_name}</b>님이 메시지를 보냈습니다 <span className="ml-1 text-[0.75rem] bg-red-500 text-white rounded-full px-1.5 py-px font-bold">{u.count}</span>
                  </p>
                  <p className="text-xs text-stone-600 line-clamp-1">&ldquo;{u.lastMessage}&rdquo;</p>
                  <p className="text-[0.8125rem] text-stone-400">{new Date(u.lastAt).toLocaleString('ko-KR')}</p>
                </button>
              ))}
              {listedComments.length === 0 && listedFollows.length === 0 && unreadMessages.length === 0 && (feastCleared || (visibleFeastFriends.length === 0 && !isMyFeastToday)) ? (
                <div className="p-10 text-center text-stone-400 text-sm">새 알림이 없습니다.</div>
              ) : (
                listedComments.map(n => (
                  <div key={n.id} className="relative">
                  <button onClick={() => hideAlert(`c:${n.id}`)} className="absolute top-3 right-3 z-10 text-stone-300 hover:text-stone-600 text-lg leading-none px-1" aria-label="이 알림 지우기">×</button>
                  <button onClick={() => openNotification(n)} className="w-full p-4 pr-10 text-left hover:bg-stone-50 transition-colors flex flex-col gap-1">
                    <p className="text-[0.9375rem] text-stone-800">
                      {n.mention ? <Icon name="tag" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-amber-600" /> : <Icon name="chat" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1 text-emerald-600" />}<b>{n.author_name}</b>님이 {n.mention === 'post' ? '글에서 회원님을 언급했어요' : n.mention === 'comment' ? '댓글에서 회원님을 언급했어요' : n.is_reply ? '회원님에게 답글을 남겼습니다' : '회원님의 글에 댓글을 남겼습니다'}
                    </p>
                    <p className="text-xs text-stone-600 line-clamp-2">&ldquo;{n.content}&rdquo;</p>
                    <p className="text-[0.8125rem] text-stone-400 truncate">
                      {new Date(n.created_at).toLocaleString('ko-KR')} · {n.post_content || '사진 게시물'}
                    </p>
                  </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 로그인 모달 */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowAuthModal(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-5 border border-stone-200" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <img src="/icon-v2-192.png" alt="" className="w-14 h-14 rounded-2xl shadow-md mx-auto" />
              <h2 className="font-serif font-bold text-xl text-stone-900 mt-2">가톨릭그램</h2>
              <p className="text-xs text-stone-500 mt-1.5">카카오·구글·네이버 계정으로 간편하게 시작하세요</p>
            </div>

            {isKakaoInApp && (
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
                href="/api/auth/naver/start"
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
        <div className="fixed inset-0 z-[80] bg-black flex flex-col animate-fade-in">
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedPostDetail(null)}>
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
                className="pointer-events-none absolute left-4 right-4 mx-auto max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl"
                style={{ ...pos, transition: viewerAnimating ? 'top 0.26s ease-out, bottom 0.26s ease-out' : 'none' }}
              >
                <div className="p-4 flex items-center gap-2.5 border-b border-stone-100">
                  {peek.avatar_url ? <img src={peek.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <span className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold">{peek.author_name?.[0]}</span>}
                  <span className="text-xs font-bold text-stone-800">{peek.author_name}</span>
                </div>
                {thumb ? <div className="bg-black flex justify-center"><img src={thumb} alt="" className="aspect-[4/5] object-cover" style={{ width: 'min(100%, calc(60dvh * 0.8))' }} /></div> : <p className="p-5 text-sm text-stone-700 line-clamp-4">{peek.content}</p>}
              </div>
            );
          })()}
          <div
            ref={viewerCardRef}
            className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85dvh]"
            style={{ transform: `translateY(${viewerDrag}px)`, transition: viewerAnimating ? 'transform 0.26s ease-out' : 'none' }}
            onClick={e => e.stopPropagation()}
            onTouchStart={onViewerTouchStart}
            onTouchMove={onViewerTouchMove}
            onTouchEnd={onViewerTouchEnd}
          >
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <button onClick={() => { const d = selectedPostDetail; setSelectedPostDetail(null); handleAvatarClick({ id: d.user_id, name: d.author_name, avatar_url: d.avatar_url, handle: d.handle, badge_type: d.badge_type }); }} className="flex items-center gap-2.5 text-left">
                {selectedPostDetail.avatar_url ? (
                  <img src={selectedPostDetail.avatar_url} alt="프로필" className="w-8 h-8 rounded-full object-cover border border-stone-200" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">{(selectedPostDetail.author_name || '교')[0]}</div>
                )}
                <div>
                  <span className="text-xs font-bold text-stone-800 inline-flex items-center gap-1">{selectedPostDetail.author_name}<RoleBadge type={selectedPostDetail.badge_type} size="xs" /></span>
                  <span className="text-[0.75rem] text-stone-400 block">@{selectedPostDetail.handle || 'user'}</span>
                </div>
              </button>
              <button onClick={() => setSelectedPostDetail(null)} className="text-stone-400 hover:text-stone-700 p-1 font-bold text-lg">×</button>
            </div>
            
            <div ref={viewerScrollRef} className="overflow-y-auto overscroll-contain flex-1 flex flex-col">
              {selectedPostDetail.video_url && (
                <div className="bg-black" data-viewer-media><VideoViewer src={selectedPostDetail.video_url} poster={selectedPostDetail.video_poster} overlays={selectedPostDetail.video_overlays} onDoubleTap={() => likeByDoubleTap(selectedPostDetail.id)} /></div>
              )}
              {!selectedPostDetail.video_url && selectedPostDetail.images && selectedPostDetail.images.length > 0 && (
                <div className="w-full bg-black flex items-center justify-center relative select-none" data-viewer-media>
                  <img src={selectedPostDetail.images[Math.min(detailImageIndex, selectedPostDetail.images.length - 1)]} alt="게시물 사진" onClick={viewerImageTap} className="aspect-[4/5] object-cover" style={{ width: 'min(100%, calc(60dvh * 0.8))' }} />
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
              <div className="px-5 pb-5 pt-3 flex flex-col gap-2">
                {/* 내 글이면 여기서 공개 범위를 바로 바꿀 수 있음 */}
                {user?.id === selectedPostDetail.user_id && (
                  <div className="mb-1 flex flex-col gap-2">
                    <VisibilityPicker value={selectedPostDetail.visibility || 'public'} onChange={v => changePostVisibility(selectedPostDetail.id, v)} />
                    <div className="flex gap-1.5">
                      <button onClick={() => { const p = posts.find(x => x.id === selectedPostDetail.id) || selectedPostDetail; setSelectedPostDetail(null); startEditPost(p); }} className="flex-1 py-2 rounded-xl border border-stone-300 text-[0.8125rem] font-bold text-stone-700 inline-flex items-center justify-center"><Icon name="pencil" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />글 고치기</button>
                      <button onClick={() => handleDeletePost(selectedPostDetail.id)} className="flex-1 py-2 rounded-xl border border-red-200 text-[0.8125rem] font-bold text-red-600 inline-flex items-center justify-center"><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />지우기</button>
                    </div>
                  </div>
                )}
                {/* 글은 처음엔 두 줄만, 누르면 전체 */}
                <ClampText
                  key={selectedPostDetail.id}
                  lines={2}
                  expanded={viewerTextOpen}
                  onExpand={() => setViewerTextOpen(true)}
                  onCollapse={() => setViewerTextOpen(false)}
                  className="text-stone-800 text-[0.9375rem] whitespace-pre-wrap leading-relaxed"
                  text={selectedPostDetail.content || ''}
                  renderText={t => <HashtagText text={t} onTag={openHashtag} onMention={h => { setSelectedPostDetail(null); goToHandle(h); }} />}
                />
                <span className="text-[0.8125rem] text-stone-400 mt-1">{new Date(selectedPostDetail.created_at).toLocaleString('ko-KR')}</span>

              </div>
            </div>
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
          <img src={avatarPreview.url} alt={`${avatarPreview.name}님 프로필 사진`} className="w-[min(80vw,22rem)] aspect-square rounded-full object-cover shadow-2xl border-4 border-white/20" />
          <p className="text-white text-xl font-bold">{avatarPreview.name}</p>
          <button onClick={() => setAvatarPreview(null)} className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 w-11 h-11 flex items-center justify-center text-white text-3xl leading-none" aria-label="닫기">×</button>
        </div>
      )}

      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} alt="확대 사진" className="max-w-full max-h-[90dvh] object-contain rounded-lg" />
        </div>
      )}

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
                  onChange={(e) => setNicknameInput(e.target.value)}
                  maxLength={20}
                  required
                  className="w-full p-3 text-sm font-medium border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50"
                />
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
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left"><Icon name="candle" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />나의 축일 <span className="font-normal text-stone-400">(선택)</span></label>
                <FeastDayPicker value={feastDayInput} onChange={setFeastDayInput} name={baptismalName} />
                <p className="text-[0.75rem] text-stone-400 mt-1.5 leading-snug">축일에 축하 인사를 받고, 팔로워에게도 알려드려요. 잘 모르시면 비워두고 나중에 ⚙️ 설정에서 입력할 수 있어요.</p>
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

      {/* 게시글 ⋯ 메뉴: 아래에서 올라오는 큰 버튼 */}
      {postMenuId && (() => {
        const post = posts.find(p => p.id === postMenuId);
        if (!post) return null;
        const mine = user?.id === post.user_id;
        const canDelete = mine || isAdmin;
        const item = 'w-full py-4 text-[1rem] font-semibold border-b border-stone-100 last:border-b-0';
        return (
          <div className="fixed inset-0 bg-black/50 z-[75] flex items-end sm:items-center justify-center animate-fade-in" onClick={() => setPostMenuId(null)}>
            <div className="bg-white w-full sm:w-96 rounded-t-3xl sm:rounded-3xl overflow-hidden pb-safe" onClick={e => e.stopPropagation()}>
              <p className="pt-4 pb-2 text-center text-xs text-stone-400">{post.author_name}님의 글</p>
              {mine && <button onClick={() => { setPostMenuId(null); startEditPost(post); }} className={`${item} text-stone-800`}><Icon name="pencil" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />글 고치기 · 공개 범위</button>}
              {canDelete && <button onClick={() => { setPostMenuId(null); handleDeletePost(post.id); }} className={`${item} text-red-600`}><Icon name="trash" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />지우기</button>}
              <button onClick={() => { setPostMenuId(null); openPostViewer(post); }} className={`${item} text-stone-700`}><Icon name="expand" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />크게 보기</button>
              {!mine && <button onClick={() => { setPostMenuId(null); goToProfile(post.user_id); }} className={`${item} text-stone-700`}><Icon name="user" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />{post.author_name}님 공간 가기</button>}
              {user && !mine && <button onClick={() => { setPostMenuId(null); setReportTarget({ type: 'post', id: post.id, userId: post.user_id, userName: post.author_name, preview: post.content }); }} className={`${item} text-red-500`}><Icon name="siren" className="w-[1.1em] h-[1.1em] inline-block align-[-0.2em] mr-1" />신고하기</button>}
              <button onClick={() => setPostMenuId(null)} className="w-full py-4 text-[1rem] font-bold text-stone-500 bg-stone-50">취소</button>
            </div>
          </div>
        );
      })()}

      {/* 맨 위로: 하단 가운데 + 버튼 바로 위 */}
      {showToTop && !fabOpen && activeTab !== 'chat' && activeTab !== 'reels' && (
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
        <nav className={`fixed bottom-0 left-0 right-0 max-w-xl mx-auto border-t flex items-center justify-around z-40 pb-safe ${activeTab === 'reels' ? 'bg-black border-white/10' : 'bg-white border-stone-200'}`}>
          {(() => {
            // 인스타그램처럼: 홈 · 탐색 · 만들기 · 영상 · 내 공간
            const dark = activeTab === 'reels';
            const tone = (on: boolean) => on ? (dark ? 'text-white' : 'text-stone-900') : (dark ? 'text-white/55' : 'text-stone-400');
            const cls = 'flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors';
            const meOn = (activeTab === 'profile' && viewingUserId === user?.id) || activeTab === 'messages';
            return (
              <>
                <button onClick={() => tapTab('home', goToHome)} className={`${cls} ${tone(activeTab === 'home')}`}>
                  <svg viewBox="0 0 24 24" fill={activeTab === 'home' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                  <span className="text-[0.75rem] font-medium">홈</span>
                </button>
                <button onClick={() => tapTab('explore', () => { setExploreQuery(''); goToTab('explore'); })} className={`${cls} ${tone(activeTab === 'explore')}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeTab === 'explore' ? 2.6 : 2} className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" /></svg>
                  <span className="text-[0.75rem] font-medium">탐색</span>
                </button>
                <button onClick={() => { if (!user) { setShowAuthModal(true); return; } if (!requireProfile()) return; if (activeTab !== 'home') goToHome(); setShowComposer(true); }} className={cls} aria-label="새 글 만들기">
                  <span className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center ${dark ? 'border-white text-white' : 'border-stone-800 text-stone-800'}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                  <span className={`text-[0.75rem] font-medium ${dark ? 'text-white' : 'text-stone-800'}`}>만들기</span>
                </button>
                <button onClick={() => goToTab('reels')} className={`${cls} ${tone(activeTab === 'reels')}`}>
                  <Icon name="film" fill={activeTab === 'reels'} className="w-7 h-7" />
                  <span className="text-[0.75rem] font-medium">영상</span>
                </button>
                <button onClick={() => { if (!user) setShowAuthModal(true); else goToProfile(user.id); }} className={`${cls} ${tone(meOn)}`}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" className={`w-7 h-7 rounded-full object-cover ${meOn ? (dark ? 'ring-2 ring-white' : 'ring-2 ring-stone-900') : ''}`} />
                    : <svg viewBox="0 0 24 24" fill={meOn ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
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