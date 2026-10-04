'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import imageCompression from 'browser-image-compression';
import { User } from '@supabase/supabase-js';
import Cropper from 'react-easy-crop';

const ADMIN_EMAILS = ['yunho-jo@casuwon.or.kr']; 

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
}

interface Comment {
  id: string;
  post_id: string;
  content: string;
  author_name: string;
  created_at: string;
}

// ----------------- 이미지 자르기 유틸리티 함수 -----------------
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
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas is empty'));
    }, 'image/jpeg', 0.9);
  });
}
// -----------------------------------------------------------

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ baptismal_name: string, avatar_url?: string } | null>(null);
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
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [baptismalName, setBaptismalName] = useState('');
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // 탭 및 프로필 상태 관리 (새로고침 유지)
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<{baptismal_name: string, avatar_url?: string} | null>(null);
  const [followData, setFollowData] = useState({ followers: 0, following: 0, isFollowing: false });

  // 프로필 사진 자르기 상태
  const [avatarFile, setAvatarFile] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    // 새로고침 시 마지막으로 보던 탭과 프로필 기억
    const savedTab = localStorage.getItem('activeTab') as 'home' | 'profile';
    const savedUserId = localStorage.getItem('viewingUserId');
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
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (activeTab === 'profile' && viewingUserId) {
      fetchViewingProfile(viewingUserId);
      fetchFollowData(viewingUserId);
    }
  }, [activeTab, viewingUserId, user]);

  const goToHome = () => {
    setActiveTab('home');
    localStorage.setItem('activeTab', 'home');
  };

  const goToProfile = (targetUserId: string) => {
    setViewingUserId(targetUserId);
    setActiveTab('profile');
    localStorage.setItem('activeTab', 'profile');
    localStorage.setItem('viewingUserId', targetUserId);
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) fetchProfile(user.id);
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('baptismal_name, avatar_url').eq('id', userId).single();
    if (data && data.baptismal_name) {
      setProfile(data);
      setNeedsProfileSetup(false);
    } else {
      setNeedsProfileSetup(true);
    }
  };

  const fetchViewingProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('baptismal_name, avatar_url').eq('id', userId).single();
    if (data) setViewingProfile(data);
  };

  const fetchFollowData = async (targetId: string) => {
    const { count: followers } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', targetId);
    const { count: following } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId);
    let isFollowing = false;
    if (user) {
      const { data } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', targetId).maybeSingle();
      isFollowing = !!data;
    }
    setFollowData({ followers: followers || 0, following: following || 0, isFollowing });
  };

  const toggleFollow = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!viewingUserId) return;
    
    if (followData.isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', viewingUserId);
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: viewingUserId });
    }
    fetchFollowData(viewingUserId);
  };

  const handleKakaoLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: 'https://catholicgram-dey7.vercel.app/auth/signin-complete', skipBrowserRedirect: true },
    });
    if (data?.url) window.location.href = data.url;
  };

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('profiles').upsert([{ id: user.id, baptismal_name: baptismalName.trim(), email: user.email }]);
    if (!error) {
      setProfile({ baptismal_name: baptismalName.trim() });
      setNeedsProfileSetup(false);
    }
    setLoading(false);
  };

  const fetchPosts = async () => {
    const { data: postsData } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    const { data: profilesData } = await supabase.from('profiles').select('id, avatar_url');
    if (postsData && profilesData) {
      const profileMap = Object.fromEntries(profilesData.map((p: any) => [p.id, p.avatar_url]));
      setPosts(postsData.map(p => ({ ...p, avatar_url: profileMap[p.user_id] })));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).slice(0, 3);
    setSelectedFiles(files);
    setPreviewUrls(files.map(f => URL.createObjectURL(f)));
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setShowAuthModal(true); return; }
    if (needsProfileSetup) return;
    if (!content.trim() && selectedFiles.length === 0) return;
    setLoading(true);

    const uploadedUrls: string[] = [];
    const compressionOptions = { maxSizeMB: 1.5, maxWidthOrHeight: 1920, useWebWorker: true };

    for (const file of selectedFiles) {
      const compressed = await imageCompression(file, compressionOptions);
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
      fetchPosts();
      goToHome();
    }
    setLoading(false);
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
    const currentPost = posts.find((p) => p.id === postId);
    if (!currentPost) return;

    const { data: existing } = await supabase.from('post_reactions').select('id').eq('post_id', postId).eq('user_id', user.id).eq('reaction_type', type).maybeSingle(); 
    if (existing) {
      await supabase.from('post_reactions').delete().eq('id', existing.id);
      const newCount = Math.max(0, type === 'pray' ? currentPost.pray_count - 1 : currentPost.like_count - 1);
      const updateField = type === 'pray' ? { pray_count: newCount } : { like_count: newCount };
      await supabase.from('posts').update(updateField).eq('id', postId);
      setPosts(posts.map(p => p.id === postId ? { ...p, ...updateField } : p));
    } else {
      await supabase.from('post_reactions').insert({ post_id: postId, user_id: user.id, reaction_type: type });
      const newCount = type === 'pray' ? currentPost.pray_count + 1 : currentPost.like_count + 1;
      const updateField = type === 'pray' ? { pray_count: newCount } : { like_count: newCount };
      await supabase.from('posts').update(updateField).eq('id', postId);
      setPosts(posts.map(p => p.id === postId ? { ...p, ...updateField } : p));
    }
  };

  // 프로필 사진 선택 핸들러
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener('load', () => setAvatarFile(reader.result?.toString() || null));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // 자른 이미지 저장 핸들러
  const handleCropSave = async () => {
    if (!croppedAreaPixels || !avatarFile || !user) return;
    setLoading(true);
    try {
      const croppedBlob = await getCroppedImg(avatarFile, croppedAreaPixels);
      const fileName = `${user.id}_${Date.now()}.jpg`;
      await supabase.storage.from('avatars').upload(fileName, croppedBlob);
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      
      setProfile(prev => ({ ...prev!, avatar_url: publicUrl }));
      setViewingProfile(prev => ({ ...prev!, avatar_url: publicUrl }));
      setAvatarFile(null);
      fetchPosts();
    } catch (err) {
      alert('사진 변경에 실패했습니다.');
    }
    setLoading(false);
  };

  const myPosts = posts.filter(post => post.user_id === viewingUserId);

  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-stone-200 bg-stone-50/30 flex flex-col font-sans relative pb-16">
      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-stone-200 px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-2 cursor-pointer" onClick={goToHome}>
          <span className="text-amber-800 text-xl font-serif">✟</span>
          <h1 className="font-serif font-bold text-stone-900 tracking-tight text-lg">가톨릭그램</h1>
        </div>
        <div>
          {user ? (
            <div className="flex items-center gap-3">
              <button onClick={() => goToProfile(user.id)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="내 프로필" className="w-6 h-6 rounded-full object-cover border border-stone-200" />
                ) : (
                  <div className="w-6 h-6 bg-stone-200 rounded-full flex items-center justify-center text-[10px] font-bold text-stone-600">
                    {profile?.baptismal_name?.[0] || '교'}
                  </div>
                )}
                <span className="text-xs font-medium text-stone-700">{profile?.baptismal_name} 님</span>
              </button>
              <button onClick={() => supabase.auth.signOut()} className="text-[11px] text-stone-400 hover:text-stone-700">로그아웃</button>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)} className="text-xs font-semibold bg-stone-900 text-white px-3.5 py-1.5 rounded-full">로그인</button>
          )}
        </div>
      </header>

      {activeTab === 'home' ? (
        <>
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
                  <label htmlFor="photo-upload" className="cursor-pointer text-xs font-semibold text-stone-600 bg-stone-100 px-3.5 py-2 rounded-xl">📷 사진 첨부</label>
                </div>
                <button type="submit" disabled={loading || (!content.trim() && selectedFiles.length === 0)} className="bg-stone-900 text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-stone-800 disabled:opacity-40">{loading ? '올리는 중...' : '나눔 올리기'}</button>
              </div>
            </form>
          </section>

          <section className="divide-y divide-stone-200/70 flex-1">
            {posts.map((post) => {
              const canDelete = user?.id === post.user_id || (user?.email && ADMIN_EMAILS.includes(user.email));
              return (
                <article key={post.id} className="p-4 sm:p-5 bg-white flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <button onClick={() => goToProfile(post.user_id)} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                      {post.avatar_url ? (
                        <img src={post.avatar_url} alt="프로필" className="w-8 h-8 rounded-full object-cover border border-stone-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">{(post.author_name || '교')[0]}</div>
                      )}
                      <div className="flex flex-col items-start">
                        <span className="text-xs font-bold text-stone-800">{post.author_name}</span>
                        <span className="text-[10px] text-stone-400">{new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
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
                  </div>
                </article>
              );
            })}
          </section>
        </>
      ) : (
        <section className="flex-1 bg-white flex flex-col">
          <div className="p-8 border-b border-stone-200 flex flex-col items-center justify-center bg-stone-50/50">
            {viewingProfile?.avatar_url ? (
              <img src={viewingProfile.avatar_url} alt="프로필" className="w-24 h-24 rounded-full object-cover border border-stone-200 shadow-sm mb-4" />
            ) : (
              <div className="w-24 h-24 bg-stone-200 text-stone-600 rounded-full flex items-center justify-center text-4xl font-serif font-bold shadow-inner mb-4">
                {viewingProfile?.baptismal_name ? viewingProfile.baptismal_name[0] : '교'}
              </div>
            )}
            <h2 className="text-xl font-bold text-stone-900">{viewingProfile?.baptismal_name || '교우'}</h2>
            
            <div className="flex gap-6 mt-4 text-center">
              <div><p className="text-lg font-bold text-stone-800">{myPosts.length}</p><p className="text-xs text-stone-500 font-medium">게시물</p></div>
              <div><p className="text-lg font-bold text-stone-800">{followData.followers}</p><p className="text-xs text-stone-500 font-medium">팔로워</p></div>
              <div><p className="text-lg font-bold text-stone-800">{followData.following}</p><p className="text-xs text-stone-500 font-medium">팔로잉</p></div>
            </div>

            <div className="mt-5">
              {viewingUserId === user?.id ? (
                <label className="cursor-pointer bg-stone-900 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors shadow-sm">
                  프로필 사진 변경
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                </label>
              ) : (
                <button onClick={toggleFollow} className={`px-8 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors ${followData.isFollowing ? 'bg-stone-200 text-stone-800' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
                  {followData.isFollowing ? '팔로잉' : '팔로우'}
                </button>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-stone-100">
            {myPosts.map((post) => (
              <div key={post.id} className="aspect-square bg-white relative group overflow-hidden border border-stone-100">
                {post.images && post.images.length > 0 ? (
                  <img src={post.images[0]} alt="내 사진" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full p-2 text-[10px] text-stone-600 flex items-center justify-center text-center">{post.content}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 크롭 모달 (사진 자르기) */}
      {avatarFile && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col animate-fade-in">
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
              onCropComplete={useCallback((_, croppedPixels) => setCroppedAreaPixels(croppedPixels as any), [])}
            />
          </div>
          <div className="p-5 bg-white flex justify-between items-center pb-safe">
            <button onClick={() => setAvatarFile(null)} className="text-stone-500 font-medium text-sm">취소</button>
            <p className="text-xs text-stone-400">손가락으로 확대 및 이동</p>
            <button onClick={handleCropSave} disabled={loading} className="text-blue-500 font-bold text-sm">{loading ? '적용중...' : '확인'}</button>
          </div>
        </div>
      )}

      {/* 사진 확대 모달 */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} alt="확대 사진" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 max-w-xl mx-auto bg-white border-t border-stone-200 flex items-center justify-around z-40 pb-safe">
        <button onClick={goToHome} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-stone-900' : 'text-stone-400'}`}>
          <svg viewBox="0 0 24 24" fill={activeTab === 'home' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          <span className="text-[10px] font-medium">홈</span>
        </button>
        <button onClick={() => { if (!user) setShowAuthModal(true); else goToProfile(user.id); }} className={`flex-1 py-3.5 flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-stone-900' : 'text-stone-400'}`}>
          <svg viewBox="0 0 24 24" fill={activeTab === 'profile' ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          <span className="text-[10px] font-medium">내 공간</span>
        </button>
      </nav>
    </main>
  );
}