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
import MusicPicker, { type SelectedMusic } from '@/components/MusicPicker';
import BgmAdmin from '@/components/BgmAdmin';
import PostPhotos from '@/components/PostPhotos';
import YouTubePlayer from '@/components/YouTubePlayer';
import PostVideo, { VideoViewer } from '@/components/PostVideo';
import HeartBurst from '@/components/HeartBurst';
import { useDoubleTap } from '@/lib/double-tap';
import VideoEditor, { OverlayLayer, hasOverlays, type VideoOverlays } from '@/components/VideoOverlays';
import { MAX_VIDEO_MB, MAX_VIDEO_SECONDS, getVideoInfo, makeVideoPoster, shrinkVideo } from '@/lib/video';
import { type BgmTrack, parsePostMusic } from '@/lib/music';
import SponsorBanner from '@/components/SponsorBanner';
import SponsorAdmin from '@/components/SponsorAdmin';
import { FEED_BANNER_EVERY, type SponsorBannerData } from '@/lib/sponsor';
import FeastDayPicker from '@/components/FeastDayPicker';
import Icon from '@/components/Icon';
import ClampText from '@/components/ClampText';
import AdminStats from '@/components/AdminStats';
import MeditationAdmin from '@/components/MeditationAdmin';
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
  return post || chat || alerts || feedback || notice || reports ? { post, chat, alerts, feedback, notice, reports } : null;
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

