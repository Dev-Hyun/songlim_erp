import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StorageClient from "@/components/storage/StorageClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = { title: "클라우드 NAS | 송림 ERP" };

export default function StoragePage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="클라우드 NAS" />
        <StorageClient root="nas" title="클라우드 NAS" showSpaces />
      </div>
    </StaffOnly>
  );
}
