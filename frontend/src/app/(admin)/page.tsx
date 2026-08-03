import type { Metadata } from "next";
import DashboardHome from "@/components/ecommerce/DashboardHome";
import RequireAuth from "@/components/auth/RequireAuth";

export const metadata: Metadata = {
  title: { absolute: "송림메디칼" },
  description: "송림메디칼 ERP",
};

export default function Ecommerce() {
  return (
    <RequireAuth>
      <DashboardHome />
    </RequireAuth>
  );
}
