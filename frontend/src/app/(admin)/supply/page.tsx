import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SupplyShopClient from "@/components/supply/SupplyShopClient";

export const metadata: Metadata = { title: "소모품 발주 | 송림 ERP" };

export default function SupplyShopPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="소모품 발주" />
      <SupplyShopClient />
    </div>
  );
}
