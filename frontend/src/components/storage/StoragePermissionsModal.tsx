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
        className="surface-card max-h-[80vh] w-full max-w-lg overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="card-title">공유 클라우드 폴더 권한 관리</h3>
          <button onClick={onClose} className="icon-btn">✕</button>
        </div>
        <p className="mb-3 fg-subtle text-ui-sm">
          지정하지 않은 폴더/직급은 기본적으로 전체 열람+편집 가능합니다. 특정 직급을 제한하고 싶은
          폴더만 여기서 추가하세요.
        </p>

        {loading ? (
          <div className="empty-state">불러오는 중...</div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <select
                value={form.folder_id}
                onChange={(e) => setForm({ ...form, folder_id: e.target.value })}
                className="field min-w-0 flex-1"
              >
                <option value="">폴더 선택</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
              </select>
              <select
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="field"
              >
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                className="field"
              >
                <option value="view">읽기만</option>
                <option value="edit">편집 가능</option>
              </select>
              <button onClick={add} className="btn btn-primary">추가</button>
            </div>

            <div className="space-y-1.5">
              {perms.map((p) => (
                <div key={p.id} className="surface-sub fg-base flex items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-ui">
                  <span className="min-w-0 truncate">{pathFor(p.folder_id)} — <b className="fg-strong font-medium">{p.position}</b>: {p.permission_level === "edit" ? "편집 가능" : "읽기만"}</span>
                  <button onClick={async () => { await removePermission(p.id); load(); }} className="btn btn-danger h-7">삭제</button>
                </div>
              ))}
              {perms.length === 0 && <div className="fg-subtle text-ui-sm">설정된 제한이 없습니다</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
