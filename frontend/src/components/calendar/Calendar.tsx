"use client";
import React, { useState, useRef, useEffect, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  EventInput,
  DateSelectArg,
  EventClickArg,
} from "@fullcalendar/core";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";

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

type Tab = "all" | "team" | "mine";

const Calendar: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<ApiEvent | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [teams, setTeams] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [teamFilter, setTeamFilter] = useState("");
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

  const teamOptions = useMemo(
    () => [...new Set(staff.map((s) => s.department).filter(Boolean))] as string[],
    [staff]
  );

  const filteredEvents = useMemo(() => {
    if (tab === "all") return events;
    if (tab === "mine")
      return events.filter((e) => e.created_by === user?.id || e.assignee_ids.includes(user?.id ?? -1));
    if (tab === "team" && teamFilter) return events.filter((e) => e.teams.includes(teamFilter));
    return events;
  }, [events, tab, teamFilter, user]);

  const fcEvents: EventInput[] = filteredEvents.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.start_at,
    end: e.end_at || undefined,
    allDay: true,
    extendedProps: { shared: e.is_shared, teams: e.teams },
  }));

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    resetModalFields();
    setEventStartDate(selectInfo.startStr);
    setEventEndDate(selectInfo.endStr || selectInfo.startStr);
    openModal();
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const ev = events.find((e) => String(e.id) === clickInfo.event.id);
    if (!ev) return;
    setSelectedEvent(ev);
    setEventTitle(ev.title);
    setEventStartDate(ev.start_at);
    setEventEndDate(ev.end_at || ev.start_at);
    setTeams(ev.teams);
    setAssigneeIds(ev.assignee_ids);
    openModal();
  };

  async function handleAdd() {
    if (!eventTitle.trim() || !eventStartDate) return;
    await fetch(`${API}/api/calendar-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title: eventTitle,
        start_at: eventStartDate,
        end_at: eventEndDate,
        is_shared: teams.length > 0,
        teams,
        assignee_ids: assigneeIds,
      }),
    });
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
          {[
            { v: "all", l: "전체 캘린더" },
            { v: "team", l: "팀별 캘린더" },
            { v: "mine", l: "나의 캘린더" },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setTab(t.v as Tab)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${tab === t.v ? "bg-brand-500 text-white" : "text-gray-500"}`}
            >
              {t.l}
            </button>
          ))}
        </div>
        {tab === "team" && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            <option value="">팀 선택</option>
            {teamOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
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
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next addEventButton",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={fcEvents}
          selectable={true}
          select={handleDateSelect}
          eventClick={handleEventClick}
          customButtons={{
            addEventButton: {
              text: "+ 일정 추가",
              click: openModal,
            },
          }}
        />
      </div>
      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[600px] p-6 lg:p-10">
        <div className="flex flex-col px-2 overflow-y-auto custom-scrollbar">
          <h5 className="mb-6 font-semibold text-gray-800 text-theme-xl dark:text-white/90 lg:text-2xl">
            {selectedEvent ? "일정 상세" : "새 일정"}
          </h5>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">제목</label>
            <input
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              disabled={!!selectedEvent}
              className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div className="mt-4 flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">시작일</label>
              <input type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} disabled={!!selectedEvent}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">종료일</label>
              <input type="date" value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} disabled={!!selectedEvent}
                className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">팀 공유 (다중 선택)</label>
            <div className="flex flex-wrap gap-1.5">
              {teamOptions.length === 0 && <span className="text-xs text-gray-400">등록된 부서가 없습니다</span>}
              {teamOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!!selectedEvent}
                  onClick={() => toggleTeam(t)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
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
                  disabled={!!selectedEvent}
                  onClick={() => toggleAssignee(s.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    assigneeIds.includes(s.id) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/10"
                  }`}
                >
                  {s.display_name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3 sm:justify-end">
            <button onClick={closeModal} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 sm:w-auto">닫기</button>
            {selectedEvent ? (
              user && user.id === selectedEvent.created_by && (
                <button onClick={handleDelete} className="w-full rounded-lg bg-error-500 px-4 py-2.5 text-sm font-medium text-white sm:w-auto">삭제</button>
              )
            ) : (
              <button onClick={handleAdd} className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white sm:w-auto">등록</button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Calendar;
