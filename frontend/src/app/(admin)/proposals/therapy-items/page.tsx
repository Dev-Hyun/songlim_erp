import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import TherapyItemsClient from "@/components/proposals/TherapyItemsClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "치료장비 품목 관리 | 송림 ERP",
};

export default function TherapyItemsPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="치료장비 품목 관리" />
        <TherapyItemsClient />
      </div>
    </StaffOnly>
  );
}
