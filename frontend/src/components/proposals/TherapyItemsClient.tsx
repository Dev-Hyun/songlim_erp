"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  TherapyItem,
  TherapyItemPayload,
  createTherapyItem,
  fetchTherapyItems,
  reorderTherapyItems,
  therapyImageSrc,
  updateTherapyItem,
  uploadTherapyImage,
} from "./therapyApi";

// 재고 화면과 같은 기준(≤640px)으로 폰 여부를 판단한다.
function useIsNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 640px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 640px)").matches,
    () => false,
  );
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "처리하지 못했습니다");

/** 비고 표시: 줄바꿈은 그대로, **x** 는 빨간 굵은 글씨. 나머지는 일반 텍스트로만 그린다(HTML 해석 없음). */
function NoteText({ text }: { text: string | null }) {
  if (!text) return <span className="fg-subtle">—</span>;
  // split에 캡처 그룹을 주면 [일반, 강조, 일반, 강조, ...] 순서로 나온다
  const parts = text.split(/\*\*([\s\S]+?)\*\*/);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-bold text-error-600 dark:text-error-400">
            {p}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}

/** 흰 배경 고정 상자 안에 사진을 맞춰 넣는다. */
function Photo({ url, className }: { url: string | null; className: string }) {
  const src = therapyImageSrc(url);
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-gray-200 bg-white dark:border-gray-700 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="text-ui-xs text-gray-400">사진 없음</span>
      )}
    </div>
  );
}

function ActiveChip({ active }: { active: boolean }) {
  return (
    <span className="chip">
      <span className={`dot ${active ? "bg-success-500" : "bg-gray-400"}`} />
      {active ? "사용" : "사용 안 함"}
    </span>
  );
}

const emptyDraft: TherapyItemPayload = { name: "", maker: "", model: "", note: "", warranty: "", is_active: true };

const draftOf = (it: TherapyItem): TherapyItemPayload => ({
  name: it.name,
  maker: it.maker ?? "",
  model: it.model ?? "",
  note: it.note ?? "",
  warranty: it.warranty ?? "",
  is_active: it.is_active,
});

