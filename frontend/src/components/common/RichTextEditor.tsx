"use client";

import { useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`min-w-[28px] rounded px-2 py-1 text-xs font-semibold ${
        active
          ? "bg-brand-500 text-white"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-4 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />;

// 네이버 블로그/티스토리 수준으로 자주 쓰는 글자색 프리셋.
const TEXT_COLORS = ["#111827", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#465fff", "#a855f7"];

export default function RichTextEditor({ value, onChange, placeholder, minHeight = "200px" }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder || "내용을 입력하세요" }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
      },
    },
  });

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API}/api/uploads/image`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      alert("이미지 업로드에 실패했습니다");
      return;
    }
    const data = await res.json();
    editor.chain().focus().setImage({ src: `${API}${data.url}` }).run();
  }

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-gray-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-800 dark:bg-white/[0.02]">
        <ToolbarButton title="제목 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarButton>
        <ToolbarButton title="제목 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
        <ToolbarButton title="제목 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
        <Divider />
        <ToolbarButton title="굵게" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><span className="font-extrabold">B</span></ToolbarButton>
        <ToolbarButton title="기울임" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><span className="italic">I</span></ToolbarButton>
        <ToolbarButton title="밑줄" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><span className="underline">U</span></ToolbarButton>
        <ToolbarButton title="취소선" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><span className="line-through">S</span></ToolbarButton>
        <Divider />
        {/* 글자색 */}
        <span className="flex items-center gap-0.5 px-0.5">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={`글자색 ${c}`}
              onClick={() => editor.chain().focus().setColor(c).run()}
              className="h-4 w-4 rounded-full border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: c }}
            />
          ))}
          <ToolbarButton title="글자색 지우기" onClick={() => editor.chain().focus().unsetColor().run()}>⌫</ToolbarButton>
        </span>
        <Divider />
        <ToolbarButton title="왼쪽 정렬" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>⬅</ToolbarButton>
        <ToolbarButton title="가운데 정렬" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>⬌</ToolbarButton>
        <ToolbarButton title="오른쪽 정렬" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>➡</ToolbarButton>
        <Divider />
        <ToolbarButton title="글머리 기호" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>•••</ToolbarButton>
        <ToolbarButton title="번호 매기기" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.2.</ToolbarButton>
        <ToolbarButton title="인용" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>&quot;</ToolbarButton>
        <ToolbarButton title="구분선" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</ToolbarButton>
        <Divider />
        <ToolbarButton
          title="링크"
          active={editor.isActive("link")}
          onClick={() => {
            const url = window.prompt("링크 URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          🔗
        </ToolbarButton>
        <ToolbarButton title="사진 추가" onClick={() => fileInputRef.current?.click()}>🖼</ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
      </div>
      <div style={{ minHeight }} className="px-3 py-2 text-sm">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
