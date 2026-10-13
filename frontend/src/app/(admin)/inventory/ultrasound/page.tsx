import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import UltrasoundInventoryClient from "@/components/inventory/UltrasoundInventoryClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "초음파 재고 관리 | 송림 ERP",
};

export default function UltrasoundInventoryPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="초음파 재고 관리" />
        <UltrasoundInventoryClient />
      </div>
    </StaffOnly>
  );
}
