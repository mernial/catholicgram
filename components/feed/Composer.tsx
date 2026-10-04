"use client";

import { useId, useRef } from "react";

type Props = {
  text: string;
  images: string[];
  onTextChange: (value: string) => void;
  onAddImages: (files: FileList | null) => void;
  onRemoveImage: (index: number) => void;
  onSubmit: () => void;
};

const MAX_IMAGES = 3;

export function Composer({
  text,
  images,
  onTextChange,
  onAddImages,
  onRemoveImage,
  onSubmit,
}: Props) {
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const remaining = MAX_IMAGES - images.length;
  const canPost = text.trim().length > 0 || images.length > 0;

  return (
    <section className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex gap-3">
        <div
          className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-rose-400 text-xs font-semibold text-white"
          aria-hidden
        >
          나
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="composer-text" className="sr-only">
            글 작성
          </label>
          <textarea
            id="composer-text"
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder="마음을 나눠 주세요..."
            rows={3}
            className="w-full resize-none bg-transparent text-[1.0625rem] leading-6 text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />

          {images.length > 0 ? (
            <ul
              className={`mt-3 grid gap-2 ${
                images.length === 1
                  ? "grid-cols-1"
                  : images.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3"
              }`}
            >
              {images.map((src, index) => (
                <li key={src} className="relative overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`첨부 사진 ${index + 1}`}
                    className="h-28 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white"
                    aria-label={`사진 ${index + 1} 삭제`}
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                id={fileId}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  onAddImages(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={remaining <= 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                사진 첨부
                <span className="text-xs text-zinc-400">{images.length}/3</span>
              </button>
            </div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canPost}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
            >
              게시
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
