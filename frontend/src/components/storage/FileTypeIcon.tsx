import React from "react";

// macOS Finder 스타일 파일 아이콘 — 확장자별 색상 + 문서 하단에 확장자 라벨을 크게 찍어
// 파일명이 길어도 PDF/XLSX/TXT 등을 한눈에 구분할 수 있게 한다.
const TYPE_COLORS: Record<string, string> = {
  pdf: "#E5484D",
  doc: "#3E63DD", docx: "#3E63DD", hwp: "#1F8FBF", txt: "#8B8D98", rtf: "#8B8D98",
  xls: "#30A46C", xlsx: "#30A46C", csv: "#30A46C",
  ppt: "#F76B15", pptx: "#F76B15", key: "#F76B15",
  zip: "#F5A623", rar: "#F5A623", "7z": "#F5A623", tar: "#F5A623", gz: "#F5A623",
  png: "#8E4EC6", jpg: "#8E4EC6", jpeg: "#8E4EC6", gif: "#8E4EC6", webp: "#8E4EC6", svg: "#8E4EC6", heic: "#8E4EC6",
  mp4: "#E93D82", mov: "#E93D82", avi: "#E93D82", mkv: "#E93D82",
  mp3: "#0EA5E9", wav: "#0EA5E9", m4a: "#0EA5E9",
};

function extOf(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? (parts.pop() || "").toLowerCase() : "";
}

export function FileTypeIcon({ filename, className = "h-10 w-10" }: { filename: string; className?: string }) {
  const ext = extOf(filename);
  const color = TYPE_COLORS[ext] || "#8B8D98";
  const label = (ext || "FILE").slice(0, 4).toUpperCase();
  return (
    <svg viewBox="0 0 40 48" className={className} role="img" aria-label={`${label} 파일`}>
      {/* 문서 본체 */}
      <path
        d="M9 3.5h15L33 12.5V42a2.5 2.5 0 0 1-2.5 2.5h-21A2.5 2.5 0 0 1 7 42V6A2.5 2.5 0 0 1 9 3.5Z"
        fill="#FFFFFF"
        stroke="#D0D5DD"
        strokeWidth="1.2"
      />
      {/* 접힌 모서리 */}
      <path d="M24 3.5 33 12.5h-6.5A2.5 2.5 0 0 1 24 10Z" fill="#EAECF0" stroke="#D0D5DD" strokeWidth="1.2" strokeLinejoin="round" />
      {/* 확장자 색상 밴드 */}
      <rect x="7" y="27" width="26" height="12.5" rx="2.5" fill={color} />
      <text x="20" y="36" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#FFFFFF" fontFamily="Arial, sans-serif">
        {label}
      </text>
    </svg>
  );
}

export function FolderGlyph({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="폴더">
      <path d="M4 11a3 3 0 0 1 3-3h8l3 3.5h12a3 3 0 0 1 3 3V29a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" fill="#54A0FF" />
      <path d="M4 15.5h32V29a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z" fill="#2E86FF" />
    </svg>
  );
}
