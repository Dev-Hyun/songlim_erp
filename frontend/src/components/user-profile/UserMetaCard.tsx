"use client";
import React from "react";
import { useAuth } from "@/context/AuthContext";

export default function UserMetaCard() {
  const { user } = useAuth();

  const name = user?.display_name || user?.username || "";
  const subLabel =
    user?.role === "hospital"
      ? [user?.hospital_name, user?.hospital_type].filter(Boolean).join(" · ")
      : [user?.department, user?.position].filter(Boolean).join(" · ") || "송림 직원";

  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <h4 className="mb-2 text-lg font-semibold text-center text-gray-800 dark:text-white/90 xl:text-left">
        {name}
      </h4>
      <p className="text-sm text-center text-gray-500 dark:text-gray-400 xl:text-left">
        {subLabel}
      </p>
    </div>
  );
}
