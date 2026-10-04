'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import imageCompression from 'browser-image-compression';
import { User } from '@supabase/supabase-js';
import Cropper from 'react-easy-crop';

const ADMIN_EMAILS = ['yunho-jo@casuwon.or.kr']; 

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
}

interface Comment { id: string; post_id: string; content: string; author_name: string; created_at: string; }
// 안드로이드 크롬 등에서 '앱 설치' 창을 띄우기 위한 이벤트 (표준 타입에 없음)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface CommentNotification { id: string; post_id: string; post_content: string; content: string; author_name: string; created_at: string; }
interface Message { id: string; sender_id: string; receiver_id: string; content: string; created_at: string; }
interface UserProfile { id: string; baptismal_name: string; avatar_url?: string; handle?: string; badge_type?: string; }

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
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [baptismalName, setBaptismalName] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [setupError, setSetupError] = useState('');
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedPostDetail, setSelectedPostDetail] = useState<Post | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const [activeTab, setActiveTab] = useState<'home' | 'profile' | 'messages' | 'chat'>('home');
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [followData, setFollowData] = useState({ followers: 0, following: 0, isFollowing: false });

  const [actionModalUser, setActionModalUser] = useState<UserProfile | null>(null);
  const [isFollowingActionUser, setIsFollowingActionUser] = useState(false);

  const [chatPartners, setChatPartners] = useState<UserProfile[]>([]);
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

    const savedTab = storageGet('activeTab') as 'home' | 'profile' | 'messages' | 'chat';
    const savedUserId = storageGet('viewingUserId');
    if (savedTab) setActiveTab(savedTab);
    if (savedUserId) setViewingUserId(savedUserId);

    checkUser();
    fetchPosts();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        setShowAuthModal(false);
        fetchProfile(currentUser.id);
      } else {
        setProfile(null);
        setNeedsProfileSetup(false);
        goToHome();
      }
    });
    return () => {
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
        setFollowData({ followers: 0, following: 0, isFollowing: false });
      }
      latestViewingUserIdRef.current = viewingUserId;
      fetchViewingProfile(viewingUserId);
      fetchFollowData(viewingUserId);
    } else if (activeTab === 'messages') {
      fetchChatPartners();
    }
  }, [activeTab, viewingUserId, user]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTab === 'chat' && currentChatUser) {
      fetchChatMessages(currentChatUser.id);
      interval = setInterval(() => fetchChatMessages(currentChatUser.id), 3000);
    }
    return () => clearInterval(interval);
  }, [activeTab, currentChatUser]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  const goToHome = () => { 
    setActiveTab('home'); 
    storageSet('activeTab', 'home');
  };

  const goToProfile = (targetUserId: string) => {
    setViewingUserId(targetUserId);
    setActiveTab('profile');
    storageSet('activeTab', 'profile');
    storageSet('viewingUserId', targetUserId);
    setActionModalUser(null);
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) fetchProfile(user.id);
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', userId).single();
    if (data && data.baptismal_name && data.handle) { 
      setProfile(data); 
      setNeedsProfileSetup(false); 
    } else { 
      setNeedsProfileSetup(true); 
    }
  };

  const fetchViewingProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').eq('id', userId).single();
    // 응답이 늦게 도착해도 지금 보고 있는 프로필이 아니면 무시
    if (data && latestViewingUserIdRef.current === userId) setViewingProfile(data);
  };

  const fetchFollowData = async (targetId: string) => {
    const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetId);
    const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId);
    let isFollowing = false;
    if (user) {
      const { data } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', targetId).maybeSingle();
      isFollowing = !!data;
    }
    if (latestViewingUserIdRef.current !== targetId) return;
    setFollowData({ followers: followers || 0, following: following || 0, isFollowing });
  };

  const toggleFollow = async (targetId: string, currentStatus: boolean) => {
    if (!user) { setShowAuthModal(true); return; }
    if (currentStatus) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
    }
    if (activeTab === 'profile' && viewingUserId === targetId) fetchFollowData(targetId);
    if (actionModalUser && actionModalUser.id === targetId) setIsFollowingActionUser(!currentStatus);
  };

  const handleAvatarClick = async (postUser: { id: string, name: string, avatar_url?: string, handle?: string, badge_type?: string }) => {
    if (!user) { setShowAuthModal(true); return; }
    if (postUser.id === user.id) {
      goToProfile(user.id);
      return;
    }
    const { data } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', postUser.id).maybeSingle();
    setIsFollowingActionUser(!!data);
    setActionModalUser({ id: postUser.id, baptismal_name: postUser.name, avatar_url: postUser.avatar_url, handle: postUser.handle, badge_type: postUser.badge_type });
  };

  const fetchChatPartners = async () => {
    if (!user) return;
    const { data } = await supabase.from('messages').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false });
    if (!data || data.length === 0) { setChatPartners([]); return; }

    const partnerIds = new Set<string>();
    data.forEach(m => {
      if (m.sender_id !== user.id) partnerIds.add(m.sender_id);
      if (m.receiver_id !== user.id) partnerIds.add(m.receiver_id);
    });

    const { data: profiles } = await supabase.from('profiles').select('id, baptismal_name, avatar_url, handle, badge_type').in('id', Array.from(partnerIds));
    setChatPartners(profiles || []);
  };

  const openChatRoom = (partner: UserProfile) => {
    setCurrentChatUser(partner);
    setActiveTab('chat');
    storageSet('activeTab', 'chat');
    setActionModalUser(null);
  };

  const fetchChatMessages = async (partnerId: string) => {
    if (!user) return;
    const { data } = await supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    if (data) setChatMessages(data);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentChatUser || !messageInput.trim()) return;
    const newMsg = messageInput.trim();
    setMessageInput('');
    await supabase.from('messages').insert({ sender_id: user.id, receiver_id: currentChatUser.id, content: newMsg });
    fetchChatMessages(currentChatUser.id);
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

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!baptismalName.trim() || !handleInput.trim()) {
      setSetupError('이름(세례명)과 고유 핸들을 모두 입력해주세요.');
      return;
    }

    const cleanHandle = handleInput.trim().replace(/^@/, '').toLowerCase();
    setLoading(true);
    setSetupError('');

    const { error } = await supabase.from('profiles').upsert([{ 
      id: user.id, 
      baptismal_name: baptismalName.trim(), 
      handle: cleanHandle,
      email: user.email 
    }]);

    if (!error) {
      setProfile({ id: user.id, baptismal_name: baptismalName.trim(), handle: cleanHandle });
      setNeedsProfileSetup(false);
      fetchPosts();
    } else {
      setSetupError('이미 사용 중인 핸들(@아이디)입니다. 다른 아이디를 입력해주세요.');
    }
    setLoading(false);
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
    const { error } = await supabase.from('posts').insert([{ content, images: uploadedUrls, user_id: user.id, author_name: author }]);
    if (!error) {
      setContent(''); setSelectedFiles([]); setPreviewUrls([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchPosts(); goToHome();
    }
    setLoading(false);
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
    if (!myPosts || myPosts.length === 0) { setNotifications([]); return; }
    const postContent = Object.fromEntries(myPosts.map(p => [p.id, p.content || '']));
    const { data } = await supabase.from('comments')
      .select('id, post_id, content, author_name, created_at')
      .in('post_id', myPosts.map(p => p.id))
      .neq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) setNotifications(data.map(c => ({ ...c, post_content: postContent[c.post_id] })));
  };

  const unreadCount = !user ? 0 : notifications.filter(n =>
    !notificationsLastSeen || new Date(n.created_at) > new Date(notificationsLastSeen)
  ).length;

  const openNotifications = () => {
    if (!user) return;
    setShowNotifications(true);
    // 목록을 열면 모두 읽음 처리 (빨간 숫자는 사라지고, 새 알림 표시는 이번 목록에서만 유지)
    const now = new Date().toISOString();
    storageSet(`notificationsLastSeen:${user.id}`, now);
    setTimeout(() => setNotificationsLastSeen(now), 0);
  };

  const openNotification = async (n: CommentNotification) => {
    setShowNotifications(false);
    goToHome();
    setOpenComments(prev => ({ ...prev, [n.post_id]: true }));
    const { data } = await supabase.from('comments').select('*').eq('post_id', n.post_id).order('created_at', { ascending: true });
    if (data) setComments(prev => ({ ...prev, [n.post_id]: data }));
    setTimeout(() => document.getElementById(`post-${n.post_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  // 내 글에 달린 댓글 알림: 로그인 중에는 30초마다, 앱으로 돌아왔을 때 다시 확인
  useEffect(() => {
    if (!user) return;
    fetchNotifications(user.id);
    const interval = setInterval(() => fetchNotifications(user.id), 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchNotifications(user.id); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  // 먼저 안내 창을 띄운다. 안드로이드는 설치 중 'Play 프로텍트' 경고가 뜰 수 있어
  // '무시하고 설치'를 눌러야 한다는 점을 설치 전에 미리 알려준다.
  const handleInstallClick = () => setShowInstallGuide(true);

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
      if (data) setComments(prev => ({ ...prev, [postId]: data }));
    }
  };
  const handleAddComment = async (postId: string) => {
    if (!user) { setShowAuthModal(true); return; }
    const text = commentInputs[postId];
    if (!text || !text.trim()) return;
    const author = profile?.baptismal_name || '교우';
    const { data, error } = await supabase.from('comments').insert([{ post_id: postId, content: text.trim(), user_id: user.id, author_name: author }]).select();
    if (!error && data) {
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data[0]] }));
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => setAvatarFile(reader.result?.toString() || null));
      reader.readAsDataURL(e.target.files[0]);
    }
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

  const myPosts = posts.filter(post => post.user_id === viewingUserId);

  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-stone-200 bg-stone-50/30 flex flex-col font-sans relative pb-16">
      
      {/* 헤더 */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-stone-200 px-4 py-3 flex items-center justify-between z-20">
        {activeTab === 'chat' ? (
          <div className="flex items-center gap-3">
            <button onClick={() => { setActiveTab('messages'); storageSet('activeTab', 'messages'); }} className="text-stone-600 hover:text-black">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex items-center gap-2">
              {currentChatUser?.avatar_url ? (
                <img src={currentChatUser.avatar_url} alt="프로필" className="w-8 h-8 rounded-full object-cover border border-stone-200" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">{currentChatUser?.baptismal_name?.[0]}</div>
              )}
              <div>
                <div className="flex items-center gap-1">
                  <h1 className="font-bold text-stone-900 text-sm">{currentChatUser?.baptismal_name}</h1>
                  {currentChatUser?.badge_type === 'priest' && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-serif font-bold border border-amber-200">✟ 신부님</span>
                  )}
                </div>
                <p className="text-[10px] text-stone-400">@{currentChatUser?.handle}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 cursor-pointer" onClick={goToHome}>
              <span className="text-amber-800 text-xl font-serif">✟</span>
              <h1 className="font-serif font-bold text-stone-900 tracking-tight text-lg">가톨릭그램</h1>
            </div>
            <div>
              {user ? (
                <div className="flex items-center gap-3">
                  <button onClick={openNotifications} className="relative text-stone-600 hover:text-stone-900" aria-label="알림">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                  </button>
                  <button onClick={() => goToProfile(user.id)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="내 프로필" className="w-6 h-6 rounded-full object-cover border border-stone-200" />
                    ) : (
                      <div className="w-6 h-6 bg-stone-200 rounded-full flex items-center justify-center text-[10px] font-bold text-stone-600">{profile?.baptismal_name?.[0] || '교'}</div>
                    )}
                    <span className="text-xs font-medium text-stone-700 flex items-center gap-1">
                      {profile?.baptismal_name}
                      {profile?.badge_type === 'priest' && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-serif">신부님</span>}
                    </span>
                  </button>
                  <button onClick={() => supabase.auth.signOut()} className="text-[11px] text-stone-400 hover:text-stone-700">로그아웃</button>
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
          <section className="p-4 bg-white border-b border-stone-200 shadow-sm">
            <form onSubmit={handleCreatePost} className="flex flex-col gap-3">
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={user ? "오늘 마음속 기도나 묵상을 들려주세요..." : '로그인 후 나눌 수 있습니다.'} rows={3} className="w-full p-3.5 text-sm bg-stone-50/70 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400" />
              {previewUrls.length > 0 && (
                <div className="flex gap-2 pt-1">
                  {previewUrls.map((url, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden shadow-sm">
                      <img src={url} alt="미리보기" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeFile(idx)} className="absolute top-0 right-0 bg-black/60 text-white w-4 h-4 flex items-center justify-center text-[10px]">×</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" id="photo-upload" />
                  <label htmlFor="photo-upload" className="cursor-pointer text-xs font-semibold text-stone-600 bg-stone-100 px-3.5 py-2 rounded-xl inline-flex items-center gap-1.5">
                    📷 사진첩에서 선택
                  </label>
                </div>
                <button type="submit" disabled={loading || (!content.trim() && selectedFiles.length === 0)} className="bg-stone-900 text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-stone-800 disabled:opacity-40">{loading ? '올리는 중...' : '나눔 올리기'}</button>
              </div>
            </form>
          </section>

          <section className="divide-y divide-stone-200/70 flex-1">
            {posts.map((post) => {
              const canDelete = user?.id === post.user_id || (user?.email && ADMIN_EMAILS.includes(user.email));
              return (
                <article key={post.id} id={`post-${post.id}`} className="p-4 sm:p-5 bg-white flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <button onClick={() => handleAvatarClick({ id: post.user_id, name: post.author_name, avatar_url: post.avatar_url, handle: post.handle, badge_type: post.badge_type })} className="flex items-center gap-2.5 hover:opacity-70 transition-opacity text-left">
                      {post.avatar_url ? (
                        <img src={post.avatar_url} alt="프로필" className="w-9 h-9 rounded-full object-cover border border-stone-200" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">{(post.author_name || '교')[0]}</div>
                      )}
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-stone-800">{post.author_name}</span>
                          {post.badge_type === 'priest' && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-serif font-bold border border-amber-200 flex items-center gap-0.5">
                              ✟ 신부님
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-stone-400">@{post.handle || 'user'} • {new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      {user?.id === post.user_id && <button onClick={() => { setEditingPostId(post.id); setEditContent(post.content); }} className="text-[11px] text-stone-400 hover:text-stone-700 px-2 py-1">수정</button>}
                      {canDelete && <button onClick={() => handleDeletePost(post.id)} className="text-[11px] text-stone-400 hover:text-red-500 px-2 py-1">삭제</button>}
                    </div>
                  </div>
                  
                  {editingPostId === post.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full p-3 text-sm border border-stone-300 rounded-xl resize-none focus:outline-none" rows={3} />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingPostId(null)} className="px-3 py-1.5 rounded-lg border text-xs">취소</button>
                        <button onClick={() => handleUpdatePost(post.id)} className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs">저장</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-stone-800 text-[13.5px] whitespace-pre-wrap leading-relaxed">{post.content}</p>
                  )}
                  
                  {post.images && post.images.length > 0 && (
                    <div className={`grid gap-1 rounded-xl overflow-hidden border border-stone-100 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      {post.images.map((img, i) => (
                        <img key={i} src={img} alt="첨부" className="w-full aspect-square object-cover cursor-pointer" onClick={() => setSelectedImage(img)} />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-5 text-xs font-medium pt-1">
                    <button onClick={() => handleReaction(post.id, 'pray')} className="flex items-center gap-1.5 text-stone-600 hover:text-indigo-600">🙏 기도할게요 {post.pray_count > 0 && `(${post.pray_count})`}</button>
                    <button onClick={() => handleReaction(post.id, 'like')} className="flex items-center gap-1.5 text-stone-600 hover:text-purple-600">🍇 공감해요 {post.like_count > 0 && `(${post.like_count})`}</button>
                    <button onClick={() => toggleCommentBox(post.id)} className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900">💬 댓글</button>
                  </div>

                  {openComments[post.id] && (
                    <div className="mt-2 pt-3 border-t border-stone-100 flex flex-col gap-2.5">
                      <div className="flex flex-col gap-1.5">
                        {(comments[post.id] || []).map((c) => (
                          <div key={c.id} className="text-xs bg-stone-100/70 p-2.5 rounded-xl text-stone-800 flex flex-col gap-0.5">
                            <span className="font-bold text-[11px] text-stone-700">{c.author_name}</span>
                            <span>{c.content}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <input type="text" value={commentInputs[post.id] || ''} onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)} placeholder="댓글을 입력하세요..." className="flex-1 text-xs border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
                        <button onClick={() => handleAddComment(post.id)} className="bg-stone-800 text-white text-xs px-3 py-2 rounded-xl">등록</button>
                      </div>
                    </div>
                  )}
                </article>
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
              {viewingProfile?.badge_type === 'priest' && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-serif font-bold border border-amber-200">✟ 신부님</span>
              )}
            </div>
            <p className="text-xs text-stone-400 mt-0.5">@{viewingProfile?.handle || 'user'}</p>
            
            <div className="flex gap-6 mt-4 text-center">
              <div><p className="text-lg font-bold text-stone-800">{myPosts.length}</p><p className="text-xs text-stone-500 font-medium">게시물</p></div>
              <div><p className="text-lg font-bold text-stone-800">{followData.followers}</p><p className="text-xs text-stone-500 font-medium">팔로워</p></div>
              <div><p className="text-lg font-bold text-stone-800">{followData.following}</p><p className="text-xs text-stone-500 font-medium">팔로잉</p></div>
            </div>

            <div className="mt-5 flex gap-2">
              {viewingUserId === user?.id ? (
                <>
                  <label className="cursor-pointer bg-stone-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors shadow-sm inline-flex items-center">
                    프로필 사진 변경
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                  </label>
                  {!isStandalone && (
                    <button onClick={handleInstallClick} className="px-4 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                      📱 홈 화면에 추가
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button onClick={() => toggleFollow(viewingUserId!, followData.isFollowing)} className={`px-6 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors ${followData.isFollowing ? 'bg-stone-200 text-stone-800' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                    {followData.isFollowing ? '팔로잉' : '팔로우'}
                  </button>
                  <button onClick={() => viewingProfile && openChatRoom(viewingProfile)} disabled={!viewingProfile} className="px-6 py-2 rounded-xl text-xs font-bold border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 transition-colors">
                    메시지
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-stone-100">
            {myPosts.length === 0 ? (
              <div className="col-span-3 p-12 text-center text-stone-400 text-sm bg-white">게시물이 없습니다.</div>
            ) : (
              myPosts.map((post) => (
                <div 
                  key={post.id} 
                  onClick={() => setSelectedPostDetail(post)} 
                  className="aspect-square bg-white relative group overflow-hidden border border-stone-100 cursor-pointer hover:opacity-90 transition-opacity"
                >
                  {post.images && post.images.length > 0 ? (
                    <img src={post.images[0]} alt="사진" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full p-2 text-[10px] text-stone-600 flex items-center justify-center text-center">{post.content}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
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
              chatPartners.map(partner => (
                <button key={partner.id} onClick={() => openChatRoom(partner)} className="w-full p-4 flex items-center gap-3 hover:bg-stone-50 transition-colors text-left">
                  {partner.avatar_url ? (
                    <img src={partner.avatar_url} alt="프로필" className="w-12 h-12 rounded-full object-cover border border-stone-200" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-serif font-bold text-lg">{partner.baptismal_name[0]}</div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-stone-800 text-sm">{partner.baptismal_name}</h3>
                      {partner.badge_type === 'priest' && <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded font-serif">신부님</span>}
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">@{partner.handle} • 대화 계속하기...</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {/* 4. 1:1 실시간 채팅방 탭 */}
      {activeTab === 'chat' && (
        <section className="flex-1 flex flex-col bg-[#F5F5F5]">
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
            {chatMessages.length === 0 ? (
              <div className="text-center text-stone-400 text-xs mt-10">첫 인사를 건네보세요.</div>
            ) : (
              chatMessages.map(msg => {
                const isMe = msg.sender_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-[13.5px] ${isMe ? 'bg-blue-500 text-white rounded-br-none' : 'bg-white text-stone-800 border border-stone-200 rounded-bl-none shadow-sm'}`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="p-3 bg-white border-t border-stone-200 flex gap-2">
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
                  {actionModalUser.badge_type === 'priest' && <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded font-serif">신부님</span>}
                </div>
                <p className="text-xs text-stone-400">@{actionModalUser.handle}</p>
              </div>
            </div>
            <div className="flex flex-col">
              <button onClick={() => goToProfile(actionModalUser.id)} className="w-full p-4 text-sm font-medium text-left hover:bg-stone-50 border-b border-stone-100 transition-colors">
                👤 프로필(공간) 보러가기
              </button>
              <button onClick={() => { toggleFollow(actionModalUser.id, isFollowingActionUser); }} className="w-full p-4 text-sm font-medium text-left hover:bg-stone-50 border-b border-stone-100 transition-colors">
                {isFollowingActionUser ? '✖ 팔로우 취소' : '➕ 팔로우하기'}
              </button>
              <button onClick={() => openChatRoom(actionModalUser)} className="w-full p-4 text-sm font-medium text-left text-blue-600 hover:bg-blue-50 transition-colors">
                💬 개인 메시지(DM) 보내기
              </button>
              <button onClick={() => setActionModalUser(null)} className="w-full p-4 text-sm font-bold text-center text-stone-400 hover:bg-stone-50 transition-colors bg-stone-50/50 mt-2">
                닫기
              </button>
            </div>
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
                <h2 className="font-bold text-stone-900">홈 화면에 추가하기</h2>
                <p className="text-xs text-stone-500">앱처럼 아이콘을 눌러 바로 열 수 있어요</p>
              </div>
            </div>
            {isIOS ? (
              <ol className="text-sm text-stone-700 flex flex-col gap-2.5 list-decimal pl-5">
                <li><b>Safari</b>로 이 페이지를 열어주세요 (Chrome은 오른쪽 위 공유 버튼)</li>
                <li>화면 아래(또는 위)의 <b>공유 버튼</b> <span className="inline-block border border-stone-300 rounded px-1 text-xs">⬆︎</span> 을 누르세요</li>
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
                  <p className="text-[15px] font-bold text-red-700">⚠️ 설치 중 경고 창이 뜨면</p>
                  <p className="text-sm text-stone-800 leading-relaxed">
                    &lsquo;Play 프로텍트&rsquo; 등의 경고가 뜰 수 있어요.<br />
                    큰 <b>[확인]</b> 버튼을 누르면 <b className="text-red-700">설치가 취소</b>됩니다.
                  </p>
                  <p className="text-[15px] font-bold text-stone-900 bg-yellow-200 rounded-lg px-3 py-2 text-center">
                    👉 아래쪽 작은 글씨 <u>무시하고 설치</u>를 눌러주세요
                  </p>
                  <p className="text-xs text-stone-500 text-center">(안 보이면 <b>자세히</b>를 먼저 누르세요)</p>
                </div>
              </>
            )}
            {!isIOS && installPrompt ? (
              <div className="flex gap-2">
                <button onClick={() => setShowInstallGuide(false)} className="px-4 py-3 rounded-xl text-sm font-medium text-stone-500 border border-stone-200">취소</button>
                <button onClick={startNativeInstall} className="flex-1 bg-stone-900 text-white py-3 rounded-xl text-sm font-bold">알겠어요, 설치하기</button>
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
          <div className="bg-white w-full sm:w-96 max-h-[80vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col pb-safe" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-bold text-stone-900">알림</h2>
              <button onClick={() => setShowNotifications(false)} className="text-stone-400 hover:text-stone-700 font-bold text-lg px-1">×</button>
            </div>
            <div className="overflow-y-auto divide-y divide-stone-100">
              {notifications.length === 0 ? (
                <div className="p-10 text-center text-stone-400 text-sm">아직 받은 알림이 없습니다.</div>
              ) : (
                notifications.map(n => (
                  <button key={n.id} onClick={() => openNotification(n)} className="w-full p-4 text-left hover:bg-stone-50 transition-colors flex flex-col gap-1">
                    <p className="text-[13px] text-stone-800">
                      💬 <b>{n.author_name}</b>님이 회원님의 글에 댓글을 남겼습니다
                    </p>
                    <p className="text-xs text-stone-600 line-clamp-2">&ldquo;{n.content}&rdquo;</p>
                    <p className="text-[11px] text-stone-400 truncate">
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
              <p className="text-xs text-stone-500 mt-1.5">카카오 계정으로 3초 만에 시작하세요</p>
            </div>

            {isKakaoInApp && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed text-center">
                카카오톡 안에서는 로그인이 안 될 수 있어요.<br />
                오른쪽 아래 <b>⋯</b> 버튼 → <b>다른 브라우저로 열기</b>를 눌러주세요.
              </p>
            )}

            {storageBlocked && (
              <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 leading-relaxed text-center">
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
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {selectedPostDetail.avatar_url ? (
                  <img src={selectedPostDetail.avatar_url} alt="프로필" className="w-8 h-8 rounded-full object-cover border border-stone-200" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">{(selectedPostDetail.author_name || '교')[0]}</div>
                )}
                <div>
                  <span className="text-xs font-bold text-stone-800">{selectedPostDetail.author_name}</span>
                  <span className="text-[10px] text-stone-400 block">@{selectedPostDetail.handle || 'user'}</span>
                </div>
              </div>
              <button onClick={() => setSelectedPostDetail(null)} className="text-stone-400 hover:text-stone-700 p-1 font-bold text-lg">×</button>
            </div>
            
            <div className="overflow-y-auto flex-1 flex flex-col">
              {selectedPostDetail.images && selectedPostDetail.images.length > 0 && (
                <div className="w-full bg-black flex items-center justify-center">
                  <img src={selectedPostDetail.images[0]} alt="게시물 사진" className="max-h-[50vh] object-contain w-full" />
                </div>
              )}
              <div className="p-5 flex flex-col gap-2">
                <p className="text-stone-800 text-sm whitespace-pre-wrap leading-relaxed">{selectedPostDetail.content}</p>
                <span className="text-[11px] text-stone-400 mt-2">{new Date(selectedPostDetail.created_at).toLocaleString('ko-KR')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} alt="확대 사진" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}

      {/* 최초 로그인 시 이름(세례명) + 고유 핸들 강제 입력 모달 */}
      {user && needsProfileSetup && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl flex flex-col gap-4 border border-stone-200">
            <div className="text-center">
              <span className="text-2xl">🕊️</span>
              <h2 className="font-serif font-bold text-lg text-stone-900 mt-2">환영합니다!</h2>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                가톨릭그램에서 사용할 프로필을 설정해주세요.<br/>(동명이인을 구분하는 고유 아이디입니다)
              </p>
            </div>
            <form onSubmit={handleProfileSetup} className="flex flex-col gap-3 mt-2">
              <div>
                <label className="text-[11px] font-bold text-stone-500 mb-1 block text-left">이름 + 세례명</label>
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
                <label className="text-[11px] font-bold text-stone-500 mb-1 block text-left">나만의 고유 핸들 (@아이디)</label>
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

              {setupError && <p className="text-red-500 text-xs text-center">{setupError}</p>}
              
              <button 
                type="submit" 
                disabled={loading || !baptismalName.trim() || !handleInput.trim()}
                className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors mt-2"
              >
                {loading ? '저장 중...' : '가톨릭그램 시작하기'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 하단 네비게이션 */}
      {activeTab !== 'chat' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-xl mx-auto bg-white border-t border-stone-200 flex items-center justify-around z-40 pb-safe">
          <button onClick={() => { goToHome(); }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-stone-900' : 'text-stone-400'}`}>
            <svg viewBox="0 0 24 24" fill={activeTab === 'home' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span className="text-[10px] font-medium">홈</span>
          </button>
          <button onClick={() => { if (!user) setShowAuthModal(true); else { setActiveTab('messages'); storageSet('activeTab', 'messages'); } }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'messages' ? 'text-stone-900' : 'text-stone-400'}`}>
            <svg viewBox="0 0 24 24" fill={activeTab === 'messages' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <span className="text-[10px] font-medium">메시지</span>
          </button>
          <button onClick={() => { if (!user) setShowAuthModal(true); else goToProfile(user.id); }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-stone-900' : 'text-stone-400'}`}>
            <svg viewBox="0 0 24 24" fill={activeTab === 'profile' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span className="text-[10px] font-medium">내 공간</span>
          </button>
        </nav>
      )}
    </main>
  );
}