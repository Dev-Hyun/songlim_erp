import PushNotificationToggle from "@/components/user-profile/PushNotificationToggle";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "프로필 | SONGLIM ERP",
  description: "송림메디칼 ERP 프로필 설정",
};

export default function Profile() {
  return (
    <div>
      <div className="surface-card p-4 lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          프로필
        </h3>
        <div className="space-y-6">
          <UserMetaCard />
          <UserInfoCard />
          {/* 새 공유일정·소모품 발주 알림을 이 기기로 받을지 여기서 켠다.
              별도 앱 설치나 가입 없이, 이미 로그인한 이 브라우저(홈 화면에 추가한
              PWA 포함)로 바로 푸시가 온다. */}
          <PushNotificationToggle />
        </div>
      </div>
    </div>
  );
}
