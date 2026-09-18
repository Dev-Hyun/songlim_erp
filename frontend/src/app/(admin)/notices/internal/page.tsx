"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SimpleBoard from "@/components/board/SimpleBoard";
import { useAuth } from "@/context/AuthContext";

export default function InternalNoticesPage() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user?.role === "hospital") {
    return (
      <div>
        <PageBreadcrumb pageTitle="회사 공지사항" />
        <div className="surface-card empty-state">
          접근 권한이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="회사 공지사항" />
      <SimpleBoard
        endpoint="/api/notices?notice_type=internal"
        title="회사 공지사항"
        canWrite={user?.role === "songrim"}
        createExtra={{ notice_type: "internal" }}
        detailHrefBase="/notices"
      />
    </div>
  );
}
