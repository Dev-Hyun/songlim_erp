import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StatsClient from "@/components/stats/StatsClient";

export const metadata: Metadata = {
  title: "영업지도 통계 | 송림 ERP",
  description: "장비 보유 현황 통계 (단일 분석)",
};

export default function SalesMapStatsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="영업지도 통계" />
      <StatsClient />
    </div>
  );
}
