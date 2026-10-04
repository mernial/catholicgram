"use client";

import { useEffect, useRef, useState } from "react";
import { Composer } from "./Composer";
import { PostCard } from "./PostCard";
import { samplePosts } from "./sample-posts";
import type { Post } from "./types";

const MAX_IMAGES = 3;

export function Feed() {
  const [posts, setPosts] = useState<Post[]>(samplePosts);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, []);

  function addImages(files: FileList | null) {
    if (!files) return;
    const slots = MAX_IMAGES - images.length;
    const next = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, slots)
      .map((file) => URL.createObjectURL(file));
    if (next.length === 0) return;
    setImages((current) => [...current, ...next]);
  }

  function removeImage(index: number) {
    setImages((current) => {
      const target = current[index];
      if (target?.startsWith("blob:")) URL.revokeObjectURL(target);
      return current.filter((_, i) => i !== index);
    });
  }

  function submitPost() {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;

    const post: Post = {
      id: crypto.randomUUID(),
      author: "나",
      handle: "me",
      initials: "나",
      createdAt: "방금 전",
      text: trimmed,
      images: [...images],
      prayers: 0,
      empathy: 0,
      comments: [],
      prayed: false,
      empathized: false,
    };

    setPosts((current) => [post, ...current]);
    setText("");
    setImages([]);
  }

  function togglePray(id: string) {
    setPosts((current) =>
      current.map((post) =>
        post.id === id
          ? {
              ...post,
              prayed: !post.prayed,
              prayers: post.prayers + (post.prayed ? -1 : 1),
            }
          : post,
      ),
    );
  }

  function toggleEmpathy(id: string) {
    setPosts((current) =>
      current.map((post) =>
        post.id === id
          ? {
              ...post,
              empathized: !post.empathized,
              empathy: post.empathy + (post.empathized ? -1 : 1),
            }
          : post,
      ),
    );
  }

  function addComment(id: string, commentText: string) {
    setPosts((current) =>
      current.map((post) =>
        post.id === id
          ? {
              ...post,
              comments: [
                ...post.comments,
                {
                  id: crypto.randomUUID(),
                  author: "나",
                  text: commentText,
                },
              ],
            }
          : post,
      ),
    );
  }

  return (
    <div className="min-h-full bg-zinc-100 dark:bg-black">
      <div className="mx-auto min-h-screen max-w-[560px] border-x border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <p className="text-xs font-medium tracking-wide text-zinc-500">
            우리 커뮤니티
          </p>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            피드
          </h1>
        </header>

        <Composer
          text={text}
          images={images}
          onTextChange={setText}
          onAddImages={addImages}
          onRemoveImage={removeImage}
          onSubmit={submitPost}
        />

        <section aria-label="게시물 목록">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onPray={togglePray}
              onEmpathy={toggleEmpathy}
              onAddComment={addComment}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
