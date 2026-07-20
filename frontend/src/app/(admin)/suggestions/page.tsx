"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SimpleBoard from "@/components/board/SimpleBoard";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

async function updateStatus(id: number, status: string) {
  await fetch(`${API}/api/suggestions/${id}/status?status=${encodeURIComponent(status)}`, {
    method: "PATCH",
    credentials: "include",
  });
}

export default function SuggestionsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="건의사항" />
      <SimpleBoard
        endpoint="/api/suggestions"
        title="건의사항"
        hasStatus
        statusOptions={["접수", "검토중", "반영완료"]}
        onStatusChange={updateStatus}
      />
    </div>
  );
}
