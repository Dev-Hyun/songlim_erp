import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import CatalogModelClient from "@/components/med/CatalogModelClient";

export default async function MedEquipmentModelPage({
  params,
}: {
  params: Promise<{ code: string; slug: string }>;
}) {
  const { code, slug } = await params;
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="장비 모델 상세" />
        <CatalogModelClient key={`${code}/${slug}`} code={code} slug={slug} />
      </div>
    </StaffOnly>
  );
}
