import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import DeliveryDetailClient from "@/components/deliveries/DeliveryDetailClient";
import StaffOnly from "@/components/auth/StaffOnly";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="초음파 & 유지보수 현황 상세" />
        <DeliveryDetailClient id={Number(id)} />
      </div>
    </StaffOnly>
  );
}
