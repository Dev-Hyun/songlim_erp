"use client";

import { useEffect, useState } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useAuth } from "@/context/AuthContext";
import { localISODate } from "@/lib/date";
import StaffOnly from "@/components/auth/StaffOnly";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface MileageLogItem {
  id: number;
  log_date: string;
  final_km: number;
  prev_km: number;
  daily_km: number;
  nonbiz_km: number;
  purpose: string | null;
  note: string | null;
  vehicle: string | null;
}

export default function MileagePage() {
  const { user, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<MileageLogItem[]>([]);
  const [lastVehicle, setLastVehicle] = useState("");
  const [loading, setLoading] = useState(true);
  const [logDate, setLogDate] = useState(() => localISODate());
  const [prevKm, setPrevKm] = useState("");
  const [finalKm, setFinalKm] = useState("");
  const [nonbizKm, setNonbizKm] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicle, setVehicle] = useState("");
  const now = new Date();
  const monthStart = localISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const [exFrom, setExFrom] = useState(monthStart);
  const [exTo, setExTo] = useState(localISODate(now));

  function load() {
    setLoading(true);
    fetch(`${API}/api/mileage-logs`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs || []);
        setLastVehicle(d.last_vehicle || "");
        // 차번호 자동저장: 사용자가 아직 입력하지 않았으면 마지막 차량을 채워둠
        setVehicle((v) => v || d.last_vehicle || "");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (user) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 전일 km 자동입력: 가장 최근 기록의 주행 후 계기판거리
  const lastKm = logs[0]?.final_km ?? 0;

  async function submit() {
    if (!finalKm) return;
    await fetch(`${API}/api/mileage-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        log_date: logDate,
        final_km: Number(finalKm),
        prev_km: prevKm ? Number(prevKm) : undefined,
        nonbiz_km: nonbizKm ? Number(nonbizKm) : 0,
        purpose,
        vehicle,
      }),
    });
    setPrevKm("");
    setFinalKm("");
    setNonbizKm("");
    setPurpose("");
    load();
  }

  function exportExcel() {
    const qs = new URLSearchParams();
    if (exFrom) qs.set("date_from", exFrom);
    if (exTo) qs.set("date_to", exTo);
    window.open(`${API}/api/mileage-logs/export?${qs.toString()}`, "_blank");
  }

  if (authLoading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>;

  return (
    <StaffOnly>
    <div>
      <PageBreadcrumb pageTitle="운행일지" />
      {!user ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
          로그인이 필요합니다
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:grid-cols-7">
            <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900" />
            <input type="number" value={prevKm} onChange={(e) => setPrevKm(e.target.value)} placeholder={`주행전 km (기본 ${lastKm})`} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900" />
            <input type="number" value={finalKm} onChange={(e) => setFinalKm(e.target.value)} placeholder="주행후 km" className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900" />
            <input type="number" value={nonbizKm} onChange={(e) => setNonbizKm(e.target.value)} placeholder="비업무용 km(선택)" className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900" />
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="운행 목적" className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900" />
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="차량번호" className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900" />
            <button onClick={submit} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-bold text-white">등록</button>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-white/[0.03]">
            <span className="text-xs font-semibold text-gray-500">국세청 운행기록부 내보내기:</span>
            <input type="date" value={exFrom} onChange={(e) => setExFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" />
            <span className="text-xs text-gray-400">~</span>
            <input type="date" value={exTo} onChange={(e) => setExTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900" />
            <button onClick={exportExcel} className="rounded-full bg-success-500 px-3.5 py-1.5 text-xs font-bold text-white">📊 Excel 내보내기</button>
            {lastVehicle && <span className="ml-auto text-xs text-gray-400">저장된 차량번호: {lastVehicle}</span>}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
                    <th className="px-3 py-2">날짜</th>
                    <th className="px-3 py-2">전일 km</th>
                    <th className="px-3 py-2">금일 km</th>
                    <th className="px-3 py-2">주행거리</th>
                    <th className="px-3 py-2">비업무용</th>
                    <th className="px-3 py-2">목적</th>
                    <th className="px-3 py-2">차량번호</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-gray-100 text-gray-700 dark:border-gray-800 dark:text-gray-300">
                      <td className="px-3 py-2">{l.log_date}</td>
                      <td className="px-3 py-2">{l.prev_km}</td>
                      <td className="px-3 py-2">{l.final_km}</td>
                      <td className="px-3 py-2 font-semibold text-brand-500">{l.daily_km}km</td>
                      <td className="px-3 py-2">{l.nonbiz_km || 0}km</td>
                      <td className="px-3 py-2">{l.purpose}</td>
                      <td className="px-3 py-2">{l.vehicle}</td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-xs text-gray-400">기록이 없습니다</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
    </StaffOnly>
  );
}
