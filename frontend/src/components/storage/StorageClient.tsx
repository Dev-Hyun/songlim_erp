"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone, FileWithPath } from "react-dropzone";
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
  storageFavorites,
  storageRecent,
  storageUsage,
  toggleFavorite,
  uploadFileWithProgress,
} from "./api";
import StoragePermissionsModal from "./StoragePermissionsModal";
import { FileTypeIcon, FolderGlyph } from "./FileTypeIcon";

const ITEM_TYPE = "storage-node";

type View = "all" | "recent-up" | "recent-open" | "fav";
type SortKey = "name" | "date";
type DragItem = { kind: "folder" | "file"; id: number };

// 통합 아이템 모델 — 폴더/파일을 한 목록에서 함께 다룬다.
interface Node {
  key: string; // d-1 / f-2
  kind: "folder" | "file";
  id: number;
  name: string;
  size?: number;
  created_at: string;
  updated_at?: string;
  opened_at?: string;
  is_favorite: boolean;
  location?: string;
  itemCount?: number;
}

function folderToNode(f: FolderRow): Node {
  return { key: `d-${f.id}`, kind: "folder", id: f.id, name: f.name, created_at: f.created_at, updated_at: f.updated_at, is_favorite: !!f.is_favorite, location: f.location };
}
function fileToNode(f: FileRow): Node {
  return { key: `f-${f.id}`, kind: "file", id: f.id, name: f.filename, size: f.size, created_at: f.created_at, updated_at: f.updated_at, opened_at: f.opened_at, is_favorite: !!f.is_favorite, location: f.location };
}

function formatSize(bytes?: number) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
function shortDate(iso?: string) {
  if (!iso) return "-";
  return iso.replace("T", " ").slice(0, 16);
}
function longDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const h = d.getHours();
  const ap = h < 12 ? "오전" : "오후";
  const h12 = ((h + 11) % 12) + 1;
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}. ${ap} ${h12}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const KIND_LABEL: Record<string, string> = { folder: "폴더" };
function fileKindLabel(name: string) {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const map: Record<string, string> = {
    pdf: "PDF 문서", doc: "Word 문서", docx: "Word 문서", hwp: "한글 문서",
    xls: "Excel 문서", xlsx: "Excel 문서", csv: "CSV 문서",
    ppt: "PowerPoint 문서", pptx: "PowerPoint 문서",
    jpg: "이미지", jpeg: "이미지", png: "이미지", gif: "이미지", webp: "이미지", heic: "이미지",
    mp4: "동영상", mov: "동영상", mp3: "오디오", wav: "오디오", zip: "압축 파일",
  };
  return map[ext] || (ext ? `${ext.toUpperCase()} 파일` : "파일");
}

