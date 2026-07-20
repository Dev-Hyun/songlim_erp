import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SimpleBoard from "@/components/board/SimpleBoard";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = { title: "커뮤니티 | 송림 ERP" };

export default function CommunityPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="커뮤니티" />
        <SimpleBoard endpoint="/api/tech-posts" title="커뮤니티" detailHrefBase="/community" />
      </div>
    </StaffOnly>
  );
}
