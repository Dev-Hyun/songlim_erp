"use client";

import Link from "next/link";
import { useState } from "react";
import MoneyInput from "./MoneyInput";
import { API } from "./api";
import type { Catalog, MobileLine, ModelPrice, ProposalItems, XrayLine } from "./types";

type SetItems = (fn: (it: ProposalItems) => ProposalItems) => void;

/** 카테고리 한 칸 — 머리글을 누르면 펼치고 접는다. 고른 개수를 오른쪽에 보여준다. */
function Panel({ title, count, children, defaultOpen = false }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || count > 0);
  return (
    <section className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="fg-strong text-ui-md font-semibold">{title}</span>
        <span className="flex items-center gap-2">
          {count > 0 && <span className="chip">{count}개 선택</span>}
          <span className={`fg-muted text-ui-xs transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>▾</span>
        </span>
      </button>
      {open && <div className="hairline-soft space-y-3 border-t px-4 py-3">{children}</div>}
    </section>
  );
}

function Check({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-control border px-2.5 py-2 text-ui transition-colors ${
        checked ? "border-gray-900 bg-gray-50 dark:border-gray-300 dark:bg-white/[0.06]" : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="fg-strong block font-medium">{label}</span>
        {sub && <span className="fg-muted block text-ui-xs">{sub}</span>}
      </span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="fg-muted mb-1 block text-ui-xs">{label}</span>
      {children}
    </label>
  );
}

/** 한 패널 안의 작은 카테고리 제목(기타장비 → LIPUS · ESWT · 근전도) */
function SubHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="pt-1">
      <div className="fg-strong text-ui font-semibold">{title}</div>
      {note && <p className="fg-muted text-ui-xs">{note}</p>}
    </div>
  );
}

/** 고른 모델 한 대의 입력 상자 */
function LineBox({ title, children, onRemove }: { title: string; children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="surface-sub rounded-control border border-gray-200 p-3 dark:border-gray-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="fg-strong text-ui-md font-semibold">{title}</span>
        <button type="button" className="btn btn-ghost h-7 px-2 text-ui-xs" onClick={onRemove}>
          빼기
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

const toggle = <T,>(list: T[], on: boolean, make: () => T, match: (x: T) => boolean): T[] =>
  on ? (list.some(match) ? list : [...list, make()]) : list.filter((x) => !match(x));

/** MAMMO·C-ARM·MCT·BMD·이동형 공통: 모델 체크 → 제안가·기존장비 인수금액 (+ extra: 상자 안 추가 칸) */
function ModelPriceSection<T extends ModelPrice>({
  models,
  rows,
  onRows,
  showErrors,
  defaultPrice,
  newRow,
  extra,
}: {
  models: { model: string; sub?: string }[];
  rows: T[];
  onRows: (rows: T[]) => void;
  showErrors: boolean;
  defaultPrice: (model: string) => number;
  newRow?: (model: string, price: number) => T;
  extra?: (row: T, patch: (p: Partial<T>) => void) => React.ReactNode;
}) {
  const patch = (model: string, p: Partial<T>) => onRows(rows.map((r) => (r.model === model ? { ...r, ...p } : r)));
  const make = (model: string): T =>
    newRow ? newRow(model, defaultPrice(model)) : ({ model, price: defaultPrice(model), tradein: null } as T);
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {models.map((m) => (
          <Check
            key={m.model}
            label={m.model}
            sub={m.sub}
            checked={rows.some((r) => r.model === m.model)}
            onChange={(on) => onRows(toggle(rows, on, () => make(m.model), (r) => r.model === m.model))}
          />
        ))}
      </div>
      {rows.map((r) => (
        <LineBox key={r.model} title={r.model} onRemove={() => onRows(rows.filter((x) => x.model !== r.model))}>
          <Field label="제안가 (VAT 포함)">
            <MoneyInput value={r.price} invalid={showErrors && !r.price} onChange={(v) => patch(r.model, { price: v } as Partial<T>)} />
          </Field>
          <Field label="기존장비 인수금액 (선택)">
            <MoneyInput value={r.tradein} placeholder="없으면 비움" onChange={(v) => patch(r.model, { tradein: v || null } as Partial<T>)} />
          </Field>
          {extra?.(r, (p) => patch(r.model, p))}
        </LineBox>
      ))}
    </>
  );
}

/** 한 카테고리를 브랜드별 소분류로 나눠 보여 준다(C-ARM: GENORAY · DRTECH, MAMMOGRAPHY: DRTECH · BEMEMS). 행은 한 목록에 그대로 둔다. */
function BrandGroups<M extends { model: string; brand: string }, T extends ModelPrice>({
  models,
  rows,
  onRows,
  render,
}: {
  models: M[];
  rows: T[];
  onRows: (rows: T[]) => void;
  render: (brand: string, models: M[], rows: T[], onRows: (rows: T[]) => void) => React.ReactNode;
}) {
  return (
    <>
      {Array.from(new Set(models.map((m) => m.brand))).map((brand) => {
        const mine = models.filter((m) => m.brand === brand);
        const isMine = (model: string) => mine.some((m) => m.model === model);
        return (
          <div key={brand} className="space-y-2">
            <SubHead title={brand} />
            {render(brand, mine, rows.filter((r) => isMine(r.model)), (sub) => onRows([...rows.filter((r) => !isMine(r.model)), ...sub]))}
          </div>
        );
      })}
    </>
  );
}

export default function CategoryPanels({
  catalog,
  items,
  setItems,
  showErrors,
}: {
  catalog: Catalog;
  items: ProposalItems;
  setItems: SetItems;
  showErrors: boolean;
}) {
  const [rxQuery, setRxQuery] = useState("");
  // 장비를 고르는 순간 들어갈 기본 금액(기존 제안서 금액 → 이후 마지막 저장 금액)
  const dp = (key: string) => catalog.defaults?.[key]?.price ?? 0;
  const xrayType = (model: string) => catalog.xray.find((x) => x.model === model)?.type;
  const patchX = (model: string, p: Partial<XrayLine>) =>
    setItems((it) => ({ ...it, xray: it.xray.map((x) => (x.model === model ? { ...x, ...p } : x)) }));
  const usCount = items.ultrasound.reduce((a, b) => a + b.models.length, 0);
  // 이 제안서에 들어 있지만 지금은 '사용 안 함'인 품목(예: 기타장비로 옮긴 ESWT) — 목록에 안 보여도 뺄 수 있게 따로 보여 준다
  const rxHidden = items.therapy.filter((l) => !catalog.therapy.some((t) => t.id === l.item_id));
  const rxShown = catalog.therapy.filter((t) =>
    `${t.name} ${t.maker || ""} ${t.model || ""}`.toLowerCase().includes(rxQuery.trim().toLowerCase()),
  );

  return (
    <div className="space-y-3">
      {/* ---------- X-RAY ---------- */}
      <Panel title="X-RAY SYSTEM" count={items.xray.length + items.xray_mobile.length + (items.pacs ? 1 : 0)}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {catalog.xray.map((m) => (
            <Check
              key={m.model}
              label={m.model}
              sub={m.desc_line}
              checked={items.xray.some((x) => x.model === m.model)}
              onChange={(on) =>
                setItems((it) => ({
                  ...it,
                  xray: toggle(
                    it.xray,
                    on,
                    () => ({
                      model: m.model,
                      detector_count: 1,
                      detector_type: m.type === "ceiling" ? catalog.xray_detector_types[0] : null,
                      table: m.type === "ceiling" ? catalog.xray_table_types[0] : null,
                      price: dp(`xray:${m.model}`),
                      tradein: null,
                      options: [],
                    }),
                    (x) => x.model === m.model,
                  ),
                }))
              }
            />
          ))}
        </div>
        {items.xray.map((x) => (
          <LineBox key={x.model} title={x.model} onRemove={() => setItems((it) => ({ ...it, xray: it.xray.filter((r) => r.model !== x.model) }))}>
            <Field label="Detector 개수">
              {/* 1~3개가 기본이라 고르기만 하게(폰에서 숫자칸 수정이 불편했음). 예전에 4개 이상 저장한 값도 보이게 남긴다. */}
              <select className="field w-full" value={x.detector_count} onChange={(e) => patchX(x.model, { detector_count: Number(e.target.value) })}>
                {Array.from(new Set([1, 2, 3, x.detector_count])).map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
            </Field>
            {xrayType(x.model) === "ceiling" && (
              <>
                <Field label="Detector 종류">
                  <select className="field w-full" value={x.detector_type || ""} onChange={(e) => patchX(x.model, { detector_type: e.target.value })}>
                    {catalog.xray_detector_types.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Table 종류">
                  <select className="field w-full" value={x.table || ""} onChange={(e) => patchX(x.model, { table: e.target.value })}>
                    {catalog.xray_table_types.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Field label="제안가 (VAT 포함)">
              <MoneyInput value={x.price} invalid={showErrors && !x.price} onChange={(v) => patchX(x.model, { price: v })} />
            </Field>
            <Field label="기존장비 인수금액 (선택)">
              <MoneyInput value={x.tradein} placeholder="없으면 비움" onChange={(v) => patchX(x.model, { tradein: v || null })} />
            </Field>
            <div className="sm:col-span-2">
              <span className="fg-muted mb-1 block text-ui-xs">OPTIONS (체크한 것만 제안서에 나옵니다)</span>
              <div className="space-y-1.5">
                {catalog.xray_options.map((o) => {
                  const cur = x.options.find((v) => v.key === o.key);
                  return (
                    <div key={o.key} className="flex flex-wrap items-center gap-2">
                      <label className="flex min-w-[220px] flex-1 items-center gap-2 text-ui">
                        <input
                          type="checkbox"
                          checked={!!cur}
                          onChange={(e) =>
                            patchX(x.model, {
                              options: e.target.checked
                                ? [...x.options, { key: o.key, price: dp(`xray_opt:${o.key}`) }]
                                : x.options.filter((v) => v.key !== o.key),
                            })
                          }
                        />
                        {o.label}
                      </label>
                      {cur && (
                        <MoneyInput
                          className="w-40"
                          value={cur.price}
                          invalid={showErrors && !cur.price}
                          ariaLabel={`${o.label} 금액`}
                          onChange={(v) => patchX(x.model, { options: x.options.map((q) => (q.key === o.key ? { ...q, price: v } : q)) })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </LineBox>
        ))}
        <SubHead title="이동형 (모바일 DR)" note="옵션 없음 · 한 대에 소개 3장 · 디텍터는 여러 장 고를 수 있음" />
        <ModelPriceSection<MobileLine>
          models={catalog.xray_mobile.map((m) => ({ model: m.model, sub: `DRGEM · ${m.sub}` }))}
          rows={items.xray_mobile}
          onRows={(rows) => setItems((it) => ({ ...it, xray_mobile: rows }))}
          showErrors={showErrors}
          defaultPrice={(m) => dp(`xray_mobile:${m}`)}
          newRow={(model, price) => ({ model, price, tradein: null, detectors: [{ size: "성인용", type: "" }] })}
          extra={(r, patch) => {
            const dets = r.detectors ?? [];
            const setDet = (i: number, p: Partial<MobileLine["detectors"][number]>) =>
              patch({ detectors: dets.map((d, j) => (j === i ? { ...d, ...p } : d)) });
            return (
              <div className="space-y-2 sm:col-span-2">
                <span className="fg-muted block text-ui-xs">디텍터 (장마다 크기 · 종류)</span>
                {dets.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="fg-muted w-5 shrink-0 text-ui-xs">{i + 1}</span>
                    <select
                      className={`field min-w-0 flex-1 ${showErrors && !d.size ? "!border-error-400" : ""}`}
                      aria-label={`디텍터 ${i + 1} 크기`}
                      value={d.size}
                      onChange={(e) => setDet(i, { size: e.target.value })}
                    >
                      <option value="">크기 선택</option>
                      {catalog.mobile_detector_sizes.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      className={`field min-w-0 flex-1 ${showErrors && !d.type ? "!border-error-400" : ""}`}
                      aria-label={`디텍터 ${i + 1} 종류`}
                      value={d.type}
                      onChange={(e) => setDet(i, { type: e.target.value })}
                    >
                      <option value="">종류 선택</option>
                      {catalog.mobile_detector_types.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost h-8 shrink-0 px-2 text-ui-xs"
                      onClick={() => patch({ detectors: dets.filter((_, j) => j !== i) })}
                    >
                      빼기
                    </button>
                  </div>
                ))}
                {dets.length < 6 && (
                  <button
                    type="button"
                    className="btn btn-default h-8 px-3 text-ui-xs"
                    onClick={() => patch({ detectors: [...dets, { size: "성인용", type: "" }] })}
                  >
                    + 디텍터 추가
                  </button>
                )}
              </div>
            );
          }}
        />
        <Check
          label="PACS 소개 페이지 넣기"
          sub="ViewRex3 · GEMPACS · UBPACS-Z 중 하나"
          checked={!!items.pacs}
          onChange={(on) => setItems((it) => ({ ...it, pacs: on ? { model: "VIEWREX 3", price: dp("pacs:VIEWREX 3") } : null }))}
        />
        {items.pacs && (
          <>
            <div className="seg">
              {catalog.pacs.map((m) => (
                <button
                  key={m.model}
                  type="button"
                  className={`seg-item ${(items.pacs?.model ?? "VIEWREX 3") === m.model ? "seg-item-on" : ""}`}
                  onClick={() => setItems((it) => ({ ...it, pacs: { model: m.model, price: dp(`pacs:${m.model}`) } }))}
                >
                  {m.title}
                  <span className="fg-muted ml-1 text-ui-xs">{m.brand}</span>
                </button>
              ))}
            </div>
            <Field label="PACS 제안가 (VAT 포함)">
              <MoneyInput
                value={items.pacs.price}
                invalid={showErrors && !items.pacs.price}
                onChange={(v) => setItems((it) => ({ ...it, pacs: it.pacs ? { ...it.pacs, price: v } : null }))}
              />
            </Field>
          </>
        )}
      </Panel>

      {/* ---------- C-ARM ---------- */}
      <Panel title="C-ARM" count={items.carm.length + (items.carm_table ? 1 : 0) + (items.carm_reducer ? 1 : 0)}>
        <BrandGroups
          models={catalog.carm}
          rows={items.carm}
          onRows={(rows) => setItems((it) => ({ ...it, carm: rows }))}
          render={(brand, models, rows, onRows) => (
            <ModelPriceSection
              models={models}
              rows={rows}
              onRows={onRows}
              showErrors={showErrors}
              defaultPrice={(m) => dp(`carm:${m}`)}
              extra={
                brand === "DRTECH"
                  ? (r, patch) => (
                      <Field label="보증기간 (비우면 3년)">
                        <input
                          className="field w-full"
                          placeholder="예: 3년"
                          maxLength={40}
                          value={r.warranty ?? ""}
                          onChange={(e) => patch({ warranty: e.target.value || null })}
                        />
                      </Field>
                    )
                  : undefined
              }
            />
          )}
        />
        <div>
          <span className="fg-muted mb-1 block text-ui-xs">전동테이블 소개 페이지 (가격은 &quot;C-arm 견적에 포함&quot;으로 표시)</span>
          <div className="seg">
            {[{ key: null, label: "없음" }, ...catalog.carm_tables].map((t) => (
              <button
                key={t.label}
                type="button"
                className={`seg-item ${items.carm_table === t.key ? "seg-item-on" : ""}`}
                onClick={() => setItems((it) => ({ ...it, carm_table: t.key }))}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <Check
          label="저감장치 페이지 넣기"
          sub="CARESON SELD X70"
          checked={!!items.carm_reducer}
          onChange={(on) => setItems((it) => ({ ...it, carm_reducer: on ? { price: dp("carm_reducer") } : null }))}
        />
        {items.carm_reducer && (
          <Field label="저감장치 제안가 (VAT 포함)">
            <MoneyInput
              value={items.carm_reducer.price}
              invalid={showErrors && !items.carm_reducer.price}
              onChange={(v) => setItems((it) => ({ ...it, carm_reducer: { price: v } }))}
            />
          </Field>
        )}
      </Panel>

      {/* ---------- MCT (모바일 CT) ---------- */}
      <Panel title="MCT" count={items.mct.length}>
        <ModelPriceSection
          models={catalog.mct.map((m) => ({ model: m.model, sub: `VATECH · ${m.sub}` }))}
          rows={items.mct}
          onRows={(rows) => setItems((it) => ({ ...it, mct: rows }))}
          showErrors={showErrors}
          defaultPrice={(m) => dp(`mct:${m}`)}
        />
      </Panel>

      {/* ---------- MAMMOGRAPHY ---------- */}
      <Panel title="MAMMOGRAPHY" count={items.mammo.length}>
        <BrandGroups
          models={catalog.mammo}
          rows={items.mammo}
          onRows={(rows) => setItems((it) => ({ ...it, mammo: rows }))}
          render={(_brand, models, rows, onRows) => (
            <ModelPriceSection models={models} rows={rows} onRows={onRows} showErrors={showErrors} defaultPrice={(m) => dp(`mammo:${m}`)} />
          )}
        />
      </Panel>

      {/* ---------- BMD ---------- */}
      <Panel title="BMD" count={items.bmd.length}>
        <ModelPriceSection
          models={catalog.bmd}
          rows={items.bmd}
          onRows={(rows) => setItems((it) => ({ ...it, bmd: rows }))}
          showErrors={showErrors}
          defaultPrice={(m) => dp(`bmd:${m}`)}
        />
      </Panel>

      {/* ---------- ULTRASOUND ---------- */}
      <Panel title="ULTRASOUND" count={usCount}>
        <p className="fg-muted text-ui-xs">브랜드마다 1페이지, 고른 모델 수(1~4개)만큼 칸이 나뉩니다.</p>
        {catalog.ultrasound.map((b) => {
          const line = items.ultrasound.find((u) => u.brand === b.brand);
          const setModels = (models: { model: string; price: number; probes: number }[]) =>
            setItems((it) => {
              const rest = it.ultrasound.filter((u) => u.brand !== b.brand);
              return { ...it, ultrasound: models.length ? [...rest, { brand: b.brand, models }] : rest };
            });
          return (
            <div key={b.brand} className="space-y-2">
              <div className="fg-strong text-ui font-semibold">{b.brand}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {b.models.map((m) => (
                  <Check
                    key={m}
                    label={m}
                    checked={!!line?.models.some((x) => x.model === m)}
                    onChange={(on) =>
                      setModels(
                        toggle(
                          line?.models || [],
                          on,
                          // Probe 개수 기본값: 마지막 저장값 → 없으면 2개(기존 제안서 기준)
                          () => ({ model: m, price: dp(`us:${b.brand}:${m}`), probes: catalog.defaults?.[`us:${b.brand}:${m}`]?.qty || 2 }),
                          (x) => x.model === m,
                        ),
                      )
                    }
                  />
                ))}
              </div>
              {line && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {line.models.map((m) => (
                    <div key={m.model} className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                      <Field label={`${m.model} 제안가`}>
                        <MoneyInput
                          value={m.price}
                          invalid={showErrors && !m.price}
                          onChange={(v) => setModels(line.models.map((x) => (x.model === m.model ? { ...x, price: v } : x)))}
                        />
                      </Field>
                      <Field label="Probe 개수">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          className="field w-full text-right"
                          value={m.probes}
                          onChange={(e) =>
                            setModels(
                              line.models.map((x) =>
                                x.model === m.model ? { ...x, probes: Math.max(1, Math.min(10, Number(e.target.value) || 1)) } : x,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Panel>

      {/* ---------- 기타장비: LIPUS · ESWT · 근전도 ---------- */}
      <Panel title="기타장비" count={items.lipus.length + items.eswt.length + items.emg.length}>
        <SubHead title="LIPUS (골융합치료기)" />
        <ModelPriceSection
          models={catalog.lipus.map((m) => ({ model: m.model, sub: m.brand }))}
          rows={items.lipus}
          onRows={(rows) => setItems((it) => ({ ...it, lipus: rows }))}
          showErrors={showErrors}
          defaultPrice={(m) => dp(`lipus:${m}`)}
        />
        <SubHead title="ESWT (체외충격파)" note="한 페이지에 4대까지 — 더 고르면 페이지가 나뉩니다." />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {catalog.eswt.map((m) => (
            <Check
              key={m.model}
              label={m.model}
              sub={`${m.brand} · ${m.type}`}
              checked={items.eswt.some((r) => r.model === m.model)}
              onChange={(on) =>
                setItems((it) => ({
                  ...it,
                  eswt: toggle(it.eswt, on, () => ({ model: m.model, price: dp(`eswt:${m.model}`) }), (r) => r.model === m.model),
                }))
              }
            />
          ))}
        </div>
        {items.eswt.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {items.eswt.map((r) => (
              <Field key={r.model} label={`${r.model} 제안가`}>
                <MoneyInput
                  value={r.price}
                  invalid={showErrors && !r.price}
                  onChange={(v) => setItems((it) => ({ ...it, eswt: it.eswt.map((x) => (x.model === r.model ? { ...x, price: v } : x)) }))}
                />
              </Field>
            ))}
          </div>
        )}
        <SubHead title="근전도" />
        <ModelPriceSection
          models={catalog.emg.map((m) => ({ model: m.model, sub: `${m.brand} · ${m.sub}` }))}
          rows={items.emg}
          onRows={(rows) => setItems((it) => ({ ...it, emg: rows }))}
          showErrors={showErrors}
          defaultPrice={(m) => dp(`emg:${m}`)}
        />
      </Panel>

      {/* ---------- 치료장비 ---------- */}
      <Panel title="치료장비" count={items.therapy.length}>
        <div className="flex flex-wrap items-center gap-2">
          <input className="field min-w-0 flex-1" placeholder="품명·제조사·모델 검색" value={rxQuery} onChange={(e) => setRxQuery(e.target.value)} />
          <Link href="/proposals/therapy-items" className="btn btn-default">
            품목 관리
          </Link>
        </div>
        {rxHidden.length > 0 && (
          <div className="rounded-control border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-ui-sm font-medium text-amber-800 dark:text-amber-200">
                사용 안 함 품목 {rxHidden.length}개가 이 제안서에 들어 있습니다
              </span>
              <button
                type="button"
                className="btn btn-default h-8 px-3 text-ui-xs"
                onClick={() => setItems((it) => ({ ...it, therapy: it.therapy.filter((l) => catalog.therapy.some((t) => t.id === l.item_id)) }))}
              >
                모두 빼기
              </button>
            </div>
            <ul className="space-y-1">
              {rxHidden.map((l) => {
                const s = (l.snapshot || {}) as { name?: string; maker?: string; model?: string };
                return (
                  <li key={l.item_id} className="flex items-center justify-between gap-2 text-ui-sm">
                    <span className="fg-strong min-w-0 truncate">{[s.name, s.maker, s.model].filter(Boolean).join(" · ") || `품목 #${l.item_id}`}</span>
                    <button
                      type="button"
                      className="btn btn-ghost h-7 shrink-0 px-2 text-ui-xs"
                      onClick={() => setItems((it) => ({ ...it, therapy: it.therapy.filter((x) => x.item_id !== l.item_id) }))}
                    >
                      빼기
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {rxShown.map((t) => {
            const line = items.therapy.find((l) => l.item_id === t.id);
            const setLine = (p: { unit_price?: number; qty?: number }) =>
              setItems((it) => ({ ...it, therapy: it.therapy.map((l) => (l.item_id === t.id ? { ...l, ...p } : l)) }));
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!line}
                    onChange={(e) =>
                      setItems((it) => ({
                        ...it,
                        therapy: e.target.checked
                          ? [...it.therapy, { item_id: t.id, unit_price: dp(`therapy:${t.id}`), qty: catalog.defaults?.[`therapy:${t.id}`]?.qty || 1 }]
                          : it.therapy.filter((l) => l.item_id !== t.id),
                      }))
                    }
                  />
                  <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-white">
                    {t.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${API}${t.image_url}`} alt="" className="max-h-10 max-w-14 object-contain" loading="lazy" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="fg-strong block text-ui font-medium">{t.name}</span>
                    <span className="fg-muted block text-ui-xs">{[t.maker, t.model].filter(Boolean).join(" · ") || "-"}</span>
                  </span>
                </label>
                {line && (
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <MoneyInput
                      className="flex-1 sm:w-36 sm:flex-none"
                      placeholder="단가"
                      value={line.unit_price}
                      invalid={showErrors && !line.unit_price}
                      onChange={(v) => setLine({ unit_price: v })}
                    />
                    <input
                      type="number"
                      min={1}
                      aria-label="수량"
                      className="field w-20 text-right"
                      value={line.qty}
                      onChange={(e) => setLine({ qty: Math.max(1, Number(e.target.value) || 1) })}
                    />
                    <span className="fg-muted text-ui-xs">개</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
