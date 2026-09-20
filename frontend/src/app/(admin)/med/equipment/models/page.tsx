import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import CatalogModelsClient from "@/components/med/CatalogModelsClient";

export const metadata: Metadata = {
  title: "의료장비 모델 | 송림 ERP",
  description: "장비 분류를 거치지 않고 모델명으로 바로 보유 의료기관 현황을 찾습니다.",
};

export default function MedEquipmentModelsPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb
          pageTitle="의료장비 모델"
          description="확인 의료기관이 많은 모델부터 보여 줍니다. 모델명을 누르면 그 모델의 보유 현황으로 갑니다."
        />
        <CatalogModelsClient />
      </div>
    </StaffOnly>
  );
}
