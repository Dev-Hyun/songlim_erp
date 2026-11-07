import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProposalEditor from "@/components/proposals/ProposalEditor";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = {
  title: "새 제안서 | 송림 ERP",
};

export default function NewProposalPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="새 제안서" />
        <ProposalEditor />
      </div>
    </StaffOnly>
  );
}
