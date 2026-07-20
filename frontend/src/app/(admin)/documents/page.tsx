import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StorageClient from "@/components/storage/StorageClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = { title: "사내 문서 서식 | 송림 ERP" };

export default function DocumentsPage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="사내 문서 서식" />
        <StorageClient folderPath="templates" title="사내 문서 서식" />
      </div>
    </StaffOnly>
  );
}
