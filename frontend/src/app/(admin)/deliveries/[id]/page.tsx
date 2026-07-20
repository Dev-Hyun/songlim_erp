import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DeliveryDetailClient from "@/components/deliveries/DeliveryDetailClient";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageBreadcrumb pageTitle="초음파 계약 현황 상세" />
      <DeliveryDetailClient id={Number(id)} />
    </div>
  );
}
