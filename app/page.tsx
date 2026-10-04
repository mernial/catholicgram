'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import imageCompression from 'browser-image-compression';
import { User } from '@supabase/supabase-js';

// 관리자 이메일 설정 (윤호님의 카카오 계정 이메일을 등록하여 모든 글 삭제 권한 부여)
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
}

interface Comment {
  id: string;
  post_id: string;
  content: string;
  author_name: string;
  created_at: string;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ baptismal_name: string } | null>(null);
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
  const [setupError, setSetupError] = useState('');

  // 사진 확대 모달용 상태
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // 글 수정 기능 상태
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
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
      }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) fetchProfile(user.id);
  };

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('baptismal_name').eq('id', userId).single();
    if (data && data.baptismal_name) {
      setProfile(data);
      setNeedsProfileSetup(false);
    } else {
      setNeedsProfileSetup(true);
    }
  };

  const handleKakaoLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: 'https://catholicgram-dey7.vercel.app/auth/signin-complete',
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      alert('카카오 로그인 오류가 발생했습니다.');
      return;
    }
    if (data?.url) window.location.href = data.url;
  };

  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!baptismalName.trim()) {
      setSetupError('이름과 세례명을 입력해주세요.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('profiles').upsert([{ 
      id: user.id, 
      baptismal_name: baptismalName.trim(), 
      email: user.email 
    }]);
    
    if (!error) {
      setProfile({ baptismal_name: baptismalName.trim() });
      setNeedsProfileSetup(false);
    } else {
      setSetupError('저장에 실패했습니다. 다시 시도해주세요.');
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (!error && data) setPosts(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).slice(0, 3);
    setSelectedFiles(files);
    setPreviewUrls(files.map(f => URL.createObjectURL(f)));
  };

  const removeFile = (idx: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== idx));
    setPreviewUrls(previewUrls.filter((_, i) => i !== idx));
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
      try {
        const compressed = await imageCompression(file, compressionOptions);
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${file.name.split('.').pop()}`;
        const { error: uploadError } = await supabase.storage.from('community-images').upload(fileName, compressed);
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('community-images').getPublicUrl(fileName);
          uploadedUrls.push(publicUrl);
        }
      } catch (err) {
        console.error('Image compression error:', err);
      }
    }

    const author = profile?.baptismal_name || '교우';
    const { error } = await supabase.from('posts').insert([{
      content,
      images: uploadedUrls,
      user_id: user.id,
      author_name: author
    }]);

    if (!error) {
      setContent('');
      setSelectedFiles([]);
      setPreviewUrls([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchPosts();
    }
    setLoading(false);
  };

  // 게시물 삭제 함수
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('정말로 이 글을 삭제하시겠습니까?')) return;
    setPosts(posts.filter(p => p.id !== postId));
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      alert('삭제 중 오류가 발생했습니다. 다시 시도해주세요.');
      fetchPosts();
    }
  };

  // 게시물 수정 준비 함수
  const startEditing = (post: Post) => {
    setEditingPostId(post.id);
    setEditContent(post.content);
  };

  // 게시물 수정 취소 함수
  const cancelEditing = () => {
    setEditingPostId(null);
    setEditContent('');
  };

  // 게시물 수정 저장 함수
  const handleUpdatePost = async (postId: string) => {
    if (!editContent.trim()) {
      alert('내용을 입력해주세요.');
      return;
    }

    // 화면(UI) 즉시 반영
    setPosts(posts.map(p => p.id === postId ? { ...p, content: editContent } : p));
    setEditingPostId(null);
    
    // DB 저장
    const { error } = await supabase
      .from('posts')
      .update({ content: editContent })
      .eq('id', postId);

    if (error) {
      alert('수정 중 오류가 발생했습니다.');
      fetchPosts(); // 에러 발생 시 원상복구
    }
  };

  const handleReaction = async (postId: string, type: 'pray' | 'like') => {
    if (!user) { setShowAuthModal(true); return; }
    if (needsProfileSetup) return;

    const currentPost = posts.find((p) => p.id === postId);
    if (!currentPost) return;

    const { data: existingReaction } = await supabase
      .from('post_reactions')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .eq('reaction_type', type)
      .maybeSingle(); 

    if (existingReaction) {
      await supabase.from('post_reactions').delete().eq('id', existingReaction.id);
      const newCount = type === 'pray' ? currentPost.pray_count - 1 : currentPost.like_count - 1;
      const updateField = type === 'pray' ? { pray_count: Math.max(0, newCount) } : { like_count: Math.max(0, newCount) };
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
    if (needsProfileSetup) return;
    const text = commentInputs[postId];
    if (!text || !text.trim()) return;
    const author = profile?.baptismal_name || '교우';
    const { data, error } = await supabase.from('comments').insert([{
      post_id: postId,
      content: text.trim(),
      user_id: user.id,
      author_name: author
    }]).select();
    if (!error && data) {
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data[0]] }));
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
    }
  };

  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-stone-200 bg-stone-50/30 flex flex-col font-sans relative">
      {/* 헤더 */}
      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-stone-200 px-4 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <span className="text-amber-800 text-xl font-serif">✟</span>
          <h1 className="font-serif font-bold text-stone-900 tracking-tight text-lg">가톨릭그램</h1>
        </div>
        <div>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-stone-700 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200">
                {profile?.baptismal_name ? `${profile.baptismal_name} 님` : '교우 님'}
              </span>
              <button onClick={handleSignOut} className="text-xs text-stone-500 hover:text-stone-800 transition-colors">로그아웃</button>
            </div>
          ) : (
            <button onClick={() => setShowAuthModal(true)} className="text-xs font-semibold bg-stone-900 text-white px-3.5 py-1.5 rounded-full hover:bg-stone-800 transition-colors">
              로그인
            </button>
          )}
        </div>
      </header>

      {/* 글 작성 */}
      <section className="p-4 bg-white border-b border-stone-200 shadow-sm">
        <form onSubmit={handleCreatePost} className="flex flex-col gap-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={user && !needsProfileSetup ? `${profile?.baptismal_name || '교우'}님, 오늘 마음속 기도나 묵상을 들려주세요...` : '로그인 후 기도와 묵상을 나눌 수 있습니다.'}
            rows={3}
            className="w-full p-3.5 text-sm bg-stone-50/70 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 text-stone-900 transition-all placeholder:text-stone-400"
          />
          {previewUrls.length > 0 && (
            <div className="flex gap-2 pt-1">
              {previewUrls.map((url, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-stone-200 shadow-sm">
                  <img src={url} alt="미리보기" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeFile(idx)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-black">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" id="photo-upload" />
              <label htmlFor="photo-upload" className="cursor-pointer text-xs font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200/80 px-3.5 py-2 rounded-xl transition-colors inline-flex items-center gap-1.5">
                📷 사진 첨부 {selectedFiles.length > 0 && `(${selectedFiles.length}/3)`}
              </label>
            </div>
            <button type="submit" disabled={loading || (!content.trim() && selectedFiles.length === 0)} className="bg-stone-900 text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-stone-800 disabled:opacity-40 transition-all shadow-sm">
              {loading ? '올리는 중...' : '나눔 올리기'}
            </button>
          </div>
        </form>
      </section>

      {/* 피드 목록 */}
      <section className="divide-y divide-stone-200/70 flex-1">
        {posts.length === 0 ? (
          <div className="p-12 text-center text-stone-400 text-sm">
            <p className="font-serif text-base mb-1">🕊️</p>
            아직 등록된 묵상 나눔이 없습니다.<br />첫 기도의 불을 밝혀주세요.
          </div>
        ) : (
          posts.map((post) => {
            const isAuthor = user?.id === post.user_id; // 작성자 본인인지 확인
            const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email); // 관리자인지 확인
            const canEdit = isAuthor; // 수정은 작성자 본인만 가능
            const canDelete = isAuthor || isAdmin; // 삭제는 작성자 본인 + 관리자 가능

            return (
              <article key={post.id} className="p-4 sm:p-5 bg-white flex flex-col gap-3 hover:bg-stone-50/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-serif font-bold">
                      {(post.author_name || '교')[0]}
                    </div>
                    <span className="text-xs font-bold text-stone-800">{post.author_name || '익명 교우'}</span>
                    <span className="text-[11px] text-stone-400">• {new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                  
                  {/* 수정 & 삭제 버튼 영역 */}
                  <div className="flex items-center gap-1">
                    {canEdit && editingPostId !== post.id && (
                      <button onClick={() => startEditing(post)} className="text-[11px] text-stone-400 hover:text-stone-700 font-medium px-2 py-1 transition-colors">
                        수정
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDeletePost(post.id)} className="text-[11px] text-stone-400 hover:text-red-500 font-medium px-2 py-1 transition-colors">
                        삭제
                      </button>
                    )}
                  </div>
                </div>
                
                {/* 글 내용 표시 (수정 모드 vs 일반 모드) */}
                {editingPostId === post.id ? (
                  <div className="flex flex-col gap-2 animate-fade-in">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-3.5 text-sm bg-white border border-stone-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 text-stone-900 transition-all"
                      rows={4}
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={cancelEditing} className="px-3.5 py-1.5 rounded-lg border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors">
                        취소
                      </button>
                      <button onClick={() => handleUpdatePost(post.id)} className="px-3.5 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 transition-colors">
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-stone-800 text-[13.5px] whitespace-pre-wrap leading-relaxed">{post.content}</p>
                )}
                
                {/* 이미지 영역 */}
                {post.images && post.images.length > 0 && (
                  <div className={`grid gap-2 rounded-2xl overflow-hidden border border-stone-100 ${post.images.length === 1 ? 'grid-cols-1' : post.images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {post.images.map((img, i) => (
                      <div key={i} className="aspect-square bg-stone-100 flex items-center justify-center overflow-hidden cursor-pointer group" onClick={() => setSelectedImage(img)}>
                        <img src={img} alt="첨부 사진" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      </div>
                    ))}
                  </div>
                )}

                {/* 하단 반응 버튼 */}
                <div className="flex items-center gap-5 text-xs text-stone-600 font-medium pt-1">
                  <button onClick={() => handleReaction(post.id, 'pray')} className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors">
                    <span>🙏</span> 기도할게요 {post.pray_count > 0 && `(${post.pray_count})`}
                  </button>
                  <button onClick={() => handleReaction(post.id, 'like')} className="flex items-center gap-1.5 hover:text-purple-600 transition-colors">
                    <span>🍇</span> 공감해요 {post.like_count > 0 && `(${post.like_count})`}
                  </button>
                  <button onClick={() => toggleCommentBox(post.id)} className="flex items-center gap-1.5 hover:text-stone-900 transition-colors">
                    <span>💬</span> 댓글
                  </button>
                </div>

                {/* 댓글 영역 */}
                {openComments[post.id] && (
                  <div className="mt-2 pt-3 border-t border-stone-100 flex flex-col gap-2.5">
                    <div className="flex flex-col gap-1.5">
                      {(comments[post.id] || []).map((c) => (
                        <div key={c.id} className="text-xs bg-stone-100/70 p-2.5 rounded-xl text-stone-800 flex flex-col gap-0.5">
                          <span className="font-bold text-[11px] text-stone-700">{c.author_name || '교우'}</span>
                          <span>{c.content}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                        placeholder={user ? '따뜻한 위로와 격려의 댓글을...' : '로그인 후 댓글 작성 가능'}
                        className="flex-1 text-xs border border-stone-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-stone-400 bg-white"
                      />
                      <button onClick={() => handleAddComment(post.id)} className="bg-stone-800 text-white text-xs px-3.5 py-2 rounded-xl hover:bg-stone-700 transition-colors font-medium">
                        등록
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {/* 사진 전체화면 모달 */}
      {selectedImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedImage(null)}
        >
          <img 
            src={selectedImage} 
            alt="확대 사진" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg" 
          />
          <button 
            className="absolute top-4 right-4 text-white text-3xl font-light hover:text-stone-300 w-10 h-10 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation(); 
              setSelectedImage(null);
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* 소셜 로그인 모달 창 */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-5 border border-stone-200">
            <div className="text-center">
              <span className="text-3xl">✟</span>
              <h2 className="font-serif font-bold text-xl text-stone-900 mt-2">가톨릭그램</h2>
              <p className="text-xs text-stone-500 mt-1.5">카카오 계정으로 3초 만에 시작하세요</p>
            </div>
            
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

      {/* 프로필 설정 모달 */}
      {user && needsProfileSetup && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-7 w-full max-w-sm shadow-2xl flex flex-col gap-4 border border-stone-200">
            <div className="text-center">
              <span className="text-2xl">🕊️</span>
              <h2 className="font-serif font-bold text-lg text-stone-900 mt-2">환영합니다!</h2>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                가톨릭그램에서 활동하실<br/>닉네임(이름+세례명)을 설정해주세요.
              </p>
            </div>
            <form onSubmit={handleProfileSetup} className="flex flex-col gap-3 mt-2">
              <input
                type="text"
                placeholder="예: 홍길동 미카엘"
                value={baptismalName}
                onChange={(e) => setBaptismalName(e.target.value)}
                required
                className="p-3.5 text-sm text-center font-medium border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 bg-stone-50"
              />
              {setupError && <p className="text-red-500 text-xs text-center">{setupError}</p>}
              <button 
                type="submit" 
                disabled={loading || !baptismalName.trim()}
                className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors mt-2"
              >
                {loading ? '저장 중...' : '이 닉네임으로 시작하기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}