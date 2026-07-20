import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DeliveriesListClient from "@/components/deliveries/DeliveriesListClient";

export const metadata: Metadata = {
  title: "초음파 계약 현황 | 송림 ERP",
};

export default function DeliveriesPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="초음파 계약 현황" />
      <DeliveriesListClient />
    </div>
  );
}
