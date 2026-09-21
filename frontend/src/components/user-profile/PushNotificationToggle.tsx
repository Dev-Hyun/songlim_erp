"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Button from "../ui/button/Button";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

// 서버가 base64url로 내려주는 VAPID 공개키를 pushManager.subscribe()가 요구하는
// Uint8Array 형태로 바꾼다 (표준 Web Push 예제에서 쓰는 변환 방식).
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type PermState = "default" | "granted" | "denied" | "unsupported";

export default function PushNotificationToggle() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<PermState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermState);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub)))
      .catch(() => {});
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermState);
      if (perm !== "granted") return;

      const keyRes = await fetch(`${API}/api/push/vapid-public-key`, { credentials: "include" });
      const { public_key: publicKey } = await keyRes.json();
      if (!publicKey) {
        alert("서버에 푸시 알림이 아직 설정되지 않았습니다. 관리자에게 문의해주세요.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await fetch(`${API}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        }),
      });
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API}/api/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  // 이 알림은 현재 캘린더 공유일정/소모품 발주 이벤트를 송림 직원에게만 보낸다.
  if (user?.role !== "songrim") return null;
  if (permission === "unsupported") return null;

  return (
    <div className="p-5 border border-gray-200 rounded-card dark:border-gray-800 lg:p-6">
      <h4 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">스마트폰 알림</h4>
      <p className="mb-4 text-ui text-gray-500 dark:text-gray-400">
        새 공유 일정, 소모품 발주 등록/상태변경이 생기면 이 브라우저로 알림을 받습니다.
        {permission === "denied" &&
          " (브라우저 알림 권한이 차단되어 있습니다 — 브라우저 설정에서 허용해주세요.)"}
      </p>
      {subscribed ? (
        <Button variant="outline" onClick={disable} disabled={busy}>
          알림 끄기
        </Button>
      ) : (
        <Button onClick={enable} disabled={busy || permission === "denied"}>
          알림 켜기
        </Button>
      )}
    </div>
  );
}