interface Comment { id: string; post_id: string; content: string; author_name: string; created_at: string; user_id?: string; reply_to_user_id?: string | null; reply_to_name?: string | null; edited_at?: string | null; }
// 안드로이드 크롬 등에서 '앱 설치' 창을 띄우기 위한 이벤트 (표준 타입에 없음)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type FollowStatus = 'none' | 'pending' | 'accepted';
type Tab = 'home' | 'explore' | 'profile' | 'messages' | 'chat' | 'anon';
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
const VISIBILITY: Record<Visibility, { icon: string; label: string; hint: string }> = {
  public: { icon: '🌍', label: '전체 공개', hint: '모든 교우가 볼 수 있어요' },
  followers: { icon: '👥', label: '팔로워만', hint: '나를 팔로우하는 교우만 볼 수 있어요' },
  private: { icon: '🔒', label: '나만 보기', hint: '나만 볼 수 있어요' },
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
            {VISIBILITY[v].icon} {VISIBILITY[v].label}
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
  
  const [openComments, setOpenComments] = useState<{ [key: string]: boolean }>({});
  const [comments, setComments] = useState<{ [key: string]: Comment[] }>({});
  const [badgeByUser, setBadgeByUser] = useState<{ [userId: string]: string | null }>({});
  // 댓글 쓴 사람의 '현재' 닉네임과 핸들 (댓글에 저장된 이름이 예전 것이어도 최신으로 보여줌)
  const [authorByUser, setAuthorByUser] = useState<{ [userId: string]: { name: string; handle?: string } }>({});
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
  const [deepLink, setDeepLink] = useState<{ post?: string; chat?: string; alerts?: boolean; feedback?: boolean; notice?: string; reports?: boolean } | null>(null);
  const [feedbackView, setFeedbackView] = useState<'reports' | null>(null); // 신고 알림으로 열면 신고 목록부터
  // 공지사항
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showNotices, setShowNotices] = useState(false);
  const [noticeOpenId, setNoticeOpenId] = useState<string | null>(null);
  const [hiddenNotices, setHiddenNotices] = useState<string[]>([]);
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
  // 오늘의 기도지향 (한국 시간 기준 오늘 것만)
  const [intentions, setIntentions] = useState<{ id: string; user_id: string; author_name: string | null; title?: string | null; content: string; created_at: string }[]>([]);
  const [showIntentions, setShowIntentions] = useState(false);
  const [intentionTitleInput, setIntentionTitleInput] = useState(''); // 기도지향 (30자)
  const [intentionInput, setIntentionInput] = useState('');            // 기도 내용 (100자)
  const [intentionEditing, setIntentionEditing] = useState(false);
  const [intentionSaving, setIntentionSaving] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [replyTargets, setReplyTargets] = useState<Record<string, { userId: string; name: string } | null>>({});
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
  const [bgmTracks, setBgmTracks] = useState<BgmTrack[]>([]);
  const [composerMusic, setComposerMusic] = useState<SelectedMusic | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [showBgmAdmin, setShowBgmAdmin] = useState(false);
  const [bgmPlaying, setBgmPlaying] = useState(false);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set()); // 사진·영상 글: 펼쳐 본 글
  const [feedFilter, setFeedFilter] = useState<'all' | 'media' | 'text'>('media'); // 홈 피드: 기본은 사진·영상 (전체 / 글로 바꿀 수 있음)
  const [showComposer, setShowComposer] = useState(false); // 글쓰기 창 (+ 버튼으로 열기)
  const [fabOpen, setFabOpen] = useState(false); // + 버튼 메뉴 펼침
  const [showAdminStats, setShowAdminStats] = useState(false); // 관리자: 접속 통계
  const [showMeditationAdmin, setShowMeditationAdmin] = useState(false); // 관리자: 오늘의 묵상 자동 올리기
  // 접속 통계 기록 (앱 열기·나가기)
  useEffect(() => startVisitTracking(), []);
  const [typing, setTyping] = useState(false); // 댓글 등 입력 중이면 + 버튼을 숨겨 '등록' 버튼을 가리지 않게
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const onIn = (e: FocusEvent) => { if (isField(e.target)) setTyping(true); };
    const onOut = (e: FocusEvent) => { if (isField(e.target)) setTyping(false); };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, []);
  const [myPostReactions, setMyPostReactions] = useState<Set<string>>(new Set()); // 내가 누른 기도·공감 ('글id:pray')
  const [editContent, setEditContent] = useState('');
  const [editOverlays, setEditOverlays] = useState<VideoOverlays | null>(null); // 영상 글 고치기: 글자·이모티콘
  const [showEditVideoEditor, setShowEditVideoEditor] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editVisibility, setEditVisibility] = useState<Visibility>('public');

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [exploreQuery, setExploreQuery] = useState('');
  const currentScreenRef = useRef<ScreenState>({ screen: true, tab: 'home' });
  const backHandlerRef = useRef<(e: PopStateEvent) => void>(() => {});
  const exitArmedAtRef = useRef(0);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [viewingBio, setViewingBio] = useState(''); // 내 공간 한 줄 소개
  const [bioDraft, setBioDraft] = useState<string | null>(null); // 소개 고치는 중이면 글자
  const [profileTab, setProfileTab] = useState<'posts' | 'tagged'>('posts');
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
        const link = deepLinkFromSearch(new URL(e.data.url, window.location.origin).search);
        if (link) setDeepLink(link); else goToHome();
      });
    }

    // 알림음: 설정 불러오기, 첫 터치 때 오디오 활성화
    sessionStartRef.current = Date.now();
    setAlertSoundOn(storageGet('alertSound') !== 'off');
    const unlock = () => unlockAlertSound();
    window.addEventListener('pointerdown', unlock, { once: true });

    const initialLink = deepLinkFromSearch(window.location.search);
    if (initialLink) {
      setDeepLink(initialLink);
      window.history.replaceState(null, '', '/');
    }

    const savedTab = storageGet('activeTab') as Tab | null;
    const savedUserId = storageGet('viewingUserId');
    const savedChatUserId = storageGet('chatUserId');

    // 이동 기록 쌓기: [종료 확인용 표시] → 홈 → (마지막으로 보던 화면)
    // 그래서 뒤로가기를 하면 앱이 바로 꺼지지 않고 이전 화면 → 홈 → '한 번 더 누르면 종료' 순서가 된다
    const stack: ScreenState[] = [{ screen: true, tab: 'home' }];
    if (savedTab === 'chat' || savedTab === 'messages') stack.push({ screen: true, tab: 'messages' });
    else if (savedTab === 'profile' && savedUserId) stack.push({ screen: true, tab: 'profile', viewingUserId: savedUserId });
    else if (savedTab === 'anon') stack.push({ screen: true, tab: 'anon' });
    else if (savedTab === 'explore') stack.push({ screen: true, tab: 'explore' });
    applyScreen(stack[stack.length - 1]);
    // Next.js 라우터가 첫 이동 기록에 자기 표시를 남긴 뒤에 기록을 쌓아야
    // 뒤로가기 때 Next.js 가 페이지를 새로고침하지 않는다 → 한 박자 뒤에 실행
    const historyTimer = setTimeout(() => {
      window.history.replaceState({ guard: true }, '');
      stack.forEach(st => window.history.pushState(st, ''));
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
    const savedFilter = storageGet('feedFilter2');
    if (savedFilter === 'all' || savedFilter === 'text') setFeedFilter(savedFilter);
    const intentionTimer = setInterval(fetchIntentions, 60 * 1000);

    // 앱을 닫았다가(다른 앱으로 갔다가) 다시 열면: 새 버전이면 새로고침, 아니면 글·기도지향·공지를 새로 불러오기
    let hiddenAt = 0;
    const onAppResume = async () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < 15 * 1000) return; // 아주 잠깐이면 그대로
      hiddenAt = 0;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await res.json();
        if (version && version !== 'dev' && version !== process.env.NEXT_PUBLIC_APP_VERSION) {
          window.location.reload();
          return;
        }
      } catch { /* 인터넷이 잠깐 끊겨도 아래는 진행 */ }
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
    if (same) window.history.replaceState(st, '');
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
    const { data: postsData } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (!postsData) return;
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

  const fetchNotices = async () => {
    const { data } = await supabase.from('announcements').select('id, title, content, pinned, pushed_at, created_at')
      .order('created_at', { ascending: false }).limit(50);
    setNotices((data || []) as Notice[]);
  };
  const hideNotice = (id: string) => {
    const next = [...hiddenNotices, id].slice(-100);
    setHiddenNotices(next);
    storageSet('noticeHidden', JSON.stringify(next));
  };
  const homeNotice = notices.find(n => n.pinned && !hiddenNotices.includes(n.id));

  const fetchIntentions = async () => {
    const query = (cols: string) => supabase.from('prayer_intentions').select(cols)
      .eq('prayer_date', todayKst()).order('created_at', { ascending: true }).limit(300);
    let { data, error } = await query('id, user_id, author_name, title, content, created_at');
    // title 칼럼이 아직 없으면(SQL 실행 전) 예전 칼럼만
    if (error) ({ data } = await query('id, user_id, author_name, content, created_at'));
    setIntentions((data || []) as unknown as typeof intentions);
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
    setBgmTracks((data || []) as BgmTrack[]);
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
      audio.src = track.url;
      audio.loop = true;
      audio.play().then(() => setBgmPlaying(true)).catch(() => setBgmPlaying(false));
    }
  };

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
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) return;
    const target = posts.find(p => p.id === postId);
    setPosts(posts.filter(p => p.id !== postId));
    await supabase.from('posts').delete().eq('id', postId);
    const videoPath = target?.video_url?.split('/post-videos/')[1];
    if (videoPath) await supabase.storage.from('post-videos').remove([decodeURIComponent(videoPath)]);
  };
  const startEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setEditContent(post.content || '');
    setEditOverlays(post.video_overlays || null);
    setEditVisibility(post.visibility || 'public');
  };
  // 공개 범위만 바로 바꾸기 (크게 보기·내 공간에서)
  const changePostVisibility = async (postId: string, visibility: Visibility) => {
    const { error } = await supabase.from('posts').update({ visibility }).eq('id', postId);
    if (error) { alert(/visibility/.test(error.message) ? VISIBILITY_SQL_HINT : '공개 범위를 바꾸지 못했어요.'); return; }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, visibility } : p));
    setSelectedPostDetail(prev => prev && prev.id === postId ? { ...prev, visibility } : prev);
  };
  const handleUpdatePost = async (postId: string) => {
    const target = posts.find(p => p.id === postId);
    if (!target) return;
    const changes: Partial<Post> = { content: editContent.trim() };
    if (target.video_url) changes.video_overlays = hasOverlays(editOverlays) ? editOverlays : null;
    if (editVisibility !== (target.visibility || 'public')) changes.visibility = editVisibility;
    setSavingEdit(true);
    const { error } = await supabase.from('posts').update(changes).eq('id', postId);
    setSavingEdit(false);
    if (error) { alert(/visibility/.test(error.message) ? VISIBILITY_SQL_HINT : `고치지 못했어요. 잠시 후 다시 해 주세요.\n(${error.message})`); return; }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...changes } : p));
    setEditingPostId(null);
  };
  // 사진·영상을 두 번 누르면 공감 (이미 공감했으면 그대로 두기)
  const likeByDoubleTap = (postId: string) => handleReaction(postId, 'like', true);

  const handleReaction = async (postId: string, type: 'pray' | 'like', onlyAdd = false) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    if (!posts.some((p) => p.id === postId)) return;
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
    const { data } = await supabase.from('profiles').select('id, badge_type, baptismal_name, handle').in('id', ids);
    if (!data) return;
    setBadgeByUser(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, p.badge_type])) }));
    setAuthorByUser(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, { name: p.baptismal_name, handle: p.handle || undefined }])) }));
  };

  // 홈에서 해당 글로 이동해 댓글을 펼친다
  const openPostComments = async (postId: string) => {
    goToHome();
    setOpenComments(prev => ({ ...prev, [postId]: true }));
    await loadCommentsFor(postId);
    setTimeout(() => document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const openNotification = (n: CommentNotification) => {
    setShowNotifications(false);
    openPostComments(n.post_id);
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
      if (isNew(`f:${r.id}`, r.created_at)) fresh.push({ key: `f:${r.id}`, icon: '👤', title: '새 팔로워', body: `${r.follower.baptismal_name}님이 회원님을 팔로우하기 시작했어요`, action: () => openNotifications() });
    });
    unreadMessages.forEach(u => {
      const chattingNow = activeTab === 'chat' && currentChatUser?.id === u.partner.id;
      if (isNew(`m:${u.partner.id}:${u.lastAt}`, u.lastAt) && !chattingNow) fresh.push({ key: `m:${u.partner.id}`, icon: '✉️', title: `${u.partner.baptismal_name}님의 메시지`, body: u.lastMessage, action: () => openChatRoom(u.partner) });
    });
    notifications.forEach(n => {
      if (isNew(`c:${n.id}`, n.created_at)) fresh.push({ key: `c:${n.id}`, icon: n.mention ? '🏷️' : '💬', title: n.mention ? '회원님이 언급되었어요' : n.is_reply ? '새 답글' : '새 댓글', body: `${n.author_name}님: ${n.content}`, action: () => openPostComments(n.post_id) });
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
    if (deepLink?.notice) { setNoticeOpenId(deepLink.notice); setShowNotices(true); setDeepLink(null); return; }
    if (!deepLink || !user) return;
    setDeepLink(null);
    if (deepLink.post) {
      openPostComments(deepLink.post);
    } else if (deepLink.chat) {
      supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', deepLink.chat).single()
        .then(({ data }) => { if (data) openChatRoom(data); });
    } else if (deepLink.alerts) {
      openNotifications();
    } else if (deepLink.feedback) {
      setFeedbackView(null);
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
    const counts: Record<string, number> = {};
    (data || []).forEach(c => { counts[c.post_id] = (counts[c.post_id] || 0) + 1; });
    setCommentCounts(counts);
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

  const toggleCommentBox = async (postId: string) => {
    const nextState = !openComments[postId];
    setOpenComments({ ...openComments, [postId]: nextState });
    if (nextState && !comments[postId]) await loadCommentsFor(postId);
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
  const tagUserInComments = async (postId: string, targetUserId: string, name: string) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    if (targetUserId !== user.id) setReplyTargets(prev => ({ ...prev, [postId]: { userId: targetUserId, name } }));
    if (!openComments[postId]) await toggleCommentBox(postId);
    setTimeout(() => {
      const input = document.getElementById(`comment-input-${postId}`) as HTMLInputElement | null;
      input?.focus();
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  const handleAddComment = async (postId: string) => {
    if (!user) { setShowAuthModal(true); return; }
    if (!requireProfile()) return;
    const text = commentInputs[postId];
    if (!text || !text.trim()) return;
    const author = profile?.baptismal_name || '교우';
    const target = replyTargets[postId];
    const row = { post_id: postId, content: text.trim(), user_id: user.id, author_name: author };
    let { data, error } = await supabase.from('comments')
      .insert([target ? { ...row, reply_to_user_id: target.userId, reply_to_name: target.name } : row]).select();
    // 답글 칼럼이 아직 없으면(SQL 실행 전) 내용 앞에 @이름을 붙여 저장
    if (error && target && (error.code === 'PGRST204' || error.code === '42703')) {
      ({ data, error } = await supabase.from('comments').insert([{ ...row, content: `@${target.name} ${row.content}` }]).select());
    }
    if (!error && data) {
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
  const anyModalOpen = !!(actionModalUser || showAuthModal || avatarFile || selectedPostDetail || selectedImage
    || showNotifications || showSettings || showFeedback || reportTarget || showInstallGuide || showSponsorAdmin || showPushPrompt || showAdminMembers || showMusicPicker || showBgmAdmin || (profileEditMode && !needsProfileSetup) || showIntentions || showVideoEditor || showNotices || showComposer || !!editingPostId || !!followList || showAdminStats || showMeditationAdmin);
  const closeAllModals = () => {
    setActionModalUser(null); setShowAuthModal(false); setAvatarFile(null); setSelectedPostDetail(null); setSelectedImage(null);
    setShowNotifications(false); setShowSettings(false); setShowFeedback(false); setReportTarget(null);
    setShowInstallGuide(false); setShowSponsorAdmin(false); setShowPushPrompt(false); setShowAdminMembers(false);
    setShowMusicPicker(false); setShowBgmAdmin(false); setProfileEditMode(false); setShowIntentions(false); setShowVideoEditor(false); setShowNotices(false);
    // 음악·영상 꾸미기 창이 위에 열려 있으면 그것만 닫고 글쓰기 창은 둔다
    if (!showMusicPicker && !showVideoEditor) setShowComposer(false);
    if (showEditVideoEditor) setShowEditVideoEditor(false); else setEditingPostId(null);
    setFollowList(null);
    setShowAdminStats(false);
    setShowMeditationAdmin(false);
  };
  backHandlerRef.current = (e: PopStateEvent) => {
    const st = e.state as ScreenState | { guard: true } | null;
    if (anyModalOpen) {
      closeAllModals();
      window.history.pushState(currentScreenRef.current, ''); // 화면은 그대로 유지
      return;
    }
    if (st && 'guard' in st) {
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
  const reactionButtons = (post: Post, onComment: () => void) => (
    <>
      {(() => {
        const prayed = myPostReactions.has(`${post.id}:pray`);
        const liked = myPostReactions.has(`${post.id}:like`);
        return (
          <>
            {/* 글자 없이 그림만. 누르면 손·하트가 진한 색으로 꽉 채워짐 */}
            <button onClick={() => handleReaction(post.id, 'pray')} aria-pressed={prayed} aria-label={`기도 ${post.pray_count || 0}`} className={`flex items-center gap-1.5 ${prayed ? 'text-amber-900 font-bold' : 'text-stone-600'}`}>
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors ${prayed ? 'bg-amber-100 text-amber-700' : 'bg-amber-50 text-amber-700'}`}><Icon name="pray" fill={prayed} className="w-[1.375rem] h-[1.375rem]" /></span>
              {post.pray_count > 0 && post.pray_count}
            </button>
            <button onClick={() => handleReaction(post.id, 'like')} aria-pressed={liked} aria-label={`공감 ${post.like_count || 0}`} className={`flex items-center gap-1.5 ${liked ? 'text-rose-700 font-bold' : 'text-stone-600'}`}>
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors ${liked ? 'bg-rose-100 text-rose-600' : 'bg-rose-50 text-rose-600'}`}><Icon name="heart" fill={liked} className="w-[1.375rem] h-[1.375rem]" /></span>
              {post.like_count > 0 && post.like_count}
            </button>
          </>
        );
      })()}
      <button onClick={onComment} aria-label={`댓글 ${commentCounts[post.id] || 0}`} className="flex items-center gap-1.5 text-stone-600">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sky-50 text-sky-800"><Icon name="chat" className="w-[1.375rem] h-[1.375rem]" /></span>
        {commentCounts[post.id] ? commentCounts[post.id] : null}
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
    <main className={`w-full max-w-xl mx-auto sm:border-x border-stone-200 bg-stone-50/30 flex flex-col font-sans relative ${activeTab === 'chat' ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh] pb-[calc(4.5rem+env(safe-area-inset-bottom))]'}`}>
      
      {/* 헤더 */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-stone-200 px-3 sm:px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between gap-2 z-20">
        {activeTab === 'chat' ? (
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button onClick={() => window.history.back()} className="text-stone-600 hover:text-black" aria-label="뒤로">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {currentChatUser?.avatar_url ? (
                <img src={currentChatUser.avatar_url} alt="프로필" className="w-8 h-8 rounded-full object-cover border border-stone-200 shrink-0" />
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
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <button onClick={openNotifications} className="relative text-stone-600 hover:text-stone-900" aria-label="알림">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                  </button>
                  <button onClick={() => goToProfile(user.id)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity min-w-0">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="내 프로필" className="w-7 h-7 rounded-full object-cover border border-stone-200" />
                    ) : (
                      <div className="w-7 h-7 bg-stone-200 rounded-full flex items-center justify-center text-[0.75rem] font-bold text-stone-600">{profile?.baptismal_name?.[0] || '교'}</div>
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
          {user && needsProfileSetup && setupDismissed && (
            <button onClick={() => setSetupDismissed(false)} className="w-full px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-left">
              <span className="text-lg">👀</span>
              <span className="flex-1 text-xs text-stone-700 leading-snug"><b>둘러보는 중이에요.</b> 프로필을 만들면 글·댓글·기도지향을 쓸 수 있어요.</span>
              <span className="text-xs font-bold bg-stone-900 text-white rounded-lg px-3 py-1.5 shrink-0">만들기</span>
            </button>
          )}
          {/* 관리자 공지 (홈 맨 위) */}
          {homeNotice && (
            <div className="flex items-center bg-amber-50 border-b border-amber-200">
              <button onClick={() => { setNoticeOpenId(homeNotice.id); setShowNotices(true); }} className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left">
                <span className="shrink-0 text-xs font-bold text-white bg-amber-600 rounded-full px-2 py-0.5">📢 공지</span>
                <span className="text-sm font-bold text-stone-800 truncate">{homeNotice.title}</span>
              </button>
              <button onClick={() => hideNotice(homeNotice.id)} className="shrink-0 flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-stone-800 px-3 py-2.5" aria-label="공지 다시 안 보기">다시 안 보기 <span className="text-lg leading-none">×</span></button>
            </div>
          )}
          {/* 오늘의 기도지향: 한 줄로 계속 흘러감, 누르면 모아 보기 */}
          {visibleIntentions.length > 0 ? (
            <button onClick={() => setShowIntentions(true)} className="w-full flex items-center bg-gradient-to-r from-[#101a3f] to-[#1f2f66] text-[#fbe7b0] border-b border-[#c99330]/40 overflow-hidden" aria-label="오늘의 기도지향 모아 보기">
              <span className="shrink-0 pl-3 pr-2 py-2 text-xs font-bold bg-[#101a3f] z-10 shadow-[6px_0_8px_-4px_#101a3f]">🙏 오늘의 기도</span>
              <span className="flex-1 overflow-hidden whitespace-nowrap py-2">
                <span className="inline-block intention-marquee" style={{ ['--marquee-duration' as string]: `${Math.max(18, visibleIntentions.reduce((n, i) => n + (i.title || i.content).length + (i.author_name || '').length, 0) * 0.4)}s` }}>
                  {[0, 1].map(copy => (
                    <span key={copy} className="pr-8">
                      {visibleIntentions.map(i => (
                        <span key={`${copy}-${i.id}`} className="mr-8 text-[0.875rem]">
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
                  <p className="text-2xl">🎉🕯️</p>
                  <p className="font-serif font-bold text-stone-900 mt-1">{profile?.baptismal_name}님, 축일을 축하드립니다!</p>
                  <p className="text-sm text-stone-600 mt-1 leading-relaxed">주님의 은총과 주보성인의 전구가<br />늘 함께하시길 기도합니다 🙏</p>
                </div>
              )}
              {visibleFeastFriends.length > 0 && (
                <div className={`flex flex-col gap-2 ${isMyFeastToday ? 'mt-3 pt-3 border-t border-amber-200' : ''}`}>
                  <p className="text-sm font-bold text-stone-800 pr-4">🎉 오늘 축일인 교우</p>
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
              <span className="text-xl">🕯️</span>
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
                  <span className="text-sm">🎵</span>
                  <span className="flex-1 min-w-0 text-xs font-bold text-stone-700 truncate">{composerMusic.title}</span>
                  {(() => { const m = parsePostMusic(composerMusic.value); return m?.kind === 'youtube' && m.clip ? <span className="text-[0.75rem] text-violet-700 shrink-0">{`${Math.floor(m.start / 60)}:${String(m.start % 60).padStart(2, '0')}부터 ${m.clip}초`}</span> : null; })()}
                  <button type="button" onClick={() => setComposerMusic(null)} className="text-stone-400 hover:text-stone-700 text-base leading-none px-1" aria-label="음악 빼기">×</button>
                </div>
              )}
              {videoStatus && <p className="text-xs text-violet-700 font-bold">🎬 {videoStatus}</p>}
              {videoPreviewUrl && (
                <div className="flex items-end gap-2">
                <div className="relative w-32 rounded-xl overflow-hidden shadow-sm bg-black [container-type:inline-size]">
                  <video src={videoPreviewUrl} muted playsInline loop autoPlay className="w-full aspect-[4/5] object-cover" />
                  <OverlayLayer overlays={composerOverlays} />
                  <span className="absolute bottom-1 left-1 text-[0.6875rem] text-white bg-black/50 rounded px-1">🎬 숏폼</span>
                  <button type="button" onClick={clearVideo} className="absolute top-1 right-1 bg-black/60 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">×</button>
                </div>
                <button type="button" onClick={() => setShowVideoEditor(true)} className="text-xs font-bold px-3 py-2 rounded-xl bg-violet-50 text-violet-800 border border-violet-100">✨ 꾸미기</button>
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

          {/* + 버튼: 누르면 글쓰기와 보기(사진·영상 / 전체 / 글) 버튼이 사르륵 펼쳐짐 */}
          {!showComposer && !typing && (
            <>
              {fabOpen && <button className="fixed inset-0 z-30 bg-black/20 animate-fade-in" onClick={() => setFabOpen(false)} aria-label="닫기" />}
              <div className="fixed z-30 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50vw-18rem+1rem))] flex flex-col items-end gap-2.5">
                {([
                  { key: 'write', label: '글쓰기', icon: 'pencil' },
                  { key: 'media', label: '사진·영상 보기', icon: 'camera' },
                  { key: 'all', label: '전체 보기', icon: null },
                  { key: 'text', label: '글만 보기', icon: 'chat' },
                ] as const).map((item, i, arr) => {
                  const active = item.key !== 'write' && feedFilter === item.key;
                  return (
                    <button
                      key={item.key}
                      tabIndex={fabOpen ? 0 : -1}
                      aria-hidden={!fabOpen}
                      onClick={() => {
                        setFabOpen(false);
                        if (item.key === 'write') { if (requireProfile()) setShowComposer(true); return; }
                        setFeedFilter(item.key); storageSet('feedFilter2', item.key);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      style={{ transitionDelay: fabOpen ? `${(arr.length - 1 - i) * 45}ms` : '0ms' }}
                      className={`flex items-center gap-2.5 transition-all duration-300 ease-out ${fabOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-90 pointer-events-none'}`}
                    >
                      <span className={`px-3 py-1.5 rounded-full text-sm font-bold shadow-md ${active ? 'bg-stone-900 text-white' : 'bg-white text-stone-800'}`}>{item.label}{active && ' ✓'}</span>
                      <span className={`w-12 h-12 rounded-full shadow-md flex items-center justify-center ${item.key === 'write' ? 'bg-amber-600 text-white' : active ? 'bg-stone-900 text-white' : 'bg-white text-stone-700'}`}>
                        {item.icon ? <Icon name={item.icon} className="w-[1.375rem] h-[1.375rem]" /> : <span className="text-lg leading-none">☰</span>}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => setFabOpen(o => !o)}
                  className="w-14 h-14 rounded-full bg-stone-900 text-white shadow-lg shadow-stone-900/30 flex items-center justify-center active:scale-95 transition-transform"
                  aria-label={fabOpen ? '닫기' : '글쓰기·보기 메뉴 열기'}
                  aria-expanded={fabOpen}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`w-7 h-7 transition-transform duration-300 ${fabOpen ? 'rotate-45' : ''}`}><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
            </>
          )}

          <section className="divide-y divide-stone-200/70 flex-1">
            {(() => {
              const hasMedia = (p: Post) => !!p.video_url || !!(p.images && p.images.length > 0);
              const shown = posts.filter(post => !blockedIds.has(post.user_id)
                && (feedFilter === 'all' || (feedFilter === 'media' ? hasMedia(post) : !hasMedia(post))));
              if (shown.length === 0 && posts.length > 0) {
                return <div className="py-16 text-center text-sm text-stone-400">{feedFilter === 'media' ? '아직 사진·영상 글이 없어요.' : '아직 글만 쓴 나눔이 없어요.'}</div>;
              }
              return shown.map((post, postIndex) => {
              const canDelete = user?.id === post.user_id || (user?.email && ADMIN_EMAILS.includes(user.email));
              // 게시글 FEED_BANNER_EVERY 개마다 후원 배너를 번갈아 끼움
              const slot = (postIndex + 1) % FEED_BANNER_EVERY === 0 ? (postIndex + 1) / FEED_BANNER_EVERY - 1 : -1;
              const inlineBanner = slot >= 0 && feedBanners.length > 0 ? feedBanners[slot % feedBanners.length] : null;
              return (
                <Fragment key={post.id}>
                <article id={`post-${post.id}`} className="bg-white flex flex-col gap-3 pb-4 sm:pb-5">
                  {/* 사진이 먼저, 크게 (여러 장이면 옆으로 넘김) — 사진을 누르면 작성자·음악과 함께 크게 보기 */}
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
                      onMusic={parsePostMusic(post.music) ? () => openPostViewer(post) : undefined}
                    />
                  )}

                  <div className="px-4 sm:px-5 flex flex-col gap-3">
                    {!(post.images && post.images.length > 0) && !post.video_url && <div className="pt-4 sm:pt-5" />}
                    {(() => {
                      // 사진·영상이 있는 글은 첫 줄, 글만 있는 글은 두 줄만 보이고 끝에 '... 더 보기' → 누르면 전체
                      const hasMedia = !!post.video_url || !!(post.images && post.images.length > 0);
                      return (
                      <ClampText
                        lines={hasMedia ? 1 : 2}
                        expanded={expandedPosts.has(post.id)}
                        onExpand={() => setExpandedPosts(prev => new Set(prev).add(post.id))}
                        className="text-stone-800 text-[1rem] whitespace-pre-wrap leading-relaxed"
                        prefixText={`\u3000\u3000${post.author_name}`}
                        prefix={
                          /* 프로필 사진·닉네임을 누르면 그 사람의 공간으로 */
                          <button onClick={e => { e.stopPropagation(); goToProfile(post.user_id); }} className="font-bold text-stone-900 mr-1.5 inline-flex items-center gap-1.5 align-bottom">
                            {post.avatar_url
                              ? <img src={post.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-stone-200 shrink-0" />
                              : <span className="w-7 h-7 rounded-full bg-stone-200 text-stone-600 text-xs font-serif font-bold flex items-center justify-center shrink-0">{post.author_name?.[0] || '교'}</span>}
                            <span className="inline-flex items-center gap-0.5">{post.author_name}<RoleBadge type={post.badge_type} size="xs" showLabel={false} /></span>
                          </button>
                        }
                        text={post.content || ''}
                        renderText={t => <HashtagText text={t} onTag={openHashtag} onMention={goToHandle} />}
                      />
                      );
                    })()}

                    {!(post.images && post.images.length > 0) && parsePostMusic(post.music) && (
                      <button onClick={() => openPostViewer(post)} className="self-start flex items-center gap-1.5 max-w-full text-xs font-bold text-violet-800 bg-violet-50 border border-violet-100 rounded-full px-3 py-1.5">
                        <Icon name="music" className="w-4 h-4" /><span className="truncate">{post.music_title || '음악'}</span><span className="text-violet-500 shrink-0">▶ 듣기</span>
                      </button>
                    )}

                    <div className="flex items-center gap-x-3 gap-y-2 flex-wrap text-[0.875rem] font-medium">
                      {reactionButtons(post, () => toggleCommentBox(post.id))}
                      <span className="ml-auto flex items-center gap-1 text-[0.8125rem] text-stone-400">
                        {post.visibility && post.visibility !== 'public' && <span className="text-[0.75rem] bg-stone-100 text-stone-600 rounded-full px-2 py-0.5">{VISIBILITY[post.visibility].icon} {VISIBILITY[post.visibility].label}</span>}
                        {new Date(post.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                        {(canDelete || user) && (
                          <button onClick={() => setPostMenuId(postMenuId === post.id ? null : post.id)} className="px-1.5 text-base leading-none text-stone-400 hover:text-stone-700" aria-label="더보기">⋯</button>
                        )}
                      </span>
                    </div>
                    {postMenuId === post.id && (
                      <div className="flex justify-end gap-1 -mt-1">
                        <button onClick={() => { setPostMenuId(null); openPostViewer(post); }} className="text-[0.8125rem] text-stone-500 border border-stone-200 rounded-lg px-2.5 py-1">작성자 보기</button>
                        {user?.id === post.user_id && <button onClick={() => { setPostMenuId(null); startEditPost(post); }} className="text-[0.8125rem] text-stone-500 border border-stone-200 rounded-lg px-2.5 py-1">수정</button>}
                        {canDelete && <button onClick={() => { setPostMenuId(null); handleDeletePost(post.id); }} className="text-[0.8125rem] text-red-500 border border-red-200 rounded-lg px-2.5 py-1">삭제</button>}
                        {user && user.id !== post.user_id && <button onClick={() => { setPostMenuId(null); setReportTarget({ type: 'post', id: post.id, userId: post.user_id, userName: post.author_name, preview: post.content }); }} className="text-[0.8125rem] text-red-500 border border-red-200 rounded-lg px-2.5 py-1">신고</button>}
                      </div>
                    )}

                  {openComments[post.id] && (
                    <div className="mt-2 pt-3 border-t border-stone-100 flex flex-col gap-2.5">
                      <div className="flex flex-col gap-1.5">
                        {(comments[post.id] || []).filter(c => !c.user_id || !blockedIds.has(c.user_id)).map((c) => (
                          <div key={c.id} className={`text-xs bg-stone-100/70 p-2.5 rounded-xl text-stone-800 flex flex-col gap-0.5 ${c.reply_to_user_id ? 'ml-5' : ''}`}>
                            <span className="flex items-center justify-between gap-2">
                              <button
                                onClick={() => c.user_id && tagUserInComments(post.id, c.user_id, authorName(c))}
                                className="font-bold text-[0.8125rem] text-stone-700 inline-flex items-center gap-1 text-left"
                              >
                                {authorName(c)}{c.user_id && <RoleBadge type={badgeByUser[c.user_id] ?? (c.user_id === user?.id ? profile?.badge_type : undefined)} size="xs" />}
                                {authorHandle(c) && <span className="font-normal text-[0.75rem] text-stone-400">@{authorHandle(c)}</span>}
                              </button>
                              <span className="flex items-center gap-2 shrink-0">
                                {user && c.user_id && c.user_id !== user.id && (
                                  <button onClick={() => tagUserInComments(post.id, c.user_id!, authorName(c))} className="text-[0.75rem] text-blue-600 font-bold">↩ 답글</button>
                                )}
                                {user && c.user_id !== user.id && (
                                  <button onClick={() => setReportTarget({ type: 'comment', id: c.id, userId: c.user_id, userName: c.author_name, preview: c.content })} className="text-[0.75rem] text-stone-400 hover:text-red-500">신고</button>
                                )}
                                {user && c.user_id === user.id && editingCommentId !== c.id && (
                                  <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.content); }} className="text-[0.75rem] text-stone-500 font-bold">수정</button>
                                )}
                                {user && (c.user_id === user.id || isAdmin) && editingCommentId !== c.id && (
                                  <button onClick={() => deleteComment(c)} className="text-[0.75rem] text-red-500 font-bold">삭제</button>
                                )}
                              </span>
                            </span>
                            {editingCommentId === c.id ? (
                              <div className="flex flex-col gap-1.5 mt-1">
                                <textarea
                                  value={editCommentText}
                                  onChange={e => setEditCommentText(e.target.value)}
                                  rows={2}
                                  autoFocus
                                  className="w-full text-xs border border-stone-300 rounded-lg px-2.5 py-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-stone-400"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button onClick={() => setEditingCommentId(null)} className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">취소</button>
                                  <button onClick={() => saveCommentEdit(c)} disabled={!editCommentText.trim()} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold disabled:opacity-40">저장</button>
                                </div>
                              </div>
                            ) : (
                              <span>
                                {c.reply_to_name && <span className="text-blue-600 font-bold mr-1">@{(c.reply_to_user_id && authorByUser[c.reply_to_user_id]?.name) || c.reply_to_name}</span>}
                                <HashtagText text={c.content} onTag={openHashtag} onMention={goToHandle} />
                                {c.edited_at && <span className="text-stone-400 ml-1 text-[0.6875rem]">(수정됨)</span>}
                              </span>
                            )}
                            {editingCommentId !== c.id && (() => {
                              const r = commentReactions[c.id] || { pray: 0, like: 0, myPray: false, myLike: false };
                              return (
                                <span className="flex gap-1.5 mt-1">
                                  <button onClick={() => toggleCommentReaction(c.id, 'pray')} className={`inline-flex items-center gap-1 text-[0.75rem] px-2 py-0.5 rounded-full border ${r.myPray ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold' : 'border-stone-200 text-stone-500 bg-white'}`}>
                                    <Icon name="pray" fill={r.myPray} className={`w-3.5 h-3.5 ${r.myPray ? 'text-amber-600' : 'text-amber-700'}`} />기도{r.pray > 0 && ` ${r.pray}`}
                                  </button>
                                  <button onClick={() => toggleCommentReaction(c.id, 'like')} className={`inline-flex items-center gap-1 text-[0.75rem] px-2 py-0.5 rounded-full border ${r.myLike ? 'bg-rose-50 border-rose-300 text-rose-700 font-bold' : 'border-stone-200 text-stone-500 bg-white'}`}>
                                    <Icon name="heart" fill={r.myLike} className={`w-3.5 h-3.5 ${r.myLike ? 'text-rose-500' : 'text-rose-600'}`} />공감{r.like > 0 && ` ${r.like}`}
                                  </button>
                                </span>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                      {replyTargets[post.id] ? (
                        <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-2.5 py-1.5">
                          <span className="flex-1 min-w-0 truncate">🏷️ <b>@{replyTargets[post.id]!.name}</b>님을 태그했어요</span>
                          <button onClick={() => setReplyTargets(prev => ({ ...prev, [post.id]: null }))} className="text-blue-400 text-base leading-none px-1" aria-label="답글 취소">×</button>
                        </div>
                      ) : (
                        <p className="text-[0.75rem] text-stone-400"><Icon name="chat" className="inline w-3.5 h-3.5 -mt-0.5 mr-1" /><b className="text-stone-500">{post.author_name}</b>님 글에 댓글을 남겨요 · 닉네임을 누르면 그분을 태그해요</p>
                      )}
                      {user && <MentionSuggest value={commentInputs[post.id] || ''} onChange={v => setCommentInputs(prev => ({ ...prev, [post.id]: v }))} excludeId={user.id} />}
                      <div className="flex gap-1.5">
                        <input id={`comment-input-${post.id}`} type="text" value={commentInputs[post.id] || ''} onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)} placeholder={replyTargets[post.id] ? `${replyTargets[post.id]!.name}님에게 답글...` : '댓글을 입력하세요...'} className="flex-1 text-xs border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
                        <button onClick={() => handleAddComment(post.id)} className="bg-stone-800 text-white text-xs px-3 py-2 rounded-xl">등록</button>
                      </div>
                    </div>
                  )}
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
          <div className="p-8 border-b border-stone-200 flex flex-col items-center justify-center bg-stone-50/50">
            {(() => {
              const avatar = viewingProfile?.avatar_url ? (
                <img src={viewingProfile.avatar_url} alt="프로필" className="w-24 h-24 rounded-full object-cover border border-stone-200 shadow-sm" />
              ) : (
                <div className="w-24 h-24 bg-stone-200 text-stone-600 rounded-full flex items-center justify-center text-4xl font-serif font-bold shadow-inner">
                  {viewingProfile?.baptismal_name ? viewingProfile.baptismal_name[0] : '교'}
                </div>
              );
              // 내 프로필: 사진을 누르면 프로필 사진 바꾸기
              return viewingUserId === user?.id ? (
                <label className="relative cursor-pointer mb-3" aria-label="프로필 사진 바꾸기">
                  {avatar}
                  <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-stone-900 text-white flex items-center justify-center border-2 border-white shadow"><Icon name="camera" className="w-4 h-4" /></span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                </label>
              ) : <div className="mb-3">{avatar}</div>;
            })()}
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl font-bold text-stone-900">{viewingProfile?.baptismal_name || '교우'}</h2>
              <RoleBadge type={viewingProfile?.badge_type} size="md" />
            </div>
            <p className="text-xs text-stone-400 mt-0.5">@{viewingProfile?.handle || 'user'}</p>
            {/* 한 줄 소개: 내 공간이면 눌러서 쓰기·고치기 */}
            {bioDraft !== null ? (
              <div className="mt-3 w-full max-w-xs flex flex-col gap-1.5">
                <textarea autoFocus value={bioDraft} onChange={e => setBioDraft(e.target.value.slice(0, 80))} rows={2} placeholder="예: 수원교구 ○○성당 / 매일 묵주기도 함께해요 🙏" className="w-full p-2.5 text-sm text-center bg-white border border-stone-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">{bioDraft.length}/80</span>
                  <span className="flex gap-1.5">
                    <button onClick={() => setBioDraft(null)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600">취소</button>
                    <button onClick={saveBio} className="px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold">저장</button>
                  </span>
                </div>
              </div>
            ) : viewingBio ? (
              <p onClick={viewingUserId === user?.id ? () => setBioDraft(viewingBio) : undefined} className={`mt-2.5 max-w-xs text-sm text-stone-700 text-center whitespace-pre-wrap leading-relaxed ${viewingUserId === user?.id ? 'cursor-pointer' : ''}`}>{viewingBio}</p>
            ) : viewingUserId === user?.id && (
              <button onClick={() => setBioDraft('')} className="mt-2.5 text-xs text-stone-500 border border-dashed border-stone-300 rounded-full px-3 py-1.5">✏️ 나를 소개하는 한 마디 쓰기</button>
            )}
            {isAdmin && viewingRealName && (
              <p className="text-xs text-stone-500 mt-1 bg-stone-100 rounded-lg px-2 py-0.5">🔒 실명: {viewingRealName} <span className="text-stone-400">(관리자만 보임)</span></p>
            )}
            
            <div className="flex gap-6 mt-4 text-center">
              <div><p className="text-lg font-bold text-stone-800">{myPosts.length}</p><p className="text-xs text-stone-500 font-medium">게시물</p></div>
              <button onClick={() => openFollowList('followers')}><p className="text-lg font-bold text-stone-800">{followData.followers}</p><p className="text-xs text-stone-500 font-medium">팔로워</p></button>
              <button onClick={() => openFollowList('following')}><p className="text-lg font-bold text-stone-800">{followData.following}</p><p className="text-xs text-stone-500 font-medium">팔로잉</p></button>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {viewingUserId === user?.id ? (
                <>
                  <button onClick={() => goToTab('messages')} className="relative inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-stone-900 text-white shadow-sm hover:bg-stone-800 transition-colors">
                    <Icon name="send" className="w-4 h-4" />메시지
                    {unreadMessageCount > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>}
                  </button>
                  <button onClick={() => { setSettingsView('main'); setShowSettings(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                    <Icon name="gear" className="w-4 h-4" />설정
                  </button>
                  {isAdmin && (
                    <button onClick={() => setShowAdminStats(true)} className="px-4 py-2 rounded-xl text-xs font-bold border border-sky-300 bg-sky-50 text-sky-900 shadow-sm hover:bg-sky-100 transition-colors inline-flex items-center gap-1.5">
                      📊 접속 통계
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => setShowSponsorAdmin(true)} className="px-4 py-2 rounded-xl text-xs font-bold border border-amber-300 bg-amber-50 text-amber-800 shadow-sm hover:bg-amber-100 transition-colors inline-flex items-center gap-1.5">
                      <Icon name="storefront" className="w-4 h-4" />광고 관리
                    </button>
                  )}
                  <button onClick={() => setShowFeedback(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                    <Icon name="envelope" className="w-4 h-4" />{isAdmin ? '건의함' : '건의하기'}
                  </button>
                  {!isStandalone && (
                    <button onClick={handleInstallClick} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                      <Icon name="phone" className="w-4 h-4" />홈 화면에 추가
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button onClick={() => toggleFollow(viewingUserId!, followData.status)} className={`px-6 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors ${followData.status === 'none' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-stone-200 text-stone-800'}`}>
                    {followData.status === 'none' ? '팔로우' : '팔로잉'}
                  </button>
                  <button onClick={() => viewingProfile && openChatRoom(viewingProfile)} disabled={!viewingProfile} className="px-6 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                    메시지
                  </button>
                </>
              )}
            </div>

            {isAdmin && viewingProfile && (
              <div className="mt-4 flex items-center gap-2 text-xs bg-white border border-stone-200 rounded-xl px-3 py-2 shadow-sm">
                <span className="font-bold text-stone-600">👑 관리자 · 인증 뱃지</span>
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

          {/* 게시물 / 태그됨 (나를 @태그한 글 모아 보기) */}
          <div className="flex border-b border-stone-200 bg-white">
            {([['posts', '게시물', 'camera'], ['tagged', '태그됨', 'pin']] as const).map(([key, label, icon]) => (
              <button key={key} onClick={() => setProfileTab(key)} className={`flex-1 py-3 inline-flex items-center justify-center gap-1.5 text-sm font-bold border-b-2 ${profileTab === key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400'}`}>
                <Icon name={icon} className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-stone-100">
            {(() => {
              const gridPosts = profileTab === 'posts'
                ? myPosts
                : posts.filter(p => p.user_id !== viewingUserId && !blockedIds.has(p.user_id) && mentionsHandle(p.content, viewingProfile?.handle));
              return gridPosts.length === 0 ? (
              <div className="col-span-3 p-12 text-center text-stone-400 text-sm bg-white">{profileTab === 'posts' ? '게시물이 없습니다.' : '아직 태그된 글이 없어요.'}</div>
            ) : (
              gridPosts.map((post) => (
                <div 
                  key={post.id} 
                  onClick={() => openPostViewer(post)} 
                  className="aspect-square bg-white relative group overflow-hidden border border-stone-100 cursor-pointer hover:opacity-90 transition-opacity"
                >
                  {post.visibility && post.visibility !== 'public' && <span className="absolute top-1 left-1 z-10 text-[0.6875rem] bg-black/55 text-white rounded-full px-1.5 py-0.5">{VISIBILITY[post.visibility].icon}</span>}
                  {post.music && <span className="absolute top-1 right-1 z-10 text-xs bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center">🎵</span>}
                  {post.video_url && <span className="absolute bottom-1 right-1 z-10 text-xs bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center">▶</span>}
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
      {activeTab === 'anon' && (
        <AnonBoard user={user} isAdmin={isAdmin} profileReady={!needsProfileSetup} onRequireLogin={() => user ? setSetupDismissed(false) : setShowAuthModal(true)} onReport={setReportTarget} />
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
            <input type="text" value={messageInput} onChange={(e) => setMessageInput(e.target.value)} placeholder="메시지 입력..." className="flex-1 bg-stone-100 border-none rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                👤 프로필(공간) 보러가기
              </button>
              <button onClick={() => { toggleFollow(actionModalUser.id, actionUserFollowStatus); }} className="w-full p-4 text-sm font-medium text-left hover:bg-stone-50 border-b border-stone-100 transition-colors">
                {actionUserFollowStatus === 'none' ? '➕ 팔로우하기' : '✖ 팔로우 취소'}
              </button>
              <button onClick={() => openChatRoom(actionModalUser)} className="w-full p-4 text-sm font-medium text-left text-blue-600 hover:bg-blue-50 border-b border-stone-100 transition-colors">
                💬 개인 메시지(DM) 보내기
              </button>
              <button onClick={() => { const u = actionModalUser; setActionModalUser(null); setReportTarget({ type: 'user', id: u.id, userId: u.id, userName: u.baptismal_name, preview: `${u.baptismal_name} @${u.handle || ''}` }); }} className="w-full p-4 text-sm font-medium text-left text-stone-600 hover:bg-stone-50 border-b border-stone-100 transition-colors">
                🚨 신고하기
              </button>
              {blockedIds.has(actionModalUser.id) ? (
                <button onClick={() => { unblockUser(actionModalUser.id); setActionModalUser(null); }} className="w-full p-4 text-sm font-medium text-left text-stone-600 hover:bg-stone-50 transition-colors">
                  ✅ 차단 해제
                </button>
              ) : (
                <button onClick={() => confirmBlock(actionModalUser)} className="w-full p-4 text-sm font-medium text-left text-red-600 hover:bg-red-50 transition-colors">
                  🚫 차단하기
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
          onOpenNotices={() => { setShowSettings(false); setNoticeOpenId(null); setShowNotices(true); }}
          initialView={settingsView}
          onOpenMembers={isAdmin ? () => { setShowSettings(false); setShowAdminMembers(true); } : undefined}
          onOpenBgm={isAdmin ? () => { setShowSettings(false); setShowBgmAdmin(true); } : undefined}
          onOpenStats={isAdmin ? () => { setShowSettings(false); setShowAdminStats(true); } : undefined}
          onOpenMeditation={isAdmin ? () => { setShowSettings(false); setShowMeditationAdmin(true); } : undefined} />
      )}

      {/* 오늘의 기도지향 모아 보기 */}
      {showIntentions && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowIntentions(false)}>
          <div className="bg-white w-full sm:w-96 max-h-[85dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-gradient-to-br from-[#101a3f] to-[#1f2f66] text-white flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#fbe7b0]">🙏 오늘의 기도지향 ({visibleIntentions.length})</h2>
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
              ) : visibleIntentions.map(i => (
                <div key={i.id} className="p-4 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => { setShowIntentions(false); goToProfile(i.user_id); }} className="text-sm font-bold text-stone-900">{i.author_name || '교우'}</button>
                    <span className="flex items-center gap-2">
                      <span className="text-[0.75rem] text-stone-400">{new Date(i.created_at).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}</span>
                      {isAdmin && user?.id !== i.user_id && <button onClick={() => deleteIntention(i.id)} className="text-[0.75rem] text-red-500">삭제</button>}
                    </span>
                  </div>
                  {i.title && <p className="text-[0.9375rem] font-bold text-[#1f2f66]">🙏 {i.title}</p>}
                  <p className={`text-[0.9375rem] text-stone-800 leading-relaxed ${i.title ? 'bg-stone-50 rounded-xl px-3 py-2' : ''}`}>{i.title ? i.content : `🙏 ${i.content}`}</p>
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* 공지사항 */}
      {showNotices && (
        <NoticeBoard
          key={noticeOpenId || 'list'}
          notices={notices}
          isAdmin={isAdmin}
          initialOpenId={noticeOpenId}
          hiddenIds={hiddenNotices}
          onHide={id => { hideNotice(id); setShowNotices(false); }}
          onClose={() => setShowNotices(false)}
          onChanged={fetchNotices}
        />
      )}

      {/* 숏폼 영상 꾸미기 */}
      {showAdminStats && isAdmin && <AdminStats onClose={() => setShowAdminStats(false)} />}
      {showMeditationAdmin && isAdmin && <MeditationAdmin onClose={() => setShowMeditationAdmin(false)} onPosted={fetchPosts} />}

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
            musicTitle={target.music_title}
            onOpenMusic={() => alert('배경음악은 새 글을 쓸 때만 고를 수 있어요.')}
            onRemoveMusic={() => alert('배경음악은 새 글을 쓸 때만 바꿀 수 있어요.')}
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
          onOpenMusic={() => setShowMusicPicker(true)}
          onRemoveMusic={() => setComposerMusic(null)}
          onDone={o => { setComposerOverlays(o); setShowVideoEditor(false); }}
          onCancel={() => setShowVideoEditor(false)}
        />
      )}

      {/* 글쓰기: 음악 고르기 */}
      {showMusicPicker && (
        <MusicPicker tracks={bgmTracks} onClose={() => setShowMusicPicker(false)} onSelect={m => { setComposerMusic(m); setShowMusicPicker(false); }} />
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
            <span className="text-4xl">🔔</span>
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
                <button onClick={clearSeenAlerts} className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 text-stone-600">🗑 확인한 알림 지우기</button>
                <button onClick={toggleAlertSound} className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 text-stone-600">
                  {alertSoundOn ? '🔊 소리 켜짐' : '🔇 소리 꺼짐'}
                </button>
                <button onClick={() => setShowNotifications(false)} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
              </div>
            </div>
            {pushStatus !== 'checking' && pushStatus !== 'unsupported' && (
              <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-3">
                <span className="text-xl">📲</span>
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
                      👤 <b className="inline-flex items-center gap-1">{r.follower.baptismal_name}<RoleBadge type={r.follower.badge_type} size="xs" showLabel={false} /></b>님이 회원님을 팔로우하기 시작했어요
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
                    ✉️ <b>{u.partner.baptismal_name}</b>님이 메시지를 보냈습니다 <span className="ml-1 text-[0.75rem] bg-red-500 text-white rounded-full px-1.5 py-px font-bold">{u.count}</span>
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
                      {n.mention ? '🏷️' : '💬'} <b>{n.author_name}</b>님이 {n.mention === 'post' ? '글에서 회원님을 언급했어요' : n.mention === 'comment' ? '댓글에서 회원님을 언급했어요' : n.is_reply ? '회원님에게 답글을 남겼습니다' : '회원님의 글에 댓글을 남겼습니다'}
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
                {thumb ? <img src={thumb} alt="" className="w-full max-h-[50dvh] object-cover" /> : <p className="p-5 text-sm text-stone-700 line-clamp-4">{peek.content}</p>}
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
                  <img src={selectedPostDetail.images[Math.min(detailImageIndex, selectedPostDetail.images.length - 1)]} alt="게시물 사진" onClick={viewerImageTap} className="max-h-[50dvh] object-contain w-full" />
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
                if (!track) return <p className="px-4 py-2.5 text-xs text-stone-400 bg-stone-50">🎵 이 음악은 더 이상 제공되지 않아요</p>;
                return (
                  <button onClick={toggleBgm} className="flex items-center gap-3 px-4 py-2.5 bg-violet-50 border-b border-violet-100 text-left">
                    <span className="w-9 h-9 rounded-full bg-violet-700 text-white flex items-center justify-center shrink-0">{bgmPlaying ? '❚❚' : '▶'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-stone-800 truncate">{selectedPostDetail.music_title || track.title}</span>
                      <span className="block text-xs text-stone-500">{bgmPlaying ? '재생 중' : '눌러서 듣기'}</span>
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
                  <div className="mb-1"><VisibilityPicker value={selectedPostDetail.visibility || 'public'} onChange={v => changePostVisibility(selectedPostDetail.id, v)} /></div>
                )}
                {/* 글은 처음엔 두 줄만, 누르면 전체 */}
                <ClampText
                  key={selectedPostDetail.id}
                  lines={2}
                  expanded={viewerTextOpen}
                  onExpand={() => setViewerTextOpen(true)}
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
              <span className="text-2xl">🕊️</span>
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
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left">이름 + 세례명 <span className="font-normal text-stone-400">(🔒 관리자만 봐요)</span></label>
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
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left">🕯️ 나의 축일 <span className="font-normal text-stone-400">(선택)</span></label>
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

      {/* 하단 네비게이션 */}
      {activeTab !== 'chat' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-xl mx-auto bg-white border-t border-stone-200 flex items-center justify-around z-40 pb-safe">
          <button onClick={() => { goToHome(); }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-stone-900' : 'text-stone-400'}`}>
            <svg viewBox="0 0 24 24" fill={activeTab === 'home' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span className="text-[0.75rem] font-medium">홈</span>
          </button>
          <button onClick={() => { setExploreQuery(''); goToTab('explore'); }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'explore' ? 'text-stone-900' : 'text-stone-400'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeTab === 'explore' ? 2.6 : 2} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" /></svg>
            <span className="text-[0.75rem] font-medium">탐색</span>
          </button>
          <button onClick={() => goToTab('anon')} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'anon' ? 'text-violet-700' : 'text-stone-400'}`}>
            <svg viewBox="0 0 24 24" fill={activeTab === 'anon' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-6.5-4.35-9-8.5C1.5 9.5 3 6 6.5 6c2 0 3.5 1.2 4.3 2.5h2.4C14 7.2 15.5 6 17.5 6 21 6 22.5 9.5 21 12.5 18.5 16.65 12 21 12 21z" /></svg>
            <span className="text-[0.75rem] font-medium">고민상담</span>
          </button>
          <button onClick={() => { if (!user) setShowAuthModal(true); else goToProfile(user.id); }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' || activeTab === 'messages' ? 'text-stone-900' : 'text-stone-400'}`}>
            {/* 메시지는 내 공간 안으로 옮김: 안 읽은 메시지가 있으면 여기에 숫자 표시 */}
            <span className="relative">
              <svg viewBox="0 0 24 24" fill={activeTab === 'profile' || activeTab === 'messages' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              {unreadMessageCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
              )}
            </span>
            <span className="text-[0.75rem] font-medium">내 공간</span>
          </button>
        </nav>
      )}
    </main>
  );
}