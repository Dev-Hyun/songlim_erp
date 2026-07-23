"use client";

import { useAuth } from "@/context/AuthContext";
import HospitalDashboard from "@/components/dashboard/HospitalDashboard";
import StaffDashboard from "@/components/dashboard/StaffDashboard";

export default function DashboardHome() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user?.role === "hospital") {
    return <HospitalDashboard />;
  }

  return <StaffDashboard />;
}
