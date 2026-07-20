import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DeliveryCreateClient from "@/components/deliveries/DeliveryCreateClient";

export const metadata: Metadata = {
  title: "새 납품 등록 | 송림 ERP",
};

export default function DeliveryNewPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="새 납품 등록" />
      <DeliveryCreateClient />
    </div>
  );
}
