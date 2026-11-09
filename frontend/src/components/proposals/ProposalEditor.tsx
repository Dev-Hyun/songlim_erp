"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import CategoryPanels from "./CategoryPanels";
import { createProposal, downloadFile, fetchCatalog, fetchPreview, fetchProposal, updateProposal, type ExportFormat } from "./api";
import { EMPTY_ITEMS, type Catalog, type Design, type ProposalForm, type ProposalItems } from "./types";

const PAGE_W = 1123; // 제안서 한 장 너비(px) = A4 가로

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 저장·PDF 전에 막아야 할 빈 칸. 반환값이 비어 있으면 통과. */
function missing(f: ProposalForm): string[] {
  const out: string[] = [];
  if (!f.hospital_name.trim()) out.push("병원명");
  if (!f.doctor_name.trim()) out.push("받는 분");
  const it = f.items;
  if (it.xray.some((x) => !x.price || x.options.some((o) => !o.price))) out.push("X-RAY 금액");
  if (it.pacs && !it.pacs.price) out.push("PACS 금액");
  if (it.mammo.some((x) => !x.price)) out.push("MAMMOGRAPHY 금액");
  if (it.carm.some((x) => !x.price) || (it.carm_reducer && !it.carm_reducer.price)) out.push("C-ARM 금액");
  if (it.bmd.some((x) => !x.price)) out.push("BMD 금액");
  if (it.ultrasound.some((b) => b.models.some((m) => !m.price))) out.push("초음파 금액");
  if (it.lipus.some((x) => !x.price)) out.push("LIPUS 금액");
  if (it.eswt.some((x) => !x.price)) out.push("ESWT 금액");
  if (it.emg.some((x) => !x.price)) out.push("근전도 금액");
  if (it.therapy.some((t) => !t.unit_price)) out.push("치료장비 단가");
  return out;
}

/** 저장된 items를 화면 형태로 — 예전에 저장한 제안서에 없는 칸(기타장비, Probe 개수 등)을 기본값으로 채운다. */
function normalize(items: Partial<ProposalItems>): ProposalItems {
  const it = { ...EMPTY_ITEMS, ...items };
  return { ...it, ultrasound: it.ultrasound.map((b) => ({ ...b, models: b.models.map((m) => ({ ...m, probes: m.probes || 2 })) })) };
}

/** 미리보기는 금액을 아직 안 넣은 줄을 빼고 그린다(입력하는 동안에도 나머지는 계속 보이게). */
function completeOnly(items: ProposalItems): ProposalItems {
  return {
    ...items,
    xray: items.xray.filter((x) => x.price > 0).map((x) => ({ ...x, options: x.options.filter((o) => o.price > 0) })),
    pacs: items.pacs?.price ? items.pacs : null,
    mammo: items.mammo.filter((x) => x.price > 0),
    carm: items.carm.filter((x) => x.price > 0),
    carm_reducer: items.carm_reducer?.price ? items.carm_reducer : null,
    bmd: items.bmd.filter((x) => x.price > 0),
    ultrasound: items.ultrasound
      .map((b) => ({ ...b, models: b.models.filter((m) => m.price > 0) }))
      .filter((b) => b.models.length > 0),
    lipus: items.lipus.filter((x) => x.price > 0),
    eswt: items.eswt.filter((x) => x.price > 0),
    emg: items.emg.filter((x) => x.price > 0),
    therapy: items.therapy.filter((t) => t.unit_price > 0),
  };
}

