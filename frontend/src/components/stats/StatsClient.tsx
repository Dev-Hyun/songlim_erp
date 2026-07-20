"use client";

import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import html2canvas from "html2canvas";
import { useEffect, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { fetchSidoList } from "@/components/sales-map/api";
import { CATEGORY_LABEL, EquipmentCategory } from "@/components/sales-map/types";
import {
  ShareItem,
  StatsFilter,
  SummaryStats,
  TrendData,
  fetchByRegion,
  fetchByType,
  fetchMarketShare,
  fetchSigunguList,
  fetchSummary,
  fetchYearlyTrend,
} from "./api";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const CATS: EquipmentCategory[] = ["us", "xray", "ct", "mri", "bmd", "carm"];
const YEARS = Array.from({ length: 7 }, (_, i) => 2025 - i);
const TYPE_GROUPS = [
  { value: "", label: "전체 종별" },
  { value: "clinic", label: "의원급" },
  { value: "hospital", label: "병원급" },
  { value: "general", label: "종합/상급종합" },
];

// 값의 변화가 잘 보이도록 0부터가 아니라 최소값 근처에서 시작하는 Y축 범위 계산.
// 장비 수는 항상 정수이므로 min/max는 정수로 내림/올림하고, 눈금도 정수 단위로만 찍히도록 tickAmount를 계산한다.
function tightYAxis(values: number[]) {
  const nums = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return { min: 0, max: undefined as number | undefined, tickAmount: undefined as number | undefined };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || max || 1;
  const lo = Math.max(0, Math.floor(min - range * 0.15));
  const hi = Math.ceil(max + range * 0.15);
  const span = hi - lo;
  // 눈금 개수는 정수 간격이 되도록 span의 약수 근처(최대 6개)로 잡음
  const tickAmount = Math.min(span, 6) || undefined;
  return { min: lo, max: hi, tickAmount };
}

// 장비 수 축은 항상 정수 라벨만 표시 (yaxis는 number, xaxis는 string으로 넘어와 둘 다 대응)
const intLabel = { formatter: (v: string | number) => Math.round(Number(v)).toLocaleString() };

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-800 dark:text-white/90">{value.toLocaleString()}</div>
    </div>
  );
}

const selectClass =
  "rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

