"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface StorageFileItem {
  id: number;
  filename: string;
  uploaded_by: number;
  created_at: string;
}

const ICONS: Record<string, string> = {
  pdf: "📕", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗", ppt: "📙", pptx: "📙",
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", zip: "🗜️", rar: "🗜️",
  hwp: "📄", txt: "📄", mp4: "🎬", mov: "🎬",
};

function iconFor(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ICONS[ext] || "📄";
}

export default function StorageClient({ folderPath, title, showSpaces }: { folderPath: string; title: string; showSpaces?: boolean }) {
  const { user } = useAuth();
  const [space, setSpace] = useState<"shared" | "personal">("shared");
  const effectivePath = showSpaces ? (space === "personal" ? `${folderPath}/personal/${user?.id ?? ""}` : `${folderPath}/shared`) : folderPath;

  const [files, setFiles] = useState<StorageFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  function load() {
    if (showSpaces && space === "personal" && !user) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API}/api/storage?folder_path=${encodeURIComponent(effectivePath)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setFiles)
      .finally(() => setLoading(false));
  }

  useEffect(load, [effectivePath, user]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    await fetch(`${API}/api/storage?folder_path=${encodeURIComponent(effectivePath)}`, { method: "POST", credentials: "include", body: form });
    if (inputRef.current) inputRef.current.value = "";
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`${API}/api/storage/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-800 dark:text-white/90">{title}</h2>
          {showSpaces && (
            <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
              <button
                onClick={() => setSpace("shared")}
                className={`rounded-full px-3 py-1 text-xs font-bold ${space === "shared" ? "bg-brand-500 text-white" : "text-gray-500"}`}
              >
                🏢 공유 클라우드
              </button>
              <button
                onClick={() => setSpace("personal")}
                className={`rounded-full px-3 py-1 text-xs font-bold ${space === "personal" ? "bg-brand-500 text-white" : "text-gray-500"}`}
              >
                🔒 개인 클라우드
              </button>
            </div>
          )}
        </div>
        {user && (
          <label className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
            + 파일 업로드
            <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} />
          </label>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {showSpaces && space === "personal" && !user ? "로그인이 필요합니다" : "업로드된 파일이 없습니다"}
          </div>
        ) : (
          files.map((f) => (
            <div key={f.id} className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0 dark:border-gray-800">
              <a href={`${API}/api/storage/${f.id}/download`} className="flex items-center gap-2 text-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">
                <span className="text-lg">{iconFor(f.filename)}</span>
                {f.filename}
              </a>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{f.created_at?.slice(0, 10)}</span>
                {(user?.id === f.uploaded_by || user?.is_admin) && (
                  <button onClick={() => handleDelete(f.id)} className="text-xs text-error-500">삭제</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
