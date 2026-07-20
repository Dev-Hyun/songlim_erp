"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SimpleBoard from "@/components/board/SimpleBoard";
import { useAuth } from "@/context/AuthContext";

export default function HospitalNoticesPage() {
  const { user } = useAuth();

  return (
    <div>
      <PageBreadcrumb pageTitle="병원용 공지사항" />
      <SimpleBoard
        endpoint="/api/notices?notice_type=hospital"
        title="병원용 공지사항"
        canWrite={user?.role === "songrim"}
        createExtra={{ notice_type: "hospital" }}
      />
    </div>
  );
}