export default function StatsClient() {
  const [category, setCategory] = useState<EquipmentCategory>("us");
  const [year, setYear] = useState(2025);
  const [sidoList, setSidoList] = useState<string[]>([]);
  const [sido, setSido] = useState("");
  const [sigunguList, setSigunguList] = useState<string[]>([]);
  const [sigungu, setSigungu] = useState("");
  const [typeGroup, setTypeGroup] = useState("");
  const [groupBy, setGroupBy] = useState<"maker" | "model">("maker");
  const captureRef = useRef<HTMLDivElement>(null);
  const [exportingPng, setExportingPng] = useState(false);

  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [share, setShare] = useState<ShareItem[]>([]);
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [byRegion, setByRegion] = useState<{ sido: string; count: number }[]>([]);
  const [byType, setByType] = useState<{ type: string; count: number }[]>([]);

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

  const filter: StatsFilter = { category, year, sido: sido || undefined, sigungu: sigungu || undefined, typeGroup: typeGroup || undefined };

  useEffect(() => {
    fetchSummary(filter).then(setSummary);
    fetchMarketShare(filter, groupBy).then(setShare);
    fetchYearlyTrend(filter, groupBy).then(setTrend);
    fetchByRegion(category, year).then(setByRegion);
    fetchByType(category, year).then(setByType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, year, sido, sigungu, typeGroup, groupBy]);

  async function exportPng() {
    if (!captureRef.current) return;
    setExportingPng(true);
    try {
      const canvas = await html2canvas(captureRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.font = `bold ${canvas.width / 12}px sans-serif`;
        ctx.fillStyle = "#465fff";
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 8);
        ctx.textAlign = "center";
        ctx.fillText("SONGLIM ERP", 0, 0);
        ctx.restore();
      }
      const link = document.createElement("a");
      link.download = `songlim_stats_${category}_${year}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExportingPng(false);
    }
  }

  const shareData = share.slice(0, 10);
  const shareYAxis = tightYAxis(shareData.map((s) => s.count));
  const shareOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "Outfit, sans-serif" },
    colors: ["#465fff"],
    plotOptions: { bar: { borderRadius: 5, columnWidth: "50%" } },
    dataLabels: { enabled: false },
    xaxis: { categories: shareData.map((s) => s.label) },
    yaxis: { min: shareYAxis.min, max: shareYAxis.max, tickAmount: shareYAxis.tickAmount, forceNiceScale: false, decimalsInFloat: 0, labels: intLabel },
  };
  const shareSeries = [{ name: "보유 대수", data: shareData.map((s) => s.count) }];

  const trendAllValues = trend ? Object.values(trend.data).flat() : [];
  const trendYAxis = tightYAxis(trendAllValues);
  const trendOptions: ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, fontFamily: "Outfit, sans-serif" },
    stroke: { curve: "smooth", width: 2 },
    xaxis: { categories: trend?.years.map(String) || [] },
    yaxis: { min: trendYAxis.min, max: trendYAxis.max, tickAmount: trendYAxis.tickAmount, forceNiceScale: false, decimalsInFloat: 0, labels: intLabel },
    legend: { position: "top", horizontalAlign: "left" },
  };
  const trendSeries = trend
    ? trend.labels.map((label) => ({ name: label, data: trend.data[label] }))
    : [];

  // 시도별 분포는 0부터 시작(마이너스 방지) + 값 축(가로 막대이므로 x축) 정수 라벨
  const regionOptions: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "Outfit, sans-serif" },
    colors: ["#12B76A"],
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    dataLabels: { enabled: false },
    xaxis: { categories: byRegion.map((r) => r.sido), min: 0, decimalsInFloat: 0, labels: intLabel },
  };
  const regionSeries = [{ name: "보유 대수", data: byRegion.map((r) => r.count) }];

  const typeOptions: ApexOptions = {
    chart: { type: "donut", fontFamily: "Outfit, sans-serif" },
    labels: byType.map((t) => t.type),
    legend: { position: "bottom" },
    dataLabels: { enabled: true, formatter: (val: number) => `${val.toFixed(0)}%` },
  };
  const typeSeries = byType.map((t) => t.count);
  const chartKey = `${category}-${year}-${sido}-${sigungu}-${typeGroup}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                category === c ? "bg-brand-500 text-white" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        <select value={sido} onChange={(e) => setSido(e.target.value)} className={selectClass}>
          <option value="">전체 시도</option>
          {sidoList.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={sigungu} onChange={(e) => setSigungu(e.target.value)} disabled={!sido} className={`${selectClass} disabled:opacity-40`}>
          <option value="">전체 시군구</option>
          {sigunguList.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={typeGroup} onChange={(e) => setTypeGroup(e.target.value)} className={selectClass}>
          {TYPE_GROUPS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          onClick={exportPng}
          disabled={exportingPng}
          className="ml-auto rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {exportingPng ? "생성 중..." : "🖼️ PNG 내보내기"}
        </button>
      </div>

      <div ref={captureRef} className="space-y-6 bg-gray-50 p-1 dark:bg-gray-900">
        {summary && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <SummaryCard label="총 장비 수" value={summary.total_equipment} />
            <SummaryCard label="보유 병원" value={summary.hospitals_with_equipment} />
            <SummaryCard label="제조사 종류" value={summary.maker_count} />
            <SummaryCard label="모델 종류" value={summary.model_count} />
            <SummaryCard label="미보유 (영업대상)" value={summary.no_equipment_count} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ComponentCard
            title="제조사별 점유율"
            desc={
              <span className="inline-flex gap-1">
                {(["maker", "model"] as const).map((b) => (
                  <button
                    key={b}
                    onClick={() => setGroupBy(b)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${groupBy === b ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"}`}
                  >
                    {b === "maker" ? "제조사" : "모델"}
                  </button>
                ))}
              </span>
            }
          >
            <ReactApexChart key={`share-${chartKey}-${groupBy}`} options={shareOptions} series={shareSeries} type="bar" height={280} />
          </ComponentCard>

          <ComponentCard title="연도별 추이 (2019-2025)">
            <ReactApexChart key={`trend-${chartKey}-${groupBy}`} options={trendOptions} series={trendSeries} type="line" height={280} />
          </ComponentCard>

          <ComponentCard title="시도별 분포">
            <ReactApexChart key={`region-${chartKey}`} options={regionOptions} series={regionSeries} type="bar" height={340} />
          </ComponentCard>

          <ComponentCard title="병원 종별 분포">
            {typeSeries.length > 0 ? (
              <ReactApexChart key={`type-${chartKey}`} options={typeOptions} series={typeSeries} type="donut" height={280} />
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">데이터가 없습니다</div>
            )}
          </ComponentCard>
        </div>

        <ComponentCard title="전체 순위 (TOP 20)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-400 dark:border-gray-800">
                  <th className="py-2">순위</th>
                  <th className="py-2">{groupBy === "maker" ? "제조사" : "모델"}</th>
                  <th className="py-2 text-right">장비 수</th>
                  <th className="py-2 text-right">점유율</th>
                </tr>
              </thead>
              <tbody>
                {share.slice(0, 20).map((s, i) => (
                  <tr key={s.label} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 font-medium text-gray-700 dark:text-gray-300">{s.label}</td>
                    <td className="py-2 text-right text-gray-700 dark:text-gray-300">{s.count.toLocaleString()}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                          <div className="h-full bg-brand-500" style={{ width: `${s.share}%` }} />
                        </div>
                        <span className="w-10 text-right text-gray-500">{s.share}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ComponentCard>
      </div>
    </div>
  );
}
