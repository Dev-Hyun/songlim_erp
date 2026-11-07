import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProposalListClient from "@/components/proposals/ProposalListClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "개원의 제안서 제작 | 송림 ERP",
};

export default function ProposalsPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="개원의 제안서 제작" />
        <ProposalListClient />
      </div>
    </StaffOnly>
  );
}
