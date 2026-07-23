"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useAuth } from "@/context/AuthContext";
import {
  BrowseResult,
  FileRow,
  FolderRow,
  browse,
  bulkDelete,
  copyFile,
  copyFolder,
  createFolder,
  deleteFile,
  deleteFolder,
  downloadUrl,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  uploadFile,
} from "./api";
import StoragePermissionsModal from "./StoragePermissionsModal";

const ITEM_TYPE = "storage-node";

const ICONS: Record<string, string> = {
  pdf: "📕", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗", ppt: "📙", pptx: "📙",
  png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", zip: "🗜️", rar: "🗜️",
  hwp: "📄", txt: "📄", mp4: "🎬", mov: "🎬",
};

function iconFor(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ICONS[ext] || "📄";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

type DragItem = { kind: "folder" | "file"; id: number };

function Row({
  icon,
  name,
  meta,
  selected,
  onToggle,
  onOpen,
  onRename,
  onDelete,
  onCopy,
  dragItem,
  onDropItem,
  isDropTarget,
  canWrite,
}: {
  icon: string;
  name: string;
  meta: string;
  selected: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopy: () => void;
  dragItem: DragItem;
  onDropItem?: (item: DragItem) => void;
  isDropTarget: boolean;
  canWrite: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [{ isDragging }, dragRef] = useDrag({
    type: ITEM_TYPE,
    item: dragItem,
    canDrag: canWrite,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });
  const [{ isOver }, dropRef] = useDrop({
    accept: ITEM_TYPE,
    canDrop: () => !!isDropTarget && canWrite,
    drop: (item: DragItem) => onDropItem?.(item),
    collect: (monitor) => ({ isOver: monitor.isOver() && monitor.canDrop() }),
  });

  return (
    <div
      ref={(el) => {
        dragRef(el);
        if (isDropTarget) dropRef(el);
      }}
      className={`flex items-center justify-between border-b border-gray-100 px-4 py-2.5 last:border-0 dark:border-gray-800 ${
        isOver ? "bg-brand-50 dark:bg-brand-500/10" : ""
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <input type="checkbox" checked={selected} onChange={onToggle} className="h-3.5 w-3.5 shrink-0" />
        <button
          onClick={onOpen}
          disabled={!onOpen}
          className="flex min-w-0 items-center gap-2 text-left text-sm font-medium text-gray-800 hover:text-brand-500 disabled:hover:text-gray-800 dark:text-white/90"
        >
          <span className="shrink-0 text-lg">{icon}</span>
          <span className="truncate">{name}</span>
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs text-gray-400">{meta}</span>
        {canWrite && (
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="rounded px-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-6 z-20 w-32 rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <button onClick={() => { setMenuOpen(false); onRename(); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">이름변경</button>
                  <button onClick={() => { setMenuOpen(false); onCopy(); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">사본 만들기</button>
                  <button onClick={() => { setMenuOpen(false); onDelete(); }} className="block w-full px-3 py-1.5 text-left text-error-500 hover:bg-gray-50 dark:hover:bg-white/5">삭제</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BreadcrumbCrumb({
  label,
  targetFolderId,
  onOpen,
  onDropItem,
  canWrite,
}: {
  label: string;
  targetFolderId: number | null;
  onOpen: () => void;
  onDropItem: (item: DragItem, targetFolderId: number | null) => void;
  canWrite: boolean;
}) {
  const [{ isOver }, dropRef] = useDrop({
    accept: ITEM_TYPE,
    canDrop: () => canWrite,
    drop: (item: DragItem) => onDropItem(item, targetFolderId),
    collect: (monitor) => ({ isOver: monitor.isOver() && monitor.canDrop() }),
  });
  return (
    <button
      ref={dropRef as unknown as (el: HTMLButtonElement | null) => void}
      onClick={onOpen}
      className={`rounded px-1 text-gray-500 hover:text-brand-500 ${isOver ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
    >
      {label}
    </button>
  );
}

function StorageBrowser({ root, space, ownerId, title, canManagePermissions }: { root: string; space: string; ownerId?: number; title: string; canManagePermissions: boolean }) {
  const { user } = useAuth();
  const [folderId, setFolderId] = useState<number | null>(null);
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPerms, setShowPerms] = useState(false);

  const canWrite = space === "personal" ? true : !!user; // 백엔드가 실제 권한을 최종 검증함

  function load() {
    setLoading(true);
    browse(root, space, folderId, ownerId)
      .then(setData)
      .catch(() => setData({ breadcrumb: [], folders: [], files: [] }))
      .finally(() => setLoading(false));
  }

  useEffect(load, [root, space, folderId, ownerId]);

  useEffect(() => setSelected(new Set()), [folderId, space]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const f of acceptedFiles) {
        await uploadFile(root, space, folderId, f, ownerId);
      }
      load();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root, space, folderId, ownerId]
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, noClick: true });

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleNewFolder() {
    const name = window.prompt("새 폴더 이름");
    if (!name) return;
    await createFolder(root, space, folderId, name, ownerId);
    load();
  }

  async function handleMoveTarget(item: DragItem, targetFolderId: number | null) {
    const idsToMove = selected.has(`${item.kind[0]}-${item.id}`) ? Array.from(selected) : [`${item.kind[0]}-${item.id}`];
    for (const key of idsToMove) {
      const [kind, idStr] = key.split("-");
      const id = Number(idStr);
      if (kind === "f") await moveFile(id, targetFolderId);
      else await moveFolder(id, targetFolderId);
    }
    setSelected(new Set());
    load();
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}개 항목을 삭제하시겠습니까?`)) return;
    const fileIds: number[] = [];
    const folderIds: number[] = [];
    for (const key of selected) {
      const [kind, idStr] = key.split("-");
      (kind === "f" ? fileIds : folderIds).push(Number(idStr));
    }
    await bulkDelete(fileIds, folderIds);
    setSelected(new Set());
    load();
  }

  return (
    <div {...getRootProps()} className="space-y-3">
      <input {...getInputProps()} />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <h2 className="mr-2 shrink-0 text-base font-bold text-gray-800 dark:text-white/90">{title}</h2>
          <BreadcrumbCrumb label="🏠" targetFolderId={null} onOpen={() => setFolderId(null)} onDropItem={handleMoveTarget} canWrite={canWrite} />
          {data?.breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <span className="text-gray-300">/</span>
              <BreadcrumbCrumb label={b.name} targetFolderId={b.id} onOpen={() => setFolderId(b.id)} onDropItem={handleMoveTarget} canWrite={canWrite} />
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <button onClick={handleBulkDelete} className="rounded-full bg-error-500 px-3 py-1.5 text-xs font-bold text-white">
              선택 {selected.size}개 삭제
            </button>
          )}
          {canManagePermissions && (
            <button onClick={() => setShowPerms(true)} className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300">
              폴더 권한 관리
            </button>
          )}
          <button onClick={handleNewFolder} className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300">
            + 새 폴더
          </button>
          <label className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
            + 파일 업로드
            <input
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                for (const f of files) await uploadFile(root, space, folderId, f, ownerId);
                e.target.value = "";
                load();
              }}
            />
          </label>
        </div>
      </div>

      <div
        className={`overflow-hidden rounded-2xl border-2 border-dashed bg-white dark:bg-white/[0.03] ${
          isDragActive ? "border-brand-400 bg-brand-50/50 dark:bg-brand-500/5" : "border-transparent"
        }`}
      >
        <div className="rounded-[14px] border border-gray-200 dark:border-gray-800">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : (data?.folders.length || 0) + (data?.files.length || 0) === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              폴더가 비어 있습니다. 파일을 이 영역에 끌어다 놓아 업로드할 수 있습니다.
            </div>
          ) : (
            <>
              {data?.folders.map((f: FolderRow) => (
                <Row
                  key={`d-${f.id}`}
                  icon="📁"
                  name={f.name}
                  meta={f.created_at?.slice(0, 10)}
                  selected={selected.has(`d-${f.id}`)}
                  onToggle={() => toggleSelect(`d-${f.id}`)}
                  onOpen={() => setFolderId(f.id)}
                  onRename={async () => {
                    const name = window.prompt("새 폴더 이름", f.name);
                    if (name) { await renameFolder(f.id, name); load(); }
                  }}
                  onDelete={async () => {
                    if (confirm(`"${f.name}" 폴더와 안의 내용을 모두 삭제하시겠습니까?`)) { await deleteFolder(f.id); load(); }
                  }}
                  onCopy={async () => { await copyFolder(f.id, folderId); load(); }}
                  dragItem={{ kind: "folder", id: f.id }}
                  onDropItem={(item) => handleMoveTarget(item, f.id)}
                  isDropTarget
                  canWrite={canWrite}
                />
              ))}
              {data?.files.map((f: FileRow) => (
                <Row
                  key={`f-${f.id}`}
                  icon={iconFor(f.filename)}
                  name={f.filename}
                  meta={`${formatSize(f.size)} · ${f.created_at?.slice(0, 10)}`}
                  selected={selected.has(`f-${f.id}`)}
                  onToggle={() => toggleSelect(`f-${f.id}`)}
                  onOpen={() => window.open(downloadUrl(f.id), "_blank")}
                  onRename={async () => {
                    const name = window.prompt("새 파일 이름", f.filename);
                    if (name) { await renameFile(f.id, name); load(); }
                  }}
                  onDelete={async () => {
                    if (confirm(`"${f.filename}" 파일을 삭제하시겠습니까?`)) { await deleteFile(f.id); load(); }
                  }}
                  onCopy={async () => { await copyFile(f.id, folderId); load(); }}
                  dragItem={{ kind: "file", id: f.id }}
                  isDropTarget={false}
                  canWrite={canWrite}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {showPerms && <StoragePermissionsModal root={root} onClose={() => setShowPerms(false)} />}
    </div>
  );
}

export default function StorageClient({ root, title, showSpaces }: { root: string; title: string; showSpaces?: boolean }) {
  const { user } = useAuth();
  const [space, setSpace] = useState<"shared" | "personal">("shared");

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-3">
        {showSpaces && (
          <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]" style={{ width: "fit-content" }}>
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
        {showSpaces && space === "personal" && !user ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
            로그인이 필요합니다
          </div>
        ) : (
          <StorageBrowser
            root={root}
            space={showSpaces ? space : "shared"}
            ownerId={showSpaces && space === "personal" ? user?.id : undefined}
            title={title}
            canManagePermissions={!!user?.is_admin && (!showSpaces || space === "shared")}
          />
        )}
      </div>
    </DndProvider>
  );
}
