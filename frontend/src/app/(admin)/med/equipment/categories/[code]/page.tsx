import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import CatalogCategoryClient from "@/components/med/CatalogCategoryClient";

export default async function MedEquipmentCategoryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="장비 분류 상세" />
        <CatalogCategoryClient key={code} code={code} />
      </div>
    </StaffOnly>
  );
}
