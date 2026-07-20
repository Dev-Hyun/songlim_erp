import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import InventoryClient from "@/components/inventory/InventoryClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "초음파 재고 관리 | 송림 ERP",
};

export default function UltrasoundInventoryPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="초음파 재고 관리" />
        <InventoryClient category="지멘스" />
      </div>
    </StaffOnly>
  );
}
