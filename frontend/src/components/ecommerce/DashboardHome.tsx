"use client";

import { useAuth } from "@/context/AuthContext";
import SimpleBoard from "@/components/board/SimpleBoard";
import StaffDashboard from "@/components/dashboard/StaffDashboard";

export default function DashboardHome() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user?.role === "hospital") {
    return (
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12">
          <SimpleBoard endpoint="/api/notices?notice_type=hospital" title="공지사항" canWrite={false} />
        </div>
      </div>
    );
  }

  return <StaffDashboard />;
}
