import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { postPlainText, splitPostStickers } from '@/lib/stickers';
import OpenPost, { OpenInAppButton } from './OpenPost';

// 카카오톡 등으로 공유한 게시글 주소 (/p/글id)
//  - 미리 보기(og)에 그 글의 사진·작성자·글
//  - 이 주소 자체가 그 글을 보여 준다(사진·영상·글). 카카오톡·네이버 같은 앱 안의 창에서는 가톨릭그램 앱 화면이
//    다른 브라우저로 넘기려다 막히는 일이 있어(아이패드 카카오톡: '해당 페이지를 찾을 수 없습니다'), 앱 없이도 글이 보이게
//  - 보통 브라우저·설치한 앱에서 열면 곧바로 앱의 그 글 크게 보기(/?view=글id)로 넘어간다 (OpenPost)
// 로그인하지 않은 읽기 권한(anon)으로 읽으므로 공개 범위(팔로워만·나만)를 그대로 따른다 — 공개 글만 보인다
type Props = { params: Promise<{ id: string }> };
type SharedPost = {
  id: string; user_id: string | null; content: string | null; images: string[] | null;
  video_url: string | null; video_poster: string | null; author_name: string | null; created_at: string;
};
type Author = { avatar_url: string | null; handle: string | null };

const SITE = { title: '가톨릭그램', description: '기도와 묵상을 나누는 가톨릭 커뮤니티' };

const client = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
};

async function getPost(id: string): Promise<SharedPost | null> {
  const supabase = client();
  if (!supabase || !/^[\w-]{1,64}$/.test(id)) return null;
  const { data } = await supabase.from('posts')
    .select('id, user_id, content, images, video_url, video_poster, author_name, created_at').eq('id', id).maybeSingle();
  return (data as SharedPost | null) || null;
}

async function getAuthor(userId: string | null): Promise<Author | null> {
  const supabase = client();
  if (!supabase || !userId) return null;
  const { data } = await supabase.from('profiles').select('avatar_url, handle').eq('id', userId).maybeSingle();
  return (data as Author | null) || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id).catch(() => null);
  if (!post) return { ...SITE, openGraph: { ...SITE, siteName: SITE.title, images: ['/og-catholicgram.jpg'] } };
  const text = postPlainText(post.content).replace(/\s+/g, ' ').trim();
  const title = `${post.author_name || '교우'}님의 글 · 가톨릭그램`;
  const description = text ? (text.length > 80 ? `${text.slice(0, 80)}…` : text) : '가톨릭그램에서 사진을 보세요';
  const image = post.images?.[0] || post.video_poster;
  // og:url·canonical 이 없으면 카카오톡 미리 보기 카드(사진 부분)를 누를 때 이 글이 아니라 사이트 첫 화면이 열렸다
  // (글 주소 글자를 누르면 그 글로 갔음). 카드도 이 글 주소로 가게 적어 둔다
  const url = `/p/${encodeURIComponent(post.id)}`;
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'article', siteName: SITE.title, url, images: [image || '/og-catholicgram.jpg'] },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description },
  };
}

export default async function SharedPostPage({ params }: Props) {
  const { id } = await params;
  const post = await getPost(id).catch(() => null);
  const author = post ? await getAuthor(post.user_id).catch(() => null) : null;
  const appHref = post ? `/?view=${encodeURIComponent(post.id)}` : '/';
  const { text, stickers } = splitPostStickers(post?.content);
  const name = post?.author_name || '교우';

  return (
    <main className="min-h-dvh bg-stone-100 flex flex-col items-center px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      {post && <OpenPost href={appHref} />}
      <a href="/" className="flex items-center gap-2 mb-4">
        <img src="/icon-v2-192.png" alt="" className="w-9 h-9 rounded-xl shadow-sm" />
        <span className="font-bold text-[1.125rem] text-stone-900">가톨릭그램</span>
      </a>

      {post ? (
        <article className="w-full max-w-md bg-white rounded-3xl shadow-sm overflow-hidden">
          <header className="flex items-center gap-3 px-4 py-3">
            {author?.avatar_url
              ? <img src={author.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-stone-200" />
              : <span className="w-10 h-10 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-bold">{name.slice(0, 1)}</span>}
            <div className="min-w-0">
              <p className="font-bold text-stone-900 truncate">{name}</p>
              {author?.handle && <p className="text-[0.8125rem] text-stone-400">@{author.handle}</p>}
            </div>
          </header>
          {post.video_url ? (
            <video src={post.video_url} poster={post.video_poster || undefined} controls playsInline preload="metadata" className="w-full max-h-[70dvh] bg-black" />
          ) : (
            (post.images || []).map((src, i) => (
              <img key={i} src={src} alt={`사진 ${i + 1}`} className="w-full max-h-[80dvh] object-contain bg-black" />
            ))
          )}
          <div className="px-5 py-4 flex flex-col gap-3">
            {stickers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stickers.map((s, i) => <img key={i} src={s.src} alt={`이모티콘: ${s.label}`} className="w-28 h-28 object-contain" />)}
              </div>
            )}
            {text && <p className="text-[1.0625rem] leading-relaxed text-stone-900 whitespace-pre-wrap break-words">{text}</p>}
            {!Number.isNaN(Date.parse(post.created_at)) && (
              <p className="text-[0.8125rem] text-stone-400">{new Date(post.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            )}
          </div>
        </article>
      ) : (
        <div className="w-full max-w-md bg-white rounded-3xl shadow-sm p-8 text-center">
          <p className="font-bold text-[1.0625rem] text-stone-800">볼 수 없는 글이에요</p>
          <p className="mt-1 text-[0.9375rem] text-stone-500">지워졌거나, 공개하지 않은 글이에요.</p>
        </div>
      )}

      <OpenInAppButton href={appHref} hasPost={!!post} />
      <p className="mt-2 text-[0.8125rem] text-stone-400 text-center">공감·기도·댓글은 가톨릭그램에서 할 수 있어요</p>
    </main>
  );
}
