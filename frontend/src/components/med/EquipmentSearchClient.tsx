"use client";

import Link from "next/link";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EquipmentSearchItem,
  EquipmentSearchResult,
  ManufacturerRow,
  MedMeta,
  ModelRow,
  fetchEquipmentSearch,
  fetchManufacturers,
  fetchMedMeta,
  fetchMedSigungu,
  fetchModels,
} from "./api";
import { TermsFaq } from "./CatalogParts";
import { EmptyState, Pagination, Panel, StatTile, inputClass, selectClass } from "./ui";

const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID || "";
const DEFAULT_CENTER = { lat: 36.3, lng: 127.8 };

/** 한 번에 열어 두는 결과 상한. equipment가 209만 행이라 깊은 OFFSET은 계속 느려지므로,
 *  메디하루처럼 앞쪽 N개만 보여 주고 "조건을 좁히라"고 안내한다. */
const RESULT_CAP = 1000;
/** 지도에 찍는 핀 상한 — 서버 page_size 상한(100)과 같은 값이라 한 번에 받아온다. */
const MAP_PINS = 100;
/** 사양서 `업체 선택 (복수 가능 · 최대 20개)` */
const MAKER_MAX = 20;
const PAGE_SIZES = [20, 50];
/** 모델 팝업은 서버에서 검색하므로 한 번에 받는 후보 수만 제한한다. */
const MODEL_LIMIT = 200;

type Mode = "hospital" | "advanced";
type Match = "all" | "any";
type SortKey = "name" | "region";

/** 검색 조건 한 벌. draft(입력 중)와 applied(마지막 검색)를 같은 타입으로 들고 비교한다. */
type Cond = {
  mode: Mode;
  year: number;
  /** 병원명 검색 탭 입력 */
  hname: string;
  sido: string;
  sigungu: string;
  typeGroup: string;
  categories: string[];
  models: string[];
  manufacturers: string[];
  /** 고급 검색 탭의 병원명 */
  hospitalQ: string;
  match: Match;
};

const EMPTY: Cond = {
  mode: "hospital",
  year: 2025,
  hname: "",
  sido: "",
  sigungu: "",
  typeGroup: "",
  categories: [],
  models: [],
  manufacturers: [],
  hospitalQ: "",
  match: "all",
};

/** 조건 → 서버 파라미터. 탭마다 보내는 키가 다르다(병원명 탭은 병원명만 본다). */
function paramsOf(c: Cond) {
  if (c.mode === "hospital") return { year: c.year, hospital_q: c.hname.trim() };
  return {
    year: c.year,
    sido: c.sido,
    sigungu: c.sigungu,
    type_group: c.typeGroup,
    categories: c.categories,
    models: c.models,
    manufacturers: c.manufacturers,
    match: c.match,
    hospital_q: c.hospitalQ.trim(),
  };
}

function validate(c: Cond): string {
  if (c.mode === "hospital") return c.hname.trim().length >= 2 ? "" : "2글자 이상 입력해주세요";
  const any =
    c.categories.length || c.models.length || c.manufacturers.length || c.hospitalQ.trim() || c.sido;
  return any ? "" : "지역·장비 분류·모델·업체·병원명 중 하나 이상을 선택해 주세요";
}

