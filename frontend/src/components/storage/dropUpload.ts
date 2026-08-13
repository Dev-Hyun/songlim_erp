/**
 * 드래그&드롭으로 들어온 파일/폴더를 윈도우 탐색기와 동일하게 읽어들이는 헬퍼.
 * - 파일만 떨어뜨리면 rel이 파일명뿐이라 폴더가 생기지 않는다.
 * - 폴더를 떨어뜨리면 그 폴더 이름부터 하위 전체 구조(폴더 안의 폴더 포함)가 rel 경로에 담긴다.
 * - 파일이 하나도 없는 빈 폴더도 dirs에 담겨 구조가 그대로 재현된다.
 */

export interface UploadEntry {
  file: File;
  rel: string; // "폴더/하위폴더/파일.ext" — 선행 "/"나 "./"가 없는 순수 상대경로
}

export interface DroppedTree {
  entries: UploadEntry[];
  dirs: string[]; // 드롭에 포함된 모든 폴더 경로(빈 폴더 포함)
}

const IGNORED = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/**
 * "./a//b" 같은 경로를 "a/b"로 정리한다. 브라우저는 파일 하나만 드롭해도 "./파일명" 형태의
 * 경로를 주는 경우가 있어, 그대로 쓰면 "." 이라는 이름의 폴더가 만들어진다.
 */
export function normalizeRel(rel: string): string {
  return rel
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
}

/** readEntries는 한 번에 일부(크롬은 100개)만 돌려주므로 빈 배열이 올 때까지 반복해야 누락이 없다. */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const acc: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(acc);
        else {
          acc.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

function entryToFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, prefix: string, out: DroppedTree): Promise<void> {
  if (IGNORED.has(entry.name)) return;
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    out.entries.push({ file: await entryToFile(entry as FileSystemFileEntry), rel: path });
    return;
  }
  out.dirs.push(path);
  const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
  for (const child of children) await walk(child, path, out);
}

/**
 * drop 이벤트의 DataTransfer는 핸들러가 끝나면 무효화되므로, 엔트리와 파일 목록은
 * 반드시 핸들러 안에서 동기적으로 확보해 두었다가 비동기 탐색에 넘겨야 한다.
 */
export function snapshotDataTransfer(dt: DataTransfer): { roots: FileSystemEntry[]; files: File[] } {
  const roots: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items || [])) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  return { roots, files: Array.from(dt.files || []) };
}

export async function readDroppedTree(roots: FileSystemEntry[], fallbackFiles: File[]): Promise<DroppedTree> {
  const out: DroppedTree = { entries: [], dirs: [] };
  if (roots.length > 0) {
    for (const root of roots) await walk(root, "", out);
    return out;
  }
  // FileSystem API 미지원 브라우저 — 파일만 처리(폴더 구조는 알 수 없음)
  out.entries = fallbackFiles.filter((f) => !IGNORED.has(f.name)).map((f) => ({ file: f, rel: f.name }));
  return out;
}
