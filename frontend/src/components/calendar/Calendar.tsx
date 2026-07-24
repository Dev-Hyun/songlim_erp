"use client";
import React, { useState, useRef, useEffect, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  EventInput,
  DateSelectArg,
  EventClickArg,
  DayCellContentArg,
} from "@fullcalendar/core";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import { KOREAN_HOLIDAYS } from "./holidays";

// 일정마다 다른 색을 쓰되 라이트/다크 모드 모두에서 흰 글씨와 대비가 충분한 팔레트만 사용
const EVENT_COLORS = ["#465FFF", "#0BA5EC", "#12B76A", "#F79009", "#F04438", "#7A5AF8", "#EE46BC", "#0E9384"];
function colorForEvent(id: number) {
  return EVENT_COLORS[id % EVENT_COLORS.length];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010";

interface ApiEvent {
  id: number;
  title: string;
  start_at: string;
  end_at: string | null;
  created_by: number;
  is_shared: boolean;
  assignee_ids: number[];
  teams: string[];
}

interface StaffItem {
  id: number;
  display_name: string;
  department: string | null;
}

type Tab = "all" | "기술팀" | "초음파임상팀";
const TABS: { v: Tab; l: string }[] = [
  { v: "all", l: "전체 캘린더" },
  { v: "기술팀", l: "기술부 캘린더" },
  { v: "초음파임상팀", l: "임상 캘린더" },
];

const Calendar: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<ApiEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [googleConnected, setGoogleConnected] = useState(false);
  const calendarRef = useRef<FullCalendar>(null);
  const { isOpen, openModal, closeModal } = useModal();
  const { user } = useAuth();

  function load() {
    fetch(`${API}/api/calendar-events`, { credentials: "include" })
      .then((r) => r.json())
      .then(setEvents);
  }

  function loadGoogleStatus() {
    fetch(`${API}/api/google-calendar/status`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { connected: false }))
      .then((d) => setGoogleConnected(d.connected))
      .catch(() => setGoogleConnected(false));
  }

  useEffect(load, []);
  useEffect(loadGoogleStatus, []);

  async function handleGoogleConnect() {
    const res = await fetch(`${API}/api/google-calendar/connect`, { credentials: "include" });
    if (!res.ok) {
      alert("구글 캘린더 연동이 아직 설정되지 않았습니다");
      return;
    }
    const { auth_url } = await res.json();
    window.location.href = auth_url;
  }

  async function handleGoogleDisconnect() {
    await fetch(`${API}/api/google-calendar/disconnect`, { method: "POST", credentials: "include" });
    setGoogleConnected(false);
  }

  useEffect(() => {
    fetch(`${API}/api/calendar-events/staff`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setStaff)
      .catch(() => setStaff([]));
  }, []);

  // 팀 공유 선택지는 캘린더 탭과 동일하게 기술부/임상 둘로 고정
  const teamOptions = TABS.filter((t) => t.v !== "all").map((t) => t.v);

  const filteredEvents = useMemo(() => {
    if (tab === "all") return events;
    return events.filter((e) => e.teams.includes(tab));
  }, [events, tab]);

  const fcEvents: EventInput[] = filteredEvents.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.start_at,
    end: e.end_at ? addDays(e.end_at, 1) : undefined,
    backgroundColor: colorForEvent(e.id),
    borderColor: colorForEvent(e.id),
    textColor: "#ffffff",
    allDay: true,
    extendedProps: { shared: e.is_shared, teams: e.teams },
  }));

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    resetModalFields();
    setEventStartDate(selectInfo.startStr);
    // FullCalendar의 select endStr은 배타적(다음날)이라 사람이 이해하는 "마지막 날"로 하루 빼서 저장
    setEventEndDate(selectInfo.endStr ? addDays(selectInfo.endStr, -1) : selectInfo.startStr);
    openModal();
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const ev = events.find((e) => String(e.id) === clickInfo.event.id);
    if (!ev) return;
    setSelectedEvent(ev);
    setIsEditing(false);
    setEventTitle(ev.title);
    setEventStartDate(ev.start_at);
    setEventEndDate(ev.end_at || ev.start_at);
    setTeams(ev.teams);
    setAssigneeIds(ev.assignee_ids);
    openModal();
  };

  const handleOpenNewEvent = () => {
    resetModalFields();
    openModal();
  };

  const handleCloseModal = () => {
    closeModal();
    resetModalFields();
  };

  async function handleSave() {
    if (!eventTitle.trim() || !eventStartDate) return;
    const body = JSON.stringify({
      title: eventTitle,
      start_at: eventStartDate,
      end_at: eventEndDate,
      is_shared: teams.length > 0,
      teams,
      assignee_ids: assigneeIds,
    });
    if (selectedEvent) {
      await fetch(`${API}/api/calendar-events/${selectedEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });
    } else {
      await fetch(`${API}/api/calendar-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });
    }
    closeModal();
    resetModalFields();
    load();
  }

  async function handleDelete() {
    if (!selectedEvent) return;
    await fetch(`${API}/api/calendar-events/${selectedEvent.id}`, { method: "DELETE", credentials: "include" });
    closeModal();
    resetModalFields();
    load();
  }

  const resetModalFields = () => {
    setEventTitle("");
    setEventStartDate("");
    setEventEndDate("");
    setTeams([]);
    setAssigneeIds([]);
    setSelectedEvent(null);
    setIsEditing(false);
  };

  function toggleTeam(t: string) {
    setTeams((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function toggleAssignee(id: number) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="rounded-2xl border  border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.04]">
          {TABS.map((t) => (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${tab === t.v ? "bg-brand-500 text-white" : "text-gray-500"}`}
            >
              {t.l}
            </button>
          ))}
        </div>
        {user?.role === "songrim" && (
          <button
            onClick={googleConnected ? handleGoogleDisconnect : handleGoogleConnect}
            className={`ml-auto rounded-full px-3 py-1.5 text-xs font-bold ${
              googleConnected
                ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"
                : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
            }`}
          >
            {googleConnected ? "✅ 구글 캘린더 연동됨 (해제)" : "구글 캘린더 연동"}
          </button>
        )}
      </div>
      <div className="custom-calendar">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next addEventButton",
            center: "title",
            right: "",
          }}
          dayCellContent={(arg: DayCellContentArg) => {
            const key = arg.date.toISOString().slice(0, 10);
            const holiday = KOREAN_HOLIDAYS[key];
            return (
              <>
                <span className="fc-daynum">{arg.dayNumberText.replace("일", "")}</span>
                {holiday && <span className="fc-holiday-label">{holiday}</span>}
              </>
            );
          }}
          dayCellClassNames={(arg) => (KOREAN_HOLIDAYS[arg.date.toISOString().slice(0, 10)] ? ["fc-holiday-cell"] : [])}
          events={fcEvents}
          selectable={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          customButtons={{
            addEventButton: {
              text: "+ 일정 추가",
              click: handleOpenNewEvent,
            },
          }}
        />
      </div>
      <Modal isOpen={isOpen} onClose={handleCloseModal} className="max-w-[600px] p-6 lg:p-10">
        {(() => {
          const canManage = !selectedEvent || (!!user && user.id === selectedEvent.created_by) || !!user?.is_admin;
          const fieldsDisabled = !!selectedEvent && !isEditing;
          return (
            <div className="flex flex-col px-2 overflow-y-auto custom-scrollbar">
              <h5 className="mb-6 font-semibold text-gray-800 text-theme-xl dark:text-white/90 lg:text-2xl">
                {selectedEvent ? (isEditing ? "일정 수정" : "일정 상세") : "새 일정"}
              </h5>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">제목</label>
                <input
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  disabled={fieldsDisabled}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
              <div className="mt-4 flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">시작일</label>
                  <input type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} disabled={fieldsDisabled}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">종료일</label>
                  <input type="date" value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} disabled={fieldsDisabled}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">팀 공유 (다중 선택)</label>
                <div className="flex flex-wrap gap-1.5">
                  {teamOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={fieldsDisabled}
                      onClick={() => toggleTeam(t)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${
                        teams.includes(t) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">팀원 초대 (다중 선택)</label>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {staff.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={fieldsDisabled}
                      onClick={() => toggleAssignee(s.id)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${
                        assigneeIds.includes(s.id) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"
                      }`}
                    >
                      {s.display_name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3 sm:justify-end">
                <button onClick={handleCloseModal} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 sm:w-auto">닫기</button>
                {selectedEvent && !isEditing ? (
                  canManage && (
                    <>
                      <button onClick={handleDelete} className="w-full rounded-lg bg-error-500 px-4 py-2.5 text-sm font-medium text-white sm:w-auto">삭제</button>
                      <button onClick={() => setIsEditing(true)} className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white sm:w-auto">수정</button>
                    </>
                  )
                ) : (
                  <button onClick={handleSave} className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white sm:w-auto">
                    {selectedEvent ? "수정 저장" : "등록"}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default Calendar;
