"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface Post {
  id: number;
  title: string;
  content: string;
  created_by: number;
  created_by_name: string;
  views: number;
  created_at: string;
}

interface Comment {
  id: number;
  content: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
}

export default function CommunityDetailClient({ id }: { id: number }) {
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const { user } = useAuth();
  const router = useRouter();

  function load() {
    fetch(`${API}/api/tech-posts/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setPost(d.post);
        setComments(d.comments);
      });
  }

  useEffect(load, [id]);

  async function submitComment() {
    if (!commentText.trim()) return;
    await fetch(`${API}/api/tech-posts/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content: commentText }),
    });
    setCommentText("");
    load();
  }

  if (!post) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <div className="space-y-4">
      <button onClick={() => router.push("/community")} className="text-xs font-semibold text-gray-500 hover:text-brand-500">
        ← 목록으로
      </button>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-lg font-bold text-gray-800 dark:text-white/90">{post.title}</h2>
        <div className="mt-1 text-xs text-gray-400">
          {post.created_by_name} · {post.created_at?.slice(0, 16).replace("T", " ")} · 조회 {post.views}
        </div>
        <div className="mt-4 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{post.content}</div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-2 text-xs font-bold uppercase text-gray-400">💬 댓글 {comments.length}</div>
        <div className="mb-3 space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-gray-50 p-2.5 text-sm dark:bg-white/[0.02]">
              <div className="mb-1 flex justify-between text-[11px] text-gray-400">
                <span className="font-semibold text-gray-500">{c.created_by_name}</span>
                <span>{c.created_at?.slice(0, 16).replace("T", " ")}</span>
              </div>
              <div className="text-gray-700 dark:text-gray-300">{c.content}</div>
            </div>
          ))}
          {comments.length === 0 && <div className="text-xs text-gray-400">아직 댓글이 없습니다</div>}
        </div>
        {user ? (
          <div className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="댓글을 입력하세요"
              className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
            />
            <button onClick={submitComment} className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-bold text-white">등록</button>
          </div>
        ) : (
          <div className="text-center text-xs text-gray-400">댓글 작성은 로그인이 필요합니다</div>
        )}
      </div>
    </div>
  );
}
