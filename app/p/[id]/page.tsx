import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { postPlainText } from '@/lib/stickers';
import OpenPost from './OpenPost';

// 카카오톡 등으로 공유한 게시글 주소 (/p/글id): 미리 보기에 그 글의 사진·글을 보여 주고, 열면 앱의 그 글 크게 보기(/?view=글id)로.
// 로그인하지 않은 읽기 권한(anon)으로 읽으므로 공개 범위(팔로워만·나만)를 그대로 따른다 — 공개 글만 미리 보기에 나온다
type Props = { params: Promise<{ id: string }> };
type SharedPost = { id: string; content: string | null; images: string[] | null; video_poster: string | null; author_name: string | null };

const SITE = { title: '가톨릭그램', description: '기도와 묵상을 나누는 가톨릭 커뮤니티' };

async function getPost(id: string): Promise<SharedPost | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[\w-]{1,64}$/.test(id)) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await supabase.from('posts').select('id, content, images, video_poster, author_name').eq('id', id).maybeSingle();
  return (data as SharedPost | null) || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id).catch(() => null);
  if (!post) return { ...SITE, openGraph: { ...SITE, siteName: SITE.title, images: ['/icon-v2-512.png'] } };
  const text = postPlainText(post.content).replace(/\s+/g, ' ').trim();
  const title = `${post.author_name || '교우'}님의 글 · 가톨릭그램`;
  const description = text ? (text.length > 80 ? `${text.slice(0, 80)}…` : text) : '가톨릭그램에서 사진을 보세요';
  const image = post.images?.[0] || post.video_poster;
  return {
    title, description,
    openGraph: { title, description, type: 'article', siteName: SITE.title, images: [image || '/icon-v2-512.png'] },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description },
  };
}

export default async function SharedPostPage({ params }: Props) {
  const { id } = await params;
  return <OpenPost id={id} />;
}
