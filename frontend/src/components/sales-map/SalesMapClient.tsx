"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEquipmentCatalog, fetchHospitalDetail, fetchHospitals, fetchSidoList, fetchSigunguList } from "./api";
import HospitalDetailPanel from "./HospitalDetailPanel";
import HospitalListPanel from "./HospitalListPanel";
import { makeMarkerSvg } from "./markerIcon";
import { CATEGORY_LABEL, EquipmentCategory, HospitalDetail, HospitalListItem } from "./types";

const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID || "";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";
const CATS: EquipmentCategory[] = ["us", "xray", "ct", "mri", "bmd", "carm"];
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const MARKER_ANCHOR_RATIO = { x: 12 / 24, y: 30 / 30 }; // 핀 뾰족한 끝(하단 중앙) 기준

export default function SalesMapClient() {
  // 다른 페이지에 갔다가 돌아와 컴포넌트가 재마운트될 때, 네이버지도 스크립트는 이미 로드되어
  // 있는데(window.naver 전역 객체 유지) Script의 onLoad가 다시 호출되지 않아 지도가 영영 안 뜨는 문제 방지
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && !!window.naver?.maps
  );
  const [scriptError, setScriptError] = useState(false);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const selectedMarkerRef = useRef<any>(null);
  const suppressIdleRef = useRef(false);

  const [category, setCategory] = useState<EquipmentCategory>("us");
  const [sidoList, setSidoList] = useState<string[]>([]);
  const [sido, setSido] = useState("");
  const [sigunguList, setSigunguList] = useState<string[]>([]);
  const [sigungu, setSigungu] = useState("");
  const [catalogRows, setCatalogRows] = useState<{ manufacturer: string | null; model: string | null }[]>([]);
  const [makerList, setMakerList] = useState<string[]>([]);
  const [maker, setMaker] = useState("");
  const [modelList, setModelList] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [hospitals, setHospitals] = useState<HospitalListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<HospitalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRequery, setShowRequery] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchSidoList().then(setSidoList).catch(() => setSidoList([]));
  }, []);

  useEffect(() => {
    if (!sido) {
      setSigunguList([]);
      setSigungu("");
      return;
    }
    fetchSigunguList(sido).then(setSigunguList).catch(() => setSigunguList([]));
  }, [sido]);

  useEffect(() => {
    fetchEquipmentCatalog(category)
      .then((rows) => {
        setCatalogRows(rows);
        setMakerList([...new Set(rows.map((r) => r.manufacturer).filter(Boolean))] as string[]);
      })
      .catch(() => {
        setCatalogRows([]);
        setMakerList([]);
      });
    setMaker("");
    setModel("");
  }, [category]);

  // 제조사를 선택하면 모델 선택란도 해당 제조사의 모델로만 좁혀지도록 필터링
  useEffect(() => {
    const rows = maker ? catalogRows.filter((r) => r.manufacturer === maker) : catalogRows;
    setModelList([...new Set(rows.map((r) => r.model).filter(Boolean))] as string[]);
  }, [catalogRows, maker]);

  const loadHospitals = useCallback(
    async (opts?: { nameSearch?: string }) => {
      setLoadingList(true);
      setShowRequery(false);
      try {
        const center = mapRef.current?.getCenter?.();
        // 병원명 검색일 때만 "해당 카테고리 장비 미보유 병원"도 노출한다.
        // 시도/제조사/모델 등 다른 필터는 지도 위 표시 범위(map_only)에 영향을 주면 안 됨 — sorting/필터링 시에도
        // 미보유 병원은 절대 지도에 나오지 않아야 한다는 요구사항.
        const hasNameSearch = !!opts?.nameSearch;
        const isSearch = hasNameSearch || !!sido || !!maker || !!model;
        const data = await fetchHospitals({
          lat: center ? center.lat() : DEFAULT_CENTER.lat,
          lng: center ? center.lng() : DEFAULT_CENTER.lng,
          radiusKm: 3,
          category,
          sido: sido || undefined,
          sigungu: sigungu || undefined,
          maker: maker || undefined,
          model: model || undefined,
          nameSearch: opts?.nameSearch,
          // 시도/제조사/모델 등 필터가 하나라도 걸려 있으면 지도에 보이는 좁은 반경(3km)이 아니라
          // 해당 조건 전체(시도군구 선택 시 그 지역 전체, 미선택 시 전국)를 기준으로 조회한다.
          mapOnly: !isSearch,
          sort: "dist",
        });
        setHospitals(data);
        setSearchMode(isSearch);
        renderMarkers(data);
      } finally {
        setLoadingList(false);
      }
    },
    [category, sido, sigungu, maker, model]
  );

  function iconFor(h: Pick<HospitalListItem, "has_equipment" | "is_member">, selected: boolean) {
    const naver = window.naver;
    return {
      content: makeMarkerSvg(h, selected),
      anchor: new naver.maps.Point(24 * MARKER_ANCHOR_RATIO.x * (selected ? 1.25 : 1), 30 * MARKER_ANCHOR_RATIO.y * (selected ? 1.25 : 1)),
    };
  }

  function renderMarkers(list: HospitalListItem[]) {
    const naver = window.naver;
    if (!naver || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    selectedMarkerRef.current = null;
    markersRef.current = list
      .filter((h) => h.lat && h.lng)
      .map((h) => {
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(h.lat, h.lng),
          icon: iconFor(h, false),
          title: h.name,
          zIndex: h.is_member ? 200 : h.has_equipment ? 100 : 50,
          map: mapRef.current,
        });
        marker._hospData = h;
        naver.maps.Event.addListener(marker, "click", () => selectHospital(h.id));
        return marker;
      });
  }

  // 지도 스크립트 로드 후 1회 초기화
  useEffect(() => {
    if (!scriptLoaded || mapRef.current || !mapDivRef.current) return;
    const naver = window.naver;
    if (!naver?.maps) {
      setScriptError(true);
      return;
    }
    mapRef.current = new naver.maps.Map(mapDivRef.current, {
      center: new naver.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      zoom: 12,
      mapTypeControl: false,
    });
    // 실제 네이버지도처럼: 지도를 이동/줌하면 즉시 재조회하지 않고 "이 지역 재검색" 버튼만 노출
    naver.maps.Event.addListener(mapRef.current, "idle", () => {
      if (suppressIdleRef.current) {
        suppressIdleRef.current = false;
        return;
      }
      setShowRequery(true);
    });
    loadHospitals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded]);

  // 카테고리/시도/구군/제조사/모델 변경 시 재조회
  useEffect(() => {
    if (mapRef.current) loadHospitals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sido, sigungu, maker, model]);

  function highlightMarker(id: number | null) {
    const naver = window.naver;
    if (!naver) return;
    if (selectedMarkerRef.current) {
      const prevData = selectedMarkerRef.current._hospData;
      selectedMarkerRef.current.setIcon(iconFor(prevData, false));
      selectedMarkerRef.current.setZIndex(prevData.is_member ? 200 : prevData.has_equipment ? 100 : 50);
      selectedMarkerRef.current = null;
    }
    if (id == null) return;
    const marker = markersRef.current.find((m) => m._hospData?.id === id);
    if (marker) {
      marker.setIcon(iconFor(marker._hospData, true));
      marker.setZIndex(500);
      selectedMarkerRef.current = marker;
    }
  }

  async function selectHospital(id: number) {
    setSelectedId(id);
    highlightMarker(id);
    setDetailLoading(true);
    try {
      const d = await fetchHospitalDetail(id);
      setDetail(d);
      const h = hospitals.find((x) => x.id === id);
      if (h?.lat && h?.lng && mapRef.current) {
        const pos = new window.naver.maps.LatLng(h.lat, h.lng);
        const bounds = mapRef.current.getBounds();
        if (!bounds || !bounds.hasPoint(pos)) {
          suppressIdleRef.current = true;
          mapRef.current.panTo(pos);
        }
      }
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    highlightMarker(null);
  }

  function doSearch() {
    if (!searchInput.trim()) return;
    loadHospitals({ nameSearch: searchInput.trim() });
  }

  function exitSearch() {
    setSearchInput("");
    setSido("");
    setSigungu("");
    setMaker("");
    setModel("");
    setSearchMode(false);
    loadHospitals();
  }

  function locate() {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const ll = new window.naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      suppressIdleRef.current = true;
      mapRef.current.setCenter(ll);
      mapRef.current.setZoom(14);
      loadHospitals();
    });
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const center = mapRef.current?.getCenter?.();
      const params = new URLSearchParams({
        lat: String(center ? center.lat() : DEFAULT_CENTER.lat),
        lng: String(center ? center.lng() : DEFAULT_CENTER.lng),
        radius_km: "3",
        category,
        map_only: searchMode ? "false" : "true",
      });
      if (sido) params.set("sido", sido);
      if (sigungu) params.set("sigungu", sigungu);
      if (maker) params.set("maker", maker);
      if (model) params.set("model", model);
      const res = await fetch(`${API}/api/hospitals/export?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        alert("Excel 내보내기 실패");
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const match = disp.match(/filename\*=UTF-8''(.+)/);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = match ? decodeURIComponent(match[1]) : "songlim_map.xlsx";
      a.click();
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_CLIENT_ID}`}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setScriptError(true)}
      />

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {/* 필터 바 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  category === c
                    ? "bg-brand-500 text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <select
            value={sido}
            onChange={(e) => setSido(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <option value="">전체 시도</option>
            {sidoList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={sigungu}
            onChange={(e) => setSigungu(e.target.value)}
            disabled={!sido}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <option value="">전체 시군구</option>
            {sigunguList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={maker}
            onChange={(e) => {
              setMaker(e.target.value);
              setModel("");
            }}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <option value="">전체 제조사</option>
            {makerList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            title={model || "전체 모델명"}
            className="w-32 truncate rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <option value="">전체 모델명</option>
            {modelList.map((m) => (
              <option key={m} value={m} title={m}>
                {m}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-1.5">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="병원명 검색..."
              className="w-44 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs focus:border-brand-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            />
            <button
              onClick={doSearch}
              className="rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-white"
            >
              검색
            </button>
            {searchMode && (
              <button
                onClick={exitSearch}
                className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:border-gray-700"
              >
                초기화
              </button>
            )}
            <button
              onClick={exportExcel}
              disabled={exporting}
              className="rounded-full bg-success-500 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {exporting ? "생성 중..." : "📊 Excel"}
            </button>
          </div>
        </div>

        {/* 본문: 목록 | 지도 | 상세 */}
        <div className="flex h-[calc(100vh-260px)] min-h-[520px]">
          <div className="w-[300px] shrink-0 border-r border-gray-200 dark:border-gray-800">
            <HospitalListPanel
              category={category}
              hospitals={hospitals}
              selectedId={selectedId}
              onSelect={selectHospital}
              loading={loadingList}
            />
          </div>

          <div className="relative flex-1">
            <div ref={mapDivRef} className="h-full w-full" />
            {scriptError && (
              <div className="absolute inset-0 flex items-center justify-center bg-white p-8 text-center text-sm text-error-500 dark:bg-gray-900">
                ⚠ 네이버 지도 로드 실패
                <br />
                NCP 콘솔에서 Web 서비스 URL(localhost:3000 등)이 등록되어 있는지 확인해주세요.
              </div>
            )}
            {showRequery && !searchMode && (
              <button
                onClick={() => loadHospitals()}
                className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-lg hover:bg-brand-500 hover:text-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                🔍 이 지역 재검색
              </button>
            )}
            <button
              onClick={locate}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800"
              title="내 위치"
            >
              📍
            </button>
            <div className="absolute bottom-3 right-3 rounded-lg bg-white/95 px-3 py-2 text-[11px] shadow-md dark:bg-gray-800/95 dark:text-gray-300">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> 장비 보유
              </div>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> 장비 미보유
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-success-50 px-1.5 text-[9px] font-bold text-success-600 dark:bg-success-500/15 dark:text-success-400">회원</span>
                회원가입 병원
              </div>
            </div>
          </div>

          {selectedId && (
            <div className="w-[380px] shrink-0 border-l border-gray-200 dark:border-gray-800">
              <HospitalDetailPanel
                detail={detail}
                loading={detailLoading}
                category={category}
                onClose={closeDetail}
                onEquipmentRegistered={() => {
                  loadHospitals();
                  if (selectedId) selectHospital(selectedId);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
