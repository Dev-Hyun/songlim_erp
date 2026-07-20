import Calendar from "@/components/calendar/Calendar";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StaffOnly from "@/components/auth/StaffOnly";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "캘린더 | 송림 ERP",
};
export default function page() {
  return (
    <StaffOnly>
      <div>
        <PageBreadcrumb pageTitle="캘린더" />
        <Calendar />
      </div>
    </StaffOnly>
  );
}
