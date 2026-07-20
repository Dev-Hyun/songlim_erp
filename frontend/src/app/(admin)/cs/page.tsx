"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SimpleBoard from "@/components/board/SimpleBoard";
import StaffOnly from "@/components/auth/StaffOnly";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

async function updateStatus(id: number, status: string) {
  await fetch(`${API}/api/cs/${id}/status?status=${encodeURIComponent(status)}`, {
    method: "PATCH",
    credentials: "include",
  });
}

export default function CsPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="CS" />
        <SimpleBoard
          endpoint="/api/cs"
          title="CS 접수"
          hasStatus
          statusOptions={["접수", "처리중", "처리완료"]}
          onStatusChange={updateStatus}
        />
      </div>
    </StaffOnly>
  );
}
