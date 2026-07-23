const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface FolderRow {
  id: number;
  name: string;
  created_at: string;
}

export interface FileRow {
  id: number;
  filename: string;
  size: number;
  uploaded_by: number;
  created_at: string;
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
