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
  // 모바일에서는 지도가 표시될 공간이 없으므로 아예 지도를 로드하지 않고 주소 기반 목록만 보여준다
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024
  );
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
  // 같은 좌표에 겹친 마커를 클릭했을 때 그 좌표의 병원 id 목록 (목록 패널을 그 그룹으로 좁힘)
  const [stackIds, setStackIds] = useState<number[] | null>(null);
  // 백엔드가 500건에서 잘라 보내면 사용자에게 알려준다 (잘린 걸 모르면 누락/병합으로 오해)
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 1024);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
        setTruncated(data.length >= 500);
        setStackIds(null);
        renderMarkers(data);
      } finally {
        setLoadingList(false);
      }
    },
    [category, sido, sigungu, maker, model]
  );

  function iconFor(
    h: Pick<HospitalListItem, "has_equipment" | "is_member">,
    selected: boolean,
    count = 1
  ) {
    const naver = window.naver;
    return {
      content: makeMarkerSvg(h, selected, count),
      anchor: new naver.maps.Point(24 * MARKER_ANCHOR_RATIO.x * (selected ? 1.25 : 1), 30 * MARKER_ANCHOR_RATIO.y * (selected ? 1.25 : 1)),
    };
  }

  // 지오코딩 특성상 한 건물(메디컬빌딩)의 병원들은 좌표가 완전히 동일하다. 마커를 병원마다
  // 하나씩 찍으면 완벽히 겹쳐서 "한 곳"처럼 보이고 맨 위 한 곳만 클릭된다.
  // 좌표별로 묶어 마커 하나 + 개수 배지를 찍고, 누르면 그 좌표의 병원만 목록에 펼친다.
  function groupByPosition(list: HospitalListItem[]) {
    const groups = new Map<string, HospitalListItem[]>();
    for (const h of list) {
      if (!h.lat || !h.lng) continue;
      const key = `${h.lat},${h.lng}`;
      const g = groups.get(key);
      if (g) g.push(h);
      else groups.set(key, [h]);
    }
    return [...groups.values()];
  }

  function renderMarkers(list: HospitalListItem[]) {
    const naver = window.naver;
    if (!naver || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    selectedMarkerRef.current = null;
    markersRef.current = groupByPosition(list).map((group) => {
      // 배지/색은 그룹에서 가장 눈에 띄어야 하는 병원 기준 (회원 > 장비보유)
      const rep =
        group.find((h) => h.is_member) || group.find((h) => h.has_equipment) || group[0];
      const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(group[0].lat, group[0].lng),
        icon: iconFor(rep, false, group.length),
        title: group.length > 1 ? `${group[0].name} 외 ${group.length - 1}곳` : group[0].name,
        zIndex: rep.is_member ? 200 : rep.has_equipment ? 100 : 50,
        map: mapRef.current,
      });
      marker._hosps = group;
      marker._rep = rep;
      naver.maps.Event.addListener(marker, "click", () => {
        if (group.length > 1) {
          setStackIds(group.map((h) => h.id));
          setSelectedId(null);
          setDetail(null);
          highlightMarker(null);
        } else {
          setStackIds(null);
          selectHospital(group[0].id);
        }
      });
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

  // 모바일에서는 지도를 아예 로드하지 않으므로(위 effect가 절대 실행 안 됨) 별도로 최초 목록을 불러온다
  useEffect(() => {
    if (isMobile) loadHospitals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // 카테고리/시도/구군/제조사/모델 변경 시 재조회
  useEffect(() => {
    if (mapRef.current || isMobile) loadHospitals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sido, sigungu, maker, model]);

  function highlightMarker(id: number | null) {
    const naver = window.naver;
    if (!naver) return;
    if (selectedMarkerRef.current) {
      const prev = selectedMarkerRef.current;
      selectedMarkerRef.current.setIcon(iconFor(prev._rep, false, prev._hosps.length));
      selectedMarkerRef.current.setZIndex(prev._rep.is_member ? 200 : prev._rep.has_equipment ? 100 : 50);
      selectedMarkerRef.current = null;
    }
    if (id == null) return;
    const marker = markersRef.current.find((m) => m._hosps?.some((h: HospitalListItem) => h.id === id));
    if (marker) {
      marker.setIcon(iconFor(marker._rep, true, marker._hosps.length));
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

  function clearStack() {
    setStackIds(null);
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
    setStackIds(null);
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
      {!isMobile && (
        <Script
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_CLIENT_ID}`}
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
          onError={() => setScriptError(true)}
        />
      )}

      <div className="surface-card">
        {/* 필터 바 */}
        <div className="toolbar">
          <div className="seg">
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`seg-item ${category === c ? "seg-item-on" : ""}`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <select
            value={sido}
            onChange={(e) => setSido(e.target.value)}
            className="field"
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
            className="field disabled:opacity-40"
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
            className="field"
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
            className="field w-32 truncate"
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
              className="field w-44"
            />
            <button
              onClick={doSearch}
              className="btn btn-primary"
            >
              검색
            </button>
            {searchMode && (
              <button
                onClick={exitSearch}
                className="btn btn-default"
              >
                초기화
              </button>
            )}
            <button
              onClick={exportExcel}
              disabled={exporting}
              className="btn btn-default"
            >
              {exporting ? "생성 중..." : "📊 Excel"}
            </button>
          </div>
        </div>

        {/* 모바일: 지도 없이 주소 기반 목록만. 상세는 전체화면으로 덮어씀 */}
        {isMobile ? (
          <div className="relative h-[calc(100vh-220px)] min-h-[420px]">
            <HospitalListPanel
              category={category}
              hospitals={hospitals}
              selectedId={selectedId}
              onSelect={selectHospital}
              loading={loadingList}
              stackIds={stackIds}
              onClearStack={clearStack}
              truncated={truncated}
            />
            {selectedId && (
              <div className="surface-rail absolute inset-0 z-10">
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
        ) : (
          /* 본문: 목록 | 지도 | 상세 */
          <div className="flex h-[calc(100vh-260px)] min-h-[520px]">
            <div className="hairline w-[300px] shrink-0 border-r">
              <HospitalListPanel
                category={category}
                hospitals={hospitals}
                selectedId={selectedId}
                onSelect={selectHospital}
                loading={loadingList}
                stackIds={stackIds}
                onClearStack={clearStack}
                truncated={truncated}
              />
            </div>

            <div className="relative flex-1">
              <div ref={mapDivRef} className="h-full w-full" />
              {scriptError && (
                <div className="surface-rail absolute inset-0 flex items-center justify-center p-8 text-center text-ui text-error-600 dark:text-error-400">
                  ⚠ 네이버 지도 로드 실패
                  <br />
                  NCP 콘솔에서 Web 서비스 URL(localhost:3000 등)이 등록되어 있는지 확인해주세요.
                </div>
              )}
              {showRequery && !searchMode && (
                <button
                  onClick={() => loadHospitals()}
                  className="btn btn-default absolute left-1/2 top-3 -translate-x-1/2 shadow-lg"
                >
                  🔍 이 지역 재검색
                </button>
              )}
              <button
                onClick={locate}
                className="surface-card absolute right-3 top-3 flex h-9 w-9 items-center justify-center shadow-md"
                title="내 위치"
              >
                📍
              </button>
              <div className="surface-card fg-base absolute bottom-3 right-3 px-2.5 py-2 text-ui-xs shadow-md">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> 장비 보유
                </div>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> 장비 미보유
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="chip"><span className="dot bg-success-500" />회원</span>
                  회원가입 병원
                </div>
              </div>
            </div>

            {selectedId && (
              <div className="hairline w-[380px] shrink-0 border-l">
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
        )}
      </div>
    </>
  );
}
