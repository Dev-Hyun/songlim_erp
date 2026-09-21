import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DeliveriesListClient from "@/components/deliveries/DeliveriesListClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "DEMO 관리 | 송림 ERP",
};

export default function DemoDeliveriesPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="DEMO 관리" />
        <DeliveriesListClient fixedSiteType="demo" />
      </div>
    </StaffOnly>
  );
}
