import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import MyOrdersClient from "@/components/supply/MyOrdersClient";

export const metadata: Metadata = { title: "소모품 발주 내역 | 송림 ERP" };

export default function MySupplyOrdersPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="소모품 발주 내역" />
      <MyOrdersClient />
    </div>
  );
}
