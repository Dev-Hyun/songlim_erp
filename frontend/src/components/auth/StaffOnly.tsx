"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function StaffOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/signin");
    } else if (user.role !== "songrim") {
      router.replace("/notices/hospital");
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== "songrim") return null;
  return <>{children}</>;
}
