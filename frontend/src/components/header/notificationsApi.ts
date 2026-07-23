const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

export interface NotificationItem {
  type: string;
  label: string;
  title: string;
  created_at: string;
  link: string;
}

export interface NotificationsResponse {
  unread_count: number;
  items: NotificationItem[];
}

export const fetchNotifications = (): Promise<NotificationsResponse> =>
  fetch(`${API}/api/notifications`, { credentials: "include" }).then((r) => r.json());

export const markNotificationsSeen = (): Promise<{ ok: boolean }> =>
  fetch(`${API}/api/notifications/seen`, { method: "POST", credentials: "include" }).then((r) => r.json());
