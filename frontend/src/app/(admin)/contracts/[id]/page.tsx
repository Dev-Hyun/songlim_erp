import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ContractDetailClient from "@/components/contracts/ContractDetailClient";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageBreadcrumb pageTitle="판매계약서" />
      <ContractDetailClient id={Number(id)} />
    </div>
  );
}
