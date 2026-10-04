"use client";

import { useState } from "react";
import type { Post } from "./types";

type Props = {
  post: Post;
  onPray: (id: string) => void;
  onEmpathy: (id: string) => void;
  onAddComment: (id: string, text: string) => void;
};

export function PostCard({ post, onPray, onEmpathy, onAddComment }: Props) {
  const [openComments, setOpenComments] = useState(false);
  const [comment, setComment] = useState("");

  function submitComment() {
    const next = comment.trim();
    if (!next) return;
    onAddComment(post.id, next);
    setComment("");
    setOpenComments(true);
  }

  return (
    <article className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-[0.8125rem] font-semibold text-white"
          aria-hidden
        >
          {post.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-[1.0625rem] font-semibold text-zinc-900 dark:text-zinc-50">
              {post.author}
            </h2>
            <span className="text-sm text-zinc-500">@{post.handle}</span>
            <span className="text-sm text-zinc-400">· {post.createdAt}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[1.0625rem] leading-6 text-zinc-800 dark:text-zinc-200">
            {post.text}
          </p>
        </div>
      </header>

      {post.images.length > 0 ? (
        <div
          className={`mt-3 overflow-hidden rounded-2xl ${
            post.images.length === 1
              ? "grid grid-cols-1"
              : post.images.length === 2
                ? "grid grid-cols-2 gap-1"
                : "grid grid-cols-2 grid-rows-2 gap-1"
          }`}
        >
          {post.images.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={`${post.author}님의 사진 ${index + 1}`}
              className={`w-full object-cover ${
                post.images.length === 1
                  ? "max-h-[420px]"
                  : post.images.length === 3 && index === 0
                    ? "row-span-2 h-full min-h-[220px]"
                    : "h-[140px] sm:h-[180px]"
              }`}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onPray(post.id)}
          className={`rounded-full px-1 py-2 text-center text-[0.875rem] font-medium leading-tight sm:text-[0.9375rem] sm:px-2 transition ${
            post.prayed
              ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900"
              : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          }`}
        >
          🙏 기도할게요
          <span className="ml-1 text-xs text-zinc-500">{post.prayers}</span>
        </button>
        <button
          type="button"
          onClick={() => onEmpathy(post.id)}
          className={`rounded-full px-2 py-2 text-center text-[0.9375rem] font-medium transition ${
            post.empathized
              ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900"
              : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          }`}
        >
          🫂 공감해요
          <span className="ml-1 text-xs text-zinc-500">{post.empathy}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpenComments((open) => !open)}
          className={`rounded-full px-2 py-2 text-center text-[0.9375rem] font-medium transition ${
            openComments
              ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900"
              : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          }`}
        >
          💬 댓글
          <span className="ml-1 text-xs text-zinc-500">
            {post.comments.length}
          </span>
        </button>
      </div>

      {openComments ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900">
          {post.comments.length === 0 ? (
            <p className="text-sm text-zinc-500">첫 댓글을 남겨 보세요.</p>
          ) : (
            <ul className="space-y-2">
              {post.comments.map((item) => (
                <li key={item.id} className="text-sm leading-5">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                    {item.author}
                  </span>{" "}
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitComment();
                }
              }}
              placeholder="댓글을 입력하세요"
              className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="button"
              onClick={submitComment}
              className="rounded-full bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              등록
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
