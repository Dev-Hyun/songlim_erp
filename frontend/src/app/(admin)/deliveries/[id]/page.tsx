import DeliveryDetailClient from "@/components/deliveries/DeliveryDetailClient";
import StaffOnly from "@/components/auth/StaffOnly";

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <StaffOnly>
      <div>
        {/* 제목은 레코드가 DEMO인지 납품인지에 따라 달라져서 클라이언트가 그린다 */}
        <DeliveryDetailClient id={Number(id)} />
      </div>
    </StaffOnly>
  );
}
