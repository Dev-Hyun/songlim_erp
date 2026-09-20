import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import CatalogCategoriesClient from "@/components/med/CatalogCategoriesClient";

export const metadata: Metadata = {
  title: "의료장비 분류 | 송림 ERP",
  description: "심평원 장비대분류별 보유 의료기관 수·등록 대수·모델 수를 클릭으로 탐색합니다.",
};

export default function MedEquipmentCategoriesPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb
          pageTitle="의료장비 분류"
          description="검색할 이름을 몰라도 분류 → 모델 → 보유 의료기관 순서로 눌러서 내려갈 수 있습니다."
        />
        <CatalogCategoriesClient />
      </div>
    </StaffOnly>
  );
}
