import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CsDetailClient from "@/components/cs/CsDetailClient";

export default async function CsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageBreadcrumb pageTitle="CS 상세" />
      <CsDetailClient id={Number(id)} />
    </div>
  );
}
