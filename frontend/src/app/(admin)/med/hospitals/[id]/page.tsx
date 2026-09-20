import { notFound } from "next/navigation";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import HospitalDetailClient from "@/components/med/HospitalDetailClient";

export default async function MedHospitalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // URL 키는 hospitals.id(정수)다 — ykiho는 장비 보유 기관 3,507곳에서 비어 있어 전부를 못 가리킨다.
  const hospitalId = Number(id);
  if (!Number.isInteger(hospitalId) || hospitalId <= 0) notFound();
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="의료기관 상세" />
        <HospitalDetailClient key={hospitalId} hospitalId={hospitalId} />
      </div>
    </StaffOnly>
  );
}
