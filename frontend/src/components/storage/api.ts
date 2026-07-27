const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface FolderRow {
  id: number;
  name: string;
  created_at: string;
  updated_at?: string;
  is_favorite?: boolean;
  location?: string;
}

export interface FileRow {
  id: number;
  filename: string;
  size: number;
  uploaded_by: number;
  created_at: string;
  updated_at?: string;
  is_favorite?: boolean;
  location?: string;
  opened_at?: string;
}

export interface BrowseResult {
  breadcrumb: { id: number; name: string }[];
  folders: FolderRow[];
  files: FileRow[];
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "요청 실패");
  return res.json();
}

export function browse(root: string, space: string, folderId: number | null, ownerId?: number): Promise<BrowseResult> {
  const qs = new URLSearchParams({ root, space });
  if (folderId) qs.set("folder_id", String(folderId));
  if (ownerId) qs.set("owner_id", String(ownerId));
  return fetch(`${API}/api/storage/browse?${qs.toString()}`, { credentials: "include" }).then((r) => j(r));
}

export function createFolder(root: string, space: string, parentId: number | null, name: string, ownerId?: number) {
  return fetch(`${API}/api/storage/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ root, space, parent_id: parentId, name, owner_id: ownerId }),
  }).then((r) => j<{ id: number }>(r));
}

export function renameFolder(id: number, name: string) {
  return fetch(`${API}/api/storage/folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name }),
  }).then((r) => j(r));
}

export function moveFolder(id: number, parentId: number | null) {
  return fetch(`${API}/api/storage/folders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(parentId === null ? { move_to_root: true } : { parent_id: parentId }),
  }).then((r) => j(r));
}

export function copyFolder(id: number, targetFolderId: number | null) {
  return fetch(`${API}/api/storage/folders/${id}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(targetFolderId === null ? { move_to_root: true } : { target_folder_id: targetFolderId }),
  }).then((r) => j<{ id: number }>(r));
}

export function deleteFolder(id: number) {
  return fetch(`${API}/api/storage/folders/${id}`, { method: "DELETE", credentials: "include" }).then((r) => j(r));
}

export function uploadFile(root: string, space: string, folderId: number | null, file: File, ownerId?: number) {
  const qs = new URLSearchParams({ root, space });
  if (folderId) qs.set("folder_id", String(folderId));
  if (ownerId) qs.set("owner_id", String(ownerId));
  const form = new FormData();
  form.append("file", file);
  return fetch(`${API}/api/storage?${qs.toString()}`, { method: "POST", credentials: "include", body: form }).then((r) => j<{ id: number }>(r));
}

/** fetch()는 업로드 진행률을 알려주지 않아 XHR로 직접 구현. */
export function uploadFileWithProgress(
  root: string,
  space: string,
  folderId: number | null,
  file: File,
  ownerId: number | undefined,
  onProgress: (pct: number) => void
): Promise<{ id: number }> {
  const qs = new URLSearchParams({ root, space });
  if (folderId) qs.set("folder_id", String(folderId));
  if (ownerId) qs.set("owner_id", String(ownerId));
  const form = new FormData();
  form.append("file", file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/api/storage?${qs.toString()}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error("업로드 실패"));
    };
    xhr.onerror = () => reject(new Error("업로드 실패"));
    xhr.send(form);
  });
}

/** 다운로드 진행률 표시 + 여러 파일 선택 다운로드용. Content-Length 대비 수신 바이트로 % 계산. */
export async function downloadFileWithProgress(id: number, filename: string, onProgress: (pct: number) => void): Promise<void> {
  const res = await fetch(`${API}/api/storage/${id}/download`, { credentials: "include" });
  if (!res.ok || !res.body) throw new Error("다운로드 실패");
  const total = Number(res.headers.get("Content-Length") || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(Math.round((received / total) * 100));
  }
  const blob = new Blob(chunks as BlobPart[]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function renameFile(id: number, filename: string) {
  return fetch(`${API}/api/storage/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ filename }),
  }).then((r) => j(r));
}

export function moveFile(id: number, folderId: number | null) {
  return fetch(`${API}/api/storage/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(folderId === null ? { move_to_root: true } : { folder_id: folderId }),
  }).then((r) => j(r));
}

export function copyFile(id: number, targetFolderId: number | null) {
  return fetch(`${API}/api/storage/${id}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(targetFolderId === null ? { move_to_root: true } : { target_folder_id: targetFolderId }),
  }).then((r) => j<{ id: number }>(r));
}

export function deleteFile(id: number) {
  return fetch(`${API}/api/storage/${id}`, { method: "DELETE", credentials: "include" }).then((r) => j(r));
}

export function downloadUrl(id: number) {
  return `${API}/api/storage/${id}/download`;
}

export function bulkDelete(fileIds: number[], folderIds: number[]) {
  return fetch(`${API}/api/storage/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ file_ids: fileIds, folder_ids: folderIds }),
  }).then((r) => j(r));
}

export interface FolderPermission {
  id: number;
  folder_id: number;
  position: string;
  permission_level: string;
}

export function listPermissions(): Promise<FolderPermission[]> {
  return fetch(`${API}/api/storage/permissions`, { credentials: "include" }).then((r) => j(r));
}

export function addPermission(folderId: number, position: string, level: string) {
  return fetch(`${API}/api/storage/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ folder_id: folderId, position, permission_level: level }),
  }).then((r) => j(r));
}

export function removePermission(id: number) {
  return fetch(`${API}/api/storage/permissions/${id}`, { method: "DELETE", credentials: "include" }).then((r) => j(r));
}

export function folderTree(root: string): Promise<{ id: number; path: string }[]> {
  return fetch(`${API}/api/storage/folder-tree?root=${root}`, { credentials: "include" }).then((r) => j(r));
}

function scopeQs(root: string, space: string, ownerId?: number) {
  const qs = new URLSearchParams({ root, space });
  if (ownerId) qs.set("owner_id", String(ownerId));
  return qs;
}

export function storageUsage(root: string, space: string, ownerId?: number): Promise<{ bytes: number; count: number }> {
  return fetch(`${API}/api/storage/usage?${scopeQs(root, space, ownerId).toString()}`, { credentials: "include" }).then((r) => j(r));
}

export function storageRecent(root: string, space: string, kind: "uploaded" | "opened", ownerId?: number): Promise<FileRow[]> {
  const qs = scopeQs(root, space, ownerId);
  qs.set("kind", kind);
  return fetch(`${API}/api/storage/recent?${qs.toString()}`, { credentials: "include" }).then((r) => j(r));
}

export function storageFavorites(root: string, space: string, ownerId?: number): Promise<{ folders: FolderRow[]; files: FileRow[] }> {
  return fetch(`${API}/api/storage/favorites?${scopeQs(root, space, ownerId).toString()}`, { credentials: "include" }).then((r) => j(r));
}

export function toggleFavorite(target: { folder_id?: number; file_id?: number }): Promise<{ is_favorite: boolean }> {
  return fetch(`${API}/api/storage/favorites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(target),
  }).then((r) => j(r));
}
