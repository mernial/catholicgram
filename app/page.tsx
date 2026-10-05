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
import { type BgmTrack, parsePostMusic } from '@/lib/music';
import SponsorBanner from '@/components/SponsorBanner';
import SponsorAdmin from '@/components/SponsorAdmin';
import { FEED_BANNER_EVERY, type SponsorBannerData } from '@/lib/sponsor';
import FeastDayPicker from '@/components/FeastDayPicker';
import { formatFeastDay, isValidFeastDay, todayFeastKeys, todayKst } from '@/lib/feast';

// Safari에서 '모든 쿠키 차단'이나 일부 개인정보 보호 설정이 켜져 있으면
// localStorage 접근 자체가 오류를 내서 화면 전체가 멈출 수 있으므로 안전하게 감싼다.
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
  music_title?: string | null;
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
interface CommentNotification { id: string; post_id: string; post_content: string; content: string; author_name: string; created_at: string; is_reply?: boolean; }
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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [openComments, setOpenComments] = useState<{ [key: string]: boolean }>({});
  const [comments, setComments] = useState<{ [key: string]: Comment[] }>({});
  const [badgeByUser, setBadgeByUser] = useState<{ [userId: string]: string | null }>({});
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [notifications, setNotifications] = useState<CommentNotification[]>([]);
  const [notificationsLastSeen, setNotificationsLastSeen] = useState<string | null>(null);
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
  const [deepLink, setDeepLink] = useState<{ post?: string; chat?: string; alerts?: boolean; feedback?: boolean } | null>(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [baptismalName, setBaptismalName] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [setupError, setSetupError] = useState('');
  const [feastDayInput, setFeastDayInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');   // 공개 닉네임 (baptismalName 은 비공개 실명)
  const [profileEditMode, setProfileEditMode] = useState(false); // 설정에서 프로필 정보 수정 중
  const [myRealName, setMyRealName] = useState('');
  const [viewingRealName, setViewingRealName] = useState(''); // 관리자만
  // 댓글 답글 대상 (게시물별)
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
  const [editContent, setEditContent] = useState('');

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [exploreQuery, setExploreQuery] = useState('');
  const currentScreenRef = useRef<ScreenState>({ screen: true, tab: 'home' });
  const backHandlerRef = useRef<(e: PopStateEvent) => void>(() => {});
  const exitArmedAtRef = useRef(0);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
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

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

    // 알림음: 설정 불러오기, 첫 터치 때 오디오 활성화
    sessionStartRef.current = Date.now();
    setAlertSoundOn(storageGet('alertSound') !== 'off');
    const unlock = () => unlockAlertSound();
    window.addEventListener('pointerdown', unlock, { once: true });

    const params = new URLSearchParams(window.location.search);
    const linkPost = params.get('post');
    const linkChat = params.get('chat');
    const linkAlerts = params.get('alerts') === '1';
    const linkFeedback = params.get('feedback') === '1';
    if (linkPost || linkChat || linkAlerts || linkFeedback) {
      setDeepLink({ post: linkPost || undefined, chat: linkChat || undefined, alerts: linkAlerts, feedback: linkFeedback });
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

  const fetchFollowData = async (targetId: string) => {
    // 수락된 팔로우만 숫자에 포함
    const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetId).eq('status', 'accepted');
    const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId).eq('status', 'accepted');
    const status = await getFollowStatus(targetId);
    if (latestViewingUserIdRef.current !== targetId) return;
    setFollowData({ followers: followers || 0, following: following || 0, status });
  };

  // 팔로우 (승인 없이 바로) / 언팔로우
  const toggleFollow = async (targetId: string, currentStatus: FollowStatus) => {
    if (!user) { setShowAuthModal(true); return; }
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

  const fetchPosts = async () => {
    const { data: postsData } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (!postsData) return;
    // 게시물 작성자의 프로필만 가져오기
    const authorIds = Array.from(new Set(postsData.map(p => p.user_id).filter(Boolean)));
    const { data: profilesData } = authorIds.length > 0
      ? await supabase.from('profiles').select('id, avatar_url, handle, badge_type').in('id', authorIds)
      : { data: [] };
    if (profilesData) {
      const profileMap = Object.fromEntries(profilesData.map((p: any) => [p.id, { avatar_url: p.avatar_url, handle: p.handle, badge_type: p.badge_type }]));
      setPosts(postsData.map(p => ({ 
        ...p, 
        avatar_url: profileMap[p.user_id]?.avatar_url,
        handle: profileMap[p.user_id]?.handle,
        badge_type: profileMap[p.user_id]?.badge_type
      })));
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setShowAuthModal(true); return; }
    if (needsProfileSetup) return;
    if (!content.trim() && selectedFiles.length === 0) return;
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
    const author = profile?.baptismal_name || '교우';
    const row = { content, images: uploadedUrls, user_id: user.id, author_name: author };
    let { error } = await supabase.from('posts').insert([composerMusic ? { ...row, music: composerMusic.value, music_title: composerMusic.title } : row]);
    // 음악 칼럼이 아직 없는 경우(SQL 실행 전)에는 음악 없이 올린다
    if (error && composerMusic && (error.code === 'PGRST204' || error.code === '42703')) {
      ({ error } = await supabase.from('posts').insert([row]));
      alert('글은 올렸지만 음악은 저장하지 못했어요.\n(관리자: Supabase에서 supabase/music.sql 을 실행해야 음악이 저장됩니다)');
    }
    if (!error) {
      setContent(''); setSelectedFiles([]); setPreviewUrls([]); setComposerMusic(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchPosts(); goToHome();
    }
    setLoading(false);
  };

  const fetchBgmTracks = async () => {
    const { data } = await supabase.from('bgm_tracks').select('id, title, artist, url, active, sort').eq('active', true).order('sort').order('created_at');
    setBgmTracks((data || []) as BgmTrack[]);
  };

  // 사진을 눌러 게시물을 열면 음악이 바로 재생된다.
  // (휴대폰 브라우저는 사용자가 누른 순간에만 소리 재생을 허용하므로 누른 즉시 재생을 시작)
  const openPostViewer = (post: Post, imageIndex = 0) => {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).slice(0, 3);
    setSelectedFiles(files); setPreviewUrls(files.map(f => URL.createObjectURL(f)));
  };
  const removeFile = (idx: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== idx));
    setPreviewUrls(previewUrls.filter((_, i) => i !== idx));
  };
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) return;
    setPosts(posts.filter(p => p.id !== postId));
    await supabase.from('posts').delete().eq('id', postId);
  };
  const handleUpdatePost = async (postId: string) => {
    setPosts(posts.map(p => p.id === postId ? { ...p, content: editContent } : p));
    setEditingPostId(null);
    await supabase.from('posts').update({ content: editContent }).eq('id', postId);
  };
  const handleReaction = async (postId: string, type: 'pray' | 'like') => {
    if (!user) { setShowAuthModal(true); return; }
    if (!posts.some((p) => p.id === postId)) return;
    const { data: existing } = await supabase.from('post_reactions').select('id').eq('post_id', postId).eq('user_id', user.id).eq('reaction_type', type).maybeSingle(); 
    const { error } = existing
      ? await supabase.from('post_reactions').delete().eq('id', existing.id)
      : await supabase.from('post_reactions').insert({ post_id: postId, user_id: user.id, reaction_type: type });
    if (error) return;
    // 화면의 숫자에 ±1 하지 않고 post_reactions 테이블에서 실제 개수를 다시 세어 저장
    // (여러 사람이 동시에 눌러도 값이 어긋나지 않음)
    const { count } = await supabase.from('post_reactions').select('*', { count: 'exact', head: true }).eq('post_id', postId).eq('reaction_type', type);
    const newCount = count ?? 0;
    const updateField = type === 'pray' ? { pray_count: newCount } : { like_count: newCount };
    await supabase.from('posts').update(updateField).eq('id', postId);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updateField } : p));
  };
  const fetchNotifications = async (userId: string) => {
    const { data: myPosts } = await supabase.from('posts').select('id, content').eq('user_id', userId);
    setNotificationsLastSeen(storageGet(`notificationsLastSeen:${userId}`));
    const postContent: Record<string, string> = Object.fromEntries((myPosts || []).map(p => [p.id, p.content || '']));
    const [{ data: onMyPosts }, { data: replies }] = await Promise.all([
      myPosts && myPosts.length > 0
        ? supabase.from('comments').select('id, post_id, content, author_name, created_at')
          .in('post_id', myPosts.map(p => p.id)).neq('user_id', userId)
          .order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] as Omit<CommentNotification, 'post_content'>[] }),
      // 다른 사람 글에서 나에게 단 답글 (칼럼이 없으면 빈 결과)
      supabase.from('comments').select('id, post_id, content, author_name, created_at')
        .eq('reply_to_user_id', userId).neq('user_id', userId)
        .order('created_at', { ascending: false }).limit(30),
    ]);
    const merged = new Map<string, CommentNotification>();
    (onMyPosts || []).forEach(c => merged.set(c.id, { ...c, post_content: postContent[c.post_id] }));
    (replies || []).forEach(c => merged.set(c.id, { ...c, post_content: postContent[c.post_id] || '', is_reply: true }));
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
  const loadCommentBadges = async (list: Comment[]) => {
    const ids = Array.from(new Set(list.map(c => c.user_id).filter((id): id is string => !!id)));
    if (ids.length === 0) return;
    const { data } = await supabase.from('profiles').select('id, badge_type').in('id', ids);
    if (data) setBadgeByUser(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, p.badge_type])) }));
  };

  // 홈에서 해당 글로 이동해 댓글을 펼친다
  const openPostComments = async (postId: string) => {
    goToHome();
    setOpenComments(prev => ({ ...prev, [postId]: true }));
    const { data } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (data) { setComments(prev => ({ ...prev, [postId]: data })); loadCommentBadges(data); }
    setTimeout(() => document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const openNotification = (n: CommentNotification) => {
    setShowNotifications(false);
    openPostComments(n.post_id);
  };

  // --- 휴대폰 푸시 알림 ---
  // 방금 작성한 댓글/메시지를 받는 사람에게 알림 발송 요청 (실패해도 무시)
  const sendPush = async (type: 'comment' | 'message' | 'follow' | 'feedback' | 'feedback_reply', id: string) => {
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
      if (isNew(`c:${n.id}`, n.created_at)) fresh.push({ key: `c:${n.id}`, icon: '💬', title: n.is_reply ? '새 답글' : '새 댓글', body: `${n.author_name}님: ${n.content}`, action: () => openPostComments(n.post_id) });
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
    setTimeout(() => setBgmPlaying(false), 0);
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

  const toggleCommentBox = async (postId: string) => {
    const nextState = !openComments[postId];
    setOpenComments({ ...openComments, [postId]: nextState });
    if (nextState && !comments[postId]) {
      const { data } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
      if (data) { setComments(prev => ({ ...prev, [postId]: data })); loadCommentBadges(data); }
    }
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
  };

  // 닉네임을 누르면 댓글창을 열고 그 사람을 태그한 채로 입력칸에 커서를 둔다
  const tagUserInComments = async (postId: string, targetUserId: string, name: string) => {
    if (!user) { setShowAuthModal(true); return; }
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
    || showNotifications || showSettings || showFeedback || reportTarget || showInstallGuide || showSponsorAdmin || showPushPrompt || showAdminMembers || showMusicPicker || showBgmAdmin || (profileEditMode && !needsProfileSetup));
  const closeAllModals = () => {
    setActionModalUser(null); setShowAuthModal(false); setAvatarFile(null); setSelectedPostDetail(null); setSelectedImage(null);
    setShowNotifications(false); setShowSettings(false); setShowFeedback(false); setReportTarget(null);
    setShowInstallGuide(false); setShowSponsorAdmin(false); setShowPushPrompt(false); setShowAdminMembers(false);
    setShowMusicPicker(false); setShowBgmAdmin(false); setProfileEditMode(false);
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

  return (
    <main className={`w-full max-w-xl mx-auto min-h-[100dvh] sm:border-x border-stone-200 bg-stone-50/30 flex flex-col font-sans relative ${activeTab === 'chat' ? '' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]'}`}>
      
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
              <span className="text-amber-800 text-xl font-serif">✟</span>
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
          {!isStandalone && !installBannerDismissed && !isKakaoInApp && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
              <img src="/icon-192.png" alt="" className="w-8 h-8 rounded-lg" />
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
          <section className="p-4 bg-white border-b border-stone-200 shadow-sm">
            <form onSubmit={handleCreatePost} className="flex flex-col gap-3">
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={user ? "오늘 마음속 기도나 묵상을 들려주세요... (#해시태그를 달면 찾기 쉬워요)" : '로그인 후 나눌 수 있습니다.'} rows={3} className="w-full p-3.5 text-sm bg-stone-50/70 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
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
              <div className="flex items-center justify-between pt-1">
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" id="photo-upload" />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label htmlFor="photo-upload" className="cursor-pointer text-xs font-semibold text-stone-600 bg-stone-100 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5">
                      📷 사진첩에서 선택
                    </label>
                    {user && (
                      <button type="button" onClick={() => setShowMusicPicker(true)} className="text-xs font-semibold text-stone-600 bg-stone-100 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5">
                        🎵 음악
                      </button>
                    )}
                  </div>
                </div>
                <button type="submit" disabled={loading || (!content.trim() && selectedFiles.length === 0)} className="bg-stone-900 text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-stone-800 disabled:opacity-40">{loading ? '올리는 중...' : '나눔 올리기'}</button>
              </div>
            </form>
          </section>

          <section className="divide-y divide-stone-200/70 flex-1">
            {posts.filter(post => !blockedIds.has(post.user_id)).map((post, postIndex) => {
              const canDelete = user?.id === post.user_id || (user?.email && ADMIN_EMAILS.includes(user.email));
              // 게시글 FEED_BANNER_EVERY 개마다 후원 배너를 번갈아 끼움
              const slot = (postIndex + 1) % FEED_BANNER_EVERY === 0 ? (postIndex + 1) / FEED_BANNER_EVERY - 1 : -1;
              const inlineBanner = slot >= 0 && feedBanners.length > 0 ? feedBanners[slot % feedBanners.length] : null;
              return (
                <Fragment key={post.id}>
                <article id={`post-${post.id}`} className="bg-white flex flex-col gap-3 pb-4 sm:pb-5">
                  {/* 사진이 먼저, 크게 (여러 장이면 옆으로 넘김) — 사진을 누르면 작성자·음악과 함께 크게 보기 */}
                  {post.images && post.images.length > 0 && (
                    <PostPhotos
                      images={post.images}
                      onOpen={i => openPostViewer(post, i)}
                      musicTitle={post.music_title}
                      onMusic={parsePostMusic(post.music) ? () => openPostViewer(post) : undefined}
                    />
                  )}

                  <div className="px-4 sm:px-5 flex flex-col gap-3">
                    {!(post.images && post.images.length > 0) && <div className="pt-4 sm:pt-5" />}
                    {editingPostId === post.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full p-3 text-sm border border-stone-300 rounded-xl resize-none focus:outline-none" rows={3} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingPostId(null)} className="px-3 py-1.5 rounded-lg border text-xs">취소</button>
                          <button onClick={() => handleUpdatePost(post.id)} className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs">저장</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-stone-800 text-[1rem] whitespace-pre-wrap leading-relaxed">
                        {/* 닉네임을 누르면 그 사람을 태그해 바로 댓글 쓰기 */}
                        <button onClick={() => tagUserInComments(post.id, post.user_id, post.author_name)} className="font-bold text-stone-900 mr-1.5 inline-flex items-center gap-0.5 align-baseline">
                          {post.author_name}<RoleBadge type={post.badge_type} size="xs" showLabel={false} />
                        </button>
                        {post.content && <HashtagText text={post.content} onTag={openHashtag} />}
                      </p>
                    )}

                    {!(post.images && post.images.length > 0) && parsePostMusic(post.music) && (
                      <button onClick={() => openPostViewer(post)} className="self-start flex items-center gap-1.5 max-w-full text-xs font-bold text-violet-800 bg-violet-50 border border-violet-100 rounded-full px-3 py-1.5">
                        <span>🎵</span><span className="truncate">{post.music_title || '음악'}</span><span className="text-violet-500 shrink-0">▶ 듣기</span>
                      </button>
                    )}

                    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs font-medium">
                      <button onClick={() => handleReaction(post.id, 'pray')} className="flex items-center gap-1.5 text-stone-600 hover:text-indigo-600">🙏 기도할게요 {post.pray_count > 0 && `(${post.pray_count})`}</button>
                      <button onClick={() => handleReaction(post.id, 'like')} className="flex items-center gap-1.5 text-stone-600 hover:text-purple-600">🍇 공감해요 {post.like_count > 0 && `(${post.like_count})`}</button>
                      <button onClick={() => toggleCommentBox(post.id)} className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900">💬 댓글</button>
                      <span className="ml-auto flex items-center gap-1 text-[0.8125rem] text-stone-400">
                        {new Date(post.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                        {(canDelete || user) && (
                          <button onClick={() => setPostMenuId(postMenuId === post.id ? null : post.id)} className="px-1.5 text-base leading-none text-stone-400 hover:text-stone-700" aria-label="더보기">⋯</button>
                        )}
                      </span>
                    </div>
                    {postMenuId === post.id && (
                      <div className="flex justify-end gap-1 -mt-1">
                        <button onClick={() => { setPostMenuId(null); openPostViewer(post); }} className="text-[0.8125rem] text-stone-500 border border-stone-200 rounded-lg px-2.5 py-1">작성자 보기</button>
                        {user?.id === post.user_id && <button onClick={() => { setPostMenuId(null); setEditingPostId(post.id); setEditContent(post.content); }} className="text-[0.8125rem] text-stone-500 border border-stone-200 rounded-lg px-2.5 py-1">수정</button>}
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
                                onClick={() => c.user_id && tagUserInComments(post.id, c.user_id, c.author_name)}
                                className="font-bold text-[0.8125rem] text-stone-700 inline-flex items-center gap-1 text-left"
                              >
                                {c.author_name}{c.user_id && <RoleBadge type={badgeByUser[c.user_id] ?? (c.user_id === user?.id ? profile?.badge_type : undefined)} size="xs" />}
                              </button>
                              <span className="flex items-center gap-2 shrink-0">
                                {user && c.user_id && c.user_id !== user.id && (
                                  <button onClick={() => tagUserInComments(post.id, c.user_id!, c.author_name)} className="text-[0.75rem] text-blue-600 font-bold">↩ 답글</button>
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
                                {c.reply_to_name && <span className="text-blue-600 font-bold mr-1">@{c.reply_to_name}</span>}
                                {c.content}
                                {c.edited_at && <span className="text-stone-400 ml-1 text-[0.6875rem]">(수정됨)</span>}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {replyTargets[post.id] ? (
                        <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-2.5 py-1.5">
                          <span className="flex-1 min-w-0 truncate">🏷️ <b>@{replyTargets[post.id]!.name}</b>님을 태그했어요</span>
                          <button onClick={() => setReplyTargets(prev => ({ ...prev, [post.id]: null }))} className="text-blue-400 text-base leading-none px-1" aria-label="답글 취소">×</button>
                        </div>
                      ) : (
                        <p className="text-[0.75rem] text-stone-400">💬 <b className="text-stone-500">{post.author_name}</b>님 글에 댓글을 남겨요 · 닉네임을 누르면 그분을 태그해요</p>
                      )}
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
            })}
          </section>
        </>
      )}

      {/* 2. 프로필 탭 */}
      {activeTab === 'profile' && (
        <section className="flex-1 bg-white flex flex-col">
          <div className="p-8 border-b border-stone-200 flex flex-col items-center justify-center bg-stone-50/50">
            {viewingProfile?.avatar_url ? (
              <img src={viewingProfile.avatar_url} alt="프로필" className="w-24 h-24 rounded-full object-cover border border-stone-200 shadow-sm mb-3" />
            ) : (
              <div className="w-24 h-24 bg-stone-200 text-stone-600 rounded-full flex items-center justify-center text-4xl font-serif font-bold shadow-inner mb-3">
                {viewingProfile?.baptismal_name ? viewingProfile.baptismal_name[0] : '교'}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl font-bold text-stone-900">{viewingProfile?.baptismal_name || '교우'}</h2>
              <RoleBadge type={viewingProfile?.badge_type} size="md" />
            </div>
            <p className="text-xs text-stone-400 mt-0.5">@{viewingProfile?.handle || 'user'}</p>
            {isAdmin && viewingRealName && (
              <p className="text-xs text-stone-500 mt-1 bg-stone-100 rounded-lg px-2 py-0.5">🔒 실명: {viewingRealName} <span className="text-stone-400">(관리자만 보임)</span></p>
            )}
            
            <div className="flex gap-6 mt-4 text-center">
              <div><p className="text-lg font-bold text-stone-800">{myPosts.length}</p><p className="text-xs text-stone-500 font-medium">게시물</p></div>
              <div><p className="text-lg font-bold text-stone-800">{followData.followers}</p><p className="text-xs text-stone-500 font-medium">팔로워</p></div>
              <div><p className="text-lg font-bold text-stone-800">{followData.following}</p><p className="text-xs text-stone-500 font-medium">팔로잉</p></div>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {viewingUserId === user?.id ? (
                <>
                  <label className="cursor-pointer bg-stone-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors shadow-sm inline-flex items-center">
                    프로필 사진 변경
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                  </label>
                  <button onClick={() => { setSettingsView('main'); setShowSettings(true); }} className="px-4 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                    ⚙️ 설정
                  </button>
                  {isAdmin && (
                    <button onClick={() => setShowSponsorAdmin(true)} className="px-4 py-2 rounded-xl text-xs font-bold border border-amber-300 bg-amber-50 text-amber-800 shadow-sm hover:bg-amber-100 transition-colors">
                      📢 광고 관리
                    </button>
                  )}
                  <button onClick={() => setShowFeedback(true)} className="px-4 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                    {isAdmin ? '📮 건의함' : '📮 건의하기'}
                  </button>
                  {!isStandalone && (
                    <button onClick={handleInstallClick} className="px-4 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                      📱 홈 화면에 추가
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
          
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-stone-100">
            {myPosts.length === 0 ? (
              <div className="col-span-3 p-12 text-center text-stone-400 text-sm bg-white">게시물이 없습니다.</div>
            ) : (
              myPosts.map((post) => (
                <div 
                  key={post.id} 
                  onClick={() => openPostViewer(post)} 
                  className="aspect-square bg-white relative group overflow-hidden border border-stone-100 cursor-pointer hover:opacity-90 transition-opacity"
                >
                  {post.music && <span className="absolute top-1 right-1 z-10 text-xs bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center">🎵</span>}
                  {post.images && post.images.length > 0 ? (
                    <img src={post.images[0]} alt="사진" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full p-2 text-[0.75rem] text-stone-600 flex items-center justify-center text-center">{post.content}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* 탐색 탭 */}
      {activeTab === 'explore' && (
        <ExploreTab
          user={user}
          posts={posts}
          blockedIds={blockedIds}
          initialQuery={exploreQuery}
          onOpenProfile={goToProfile}
          onOpenPost={id => { const p = posts.find(x => x.id === id); if (p?.music) openPostViewer(p); else openPostComments(id); }}
          onRequireLogin={() => setShowAuthModal(true)}
        />
      )}

      {/* 익명 고민상담 탭 */}
      {activeTab === 'anon' && (
        <AnonBoard user={user} isAdmin={isAdmin} onRequireLogin={() => setShowAuthModal(true)} onReport={setReportTarget} />
      )}

      {/* 3. 메시지 목록 탭 */}
      {activeTab === 'messages' && (
        <section className="flex-1 bg-white flex flex-col">
          <div className="p-4 border-b border-stone-200">
            <h2 className="font-bold text-lg text-stone-900">메시지 목록</h2>
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
        <section className="flex-1 flex flex-col bg-stone-100">
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
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
          <form onSubmit={sendMessage} className="sticky bottom-0 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white border-t border-stone-200 flex gap-2">
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
        <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onBlock={blockUser} />
      )}

      {/* 설정 (차단 목록, 약관, 탈퇴) */}
      {showSettings && user && (
        <SettingsModal user={user} onClose={() => setShowSettings(false)} onUnblock={unblockUser}
          feastDay={profile?.feast_day || ''} baptismalName={myRealName || profile?.baptismal_name || ''} onFeastDayChange={updateMyFeastDay}
          onEditProfile={openProfileEdit}
          initialView={settingsView}
          onOpenMembers={isAdmin ? () => { setShowSettings(false); setShowAdminMembers(true); } : undefined}
          onOpenBgm={isAdmin ? () => { setShowSettings(false); setShowBgmAdmin(true); } : undefined} />
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
        <FeedbackModal user={user} isAdmin={isAdmin} onClose={() => setShowFeedback(false)} sendPush={sendPush} />
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
              <img src="/icon-192.png" alt="" className="w-12 h-12 rounded-xl" />
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
              {isMyFeastToday && (
                <div className="p-4 bg-amber-50/60">
                  <p className="text-[0.9375rem] text-stone-800">🎉 <b>{profile?.baptismal_name}</b>님, 오늘 축일을 축하드립니다!</p>
                  <p className="text-xs text-stone-600 mt-1">주님의 은총과 주보성인의 전구가 늘 함께하시길 기도합니다 🙏</p>
                </div>
              )}
              {visibleFeastFriends.map(f => (
                <div key={`feast-${f.id}`} className="p-4 flex items-center gap-3 bg-amber-50/60">
                  <button onClick={() => { setShowNotifications(false); goToProfile(f.id); }} className="flex-1 text-left min-w-0 text-[0.9375rem] text-stone-800">
                    🎉 오늘은 <b>{f.baptismal_name}</b>님의 축일이에요
                  </button>
                  <button onClick={() => congratulateFeast(f)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold shrink-0">축하하기</button>
                </div>
              ))}
              {followRequests.filter(r => !blockedIds.has(r.follower.id)).map(r => (
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
              {notifications.length === 0 && followRequests.length === 0 && unreadMessages.length === 0 && visibleFeastFriends.length === 0 && !isMyFeastToday ? (
                <div className="p-10 text-center text-stone-400 text-sm">아직 받은 알림이 없습니다.</div>
              ) : (
                notifications.map(n => (
                  <button key={n.id} onClick={() => openNotification(n)} className="w-full p-4 text-left hover:bg-stone-50 transition-colors flex flex-col gap-1">
                    <p className="text-[0.9375rem] text-stone-800">
                      💬 <b>{n.author_name}</b>님이 {n.is_reply ? '회원님에게 답글을 남겼습니다' : '회원님의 글에 댓글을 남겼습니다'}
                    </p>
                    <p className="text-xs text-stone-600 line-clamp-2">&ldquo;{n.content}&rdquo;</p>
                    <p className="text-[0.8125rem] text-stone-400 truncate">
                      {new Date(n.created_at).toLocaleString('ko-KR')} · {n.post_content || '사진 게시물'}
                    </p>
                  </button>
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
              <span className="text-3xl">✟</span>
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
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85dvh]" onClick={e => e.stopPropagation()}>
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
            
            <div className="overflow-y-auto flex-1 flex flex-col">
              {selectedPostDetail.images && selectedPostDetail.images.length > 0 && (
                <div className="w-full bg-black flex items-center justify-center relative">
                  <img src={selectedPostDetail.images[Math.min(detailImageIndex, selectedPostDetail.images.length - 1)]} alt="게시물 사진" className="max-h-[50dvh] object-contain w-full" />
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
              <div className="p-5 flex flex-col gap-2">
                <p className="text-stone-800 text-sm whitespace-pre-wrap leading-relaxed"><HashtagText text={selectedPostDetail.content} onTag={openHashtag} /></p>
                <span className="text-[0.8125rem] text-stone-400 mt-2">{new Date(selectedPostDetail.created_at).toLocaleString('ko-KR')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} alt="확대 사진" className="max-w-full max-h-[90dvh] object-contain rounded-lg" />
        </div>
      )}

      {/* 최초 로그인 시 이름(세례명) + 고유 핸들 강제 입력 모달 */}
      {user && (needsProfileSetup || profileEditMode) && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl flex flex-col gap-4 border border-stone-200 max-h-[92dvh] overflow-y-auto">
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
                <label className="text-[0.8125rem] font-bold text-stone-500 mb-1 block text-left">🕯️ 나의 축일</label>
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
          <button onClick={() => { if (!user) setShowAuthModal(true); else goToTab('messages'); }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'messages' ? 'text-stone-900' : 'text-stone-400'}`}>
            <span className="relative">
              <svg viewBox="0 0 24 24" fill={activeTab === 'messages' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              {unreadMessageCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[0.6875rem] font-bold rounded-full flex items-center justify-center">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>
              )}
            </span>
            <span className="text-[0.75rem] font-medium">메시지</span>
          </button>
          <button onClick={() => goToTab('anon')} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'anon' ? 'text-violet-700' : 'text-stone-400'}`}>
            <svg viewBox="0 0 24 24" fill={activeTab === 'anon' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-6.5-4.35-9-8.5C1.5 9.5 3 6 6.5 6c2 0 3.5 1.2 4.3 2.5h2.4C14 7.2 15.5 6 17.5 6 21 6 22.5 9.5 21 12.5 18.5 16.65 12 21 12 21z" /></svg>
            <span className="text-[0.75rem] font-medium">고민상담</span>
          </button>
          <button onClick={() => { if (!user) setShowAuthModal(true); else goToProfile(user.id); }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-stone-900' : 'text-stone-400'}`}>
            <svg viewBox="0 0 24 24" fill={activeTab === 'profile' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="text-[0.75rem] font-medium">내 공간</span>
          </button>
        </nav>
      )}
    </main>
  );
}