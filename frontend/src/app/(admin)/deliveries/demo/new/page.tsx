import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DeliveryCreateClient from "@/components/deliveries/DeliveryCreateClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "새 DEMO 등록 | 송림 ERP",
};

export default function DemoDeliveryNewPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="새 DEMO 등록" />
        <DeliveryCreateClient fixedSiteType="demo" />
      </div>
    </StaffOnly>
  );
}
