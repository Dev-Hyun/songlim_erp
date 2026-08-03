import type { Metadata } from "next";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StorageClient from "@/components/storage/StorageClient";
import StaffOnly from "@/components/auth/StaffOnly";

export const metadata: Metadata = { title: "자료실 | 송림 ERP" };

export default function StoragePage() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="자료실" />
        <StorageClient root="nas" title="자료실" showSpaces />
      </div>
    </StaffOnly>
  );
}
