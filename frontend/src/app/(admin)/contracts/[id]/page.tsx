import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ContractDetailClient from "@/components/contracts/ContractDetailClient";
import StaffOnly from "@/components/auth/StaffOnly";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="판매계약서" />
        <ContractDetailClient id={Number(id)} />
      </div>
    </StaffOnly>
  );
}
