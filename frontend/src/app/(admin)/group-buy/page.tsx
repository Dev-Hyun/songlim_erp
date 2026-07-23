"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SimpleBoard from "@/components/board/SimpleBoard";
import { useAuth } from "@/context/AuthContext";

export default function GroupBuyPage() {
  const { user } = useAuth();

  return (
    <div>
      <PageBreadcrumb pageTitle="공동구매" />
      <SimpleBoard
        endpoint="/api/tech-posts?category=공동구매"
        title="공동구매"
        canWrite={user?.role === "songrim"}
        createExtra={{ category: "공동구매" }}
      />
    </div>
  );
}