/** 서버 HTML을 iframe에 넣고 1123px 페이지를 칸 너비에 맞춰 줄인다. */
function Preview({ html, status }: { html: string; status: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 600, h: 700 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = Math.min(1, box.w / (PAGE_W + 48));
  return (
    <div ref={boxRef} className="relative h-full min-h-[420px] overflow-hidden rounded-control bg-gray-200 dark:bg-gray-800">
      {html ? (
        <iframe
          title="제안서 미리보기"
          srcDoc={html}
          style={{ width: (PAGE_W + 48), height: box.h / s, transform: `scale(${s})`, transformOrigin: "0 0", border: 0 }}
        />
      ) : (
        <div className="fg-muted flex h-full items-center justify-center p-6 text-center text-ui">{status || "병원명과 받는 분을 넣으면 미리보기가 나옵니다."}</div>
      )}
      {html && status && <div className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-ui-xs text-white">{status}</div>}
    </div>
  );
}

export default function ProposalEditor({ id }: { id?: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const { isExpanded, isHovered } = useSidebar();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [form, setForm] = useState<ProposalForm | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [loadError, setLoadError] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "save" | ExportFormat>("");
  const [showErrors, setShowErrors] = useState(false);
  const [tab, setTab] = useState<"form" | "preview">("form");
  const [preview, setPreview] = useState("");
  const [previewStatus, setPreviewStatus] = useState("");

  // 처음: 카탈로그 + (수정이면) 제안서, 새로 만들기면 담당자 = 로그인 사용자
  useEffect(() => {
    let alive = true;
    Promise.all([fetchCatalog(), id ? fetchProposal(id) : Promise.resolve(null)])
      .then(([cat, p]) => {
        if (!alive) return;
        setCatalog(cat);
        const f: ProposalForm = p
          ? { hospital_name: p.hospital_name, doctor_name: p.doctor_name, proposal_date: p.proposal_date, rep_name: p.rep_name,
              rep_title: p.rep_title, rep_phone: p.rep_phone, design: p.design, items: normalize(p.items) }
          : { hospital_name: "", doctor_name: "", proposal_date: today(), rep_name: "", rep_title: "", rep_phone: "", design: "A", items: EMPTY_ITEMS };
        setForm(f);
        setSavedJson(p ? JSON.stringify(f) : "");
        if (p && window.location.search.includes("saved=1")) {
          setMsg({ tone: "ok", text: "저장했습니다" });
          window.history.replaceState(null, "", window.location.pathname);
        }
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  // 새 제안서의 담당자 기본값(로그인 정보가 늦게 와도 채운다)
  useEffect(() => {
    if (id || !user) return;
    setForm((f) =>
      f && !f.rep_name && !f.rep_phone
        ? { ...f, rep_name: user.display_name || user.username, rep_title: user.position || "", rep_phone: user.phone || "" }
        : f,
    );
  }, [id, user, form === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!form && JSON.stringify(form) !== savedJson;
  const problems = useMemo(() => (form ? missing(form) : []), [form]);

  // 미리보기: 입력이 멈추고 0.6초 뒤 갱신
  useEffect(() => {
    if (!form) return;
    if (!form.hospital_name.trim() || !form.doctor_name.trim()) {
      setPreview("");
      setPreviewStatus("");
      return;
    }
    const t = setTimeout(() => {
      setPreviewStatus("미리보기 갱신 중…");
      fetchPreview({ ...form, items: completeOnly(form.items) })
        .then((html) => {
          setPreview(html);
          setPreviewStatus("");
        })
        .catch((e: Error) => setPreviewStatus(e.message));
    }, 600);
    return () => clearTimeout(t);
  }, [form]);

  const setItems = useCallback((fn: (it: ProposalItems) => ProposalItems) => setForm((f) => (f ? { ...f, items: fn(f.items) } : f)), []);
  const set = <K extends keyof ProposalForm>(k: K, v: ProposalForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save(): Promise<number | null> {
    if (!form) return null;
    if (problems.length) {
      setShowErrors(true);
      setMsg({ tone: "err", text: `빈 칸을 채워 주세요: ${problems.join(", ")}` });
      return null;
    }
    setBusy("save");
    try {
      const saved = id ? await updateProposal(id, form) : await createProposal(form);
      const next: ProposalForm = { ...form, items: normalize(saved.items) };
      setForm(next);
      setSavedJson(JSON.stringify(next));
      setMsg({ tone: "ok", text: "저장했습니다" });
      // 새 제안서는 주소가 바뀌며 화면이 새로 열리므로, 저장 완료 안내를 다음 화면에 넘긴다.
      if (!id) router.replace(`/proposals/${saved.id}?saved=1`);
      return saved.id;
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
      return null;
    } finally {
      setBusy("");
    }
  }

  async function download(fmt: ExportFormat) {
    const pid = dirty || !id ? await save() : id;
    if (!pid) return;
    setBusy(fmt);
    try {
      await downloadFile(pid, fmt);
      setMsg({ tone: "ok", text: `${fmt === "pdf" ? "PDF" : "PPT"}를 내려받았습니다` });
    } catch (e) {
      setMsg({ tone: "err", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  if (loadError) return <div className="surface-card p-6 text-ui text-error-600">{loadError}</div>;
  if (!form || !catalog) return <div className="surface-card fg-muted p-6 text-ui">불러오는 중…</div>;

  const bad = (v: string) => showErrors && !v.trim();
  const text = (k: "hospital_name" | "doctor_name" | "rep_name" | "rep_title" | "rep_phone", label: string, required = false, placeholder = "") => (
    <label className="block min-w-0">
      <span className="fg-muted mb-1 block text-ui-xs">
        {label}
        {required && <span className="text-error-500"> *</span>}
      </span>
      <input
        className={`field w-full ${required && bad(form[k]) ? "!border-error-400" : ""}`}
        value={form[k]}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
      />
    </label>
  );

  return (
    <div className="pb-20">
      {/* 폰: 입력 / 미리보기 탭 */}
      <div className="seg mb-3 xl:hidden">
        {(["form", "preview"] as const).map((t) => (
          <button key={t} type="button" className={`seg-item ${tab === t ? "seg-item-on" : ""}`} onClick={() => setTab(t)}>
            {t === "form" ? "입력" : "미리보기"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={`min-w-0 space-y-3 ${tab === "preview" ? "hidden xl:block" : ""}`}>
          <section className="surface-card space-y-3 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {text("hospital_name", "병원명", true)}
              {/* 직함까지 그대로 적는다 — 원장님·실장님·대학교 등 받는 곳이 달라서 "원장님"을 붙이지 않는다 */}
              {text("doctor_name", "받는 분 (직함까지)", true, "예: 홍길동 원장님")}
              <label className="block">
                <span className="fg-muted mb-1 block text-ui-xs">제안일</span>
                <input type="date" className="field w-full" value={form.proposal_date} onChange={(e) => set("proposal_date", e.target.value)} />
              </label>
              <div>
                <span className="fg-muted mb-1 block text-ui-xs">디자인</span>
                <div className="seg">
                  {(["A", "C"] as Design[]).map((d) => (
                    <button key={d} type="button" className={`seg-item ${form.design === d ? "seg-item-on" : ""}`} onClick={() => set("design", d)}>
                      {d === "A" ? "A 클리닉 블루" : "C 송림 그린"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="hairline-soft grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3">
              {text("rep_name", "담당자")}
              {text("rep_title", "직함")}
              {text("rep_phone", "연락처")}
            </div>
          </section>
          <CategoryPanels catalog={catalog} items={form.items} setItems={setItems} showErrors={showErrors} />
        </div>

        <div className={`min-w-0 ${tab === "form" ? "hidden xl:block" : ""}`}>
          <div className="xl:sticky xl:top-20 h-[calc(100vh-180px)]">
            <Preview html={preview} status={previewStatus} />
          </div>
        </div>
      </div>

      {/* 하단 고정: 저장 / PDF / PPT */}
      <div className={`surface-card fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t px-4 py-2.5 ${isExpanded || isHovered ? "lg:left-[248px]" : "lg:left-[68px]"}`}>
        {msg && <span className={`mr-auto truncate text-ui ${msg.tone === "err" ? "text-error-600" : "fg-muted"}`}>{msg.text}</span>}
        {!msg && dirty && <span className="fg-muted mr-auto text-ui-xs">저장하지 않은 변경 사항이 있습니다</span>}
        <button type="button" className="btn btn-default" disabled={!!busy} onClick={save}>
          {busy === "save" ? "저장 중…" : "저장"}
        </button>
        {(["pdf", "pptx"] as const).map((fmt) => {
          const label = fmt === "pdf" ? "PDF" : "PPT";
          return (
            <button key={fmt} type="button" className="btn btn-primary" disabled={!!busy || problems.length > 0}
              onClick={() => download(fmt)} title={problems.length ? `빈 칸: ${problems.join(", ")}` : ""}>
              {busy === fmt ? `${label} 만드는 중…` : `${label} 다운로드`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
