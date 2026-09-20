import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import CatalogModelAliasClient from "@/components/med/CatalogModelAliasClient";

export default async function MedEquipmentModelAliasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="모델 분류 선택" />
        <CatalogModelAliasClient key={slug} slug={slug} />
      </div>
    </StaffOnly>
  );
}
