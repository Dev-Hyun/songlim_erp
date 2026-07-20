import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import InventoryClient from "@/components/inventory/InventoryClient";

export const metadata: Metadata = {
  title: "장비 재고 관리 | 송림 ERP",
};

export default function EquipmentInventoryPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="장비 재고 관리" />
      <InventoryClient category="타사" />
    </div>
  );
}
