"use client";

import { useEffect, useState } from "react";
import { FolderPermission, addPermission, folderTree, listPermissions, removePermission } from "./api";

const POSITIONS = ["회장", "사장", "상무", "이사", "부장", "과장", "팀장", "대리", "주임", "사원"];

export default function StoragePermissionsModal({ root, onClose }: { root: string; onClose: () => void }) {
  const [folders, setFolders] = useState<{ id: number; path: string }[]>([]);
  const [perms, setPerms] = useState<FolderPermission[]>([]);
  const [form, setForm] = useState({ folder_id: "", position: POSITIONS[0], level: "view" });
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([folderTree(root), listPermissions()])
      .then(([f, p]) => { setFolders(f); setPerms(p); })
      .finally(() => setLoading(false));
  }
  useEffect(load, [root]);

  async function add() {
    if (!form.folder_id) return;
    await addPermission(Number(form.folder_id), form.position, form.level);
    load();
  }

  function pathFor(folderId: number) {
    return folders.find((f) => f.id === folderId)?.path || `#${folderId}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800 dark:text-white/90">공유 클라우드 폴더 권한 관리</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="mb-3 text-xs text-gray-400">
          지정하지 않은 폴더/직급은 기본적으로 전체 열람+편집 가능합니다. 특정 직급을 제한하고 싶은
          폴더만 여기서 추가하세요.
        </p>

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <select
                value={form.folder_id}
                onChange={(e) => setForm({ ...form, folder_id: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">폴더 선택</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
              </select>
              <select
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900"
              >
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="view">읽기만</option>
                <option value="edit">편집 가능</option>
              </select>
              <button onClick={add} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">추가</button>
            </div>

            <div className="space-y-1.5">
              {perms.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-xs dark:bg-white/[0.03]">
                  <span>{pathFor(p.folder_id)} — <b>{p.position}</b>: {p.permission_level === "edit" ? "편집 가능" : "읽기만"}</span>
                  <button onClick={async () => { await removePermission(p.id); load(); }} className="text-error-500">삭제</button>
                </div>
              ))}
              {perms.length === 0 && <div className="text-xs text-gray-400">설정된 제한이 없습니다</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
