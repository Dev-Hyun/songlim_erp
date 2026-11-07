import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ProposalEditor from "@/components/proposals/ProposalEditor";
import StaffOnly from "@/components/auth/StaffOnly";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="제안서" />
        <ProposalEditor id={Number(id)} />
      </div>
    </StaffOnly>
  );
}