export default function EquipmentSearchClient() {
  const [meta, setMeta] = useState<MedMeta | null>(null);
  const [sigunguList, setSigunguList] = useState<string[]>([]);

  // 분류·모델 상세의 `…보유 의료기관 검색` CTA로 들어오면 고급 검색을 미리 채운 채로 시작한다.
  // 서버·클라이언트 첫 렌더가 같은 값을 보도록 useSearchParams를 쓴다(window.location은 어긋난다).
  const search = useSearchParams();
  const deepLink = useMemo<Cond | null>(() => {
    if (search.get("mode") !== "advanced") return null;
    const eq = search.get("eq");
    if (!eq) return null;
    const model = search.get("model");
    return { ...EMPTY, mode: "advanced", categories: [eq], models: model ? [model] : [] };
  }, [search]);

  // 입력 중인 값(draft)과 마지막 검색에 쓰인 값(applied)을 나눈다.
  // 메디하루의 핵심 규칙: 조건을 바꿔도 결과는 그대로이고 '검색하기'를 눌러야 갱신된다.
  const [draft, setDraft] = useState<Cond>(() => deepLink ?? EMPTY);
  const [applied, setApplied] = useState<Cond | null>(() => deepLink);

  // 결과 영역 컨트롤 — 조건이 아니라 '마지막 검색 결과를 보는 방식'이라 즉시 반영한다.
  const [sort, setSort] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [view, setView] = useState<"list" | "map">("list");

  const [page, setPage] = useState(1);
  const [result, setResult] = useState<EquipmentSearchResult | null>(null);
  const [mapData, setMapData] = useState<EquipmentSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  // 팝업 후보 목록
  const [makerRows, setMakerRows] = useState<ManufacturerRow[] | null>(null);
  const [makerLoading, setMakerLoading] = useState(false);
  const [modelRows, setModelRows] = useState<ModelRow[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [catQ, setCatQ] = useState("");
  const [modelQ, setModelQ] = useState("");
  const [makerQ, setMakerQ] = useState("");

  useEffect(() => {
    fetchMedMeta()
      .then((m) => {
        setMeta(m);
        if (m.years.length) setDraft((d) => ({ ...d, year: m.years[0] }));
      })
      .catch(() => setError("필터 정보를 불러오지 못했습니다. 선택 조건은 유지됩니다."));
  }, []);


  useEffect(() => {
    if (!deepLink) return;
    let alive = true;
    fetchEquipmentSearch({
      ...paramsOf(deepLink),
      sort: "name",
      order: "asc",
      page: 1,
      page_size: PAGE_SIZES[0],
    })
      .then((r) => alive && setResult(r))
      .catch(
        () =>
          alive &&
          setError("검색 결과를 불러오지 못했습니다. 조건은 유지됩니다. 잠시 후 다시 시도해 주세요.")
      );
    return () => {
      alive = false;
    };
  }, [deepLink]);

  useEffect(() => {
    if (!draft.sido) return;
    fetchMedSigungu(draft.sido).then(setSigunguList).catch(() => setSigunguList([]));
  }, [draft.sido]);

  // 모델 후보는 서버에서 찾는다(분류 안에서도 수천 종이라 클라이언트 필터로는 부족하다).
  useEffect(() => {
    // 분류가 없으면 모델 팝업 자체가 비활성이라 후보를 받지 않는다 (비우는 일은 핸들러가 한다)
    if (!draft.categories.length) return;
    let alive = true;
    const t = setTimeout(() => {
      fetchModels({
        categories: draft.categories,
        manufacturers: draft.manufacturers,
        year: draft.year,
        q: modelQ.trim(),
        limit: MODEL_LIMIT,
      })
        .then((r) => alive && setModelRows(r))
        .catch(() => alive && setModelRows([]))
        .finally(() => alive && setModelLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [draft.categories, draft.manufacturers, draft.year, modelQ]);

  const loadMakers = useCallback(() => {
    if (makerRows !== null || makerLoading) return;
    setMakerLoading(true);
    fetchManufacturers({ categories: draft.categories, year: draft.year })
      .then(setMakerRows)
      .catch(() => setMakerRows([]))
      .finally(() => setMakerLoading(false));
  }, [makerRows, makerLoading, draft.categories, draft.year]);

  const runSearch = useCallback(
    (cond: Cond, nextPage: number, key: SortKey, up: boolean, size: number) => {
      setLoading(true);
      setError("");
      fetchEquipmentSearch({
        ...paramsOf(cond),
        sort: key,
        order: up ? "asc" : "desc",
        page: nextPage,
        page_size: size,
      })
        .then(setResult)
        .catch(() => {
          setError("검색 결과를 불러오지 못했습니다. 조건은 유지됩니다. 잠시 후 다시 시도해 주세요.");
          setResult(null);
        })
        .finally(() => setLoading(false));
    },
    []
  );

  function submit() {
    const msg = validate(draft);
    setFormError(msg);
    if (msg) return;
    setApplied(draft);
    setPage(1);
    setExpanded(null);
    setMapData(null);
    runSearch(draft, 1, sort, asc, pageSize);
  }

  function goPage(p: number) {
    if (!applied) return;
    setPage(p);
    setExpanded(null);
    runSearch(applied, p, sort, asc, pageSize);
  }

  /** 정렬·표시 개수는 조건이 아니므로 마지막 검색 기준 그대로 다시 불러온다. */
  function changeView(next: { sort?: SortKey; asc?: boolean; size?: number }) {
    const key = next.sort ?? sort;
    const up = next.asc ?? asc;
    const size = next.size ?? pageSize;
    setSort(key);
    setAsc(up);
    setPageSize(size);
    if (!applied) return;
    setPage(1);
    setExpanded(null);
    runSearch(applied, 1, key, up, size);
  }

  // 지도 뷰는 앞의 100개만 따로 받아 핀으로 찍는다 (목록 페이지와 독립).
  useEffect(() => {
    if (view !== "map" || !applied) return;
    let alive = true;
    fetchEquipmentSearch({ ...paramsOf(applied), sort, order: asc ? "asc" : "desc", page: 1, page_size: MAP_PINS })
      .then((r) => alive && setMapData(r))
      .catch(() => alive && setMapData(null));
    return () => {
      alive = false;
    };
  }, [view, applied, sort, asc]);

  function reset() {
    setDraft({ ...EMPTY, mode: draft.mode, year: draft.year });
    setSigunguList([]);
    setMakerRows(null);
    setModelRows([]);
    setFormError("");
  }

  function pickTab(mode: Mode) {
    setDraft((d) => ({ ...d, mode }));
    setFormError("");
  }

  const dirty = applied !== null && JSON.stringify(draft) !== JSON.stringify(applied);
  const years = meta?.years?.length ? meta.years : [draft.year];

  const catOptions = useMemo(
    () =>
      (meta?.categories || []).map((c) => ({
        value: c.value,
        label: c.label,
        sub: `${c.rows.toLocaleString()}건`,
      })),
    [meta]
  );
  const catFiltered = useMemo(() => filterBy(catOptions, catQ), [catOptions, catQ]);
  const makerOptions = useMemo(
    () =>
      (makerRows || []).map((m) => ({
        value: m.manufacturer,
        label: m.manufacturer,
        sub: `${m.hospitals.toLocaleString()}곳`,
      })),
    [makerRows]
  );
  const makerFiltered = useMemo(() => filterBy(makerOptions, makerQ), [makerOptions, makerQ]);
  const modelOptions = useMemo(() => {
    // 서버가 (모델, 제조사, 분류) 조합으로 내려주므로 모델명 단위로 접는다
    const seen = new Map<string, { value: string; label: string; sub: string }>();
    for (const r of modelRows) {
      if (!r.model || seen.has(r.model)) continue;
      seen.set(r.model, {
        value: r.model,
        label: r.model,
        sub: [r.manufacturer, `${r.hospitals.toLocaleString()}곳`].filter(Boolean).join(" · "),
      });
    }
    // 고른 모델이 검색어 때문에 목록에서 사라지면 해제할 방법이 없어진다
    for (const m of draft.models) if (!seen.has(m)) seen.set(m, { value: m, label: m, sub: "선택함" });
    return [...seen.values()];
  }, [modelRows, draft.models]);

  const capped = result ? Math.min(result.total, RESULT_CAP) : 0;
  const mapItems = (mapData?.items || []).filter((h) => h.lat != null && h.lng != null);

  return (
    <div className="space-y-6">
      <Panel
        title="의료기관 장비 검색"
        desc={`병원명 또는 장비·모델명으로 전국 의료기관의 장비 현황을 검색하세요 · 데이터 기준: ${draft.year}년`}
        right={
          <select
            value={draft.year}
            onChange={(e) => {
              setMakerRows(null); // 연도가 바뀌면 업체 후보도 달라진다
              setDraft((d) => ({ ...d, year: Number(e.target.value) }));
            }}
            className={selectClass}
            aria-label="기준 연도"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년 기준
              </option>
            ))}
          </select>
        }
      >
        {/* (1) 검색 탭 — 병원명 검색이 기본 */}
        <div className="seg" role="tablist" aria-label="검색 방식">
          {([
            ["hospital", "병원명 검색"],
            ["advanced", "고급 검색"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={draft.mode === v}
              onClick={() => pickTab(v)}
              className={`seg-item ${draft.mode === v ? "seg-item-on" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {draft.mode === "hospital" ? (
          /* (2) 병원명 검색 탭 */
          <form
            className="mt-4 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={draft.hname}
              onChange={(e) => setDraft((d) => ({ ...d, hname: e.target.value }))}
              placeholder="병원명을 입력하세요 (예: 서울대학교병원)"
              autoComplete="off"
              className={`${inputClass} w-full sm:w-96`}
              aria-label="병원명"
            />
            <button type="submit" className="btn btn-primary px-4">
              검색하기
            </button>
          </form>
        ) : (
          /* (3) 고급 검색 탭 — 2단계 스텝 */
          <div className="mt-4 space-y-4">
            <StepBox step={1} title="지역 및 종별">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="지역 (시도)">
                  <select
                    value={draft.sido}
                    onChange={(e) => {
                      // 시도를 바꾸면 하위 시군구 선택은 무효다
                      setSigunguList([]);
                      setDraft((d) => ({ ...d, sido: e.target.value, sigungu: "" }));
                    }}
                    className={`${selectClass} w-full`}
                  >
                    <option value="">전체</option>
                    {(meta?.sidos || []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="시군구">
                  <select
                    value={draft.sigungu}
                    onChange={(e) => setDraft((d) => ({ ...d, sigungu: e.target.value }))}
                    disabled={!draft.sido}
                    className={`${selectClass} w-full disabled:opacity-40`}
                  >
                    <option value="">전체</option>
                    {sigunguList.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="의료기관 종별">
                  <select
                    value={draft.typeGroup}
                    onChange={(e) => setDraft((d) => ({ ...d, typeGroup: e.target.value }))}
                    className={`${selectClass} w-full`}
                  >
                    <option value="">전체</option>
                    {(meta?.type_groups || []).map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </StepBox>

            <StepBox step={2} title="장비 및 병원">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="장비 분류">
                  <MultiPicker
                    buttonLabel="장비 선택 (복수 가능)"
                    placeholder="장비명 검색..."
                    topLabel="자주 선택된 항목"
                    query={catQ}
                    onQueryChange={setCatQ}
                    options={catFiltered}
                    selected={draft.categories}
                    onToggle={(v) => {
                      // 분류가 바뀌면 업체·모델 후보 목록도 다시 받아야 한다
                      setMakerRows(null);
                      setModelRows([]);
                      setModelLoading(true);
                      setDraft((d) => ({
                        ...d,
                        categories: toggle(d.categories, v),
                        // 분류가 바뀌면 그 분류 밖의 모델 선택은 의미가 없다
                        models: [],
                      }));
                    }}
                    onClear={() => {
                      setMakerRows(null);
                      setModelRows([]);
                      setDraft((d) => ({ ...d, categories: [], models: [] }));
                    }}
                    emptyText="일치하는 분류가 없습니다."
                  />
                </Field>
                <Field label="모델">
                  <MultiPicker
                    buttonLabel="모델 선택 (복수 가능)"
                    placeholder="모델명 검색..."
                    query={modelQ}
                    onQueryChange={(v) => {
                      setModelQ(v);
                      setModelLoading(true);
                    }}
                    options={modelOptions}
                    selected={draft.models}
                    onToggle={(v) => setDraft((d) => ({ ...d, models: toggle(d.models, v) }))}
                    onClear={() => setDraft((d) => ({ ...d, models: [] }))}
                    disabled={!draft.categories.length}
                    disabledHint="장비 분류 선택 후 사용"
                    loading={modelLoading}
                    emptyText="일치하는 모델이 없습니다."
                  />
                </Field>
                <Field label="업체 필터">
                  <MultiPicker
                    buttonLabel={`업체 선택 (복수 가능 · 최대 ${MAKER_MAX}개)`}
                    placeholder="제조·수입사명 검색"
                    query={makerQ}
                    onQueryChange={setMakerQ}
                    options={makerFiltered}
                    selected={draft.manufacturers}
                    onToggle={(v) => setDraft((d) => ({ ...d, manufacturers: toggle(d.manufacturers, v) }))}
                    onClear={() => setDraft((d) => ({ ...d, manufacturers: [] }))}
                    onOpen={loadMakers}
                    loading={makerLoading}
                    max={MAKER_MAX}
                    clearLabel="업체 선택 해제"
                    emptyText="일치하는 업체가 없습니다."
                    note="선택한 업체 중 하나라도 연결된 장비를 검색합니다."
                  />
                </Field>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="병원명">
                  <input
                    value={draft.hospitalQ}
                    onChange={(e) => setDraft((d) => ({ ...d, hospitalQ: e.target.value }))}
                    placeholder="병원명 입력"
                    autoComplete="off"
                    className={`${inputClass} w-56`}
                  />
                </Field>
                <Field label="결합 조건">
                  <div className="seg" role="group" aria-label="결합 조건">
                    {([
                      ["all", "모두 포함"],
                      ["any", "하나라도"],
                    ] as const).map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setDraft((d) => ({ ...d, match: v }))}
                        className={`seg-item ${draft.match === v ? "seg-item-on" : ""}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={reset} className="btn btn-default">
                    초기화
                  </button>
                  <button onClick={submit} className="btn btn-primary px-4">
                    검색하기
                  </button>
                </div>
              </div>
            </StepBox>
          </div>
        )}

        {formError && <p className="mt-3 text-ui-sm text-error-500">{formError}</p>}
        {/* (4) 조건을 바꿔도 결과는 마지막 검색 기준 — 버튼을 눌러야 갱신된다 */}
        {dirty && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control border border-warning-200 bg-warning-50 px-3 py-2 dark:border-warning-500/30 dark:bg-warning-500/10">
            <span className="text-ui-sm text-warning-700 dark:text-warning-300">
              조건이 변경되었습니다. 아래 결과는 마지막 검색 기준입니다.
            </span>
            <button onClick={submit} className="btn btn-default ml-auto">
              변경한 조건으로 검색
            </button>
          </div>
        )}
      </Panel>

      {/* (5) 검색 결과 */}
      <Panel
        title="검색 결과"
        desc={applied ? "기관명을 누르면 상세 화면으로, 행을 누르면 보유 장비 전체가 펼쳐집니다." : "조건을 선택하고 검색하기를 누르세요."}
        right={
          <div className="seg" role="group" aria-label="결과 보기 방식">
            {([
              ["list", "목록"],
              ["map", "지도"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`seg-item ${view === v ? "seg-item-on" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {result && (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="검색된 기관" value={result.total} sub="곳" />
            <StatTile label="조건 일치 장비" value={result.total_units} sub="대" />
          </div>
        )}

        {result && result.total > RESULT_CAP && (
          <p className="mb-3 rounded-control surface-sub px-3 py-2 text-ui-sm fg-muted">
            조건에 맞는 병원 {result.total.toLocaleString()}개 중, 한 번에 표시할 수 있는{" "}
            {RESULT_CAP.toLocaleString()}개를 보여 드립니다. 지역·장비·모델 조건을 좁히면 나머지도 확인할 수
            있어요.
          </p>
        )}

        {applied && result && result.items.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={sort}
              onChange={(e) => changeView({ sort: e.target.value as SortKey })}
              className={selectClass}
              aria-label="정렬"
            >
              <option value="name">이름순</option>
              <option value="region">지역순</option>
            </select>
            <button onClick={() => changeView({ asc: !asc })} className="btn btn-default">
              {asc ? "오름차순" : "내림차순"}
            </button>
            <span className="fg-muted ml-2 text-ui-sm">페이지당 표시 개수</span>
            <div className="seg" role="group" aria-label="페이지당 표시 개수">
              {PAGE_SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => changeView({ size: n })}
                  className={`seg-item ${pageSize === n ? "seg-item-on" : ""}`}
                >
                  {n}개 보기
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="mb-3 text-ui-sm text-error-500">{error}</p>}
        {loading && <EmptyState message="검색 중..." />}
        {!loading && !applied && <EmptyState message="검색 조건을 입력해 주세요." />}
        {!loading && applied && result && result.items.length === 0 && (
          <div className="py-8 text-center">
            <p className="fg-muted text-ui">검색 결과가 없습니다</p>
            <p className="fg-subtle mt-1 text-ui-sm">다른 조건으로 다시 검색해보세요.</p>
            <p className="fg-subtle mt-1 text-ui-xs">
              등록된 의료기관이 없거나 장비 데이터가 없는 병원일 수 있습니다
            </p>
          </div>
        )}

        {!loading && result && result.items.length > 0 && view === "list" && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-gray-500 dark:text-gray-400">
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="py-2 text-left font-medium">병원명</th>
                    <th className="py-2 text-left font-medium">지역</th>
                    <th className="py-2 text-left font-medium">요양종별</th>
                    <th className="py-2 text-left font-medium">장비</th>
                    <th className="py-2 text-right font-medium">수량</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((h) => (
                    <HospitalRowView
                      key={h.hospital_id}
                      item={h}
                      year={applied?.year ?? draft.year}
                      open={expanded === h.hospital_id}
                      onToggle={() => setExpanded(expanded === h.hospital_id ? null : h.hospital_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={capped} onChange={goPage} />
          </>
        )}

        {!loading && result && result.items.length > 0 && view === "map" && (
          <>
            {result.total > mapItems.length && (
              <p className="mb-3 rounded-control surface-sub px-3 py-2 text-ui-sm fg-muted">
                결과가 많아 지도에는 가장 앞의 {MAP_PINS}개 병원만 표시됩니다. 필터를 좁히면 더 정확한 위치를
                확인할 수 있어요.
              </p>
            )}
            {mapData ? (
              <ResultMap items={mapItems} />
            ) : (
              <EmptyState message="장비 현황 불러오는 중…" />
            )}
            <p className="fg-subtle mt-2 text-ui-xs">
              핀을 클릭하면 병원 이름, 주소, 장비 정보를 확인할 수 있어요
            </p>
          </>
        )}
      </Panel>

      <CheckBeforeSearch year={applied?.year ?? draft.year} />
      <BrowseCards />
      <EquipmentTermsFaq year={applied?.year ?? draft.year} />
    </div>
  );
}

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function filterBy<T extends { value: string; label: string }>(options: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return options;
  return options.filter(
    (o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)
  );
}

/** 고급 검색의 한 단계. 사양서 헤더 문구 `Step 1 · 지역 및 종별` 형식을 그대로 쓴다. */
function StepBox({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-control border border-gray-200 p-3 dark:border-gray-800">
      <h4 className="label-eyebrow mb-3">
        Step {step} · {title}
      </h4>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="fg-muted mb-1 block text-ui-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

/**
 * 복수 선택 팝업 — 버튼을 누르면 내부 검색창이 있는 드롭다운이 열린다.
 * 후보가 분류 195종·모델 수천 종·업체 3천 곳이라 <select multiple>로는 고를 수 없다.
 * 검색어(query)는 부모가 들고 있다 — 분류·업체는 부모가 클라이언트에서 거르고,
 * 모델은 부모가 서버에 다시 물어보기 때문이다.
 */
function MultiPicker({
  buttonLabel,
  placeholder,
  options,
  selected,
  onToggle,
  onClear,
  query,
  onQueryChange,
  onOpen,
  disabled = false,
  disabledHint,
  loading = false,
  emptyText,
  topLabel,
  clearLabel = "전체 해제",
  note,
  max,
}: {
  buttonLabel: string;
  placeholder: string;
  options: { value: string; label: string; sub?: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
  query: string;
  onQueryChange: (v: string) => void;
  onOpen?: () => void;
  disabled?: boolean;
  disabledHint?: string;
  loading?: boolean;
  emptyText: string;
  topLabel?: string;
  clearLabel?: string;
  note?: string;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const full = max !== undefined && selected.length >= max;
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen?.();
        }}
        className={`${selectClass} flex w-full items-center justify-between gap-2 text-left disabled:opacity-40`}
      >
        <span className={`truncate ${selected.length ? "" : "fg-muted"}`}>
          {disabled && disabledHint
            ? disabledHint
            : selected.length === 0
              ? buttonLabel
              : selected.length === 1
                ? labelOf(selected[0])
                : `${labelOf(selected[0])} 외 ${selected.length - 1}개`}
        </span>
        <span className="fg-subtle shrink-0 text-ui-xs">▾</span>
      </button>

      {open && (
        <div className="surface-card absolute left-0 top-10 z-30 w-[19rem] p-2 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className={`${inputClass} w-full`}
          />
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="label-eyebrow">
              {query.trim() ? `${options.length.toLocaleString()}건` : topLabel || `${options.length.toLocaleString()}건`}
            </span>
            {selected.length > 0 && (
              <button type="button" onClick={onClear} className="fg-muted text-ui-xs hover:underline">
                {clearLabel}
              </button>
            )}
          </div>
          <div className="custom-scrollbar mt-1 max-h-64 overflow-y-auto">
            {loading && <EmptyState message="불러오는 중…" />}
            {!loading && options.length === 0 && <EmptyState message={emptyText} />}
            {!loading &&
              options.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    disabled={!on && full}
                    onClick={() => onToggle(o.value)}
                    className={`list-row disabled:opacity-40 ${on ? "bg-gray-100 dark:bg-white/[0.06]" : ""}`}
                  >
                    <span className="fg-subtle shrink-0 text-ui-xs">{on ? "☑" : "☐"}</span>
                    <span className="fg-base min-w-0 flex-1 truncate text-ui" title={o.label}>
                      {o.label}
                    </span>
                    {o.sub && <span className="fg-subtle shrink-0 text-ui-xs tabular-nums">{o.sub}</span>}
                  </button>
                );
              })}
          </div>
          {full && <p className="fg-subtle mt-1 px-1 text-ui-xs">최대 {max}개까지 선택할 수 있습니다.</p>}
          {note && <p className="fg-subtle mt-1 px-1 text-ui-xs">{note}</p>}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              className="chip-quiet max-w-full"
              title={`${labelOf(v)} 삭제`}
            >
              <span className="truncate">{labelOf(v)}</span>
              <span className="fg-subtle">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HospitalRowView({
  item,
  year,
  open,
  onToggle,
}: {
  item: EquipmentSearchItem;
  year: number;
  open: boolean;
  onToggle: () => void;
}) {
  const matched = item.matched_equipment.slice(0, 3);
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-gray-100 align-top hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
      >
        <td className="py-2.5 pr-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {/* 행 클릭은 펼치기라서 기관 상세로 가는 링크는 전파를 막는다 */}
            <Link
              href={`/med/hospitals/${item.hospital_id}`}
              onClick={(e) => e.stopPropagation()}
              className="truncate font-medium text-gray-800 hover:underline dark:text-gray-100"
            >
              {item.name}
            </Link>
            {item.is_member && (
              <span className="shrink-0 rounded bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">
                회원
              </span>
            )}
          </div>
          {item.address && (
            <div className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">{item.address}</div>
          )}
        </td>
        <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">
          {item.sido} {item.sigungu}
        </td>
        <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">{item.type || "-"}</td>
        <td className="py-2.5 pr-3">
          <div className="flex flex-wrap gap-1">
            {matched.map((e, i) => (
              <span
                key={i}
                className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
              >
                {e.label} {e.model}
              </span>
            ))}
            {item.matched_equipment.length > matched.length && (
              <span className="text-[11px] text-gray-400">+{item.matched_equipment.length - matched.length}</span>
            )}
          </div>
        </td>
        <td className="py-2.5 text-right font-semibold tabular-nums text-gray-800 dark:text-gray-100">
          {item.matched_units.toLocaleString()}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 dark:border-gray-800">
          <td colSpan={5} className="bg-gray-50 px-3 py-3 dark:bg-white/[0.03]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                {year}년 보유 장비 전체 ({item.equipment.length}건)
              </span>
              <button onClick={onToggle} className="fg-muted text-ui-xs hover:underline">
                접기
              </button>
            </div>
            <div className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-x-6 text-ui-xs">
              <span className="label-eyebrow">장비명</span>
              <span className="label-eyebrow">모델명</span>
              <span className="label-eyebrow text-right">수량</span>
            </div>
            <div className="grid grid-cols-1 gap-y-1">
              {item.equipment.map((e, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-x-6 text-xs">
                  <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">{e.label}</span>
                  <span className="min-w-0 truncate text-gray-500 dark:text-gray-400">
                    {[e.manufacturer, e.model].filter(Boolean).join(" ") || "-"}
                  </span>
                  <span className="tabular-nums text-right text-gray-500 dark:text-gray-400">{e.count}대</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** 결과 지도 — sales-map/DistributionClient와 같은 방식으로 네이버 지도 SDK를 올린다. */
function ResultMap({ items }: { items: EquipmentSearchItem[] }) {
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && !!window.naver?.maps
  );
  const [scriptError, setScriptError] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);
  // 네이버 지도 SDK는 공식 타입이 없어 이 컴포넌트가 실제로 호출하는 메서드만 선언한다
  const mapRef = useRef<{ fitBounds: (b: unknown) => void } | null>(null);
  const overlaysRef = useRef<{ setMap: (m: unknown) => void }[]>([]);

  useEffect(() => {
    if (!scriptLoaded || mapRef.current || !divRef.current) return;
    const naver = window.naver;
    if (!naver?.maps) return;
    mapRef.current = new naver.maps.Map(divRef.current, {
      center: new naver.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      zoom: 7,
      zoomControl: true,
      zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT },
    });
  }, [scriptLoaded]);

  useEffect(() => {
    const naver = window.naver;
    if (!scriptLoaded || !naver?.maps || !mapRef.current) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    if (!items.length) return;

    const info = new naver.maps.InfoWindow({ borderWidth: 0, backgroundColor: "transparent" });
    const bounds = new naver.maps.LatLngBounds();
    items.forEach((h) => {
      const pos = new naver.maps.LatLng(h.lat as number, h.lng as number);
      bounds.extend(pos);
      const marker = new naver.maps.Marker({ map: mapRef.current, position: pos, title: h.name });
      const eqs = h.matched_equipment
        .slice(0, 5)
        .map((e) => `${escapeHtml(e.label)} ${escapeHtml(e.model || "")} ${e.count}대`)
        .join("<br/>");
      naver.maps.Event.addListener(marker, "click", () => {
        info.setContent(
          `<div style="max-width:240px;padding:8px 10px;border-radius:8px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);font:400 12px/1.5 Outfit,sans-serif;color:#101828">
             <div style="font-weight:700">${escapeHtml(h.name)}</div>
             <div style="color:#667085">${escapeHtml(h.address || `${h.sido || ""} ${h.sigungu || ""}`)}</div>
             <div style="margin-top:4px">${eqs || "일치 장비 없음"}</div>
           </div>`
        );
        info.open(mapRef.current, marker);
      });
      overlaysRef.current.push(marker);
    });
    mapRef.current.fitBounds(bounds);
  }, [items, scriptLoaded]);

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_CLIENT_ID}`}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setScriptError(true)}
      />
      <div ref={divRef} className="h-[460px] w-full rounded-xl bg-gray-100 dark:bg-gray-800" />
      {scriptError && (
        <p className="mt-2 text-ui-sm text-error-500">지도를 불러오지 못했습니다. 목록으로 확인해 주세요.</p>
      )}
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** 검색 전 꼭 확인해 주세요 — 심평원 등록 데이터의 성격을 먼저 알리는 안내 박스. */
function CheckBeforeSearch({ year }: { year: number }) {
  return (
    <Panel title="검색 전 꼭 확인해 주세요">
      <ul className="fg-muted list-disc space-y-1.5 pl-5 text-ui-sm">
        <li>
          건강보험심사평가원 {year}년 기준 데이터상 <b className="fg-base">사용 등록 완료된 장비만</b> 표시됩니다.
        </li>
        <li>
          본 검색은 <b className="fg-base">구매·보유 여부와 무관</b>하며, &lsquo;사용 등록 여부&rsquo;를 기준으로
          합니다.
        </li>
        <li>
          모델명은 의료장비 허가증 기재 형태로 표시되며,{" "}
          <b className="fg-base">실제 통용 명칭과 다를 수 있습니다.</b>
        </li>
      </ul>
    </Panel>
  );
}

/** 의료장비 둘러보기 — 검색어가 떠오르지 않을 때 분류·모델·제조사로 들어가는 입구.
 *  메디하루 /equipment 하단의 '의료장비 둘러보기' 카드와 같은 역할이라, 이 두 페이지를
 *  사이드바 메뉴로 따로 빼지 않고 여기서만 연결한다. */
function BrowseCards() {
  const cards = [
    {
      href: "/med/equipment/categories",
      title: "의료장비 분류로 찾기",
      desc: "초음파·엑스선·골밀도 등 장비 분류별로 보유 기관과 대표 모델을 봅니다.",
    },
    {
      href: "/med/equipment/models",
      title: "모델명으로 찾기",
      desc: "분류를 거치지 않고 모델명에서 바로 보유 의료기관 현황으로 들어갑니다.",
    },
    {
      href: "/med/equipment/manufacturers",
      title: "제조·수입사로 찾기",
      desc: "업체별로 어떤 분류의 장비가 어디에 얼마나 들어가 있는지 봅니다.",
    },
  ];
  return (
    <Panel title="의료장비 둘러보기" desc="찾을 조건이 분명하지 않을 때는 분류·모델·제조사부터 들어가세요.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group rounded-control border border-gray-200 p-4 transition hover:border-brand-500 hover:bg-brand-500/[0.03] dark:border-gray-800 dark:hover:border-brand-400"
          >
            <div className="text-ui-sm font-semibold text-gray-800 group-hover:text-brand-600 dark:text-gray-100 dark:group-hover:text-brand-400">
              {c.title}
            </div>
            <p className="mt-1 text-ui-xs text-gray-500 dark:text-gray-400">{c.desc}</p>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

/** 하단 설명·용어·FAQ — 메디하루 2-9. 문구는 우리 데이터(연도 스냅샷, 자체 임포트)에 맞춰 적는다. */
function EquipmentTermsFaq({ year }: { year: number }) {
  return (
    <TermsFaq
      intro="장비 검색은 전국 의료기관의 장비 보유 현황을 공공데이터 기반으로 정리해, 병원·의원명·장비명·모델명·지역으로 조회할 수 있게 한 기능입니다. 초음파·CT·MRI 등 특정 장비나 모델을 어떤 지역의 어떤 기관이 보유했는지 검색하고, 기관별 장비 구성과 위치를 함께 확인·비교할 수 있습니다."
      method={`검색 결과는 건강보험심사평가원의 의료장비 등록 데이터를 바탕으로 합니다. 연도별 스냅샷 가운데 기본값은 가장 최근인 ${year}년 기준이며, 의료기관은 기관명과 지역명으로 찾고 장비·모델은 장비 분류·모델명·제조·수입사로 매칭합니다. 결과 행의 장비 목록은 검색 조건에 맞은 항목부터 일부만 보여 주고 나머지는 '상세 정보 보기'로 펼칩니다. 제조·수입사 표기는 레거시 6개 분류(초음파·일반엑스선·C-Arm·MRI·골밀도·CT)에서는 시장 브랜드를, 나머지 분류에서는 허가 자료의 제조원을 씁니다.`}
      terms={[
        {
          term: "의료장비 등록",
          desc: "의료기관이 건강보험심사평가원에 장비를 등록한 기록입니다. 등록 시점을 기준으로 하므로 실제 설치·가동 시점과는 차이가 있을 수 있습니다.",
        },
        {
          term: "연도별 스냅샷",
          desc: "매년 특정 시점의 데이터를 고정 저장한 판본입니다. 2019~2022 스냅샷에는 레거시 6개 분류만 적재돼 있어 그 밖의 분류는 2023년 이후에만 나옵니다.",
        },
        {
          term: "모델명(신고 표기)",
          desc: "검색에 쓰이는 모델명은 의료장비 허가증 기재 형태를 따르므로 시중 통용 명칭과 다를 수 있습니다.",
        },
        {
          term: "연결 신뢰도",
          desc: "모델과 제조·수입사의 연결이 어떤 근거로 붙었는지를 확인 · 유력 · 미확인 3단계로 표시합니다. 개별 의료기관의 계약·공급 경로를 뜻하지 않습니다.",
        },
      ]}
      faqs={[
        {
          q: "검색되지 않는 병원이 있는 이유는 무엇인가요?",
          a: "검색은 건강보험심사평가원의 장비 등록 데이터를 기반으로 하므로, 장비를 등록한 기관만 결과에 나타납니다. 장비를 등록하지 않은 기관은 실제 운영 중이더라도 검색에 표시되지 않습니다.",
        },
        {
          q: "결과 목록에 장비가 일부만 보입니다.",
          a: "행에는 조건에 맞은 장비부터 몇 줄만 먼저 보여 줍니다. 행의 '상세 정보 보기'를 누르면 그 기관의 전체 목록을 볼 수 있습니다.",
        },
        {
          q: "모델명이 실제 제품명과 다르게 보입니다.",
          a: "모델명은 허가증에 기재된 형태를 따르므로 시중에서 통용되는 이름과 다를 수 있습니다. 같은 제품이 표기만 다르게 여러 건 등록돼 있을 수도 있습니다.",
        },
        {
          q: "'개설 현황'은 이 화면과 같은 데이터인가요?",
          a: "아니요. 개설 현황은 행정안전부 인허가(개설·등록) 정보를 따로 적재한 별도 화면이고, 기관·장비·모델 검색은 건강보험심사평가원 장비 데이터를 기준으로 합니다.",
        },
      ]}
    />
  );
}
