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
        {/* 공동구매/중고기기와는 완전히 분리된 별도 게시판 — category=general만 조회 */}
        <SimpleBoard endpoint="/api/tech-posts?category=general" title="커뮤니티" detailHrefBase="/community" />
      </div>
    </StaffOnly>
  );
}
