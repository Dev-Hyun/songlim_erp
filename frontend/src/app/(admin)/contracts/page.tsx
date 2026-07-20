import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ContractsListClient from "@/components/contracts/ContractsListClient";

export const metadata: Metadata = {
  title: "계약 진행 현황 | 송림 ERP",
};

export default function ContractsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="계약 진행 현황" />
      <ContractsListClient />
    </div>
  );
}
