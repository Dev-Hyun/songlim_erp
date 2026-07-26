"use client";

import { useState } from "react";

interface Props {
  src: string;
  filename?: string;
  onClose: () => void;
}

export default function PhotoLightbox({ src, filename, onClose }: Props) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(src, { credentials: "include" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "photo.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />
      <div className="absolute right-6 top-6 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-gray-800 hover:bg-white disabled:opacity-50"
        >
          {downloading ? "다운로드 중..." : "⬇ 원본 다운로드"}
        </button>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-800 hover:bg-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