/** 제안서 치료장비 품목 관리 — 목록 · 추가/수정 · 사진 · 끌어서 순서 변경. 삭제 대신 '사용 안 함'으로 숨긴다. */
export default function TherapyItemsClient() {
  const isNarrow = useIsNarrow();
  const [items, setItems] = useState<TherapyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  // 편집 폼. id가 null이면 새 품목.
  const [form, setForm] = useState<{ id: number | null; draft: TherapyItemPayload } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");

  const listRef = useRef<HTMLElement | null>(null);
  const itemsRef = useRef<TherapyItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const load = useCallback(async () => {
    try {
      const list = await fetchTherapyItems();
      setItems(list);
      setError("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const view = showInactive ? items : items.filter((it) => it.is_active);
  const viewRef = useRef<TherapyItem[]>([]);
  useEffect(() => {
    viewRef.current = view;
  });

  // ----------------------------------------------------------- 편집 폼

  function openForm(it: TherapyItem | null) {
    setForm(it ? { id: it.id, draft: draftOf(it) } : { id: null, draft: { ...emptyDraft } });
    setFormError("");
    setFormNotice("");
  }

  const setDraft = <K extends keyof TherapyItemPayload>(key: K, value: TherapyItemPayload[K]) =>
    setForm((f) => (f ? { ...f, draft: { ...f.draft, [key]: value } } : f));

  async function saveForm() {
    if (!form) return;
    const draft = { ...form.draft, name: form.draft.name.trim() };
    if (!draft.name) {
      setFormError("품명을 입력하세요");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (form.id == null) {
        const created = await createTherapyItem(draft);
        setItems((prev) => [...prev, created]);
        // 사진은 저장된 품목에만 올릴 수 있어 폼을 닫지 않고 수정 모드로 바꾼다
        setForm({ id: created.id, draft: draftOf(created) });
        setFormNotice("추가했습니다. 이제 사진을 올릴 수 있습니다.");
      } else {
        const updated = await updateTherapyItem(form.id, draft);
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setForm(null);
      }
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일을 다시 골라도 올라가도록
    if (!file || !form || form.id == null) return;
    setUploading(true);
    setFormError("");
    try {
      const updated = await uploadTherapyImage(form.id, file);
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setUploading(false);
    }
  }

  // ----------------------------------------------------------- 드래그 정렬
  // 재고 화면과 같은 방식: 손잡이(⋮⋮)를 누른 채 끌면 놓을 자리에 파란 선, 놓으면 그 자리로.
  // 포인터 이벤트라 마우스·터치 모두 같은 코드다(손잡이에 touch-action: none).
  const dragRef = useRef<{ id: number; from: number } | null>(null);
  const [drag, setDrag] = useState<{ id: number; over: number } | null>(null);

  const dropIndexAt = (clientY: number): number => {
    const els = listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-rowid]")) : [];
    for (let i = 0; i < els.length; i++) {
      const b = els[i].getBoundingClientRect();
      if (clientY < b.top + b.height / 2) return i;
    }
    return els.length;
  };

  const onHandlePointerDown = (e: React.PointerEvent, id: number, index: number) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id, from: index };
    setDrag({ id, over: index });
  };

  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // 화면 가장자리 근처면 자동 스크롤
    const edge = 48;
    if (e.clientY < edge) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
    const over = dropIndexAt(e.clientY);
    setDrag((d) => (d && d.over !== over ? { ...d, over } : d));
  };

  const onHandlePointerUp = async (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    const over = dropIndexAt(e.clientY);
    if (over === d.from || over === d.from + 1) return; // 제자리
    const target = viewRef.current[over] ?? null; // null이면 맨 아래
    // '사용 안 함'을 숨긴 상태일 수 있으므로 전체 목록에서 자리를 옮긴다
    const prev = itemsRef.current;
    const moved = prev.find((x) => x.id === d.id);
    if (!moved) return;
    const next = prev.filter((x) => x.id !== d.id);
    const at = target ? next.findIndex((x) => x.id === target.id) : next.length;
    next.splice(at < 0 ? next.length : at, 0, moved);
    // 낙관적 반영 — 서버 응답 전에 화면 순서부터 바꾼다
    setItems(next.map((x, k) => ({ ...x, sort_order: k + 1 })));
    try {
      await reorderTherapyItems(next.map((x) => x.id));
      setError("");
    } catch (err) {
      setError(`순서 저장 실패: ${errMsg(err)}`);
      load(); // 서버 순서로 되돌린다
    }
  };

  // 놓을 자리 표시(파란 선). 맨 아래로 놓을 때는 마지막 항목 아래에 긋는다.
  const isDropBefore = (index: number) => !!drag && drag.over === index;
  const isDropAfter = (index: number) => !!drag && drag.over === view.length && index === view.length - 1;
  // 카드(div)는 테두리로 긋는다
  const cardDropClass = (index: number) =>
    `${isDropBefore(index) ? "border-t-2 !border-t-brand-500" : ""} ${isDropAfter(index) ? "border-b-2 !border-b-brand-500" : ""}`;
  // 표는 border-separate라 tr 테두리가 그려지지 않아 칸(td)에 안쪽 그림자로 긋는다
  const rowDropClass = (index: number) =>
    isDropBefore(index)
      ? "[&>td]:shadow-[inset_0_2px_0_0_var(--color-brand-500)]"
      : isDropAfter(index)
        ? "[&>td]:shadow-[inset_0_-2px_0_0_var(--color-brand-500)]"
        : "";

  const handleProps = (id: number, index: number) => ({
    role: "button" as const,
    "aria-label": "끌어서 순서 바꾸기",
    title: "끌어서 순서 바꾸기",
    onPointerDown: (e: React.PointerEvent) => onHandlePointerDown(e, id, index),
    onPointerMove: onHandlePointerMove,
    onPointerUp: onHandlePointerUp,
    onPointerCancel: onHandlePointerUp,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  });

  const formItem = form?.id != null ? items.find((x) => x.id === form.id) ?? null : null;
  const inactiveCount = items.filter((x) => !x.is_active).length;

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-center gap-2 px-3 py-2.5">
        <label className="fg-base flex cursor-pointer select-none items-center gap-1.5 text-ui">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4"
          />
          사용 안 함 포함{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
        </label>
        <div className="ml-auto">
          <button onClick={() => openForm(null)} className="btn btn-primary">
            + 품목 추가
          </button>
        </div>
        <p className="fg-subtle w-full text-ui-xs">
          {isNarrow ? "카드를 누르면 수정 · 오른쪽 ⋮⋮를 끌어 순서 이동" : "행을 누르면 수정 · 왼쪽 ⋮⋮를 끌어 순서 이동"} ·
          삭제 대신 &lsquo;사용 안 함&rsquo;으로 두면 제안서 품목 선택에서 빠집니다
        </p>
      </div>

      {error && (
        <div className="rounded-card border border-error-200 bg-error-50 px-3 py-2 text-ui text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="surface-card empty-state">불러오는 중...</div>
      ) : view.length === 0 ? (
        <div className="surface-card empty-state">품목이 없습니다</div>
      ) : isNarrow ? (
        /* 폰: 표 대신 품목 하나당 카드 하나. 글자는 줄바꿈되어 잘리지 않는다. */
        <div ref={(el) => { listRef.current = el; }} className="space-y-2.5">
          {view.map((it, i) => (
            <div
              key={it.id}
              data-rowid={it.id}
              className={`surface-card relative flex items-stretch transition-colors ${cardDropClass(i)} ${
                drag?.id === it.id ? "opacity-40" : !it.is_active ? "opacity-55" : ""
              }`}
            >
              <button
                onClick={() => openForm(it)}
                className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left active:bg-gray-50 dark:active:bg-white/[0.04]"
              >
                <Photo url={it.image_url} className="h-14 w-20" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="fg-strong break-words text-ui-lg font-bold leading-snug">{it.name}</div>
                  {(it.maker || it.model) && (
                    <div className="fg-muted break-words text-ui">{[it.maker, it.model].filter(Boolean).join(" · ")}</div>
                  )}
                  {it.note && (
                    <div className="fg-base text-ui">
                      <NoteText text={it.note} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {it.warranty && <span className="fg-muted break-words text-ui-sm">Warranty {it.warranty}</span>}
                    <ActiveChip active={it.is_active} />
                  </div>
                </div>
              </button>
              <span
                {...handleProps(it.id, i)}
                className="fg-subtle flex w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center border-l border-gray-100 text-lg active:cursor-grabbing dark:border-gray-800"
              >
                ⋮⋮
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="table-dense">
            <thead>
              <tr>
                <th className="th-dense w-14 text-center">순서</th>
                <th className="th-dense w-[96px]">사진</th>
                <th className="th-dense">품명</th>
                <th className="th-dense">제조사</th>
                <th className="th-dense">모델</th>
                <th className="th-dense">비고</th>
                <th className="th-dense">Warranty</th>
                <th className="th-dense w-28">사용 여부</th>
              </tr>
            </thead>
            <tbody ref={(el) => { listRef.current = el; }}>
              {view.map((it, i) => (
                <tr
                  key={it.id}
                  data-rowid={it.id}
                  onClick={() => openForm(it)}
                  className={`row-hover cursor-pointer ${rowDropClass(i)} ${
                    drag?.id === it.id ? "opacity-40" : !it.is_active ? "opacity-55" : ""
                  }`}
                >
                  <td className="td-dense text-center">
                    <span
                      {...handleProps(it.id, i)}
                      className="fg-subtle inline-flex h-7 w-6 cursor-grab touch-none select-none items-center justify-center text-sm active:cursor-grabbing"
                    >
                      ⋮⋮
                    </span>
                  </td>
                  <td className="td-dense">
                    <Photo url={it.image_url} className="h-12 w-[72px]" />
                  </td>
                  <td className="td-dense fg-strong font-semibold">{it.name}</td>
                  <td className="td-dense">{it.maker || <span className="fg-subtle">—</span>}</td>
                  <td className="td-dense">{it.model || <span className="fg-subtle">—</span>}</td>
                  <td className="td-dense min-w-[200px]">
                    <NoteText text={it.note} />
                  </td>
                  <td className="td-dense">{it.warranty || <span className="fg-subtle">—</span>}</td>
                  <td className="td-dense">
                    <ActiveChip active={it.is_active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 추가/수정 폼. 폰은 재고 화면과 같은 하단 시트, PC는 가운데 모달. */}
      {form && (
        <>
          <div className="fixed inset-0 z-[100000] bg-gray-900/30" onClick={() => setForm(null)} />
          <div className="surface-card fixed inset-x-0 bottom-0 z-[100001] flex max-h-[92vh] flex-col rounded-b-none border-x-0 border-b-0 shadow-pop sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-b-card sm:border-x sm:border-b">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <div className="fg-strong min-w-0 flex-1 truncate text-ui-lg font-semibold">
                {form.id == null ? "품목 추가" : form.draft.name || formItem?.name || "품목 수정"}
              </div>
              <button onClick={() => setForm(null)} aria-label="닫기" className="icon-btn">
                ×
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {formNotice && <div className="fg-muted text-ui-sm">{formNotice}</div>}

              {/* 사진 — 저장된 품목에만. 서버가 흰 배경을 지우고 다듬은 결과를 바로 보여 준다. */}
              <div>
                <div className="fg-muted mb-1 text-ui-xs font-medium">사진</div>
                {formItem ? (
                  <div className="flex items-center gap-3">
                    <Photo url={formItem.image_url} className="h-[100px] w-[150px]" />
                    <label className={`btn btn-default ${uploading ? "pointer-events-none opacity-45" : "cursor-pointer"}`}>
                      {uploading ? "처리 중..." : formItem.image_url ? "사진 바꾸기" : "사진 올리기"}
                      <input type="file" accept="image/*" onChange={onPickImage} disabled={uploading} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <div className="fg-subtle text-ui-sm">먼저 저장하면 사진을 올릴 수 있습니다</div>
                )}
              </div>

              <label className="block">
                <span className="fg-muted mb-1 block text-ui-xs font-medium">
                  품명 <span className="text-error-500">*</span>
                </span>
                <input value={form.draft.name} onChange={(e) => setDraft("name", e.target.value)} className="field w-full" />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="fg-muted mb-1 block text-ui-xs font-medium">제조사</span>
                  <input value={form.draft.maker} onChange={(e) => setDraft("maker", e.target.value)} className="field w-full" />
                </label>
                <label className="block">
                  <span className="fg-muted mb-1 block text-ui-xs font-medium">모델</span>
                  <input value={form.draft.model} onChange={(e) => setDraft("model", e.target.value)} className="field w-full" />
                </label>
              </div>
              <label className="block">
                <span className="fg-muted mb-1 block text-ui-xs font-medium">비고</span>
                <textarea
                  rows={4}
                  value={form.draft.note}
                  onChange={(e) => setDraft("note", e.target.value)}
                  className="field-auto w-full resize-y"
                />
                <span className="fg-subtle mt-1 block text-ui-xs">줄바꿈 가능, **강조**로 감싸면 빨간 굵은 글씨</span>
              </label>
              <label className="block">
                <span className="fg-muted mb-1 block text-ui-xs font-medium">Warranty</span>
                <input value={form.draft.warranty} onChange={(e) => setDraft("warranty", e.target.value)} className="field w-full" />
              </label>
              <div>
                <div className="fg-muted mb-1 text-ui-xs font-medium">사용 여부</div>
                <div className="seg">
                  <button
                    type="button"
                    onClick={() => setDraft("is_active", true)}
                    className={`seg-item ${form.draft.is_active ? "seg-item-on" : ""}`}
                  >
                    사용
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft("is_active", false)}
                    className={`seg-item ${!form.draft.is_active ? "seg-item-on" : ""}`}
                  >
                    사용 안 함
                  </button>
                </div>
              </div>

              {formError && <div className="text-ui-sm text-error-600 dark:text-error-400">{formError}</div>}
            </div>

            <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
              <button onClick={() => setForm(null)} className="btn btn-default ml-auto">
                취소
              </button>
              <button onClick={saveForm} disabled={saving || uploading} className="btn btn-primary !px-5">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
