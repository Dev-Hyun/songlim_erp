"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SimpleBoard from "@/components/board/SimpleBoard";
import { useAuth } from "@/context/AuthContext";

export default function UsedEquipmentPage() {
  const { user } = useAuth();

  return (
    <div>
      <PageBreadcrumb pageTitle="중고기기" />
      <SimpleBoard
        endpoint="/api/tech-posts?category=중고기기"
        title="중고기기"
        canWrite={user?.role === "songrim"}
        createExtra={{ category: "중고기기" }}
      />
    </div>
  );
}
