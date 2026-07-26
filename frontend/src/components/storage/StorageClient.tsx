"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  downloadFileWithProgress,
  downloadUrl,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  uploadFileWithProgress,
} from "./api";
import StoragePermissionsModal from "./StoragePermissionsModal";
import { FileTypeIcon, FolderGlyph } from "./FileTypeIcon";

const ITEM_TYPE = "storage-node";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  return iso.replace("T", " ").slice(0, 16);
}

type DragItem = { kind: "folder" | "file"; id: number };

function Row({
  icon,
  name,
  meta,
  selected,
  onToggle,
  onOpen,
  onDelete,
  onCopy,
  dragItem,
  onDropItem,
  isDropTarget,
  canWrite,
  layout = "list",
  autoRename,
  onRenameCommit,
}: {
  icon: React.ReactNode;
  name: string;
  meta: string;
  selected: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  onDelete: () => void;
  onCopy: () => void;
  dragItem: DragItem;
  onDropItem?: (item: DragItem) => void;
  isDropTarget: boolean;
  canWrite: boolean;
  layout?: "list" | "grid";
  autoRename?: boolean;
  onRenameCommit?: (newName: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(!!autoRename);
  const [renameValue, setRenameValue] = useState(name);
  const inputElRef = useRef<HTMLInputElement | null>(null);
  // renaming이 true가 될 때 딱 한 번만 focus/select한다. 매 렌더마다(=매 키 입력마다) 새로
  // 만들어지는 콜백 ref로 select()를 다시 호출하면 그 사이 진행 중이던 한글 IME 조합이
  // 끊겨서 한 글자 이상 입력이 안 되는 버그가 있었다.
  useEffect(() => {
    if (renaming) {
      inputElRef.current?.focus();
      inputElRef.current?.select();
    }
  }, [renaming]);
  const [{ isDragging }, dragRef] = useDrag({
    type: ITEM_TYPE,
    item: dragItem,
    canDrag: canWrite && !renaming,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });
  const [{ isOver }, dropRef] = useDrop({
    accept: ITEM_TYPE,
    canDrop: () => !!isDropTarget && canWrite,
    drop: (item: DragItem) => onDropItem?.(item),
    collect: (monitor) => ({ isOver: monitor.isOver() && monitor.canDrop() }),
  });

  function commitRename() {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== name) onRenameCommit?.(trimmed);
  }

  const nameNode = renaming ? (
    <input
      ref={inputElRef}
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitRename();
        if (e.key === "Escape") { setRenaming(false); setRenameValue(name); }
      }}
      onBlur={commitRename}
      onClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 rounded border border-brand-400 bg-white px-1.5 py-0.5 text-sm dark:bg-gray-900"
    />
  ) : (
    <span className="truncate">{name}</span>
  );

  const menu = canWrite && (
    <div className="relative">
      <button onClick={() => setMenuOpen((v) => !v)} className="rounded px-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
        ⋯
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-6 z-50 w-32 rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-900">
            <button onClick={() => { setMenuOpen(false); setRenaming(true); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">이름변경</button>
            <button onClick={() => { setMenuOpen(false); onCopy(); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">사본 만들기</button>
            <button onClick={() => { setMenuOpen(false); onDelete(); }} className="block w-full px-3 py-1.5 text-left text-error-500 hover:bg-gray-50 dark:hover:bg-white/5">삭제</button>
          </div>
        </>
      )}
    </div>
  );

  if (layout === "grid") {
    return (
      <div
        ref={(el) => {
          dragRef(el);
          if (isDropTarget) dropRef(el);
        }}
        onClick={onOpen}
        className={`group relative flex cursor-pointer flex-col items-center rounded-xl border border-transparent p-3 text-center hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-800 dark:hover:bg-white/[0.03] ${
          isOver ? "border-brand-300 bg-brand-50 dark:bg-brand-500/10" : ""
        } ${isDragging ? "opacity-40" : ""}`}
      >
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          className="absolute left-2 top-2 h-3.5 w-3.5"
        />
        {menu && <div className="absolute right-1 top-1" onClick={(e) => e.stopPropagation()}>{menu}</div>}
        <span className="mb-1.5 flex h-12 w-12 items-center justify-center">{icon}</span>
        <div className="flex w-full items-center justify-center px-1 text-xs font-medium text-gray-800 dark:text-white/90">{nameNode}</div>
        <span className="mt-0.5 text-[10px] text-gray-400">{meta}</span>
      </div>
    );
  }

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
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <input type="checkbox" checked={selected} onChange={onToggle} className="h-3.5 w-3.5 shrink-0" />
        <button
          onClick={onOpen}
          disabled={!onOpen || renaming}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-gray-800 hover:text-brand-500 disabled:hover:text-gray-800 dark:text-white/90"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
          {nameNode}
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs text-gray-400">{meta}</span>
        {menu}
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

type SortKey = "name" | "date";

function StorageBrowser({ root, space, ownerId, title, canManagePermissions }: { root: string; space: string; ownerId?: number; title: string; canManagePermissions: boolean }) {
  const { user } = useAuth();
  const [folderId, setFolderId] = useState<number | null>(null);
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPerms, setShowPerms] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [justCreatedFolderId, setJustCreatedFolderId] = useState<number | null>(null);
  const [transfer, setTransfer] = useState<{ label: string; pct: number } | null>(null);

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

  async function uploadFiles(files: File[]) {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const label = files.length > 1 ? `업로드 중 (${i + 1}/${files.length}) · ${f.name}` : `업로드 중 · ${f.name}`;
      setTransfer({ label, pct: 0 });
      await uploadFileWithProgress(root, space, folderId, f, ownerId, (pct) => setTransfer({ label, pct }));
    }
    setTransfer(null);
    load();
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      uploadFiles(acceptedFiles);
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
    const res = await createFolder(root, space, folderId, "새 폴더", ownerId);
    setJustCreatedFolderId(res.id);
    load();
  }

  function sortRows<T extends { name?: string; filename?: string; created_at: string }>(rows: T[]): T[] {
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === "name") return (a.name || a.filename || "").localeCompare(b.name || b.filename || "");
      return a.created_at.localeCompare(b.created_at);
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
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

  async function handleBulkDownload() {
    const fileRows = (data?.files || []).filter((f) => selected.has(`f-${f.id}`));
    if (fileRows.length === 0) return;
    for (let i = 0; i < fileRows.length; i++) {
      const f = fileRows[i];
      const label = fileRows.length > 1 ? `다운로드 중 (${i + 1}/${fileRows.length}) · ${f.filename}` : `다운로드 중 · ${f.filename}`;
      setTransfer({ label, pct: 0 });
      await downloadFileWithProgress(f.id, f.filename, (pct) => setTransfer({ label, pct }));
    }
    setTransfer(null);
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
      <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
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
        {/* 모바일에서 버튼이 여러 줄로 밀려 보이지 않도록 한 줄로 가로 스크롤 처리 */}
        <div className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {selected.size > 0 && (
            <>
              <button onClick={handleBulkDownload} className="shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-white">
                선택 {selected.size}개 다운로드
              </button>
              <button onClick={handleBulkDelete} className="shrink-0 rounded-full bg-error-500 px-3 py-1.5 text-xs font-bold text-white">
                선택 {selected.size}개 삭제
              </button>
            </>
          )}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="shrink-0 rounded-full border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <option value="name">이름순</option>
            <option value="date">날짜순</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="shrink-0 rounded-full border border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300"
            title="정렬 방향"
          >
            {sortDir === "asc" ? "▲" : "▼"}
          </button>
          <div className="flex shrink-0 gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
            <button onClick={() => setView("list")} className={`rounded-full px-2.5 py-1 text-xs font-bold ${view === "list" ? "bg-white shadow dark:bg-gray-700" : "text-gray-500"}`}>☰ 목록</button>
            <button onClick={() => setView("grid")} className={`rounded-full px-2.5 py-1 text-xs font-bold ${view === "grid" ? "bg-white shadow dark:bg-gray-700" : "text-gray-500"}`}>▦ 아이콘</button>
          </div>
          {canManagePermissions && (
            <button onClick={() => setShowPerms(true)} className="shrink-0 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300">
              폴더 권한 관리
            </button>
          )}
          <button onClick={handleNewFolder} className="shrink-0 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-600 dark:border-gray-700 dark:text-gray-300">
            + 새 폴더
          </button>
          <label className="shrink-0 cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white">
            + 파일 업로드
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                uploadFiles(files);
              }}
            />
          </label>
        </div>
        {transfer && (
          <div className="pt-1">
            <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
              <span className="truncate">{transfer.label}</span>
              <span className="shrink-0 font-semibold">{transfer.pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${transfer.pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed bg-white dark:bg-white/[0.03] ${
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
            <div className={view === "grid" ? "grid grid-cols-3 gap-1 p-3 sm:grid-cols-4 md:grid-cols-6" : ""}>
              {sortRows(data?.folders || []).map((f: FolderRow) => (
                <Row
                  key={`d-${f.id}`}
                  icon={<FolderGlyph className={view === "grid" ? "h-11 w-11" : "h-6 w-6"} />}
                  name={f.name}
                  meta={formatDateTime(f.created_at)}
                  selected={selected.has(`d-${f.id}`)}
                  onToggle={() => toggleSelect(`d-${f.id}`)}
                  onOpen={() => setFolderId(f.id)}
                  autoRename={justCreatedFolderId === f.id}
                  onRenameCommit={async (newName) => {
                    setJustCreatedFolderId(null);
                    await renameFolder(f.id, newName);
                    load();
                  }}
                  onDelete={async () => {
                    if (confirm(`"${f.name}" 폴더와 안의 내용을 모두 삭제하시겠습니까?`)) { await deleteFolder(f.id); load(); }
                  }}
                  onCopy={async () => { await copyFolder(f.id, folderId); load(); }}
                  dragItem={{ kind: "folder", id: f.id }}
                  onDropItem={(item) => handleMoveTarget(item, f.id)}
                  isDropTarget
                  canWrite={canWrite}
                  layout={view}
                />
              ))}
              {sortRows(data?.files || []).map((f: FileRow) => (
                <Row
                  key={`f-${f.id}`}
                  icon={<FileTypeIcon filename={f.filename} className={view === "grid" ? "h-11 w-11" : "h-6 w-6"} />}
                  name={f.filename}
                  meta={view === "grid" ? formatSize(f.size) : `${formatSize(f.size)} · ${formatDateTime(f.created_at)}`}
                  selected={selected.has(`f-${f.id}`)}
                  onToggle={() => toggleSelect(`f-${f.id}`)}
                  onOpen={() => window.open(downloadUrl(f.id), "_blank")}
                  onRenameCommit={async (newName) => {
                    await renameFile(f.id, newName);
                    load();
                  }}
                  onDelete={async () => {
                    if (confirm(`"${f.filename}" 파일을 삭제하시겠습니까?`)) { await deleteFile(f.id); load(); }
                  }}
                  onCopy={async () => { await copyFile(f.id, folderId); load(); }}
                  dragItem={{ kind: "file", id: f.id }}
                  isDropTarget={false}
                  canWrite={canWrite}
                  layout={view}
                />
              ))}
            </div>
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