function StarButton({ on, onClick }: { on: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      title={on ? "즐겨찾기 해제" : "즐겨찾기"}
      className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${on ? "text-warning-400" : "text-gray-300 hover:text-warning-400 dark:text-gray-600"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

function StorageItem({
  node,
  layout,
  selected,
  draggable,
  isDropTarget,
  autoRename,
  onSelect,
  onOpen,
  onToggleFavorite,
  onRenameCommit,
  onRenameClose,
  onDelete,
  onCopy,
  onDropItem,
}: {
  node: Node;
  layout: "list" | "grid";
  selected: boolean;
  draggable: boolean;
  isDropTarget: boolean;
  autoRename?: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onRenameCommit?: (name: string) => void;
  onRenameClose?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onDropItem?: (item: DragItem) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(!!autoRename);
  const [renameValue, setRenameValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // renaming 진입 시 한 번만 focus/select — 매 렌더마다 select()하면 한글 IME 조합이 끊긴다.
  useEffect(() => {
    if (renaming) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [renaming]);
  // F2 등 부모가 autoRename을 켜면(이미 마운트된 항목이라도) 이름변경 모드로 진입.
  useEffect(() => {
    if (autoRename) { setRenameValue(node.name); setRenaming(true); }
  }, [autoRename, node.name]);

  const [{ isDragging }, dragRef] = useDrag({
    type: ITEM_TYPE,
    item: { kind: node.kind, id: node.id } as DragItem,
    canDrag: draggable && !renaming,
    collect: (m) => ({ isDragging: m.isDragging() }),
  });
  const [{ isOver }, dropRef] = useDrop({
    accept: ITEM_TYPE,
    canDrop: () => isDropTarget,
    drop: (item: DragItem) => onDropItem?.(item),
    collect: (m) => ({ isOver: m.isOver() && m.canDrop() }),
  });

  function commit() {
    setRenaming(false);
    onRenameClose?.();
    const t = renameValue.trim();
    if (t && t !== node.name) onRenameCommit?.(t);
  }

  const icon = node.kind === "folder"
    ? <FolderGlyph className={layout === "grid" ? "h-14 w-14" : "h-6 w-6"} />
    : <FileTypeIcon filename={node.name} className={layout === "grid" ? "h-14 w-14" : "h-6 w-6"} />;

  const nameNode = renaming ? (
    <input
      ref={inputRef}
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(); if (e.key === "Escape") { setRenaming(false); setRenameValue(node.name); onRenameClose?.(); } }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 rounded border border-brand-400 bg-white px-1.5 py-0.5 text-sm dark:bg-gray-900"
    />
  ) : (
    <span className="truncate">{node.name}</span>
  );

  const menu = (onRenameCommit || onDelete || onCopy) && (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setMenuOpen((v) => !v)} className="rounded px-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">⋯</button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-6 z-50 w-32 rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-900">
            {onRenameCommit && <button onClick={() => { setMenuOpen(false); setRenaming(true); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">이름변경</button>}
            {onCopy && <button onClick={() => { setMenuOpen(false); onCopy(); }} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">사본 만들기</button>}
            {onDelete && <button onClick={() => { setMenuOpen(false); onDelete(); }} className="block w-full px-3 py-1.5 text-left text-error-500 hover:bg-gray-50 dark:hover:bg-white/5">삭제</button>}
          </div>
        </>
      )}
    </div>
  );

  const setRefs = (el: HTMLDivElement | null) => { dragRef(el); if (isDropTarget) dropRef(el); };

  if (layout === "grid") {
    return (
      <div
        ref={setRefs}
        onClick={onSelect}
        onDoubleClick={onOpen}
        className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border-[1.5px] p-4 text-center transition ${
          selected ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10" : "border-transparent hover:bg-gray-50 dark:hover:bg-white/[0.03]"
        } ${isOver ? "border-brand-300 bg-brand-50 dark:bg-brand-500/10" : ""} ${isDragging ? "opacity-40" : ""}`}
      >
        <div className="absolute right-2 top-2 flex items-center" onClick={(e) => e.stopPropagation()}>
          <StarButton on={node.is_favorite} onClick={onToggleFavorite} />
          {menu}
        </div>
        <span className="flex h-16 w-16 items-center justify-center">{icon}</span>
        <div className="flex w-full items-center justify-center px-1 text-[13px] font-medium text-gray-800 dark:text-white/90">{nameNode}</div>
        <span className="text-[11px] text-gray-400">{node.kind === "folder" ? "폴더" : formatSize(node.size)}</span>
      </div>
    );
  }

  return (
    <div
      ref={setRefs}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={`group grid cursor-pointer grid-cols-[1fr_150px_96px_auto] items-center gap-3 rounded-lg border-[1.5px] px-3 py-2.5 transition ${
        selected ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10" : "border-transparent hover:bg-gray-50 dark:hover:bg-white/[0.03]"
      } ${isOver ? "border-brand-300 bg-brand-50 dark:bg-brand-500/10" : ""} ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1 text-sm font-medium text-gray-800 dark:text-white/90">{nameNode}</span>
        <span className="shrink-0" onClick={(e) => e.stopPropagation()}><StarButton on={node.is_favorite} onClick={onToggleFavorite} /></span>
      </div>
      <span className="text-xs text-gray-400">{shortDate(node.updated_at || node.created_at)}</span>
      <span className="text-right text-xs text-gray-400">{node.kind === "folder" ? (node.itemCount != null ? `${node.itemCount}개` : "폴더") : formatSize(node.size)}</span>
      <span className="w-8 text-center opacity-0 group-hover:opacity-100">{menu}</span>
    </div>
  );
}

function Crumb({ label, targetFolderId, onOpen, onDropItem }: { label: string; targetFolderId: number | null; onOpen: () => void; onDropItem: (item: DragItem, t: number | null) => void }) {
  const [{ isOver }, dropRef] = useDrop({
    accept: ITEM_TYPE,
    drop: (item: DragItem) => onDropItem(item, targetFolderId),
    collect: (m) => ({ isOver: m.isOver() }),
  });
  return (
    <button ref={dropRef as unknown as (el: HTMLButtonElement | null) => void} onClick={onOpen} className={`rounded px-1 font-semibold text-gray-500 hover:text-brand-500 ${isOver ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}>
      {label}
    </button>
  );
}

function Workspace({ root, showSpaces }: { root: string; showSpaces?: boolean }) {
  const { user } = useAuth();
  const [space, setSpace] = useState<"shared" | "personal">("shared");
  const ownerId = showSpaces && space === "personal" ? user?.id : undefined;
  const effectiveSpace = showSpaces ? space : "shared";

  const [view, setView] = useState<View>("all");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [data, setData] = useState<BrowseResult | null>(null);
  const [flat, setFlat] = useState<{ folders: Node[]; files: Node[] }>({ folders: [], files: [] });
  const [usage, setUsage] = useState<{ bytes: number; count: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [layout, setLayout] = useState<"list" | "grid">("grid");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showPerms, setShowPerms] = useState(false);
  const [transfer, setTransfer] = useState<{ label: string; pct: number } | null>(null);
  const [justCreatedFolderId, setJustCreatedFolderId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renameKey, setRenameKey] = useState<string | null>(null); // F2로 이름변경 진입시킬 대상 key

  const isBrowse = view === "all";
  const canWrite = effectiveSpace === "personal" ? true : !!user;

  const loadUsage = useCallback(() => {
    storageUsage(root, effectiveSpace, ownerId).then(setUsage).catch(() => setUsage(null));
  }, [root, effectiveSpace, ownerId]);

  const load = useCallback(() => {
    setLoading(true);
    if (view === "all") {
      browse(root, effectiveSpace, folderId, ownerId)
        .then(setData)
        .catch(() => setData({ breadcrumb: [], folders: [], files: [] }))
        .finally(() => setLoading(false));
    } else if (view === "fav") {
      storageFavorites(root, effectiveSpace, ownerId)
        .then((r) => setFlat({ folders: r.folders.map(folderToNode), files: r.files.map(fileToNode) }))
        .catch(() => setFlat({ folders: [], files: [] }))
        .finally(() => setLoading(false));
    } else {
      storageRecent(root, effectiveSpace, view === "recent-open" ? "opened" : "uploaded", ownerId)
        .then((r) => setFlat({ folders: [], files: r.map(fileToNode) }))
        .catch(() => setFlat({ folders: [], files: [] }))
        .finally(() => setLoading(false));
    }
    loadUsage();
  }, [root, effectiveSpace, ownerId, view, folderId, loadUsage]);

  useEffect(load, [load]);
  useEffect(() => { setSelection(new Set()); setDetailKey(null); }, [view, folderId, effectiveSpace]);

  // 현재 뷰의 노드 목록
  const nodes: Node[] = useMemo(() => {
    if (view === "all") {
      const fo = (data?.folders || []).map(folderToNode);
      const fi = (data?.files || []).map(fileToNode);
      return [...fo, ...fi];
    }
    return [...flat.folders, ...flat.files];
  }, [view, data, flat]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...nodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1; // 폴더 먼저
      if (sortKey === "name") return a.name.localeCompare(b.name, "ko") * (sortDir === "asc" ? 1 : -1);
      const ak = view === "recent-open" ? a.opened_at || a.created_at : a.created_at;
      const bk = view === "recent-open" ? b.opened_at || b.created_at : b.created_at;
      return (ak < bk ? -1 : ak > bk ? 1 : 0) * dir;
    });
    return arr;
  }, [nodes, sortKey, sortDir, view]);

  const nodeByKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes]);
  const detailNode = detailKey ? nodeByKey.get(detailKey) : undefined;

  const breadcrumbPath = useMemo(() => {
    const names = (data?.breadcrumb || []).map((b) => b.name);
    return ["전체 파일", ...names].join(" > ");
  }, [data]);

  const titleLabel = view === "all"
    ? (data?.breadcrumb?.length ? data.breadcrumb[data.breadcrumb.length - 1].name : "전체 파일")
    : view === "fav" ? "즐겨찾기" : view === "recent-open" ? "최근 열어본" : "최근 올린";

  // ── actions ──
  function pickView(v: View) { setView(v); setFolderId(null); setSidebarOpen(false); }
  function openFolder(id: number) { setView("all"); setFolderId(id); setSidebarOpen(false); }

  function selectNode(key: string) { setSelection(new Set([key])); setDetailKey(key); }
  function toggleCheck(key: string) {
    setSelection((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    setDetailKey(key);
  }
  function openNode(n: Node) {
    if (n.kind === "folder") openFolder(n.id);
    else window.open(downloadUrl(n.id), "_blank");
  }

  async function onToggleFav(n: Node) {
    await toggleFavorite(n.kind === "folder" ? { folder_id: n.id } : { file_id: n.id });
    load();
  }

  // 노드 단위 편집 동작 (전체 파일 뷰에서만 노출) — grid/list 양쪽에서 재사용
  async function renameNode(n: Node, name: string) {
    setJustCreatedFolderId(null);
    if (n.kind === "folder") await renameFolder(n.id, name);
    else await renameFile(n.id, name);
    load();
  }
  async function deleteNode(n: Node) {
    if (!confirm(`"${n.name}"${n.kind === "folder" ? " 폴더와 안의 내용을" : " 파일을"} 삭제하시겠습니까?`)) return;
    if (n.kind === "folder") await deleteFolder(n.id);
    else await deleteFile(n.id);
    load();
  }
  async function copyNode(n: Node) {
    if (n.kind === "folder") await copyFolder(n.id, folderId);
    else await copyFile(n.id, folderId);
    load();
  }

  // rel = "폴더/하위폴더/파일.ext" 형태의 상대경로. 폴더 세그먼트를 만나면 순서대로 폴더를 만들고
  // (한 번의 업로드 안에서 같은 경로는 캐시로 1회만 생성) 파일을 그 폴더에 올린다. 평범한 파일은
  // rel이 파일명뿐이라 현재 폴더에 그대로 올라간다 — 즉 바탕화면에서 폴더를 통째로 올리면 폴더명과
  // 하위 폴더 구조가 그대로 재현된다.
  async function uploadEntries(entries: { file: File; rel: string }[]) {
    if (entries.length === 0) return;
    const folderCache = new Map<string, number>();
    for (let i = 0; i < entries.length; i++) {
      const { file, rel } = entries[i];
      const segs = rel.split("/").filter(Boolean);
      const fileName = segs.pop() || file.name;
      let parentId = folderId;
      let acc = "";
      for (const seg of segs) {
        acc += "/" + seg;
        const cached = folderCache.get(acc);
        if (cached !== undefined) { parentId = cached; continue; }
        const res = await createFolder(root, effectiveSpace, parentId, seg, ownerId);
        folderCache.set(acc, res.id);
        parentId = res.id;
      }
      const label = entries.length > 1 ? `업로드 중 (${i + 1}/${entries.length}) · ${fileName}` : `업로드 중 · ${fileName}`;
      setTransfer({ label, pct: 0 });
      // 폴더 업로드 시 브라우저가 파일명에 상대경로를 남기는 경우가 있어, 항상 마지막 세그먼트(순수 파일명)로
      // 올린다 — 저장 키에 "/"가 섞여 서버 저장이 실패하는 것을 방지.
      const upFile = fileName === file.name ? file : new File([file], fileName, { type: file.type, lastModified: file.lastModified });
      await uploadFileWithProgress(root, effectiveSpace, parentId, upFile, ownerId, (pct) => setTransfer({ label, pct }));
    }
    setTransfer(null);
    load();
  }

  // 폴더 선택(webkitdirectory) 시 webkitRelativePath에 구조가 들어오고, 일반 파일 선택 시엔 비어 있어 파일명만 쓴다.
  function uploadFiles(files: File[]) {
    return uploadEntries(files.map((f) => ({ file: f, rel: f.webkitRelativePath || f.name })));
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    // 폴더를 드롭하면 react-dropzone이 하위까지 재귀 탐색해 각 파일의 path에 상대경로를 채워준다.
    onDrop: (accepted: FileWithPath[]) => {
      if (isBrowse) uploadEntries(accepted.map((f) => ({ file: f, rel: f.path || f.name })));
    },
    noClick: true,
    disabled: !isBrowse,
  });

  async function handleNewFolder() {
    const res = await createFolder(root, effectiveSpace, folderId, "새 폴더", ownerId);
    setJustCreatedFolderId(res.id);
    load();
  }

  async function handleMoveTarget(item: DragItem, targetFolderId: number | null) {
    const dragKey = `${item.kind[0]}-${item.id}`;
    const keys = selection.has(dragKey) ? Array.from(selection) : [dragKey];
    for (const key of keys) {
      const [k, idStr] = key.split("-");
      const id = Number(idStr);
      if (k === "f") await moveFile(id, targetFolderId);
      else await moveFolder(id, targetFolderId);
    }
    setSelection(new Set());
    load();
  }

  async function handleBulkDownload() {
    const files = sorted.filter((n) => n.kind === "file" && selection.has(n.key));
    for (let i = 0; i < files.length; i++) {
      const n = files[i];
      const label = files.length > 1 ? `다운로드 중 (${i + 1}/${files.length}) · ${n.name}` : `다운로드 중 · ${n.name}`;
      setTransfer({ label, pct: 0 });
      await downloadFileWithProgress(n.id, n.name, (pct) => setTransfer({ label, pct }));
    }
    setTransfer(null);
  }

  async function handleBulkDelete() {
    if (selection.size === 0) return;
    if (!confirm(`선택한 ${selection.size}개 항목을 삭제하시겠습니까?`)) return;
    const fileIds: number[] = [], folderIds: number[] = [];
    for (const key of selection) { const [k, idStr] = key.split("-"); (k === "f" ? fileIds : folderIds).push(Number(idStr)); }
    await bulkDelete(fileIds, folderIds);
    setSelection(new Set());
    load();
  }

  // 자료실 키보드 단축키 — 선택 항목 1개에 F2(이름변경), 선택 항목에 Delete(삭제).
  // 텍스트 입력(이름변경/검색) 중에는 무시하되 체크박스 포커스 상태에선 동작.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isBrowse || !canWrite) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const isTextEntry = tag === "TEXTAREA" || el?.isContentEditable ||
        (tag === "INPUT" && !["checkbox", "radio", "button", "submit"].includes((el as HTMLInputElement).type));
      if (isTextEntry) return;
      if (e.key === "F2") { if (selection.size === 1) setRenameKey(Array.from(selection)[0]); }
      else if (e.key === "Delete") { handleBulkDelete(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBrowse, canWrite, selection, sorted]);

  const allSelected = sorted.length > 0 && sorted.every((n) => selection.has(n.key));
  function toggleSelectAll() { setSelection(allSelected ? new Set() : new Set(sorted.map((n) => n.key))); }

  const btn = "shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";
  // 올리기(주요 액션) 전용 — btn(bg-white/text-gray)과 섞으면 Tailwind 유틸 충돌로 라이트모드에서
  // bg-white가 이겨 흰 배경+흰 글자로 안 보이던 문제가 있어 별도 클래스로 분리한다.
  const btnPrimary = "shrink-0 cursor-pointer rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600";
  const iconBtn = (active: boolean) => `flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 ${active ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15" : ""}`;

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="grid grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:grid-cols-[220px_1fr]" style={{ minHeight: "70vh" }}>
        {/* ── sidebar ── */}
        <aside className={`z-40 flex flex-col border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:w-64 max-lg:border-r max-lg:bg-gray-50 max-lg:shadow-xl max-lg:transition-transform dark:max-lg:bg-gray-900 lg:border-r ${sidebarOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"}`}>
          <div className="flex-1 overflow-y-auto p-3">
            {showSpaces && (
              <div className="mb-3 flex gap-1 rounded-full bg-gray-200/70 p-1 dark:bg-white/[0.06]">
                <button onClick={() => { setSpace("shared"); pickView("all"); }} className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold ${space === "shared" ? "bg-white text-brand-500 shadow-sm dark:bg-gray-800" : "text-gray-500"}`}>🏢 공유</button>
                <button onClick={() => { setSpace("personal"); pickView("all"); }} className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold ${space === "personal" ? "bg-white text-brand-500 shadow-sm dark:bg-gray-800" : "text-gray-500"}`}>🔒 개인</button>
              </div>
            )}
            <button onClick={() => pickView("all")} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${view === "all" ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>
              <span>🗂️</span> 전체 파일
            </button>
            <div className="mt-1 px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">최근</div>
            <button onClick={() => pickView("recent-up")} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium ${view === "recent-up" ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>
              <span>↑</span> 최근 올린
            </button>
            <button onClick={() => pickView("recent-open")} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium ${view === "recent-open" ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>
              <span>👁</span> 최근 열어본
            </button>
            <button onClick={() => pickView("fav")} className={`mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${view === "fav" ? "bg-brand-50 text-brand-500 dark:bg-brand-500/10" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}>
              <span>⭐</span> 즐겨찾기
            </button>
          </div>
          <div className="border-t border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">☁️</span>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-gray-800 dark:text-white/90">{usage ? formatSize(usage.bytes) : "-"} <span className="text-[11px] font-semibold text-gray-400">사용 중</span></div>
                <div className="truncate text-[11px] text-gray-400">송림 클라우드 · 용량 제한 없음</div>
              </div>
            </div>
          </div>
        </aside>
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-gray-900/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* ── main ── */}
        <div {...getRootProps()} className="flex min-w-0 flex-col">
          <input {...getInputProps()} />
          <div className="border-b border-gray-100 px-4 pt-4 dark:border-gray-800 sm:px-6">
            <div className="flex min-w-0 items-center gap-1 text-xs">
              {view === "all" && (
                <>
                  <Crumb label="🏠 전체 파일" targetFolderId={null} onOpen={() => setFolderId(null)} onDropItem={handleMoveTarget} />
                  {data?.breadcrumb.map((b) => (
                    <span key={b.id} className="flex items-center gap-1">
                      <span className="text-gray-300">/</span>
                      <Crumb label={b.name} targetFolderId={b.id} onOpen={() => setFolderId(b.id)} onDropItem={handleMoveTarget} />
                    </span>
                  ))}
                </>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden" aria-label="메뉴">☰</button>
              <h2 className="text-xl font-extrabold text-gray-800 dark:text-white/90">{titleLabel}</h2>
            </div>

            <div className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 py-3 sm:flex-wrap sm:overflow-visible">
              <button onClick={toggleSelectAll} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-[1.6px] text-[11px] ${allSelected ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 dark:border-gray-600"}`} title="전체 선택">{allSelected ? "✓" : ""}</button>
              {isBrowse && canWrite && (
                <>
                  <label className={btnPrimary}>
                    ↑ 올리기
                    <input type="file" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; uploadFiles(files); }} />
                  </label>
                  <label className={btn}>
                    ↑ 폴더 올리기
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; uploadFiles(files); }}
                      {...({ webkitdirectory: "" } as unknown as React.InputHTMLAttributes<HTMLInputElement>)}
                    />
                  </label>
                  <button onClick={handleNewFolder} className={btn}>+ 새 폴더</button>
                </>
              )}
              {selection.size > 0 && (
                <>
                  <button onClick={handleBulkDownload} className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white">선택 {selection.size}개 다운로드</button>
                  {isBrowse && <button onClick={handleBulkDelete} className="shrink-0 rounded-lg bg-error-500 px-3 py-2 text-xs font-bold text-white">삭제</button>}
                </>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-2">
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="rounded-lg border-none bg-transparent py-1.5 pr-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <option value="date">올린 날짜</option>
                  <option value="name">이름</option>
                </select>
                <select value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")} className="rounded-lg border-none bg-transparent py-1.5 pr-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
                  <option value="desc">최신순</option>
                  <option value="asc">오래된순</option>
                </select>
                <button onClick={() => setLayout("list")} className={iconBtn(layout === "list")} title="목록 보기">☰</button>
                <button onClick={() => setLayout("grid")} className={iconBtn(layout === "grid")} title="아이콘 보기">▦</button>
                <button onClick={() => setInfoOpen((v) => !v)} className={iconBtn(infoOpen)} title="상세 정보">ⓘ</button>
                {user?.is_admin && effectiveSpace === "shared" && isBrowse && (
                  <button onClick={() => setShowPerms(true)} className={btn}>폴더 권한</button>
                )}
              </div>
            </div>
            {transfer && (
              <div className="pb-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="truncate">{transfer.label}</span><span className="shrink-0 font-semibold">{transfer.pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${transfer.pct}%` }} /></div>
              </div>
            )}
          </div>

          {/* content + detail */}
          <div className="flex min-h-0 flex-1">
            <div className={`min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 ${isDragActive ? "bg-brand-50/40 dark:bg-brand-500/5" : ""}`}>
              {loading ? (
                <div className="p-10 text-center text-sm text-gray-400">불러오는 중...</div>
              ) : sorted.length === 0 ? (
                <div className="p-14 text-center text-sm text-gray-400">
                  {view === "fav" ? "즐겨찾기한 항목이 없습니다." : view === "recent-open" ? "최근 열어본 파일이 없습니다." : view === "recent-up" ? "최근 올린 파일이 없습니다." : "폴더가 비어 있습니다. 파일을 끌어다 놓아 업로드할 수 있습니다."}
                </div>
              ) : layout === "grid" ? (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                  {sorted.map((n) => (
                    <label key={n.key} className="relative">
                      <input type="checkbox" checked={selection.has(n.key)} onChange={() => toggleCheck(n.key)} onClick={(e) => e.stopPropagation()} className="absolute left-3 top-3 z-10 h-3.5 w-3.5" />
                      <StorageItem
                        node={n} layout="grid" selected={selection.has(n.key)} draggable={isBrowse && canWrite} isDropTarget={isBrowse && n.kind === "folder" && canWrite}
                        autoRename={(justCreatedFolderId === n.id && n.kind === "folder") || renameKey === n.key}
                        onSelect={() => selectNode(n.key)} onOpen={() => openNode(n)} onToggleFavorite={() => onToggleFav(n)}
                        onRenameCommit={isBrowse && canWrite ? (name) => renameNode(n, name) : undefined}
                        onRenameClose={() => { setRenameKey(null); setJustCreatedFolderId(null); }}
                        onDelete={isBrowse && canWrite ? () => deleteNode(n) : undefined}
                        onCopy={isBrowse && canWrite ? () => copyNode(n) : undefined}
                        onDropItem={(item) => handleMoveTarget(item, n.id)}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="grid grid-cols-[1fr_150px_96px_auto] gap-3 border-b border-gray-100 px-3 pb-1.5 text-[11px] font-bold text-gray-400 dark:border-gray-800">
                    <span>이름</span><span>올린 날짜</span><span className="text-right">크기</span><span className="w-8" />
                  </div>
                  {sorted.map((n) => (
                    <div key={n.key} className="flex items-center gap-2">
                      <input type="checkbox" checked={selection.has(n.key)} onChange={() => toggleCheck(n.key)} onClick={(e) => e.stopPropagation()} className="h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <StorageItem
                          node={n} layout="list" selected={selection.has(n.key)} draggable={isBrowse && canWrite} isDropTarget={isBrowse && n.kind === "folder" && canWrite}
                          autoRename={(justCreatedFolderId === n.id && n.kind === "folder") || renameKey === n.key}
                          onSelect={() => selectNode(n.key)} onOpen={() => openNode(n)} onToggleFavorite={() => onToggleFav(n)}
                          onRenameCommit={isBrowse && canWrite ? (name) => renameNode(n, name) : undefined}
                        onRenameClose={() => { setRenameKey(null); setJustCreatedFolderId(null); }}
                          onDelete={isBrowse && canWrite ? () => deleteNode(n) : undefined}
                          onCopy={isBrowse && canWrite ? () => copyNode(n) : undefined}
                          onDropItem={(item) => handleMoveTarget(item, n.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {infoOpen && (
              <aside className="hidden w-72 shrink-0 border-l border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40 lg:block">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-gray-800 dark:text-white/90">상세 정보</h3>
                  <button onClick={() => setInfoOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                {!detailNode ? (
                  <div className="py-12 text-center text-xs text-gray-400">항목을 선택하면<br />상세 정보가 표시됩니다.</div>
                ) : (
                  <>
                    <div className="mb-4 flex aspect-[4/3] items-center justify-center rounded-xl bg-white dark:bg-white/[0.03]">
                      {detailNode.kind === "folder" ? <FolderGlyph className="h-20 w-20" /> : <FileTypeIcon filename={detailNode.name} className="h-20 w-20" />}
                    </div>
                    <div className="mb-3 break-all text-sm font-bold text-gray-800 dark:text-white/90">{detailNode.name}</div>
                    {[
                      ["종류", detailNode.kind === "folder" ? KIND_LABEL.folder : fileKindLabel(detailNode.name)],
                      ["위치", detailNode.location ?? breadcrumbPath],
                      ["올린 날짜", longDate(detailNode.created_at)],
                      ["수정한 날짜", longDate(detailNode.updated_at || detailNode.created_at)],
                      ["크기·항목", detailNode.kind === "folder" ? (detailNode.itemCount != null ? `항목 ${detailNode.itemCount}개` : "폴더") : formatSize(detailNode.size)],
                    ].map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[70px_1fr] gap-2 border-b border-gray-100 py-2 text-xs last:border-0 dark:border-gray-800">
                        <span className="font-semibold text-gray-400">{k}</span>
                        <span className="break-all font-medium text-gray-700 dark:text-gray-200">{v}</span>
                      </div>
                    ))}
                  </>
                )}
              </aside>
            )}
          </div>
        </div>
      </div>
      {showPerms && <StoragePermissionsModal root={root} onClose={() => setShowPerms(false)} />}
    </DndProvider>
  );
}

export default function StorageClient({ root, showSpaces }: { root: string; title: string; showSpaces?: boolean }) {
  return <Workspace root={root} showSpaces={showSpaces} />;
}
