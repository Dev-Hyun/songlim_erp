import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ContractCreateClient from "@/components/contracts/ContractCreateClient";

export const metadata: Metadata = {
  title: "새 계약 건 등록 | 송림 ERP",
};

export default function ContractNewPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="새 계약 건 등록" />
      <ContractCreateClient />
    </div>
  );
}
