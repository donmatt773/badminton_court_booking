"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "./confirm-modal";
import { getPusherClient } from "@/lib/client/pusher-client";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";
import { isValidBlockedSlotTimeRange } from "@/lib/shared/blocked-slot-time";

type Court = {
  _id: string;
  name: string;
};

type BlockedSlot = {
  _id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  groupName?: string | null;
  groupRepresentative?: string | null;
  recurrenceUntilDate?: string | null;
  recurrenceWeekdays?: number[] | null;
  reason?: string | null;
  sessionStartedAt?: string | null;
  sessionEndedAt?: string | null;
  hourlyRateSnapshot?: number | null;
  actualDurationHours?: number | null;
  chargedAmount?: number | null;
  createdAt: string;
};

type GroupedBlockedRow = {
  groupKey: string;
  groupName: string;
  groupRepresentative: string;
  slots: BlockedSlot[];
  courts: string[];
  totalRevenue: number;
  runningCount: number;
  closedCount: number;
  scheduledCount: number;
  notStartedCount: number;
  latestCreatedAt: string;
};

function normalizedGroupName(slot: BlockedSlot): string {
  return slot.groupName?.trim() || "Unassigned Group";
}

function normalizedRepresentative(slot: BlockedSlot): string {
  return slot.groupRepresentative?.trim() || "No Representative";
}

function blockedGroupKey(slot: BlockedSlot): string {
  return `${normalizedGroupName(slot)}|||${normalizedRepresentative(slot)}`;
}

function parseBlockedGroupKey(groupKey: string): { groupName: string; groupRepresentative: string } {
  const [groupName, groupRepresentative] = groupKey.split("|||");
  return {
    groupName: groupName || "Unassigned Group",
    groupRepresentative: groupRepresentative || "No Representative",
  };
}

const WEEKDAY_LABEL_BY_INDEX: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function blockedSlotSessionLabel(slot: BlockedSlot, today: string): "scheduled" | "not_started" | "running" | "closed" {
  if (slot.sessionStartedAt && slot.sessionEndedAt) {
    return "closed";
  }

  if (slot.sessionStartedAt && !slot.sessionEndedAt) {
    return "running";
  }

  if (slot.bookingDate > today) {
    return "scheduled";
  }

  return "not_started";
}

function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    return time;
  }

  const normalizedHour = hours % 12 === 0 ? 12 : hours % 12;
  const period = hours < 12 ? "AM" : "PM";
  return `${normalizedHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function formatElapsedDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthISO(): string {
  return todayISODate().slice(0, 7);
}

function currentYearISO(): string {
  return todayISODate().slice(0, 4);
}

function listDatesInMonth(month: string): string[] {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return [];
  }

  const dates: string[] = [];
  const totalDays = new Date(year, monthNumber, 0).getDate();
  for (let day = 1; day <= totalDays; day += 1) {
    dates.push(`${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

function listDatesInYear(yearText: string): string[] {
  const year = Number(yearText);
  if (!Number.isInteger(year)) {
    return [];
  }

  const dates: string[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const totalDays = new Date(year, month, 0).getDate();
    for (let day = 1; day <= totalDays; day += 1) {
      dates.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  return dates;
}

function currentTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

type NewBlockForm = {
  mode: "daily" | "monthly" | "yearly";
  courtIds: string[];
  bookingDate: string;
  bookingMonth: string;
  bookingYear: string;
  selectedWeekdays: number[];
  startTime: string;
  endTime: string;
  groupName: string;
  groupRepresentative: string;
  reason: string;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
};

export function BlockedSlotManager() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const [groupSessionAction, setGroupSessionAction] = useState<"begin" | "end" | null>(null);
  const [sessionRecordDate, setSessionRecordDate] = useState<string>("all");
  const [groupModalKey, setGroupModalKey] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const [groupEditKey, setGroupEditKey] = useState<string | null>(null);
  const [groupEditForm, setGroupEditForm] = useState({
    courtIds: [] as string[],
    groupName: "",
    groupRepresentative: "",
    bookingDate: "",
    recurrenceWeekdays: [] as number[],
    startTime: "",
    endTime: "",
    reason: "",
  });
  const [isGroupEditSaving, setIsGroupEditSaving] = useState(false);
  const [isGroupDeleting, setIsGroupDeleting] = useState(false);
  const [groupEditError, setGroupEditError] = useState<string | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const today = todayISODate();
  const nowTime = currentTimeHHMM();

  const [form, setForm] = useState<NewBlockForm>({
    mode: "daily",
    courtIds: [],
    bookingDate: todayISODate(),
    bookingMonth: currentMonthISO(),
    bookingYear: currentYearISO(),
    selectedWeekdays: [],
    startTime: "08:00",
    endTime: "09:00",
    groupName: "",
    groupRepresentative: "",
    reason: "",
  });

  const bookingDates = useMemo(() => {
    let dates: string[] = [];
    if (form.mode === "daily") {
      dates = [form.bookingDate];
    } else if (form.mode === "monthly") {
      dates = listDatesInMonth(form.bookingMonth);
    } else {
      dates = listDatesInYear(form.bookingYear);
    }

    if (form.mode !== "daily" && form.selectedWeekdays.length > 0) {
      const selectedWeekdaySet = new Set(form.selectedWeekdays);
      dates = dates.filter((dateText) => {
        const weekday = new Date(`${dateText}T00:00:00Z`).getUTCDay();
        return selectedWeekdaySet.has(weekday);
      });
    }

    const uniqueFutureDates = Array.from(new Set(dates)).filter((date) => date >= today).sort();
    return uniqueFutureDates;
  }, [form.bookingDate, form.bookingMonth, form.bookingYear, form.mode, form.selectedWeekdays, today]);

  const courtNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const court of courts) {
      map[court._id] = court.name;
    }
    return map;
  }, [courts]);

  const sessionRecordDates = useMemo(
    () => Array.from(new Set(blockedSlots.map((slot) => slot.bookingDate))).sort().reverse(),
    [blockedSlots]
  );

  const filteredBlockedSlots = useMemo(() => {
    return blockedSlots.filter((slot) =>
      sessionRecordDate === "all" || slot.bookingDate === sessionRecordDate
    );
  }, [blockedSlots, sessionRecordDate]);

  const completedFilteredSessions = useMemo(
    () => filteredBlockedSlots.filter((slot) => typeof slot.chargedAmount === "number"),
    [filteredBlockedSlots]
  );

  useEffect(() => {
    if (sessionRecordDate !== "all" && !sessionRecordDates.includes(sessionRecordDate)) {
      setSessionRecordDate("all");
    }
  }, [sessionRecordDate, sessionRecordDates]);

  const groupedBlockedRows = useMemo(() => {
    const map = new Map<string, GroupedBlockedRow>();

    for (const slot of filteredBlockedSlots) {
      const groupKey = blockedGroupKey(slot);
      const existing = map.get(groupKey);
      const sessionState = blockedSlotSessionLabel(slot, today);
      const charged = typeof slot.chargedAmount === "number" ? slot.chargedAmount : 0;

      if (!existing) {
        map.set(groupKey, {
          groupKey,
          groupName: normalizedGroupName(slot),
          groupRepresentative: normalizedRepresentative(slot),
          slots: [slot],
          courts: [courtNameById[slot.courtId] ?? slot.courtId],
          totalRevenue: charged,
          runningCount: sessionState === "running" ? 1 : 0,
          closedCount: sessionState === "closed" ? 1 : 0,
          scheduledCount: sessionState === "scheduled" ? 1 : 0,
          notStartedCount: sessionState === "not_started" ? 1 : 0,
          latestCreatedAt: slot.createdAt,
        });
        continue;
      }

      existing.slots.push(slot);
      if (!existing.courts.includes(courtNameById[slot.courtId] ?? slot.courtId)) {
        existing.courts.push(courtNameById[slot.courtId] ?? slot.courtId);
      }
      existing.totalRevenue += charged;
      if (sessionState === "running") existing.runningCount += 1;
      if (sessionState === "closed") existing.closedCount += 1;
      if (sessionState === "scheduled") existing.scheduledCount += 1;
      if (sessionState === "not_started") existing.notStartedCount += 1;
      if (new Date(slot.createdAt).getTime() > new Date(existing.latestCreatedAt).getTime()) {
        existing.latestCreatedAt = slot.createdAt;
      }
    }

    return Array.from(map.values()).sort(
      (left, right) => new Date(right.latestCreatedAt).getTime() - new Date(left.latestCreatedAt).getTime()
    );
  }, [filteredBlockedSlots, today, courtNameById]);

  const groupModalIdentity = useMemo(() => {
    if (!groupModalKey) {
      return null;
    }

    return parseBlockedGroupKey(groupModalKey);
  }, [groupModalKey]);

  const groupModalSlots = useMemo(() => {
    if (!groupModalKey) {
      return [] as BlockedSlot[];
    }

    return blockedSlots
      .filter((slot) => blockedGroupKey(slot) === groupModalKey)
      .sort((left, right) => {
        if (left.bookingDate !== right.bookingDate) {
          return right.bookingDate.localeCompare(left.bookingDate);
        }
        if (left.courtId !== right.courtId) {
          const leftCourt = courtNameById[left.courtId] ?? left.courtId;
          const rightCourt = courtNameById[right.courtId] ?? right.courtId;
          return leftCourt.localeCompare(rightCourt, undefined, { numeric: true, sensitivity: "base" });
        }
        return left.startTime.localeCompare(right.startTime);
      });
  }, [blockedSlots, groupModalKey, courtNameById]);

  const groupModalDailyBreakdown = useMemo(() => {
    if (!groupModalKey) {
      return [] as Array<{ date: string; closedCount: number; revenue: number }>;
    }

    const byDate: Record<string, { closedCount: number; revenue: number }> = {};

    for (const slot of groupModalSlots) {
      if (!byDate[slot.bookingDate]) {
        byDate[slot.bookingDate] = { closedCount: 0, revenue: 0 };
      }

      if (typeof slot.chargedAmount === "number") {
        byDate[slot.bookingDate].closedCount += 1;
        byDate[slot.bookingDate].revenue += slot.chargedAmount;
      }
    }

    return Object.entries(byDate)
      .sort(([leftDate], [rightDate]) => rightDate.localeCompare(leftDate))
      .map(([date, values]) => ({
        date,
        closedCount: values.closedCount,
        revenue: values.revenue,
      }));
  }, [groupModalSlots, groupModalKey]);

  const groupModalRevenueTotal = useMemo(
    () => groupModalDailyBreakdown.reduce((sum, row) => sum + row.revenue, 0),
    [groupModalDailyBreakdown]
  );

  const groupModalClosedCount = useMemo(
    () => groupModalDailyBreakdown.reduce((sum, row) => sum + row.closedCount, 0),
    [groupModalDailyBreakdown]
  );

  const groupModalMonitorSlots = useMemo(
    () => groupModalSlots.filter((slot) => blockedSlotSessionLabel(slot, today) !== "closed"),
    [groupModalSlots, today]
  );

  const groupBeginEligibleCount = useMemo(
    () =>
      groupModalMonitorSlots.filter(
        (slot) =>
          !slot.sessionStartedAt &&
          slot.bookingDate <= today &&
          (slot.bookingDate < today || nowTime >= slot.startTime)
      ).length,
    [groupModalMonitorSlots, today, nowTime]
  );

  const groupEndEligibleCount = useMemo(
    () => groupModalMonitorSlots.filter((slot) => !!slot.sessionStartedAt && !slot.sessionEndedAt).length,
    [groupModalMonitorSlots]
  );

  const groupModalLockedCourtIds = useMemo(
    () => Array.from(new Set(groupModalSlots.filter((slot) => !!slot.sessionStartedAt).map((slot) => slot.courtId))),
    [groupModalSlots]
  );

  const groupModalRecurringDayLabels = useMemo(() => {
    const firstWeekdays = groupModalSlots.find((slot) => Array.isArray(slot.recurrenceWeekdays))?.recurrenceWeekdays;
    if (!Array.isArray(firstWeekdays) || firstWeekdays.length === 0) {
      return ["Daily"];
    }

    return Array.from(new Set(firstWeekdays))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((left, right) => left - right)
      .map((day) => WEEKDAY_LABEL_BY_INDEX[day] ?? String(day));
  }, [groupModalSlots]);

  async function loadData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [courtsRes, blockedRes] = await Promise.all([
        fetch("/api/admin/courts", { cache: "no-store" }),
        fetch("/api/admin/blocked-slots", { cache: "no-store" }),
      ]);

      if (!courtsRes.ok) {
        throw new Error("Failed to load courts");
      }

      if (!blockedRes.ok) {
        throw new Error("Failed to load blocked records");
      }

      const courtsBody = (await courtsRes.json()) as { data?: Court[] };
      const blockedBody = (await blockedRes.json()) as { data?: BlockedSlot[] };

      const nextCourts = (courtsBody.data ?? []).slice().sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
      );
      setCourts(nextCourts);
      setBlockedSlots(blockedBody.data ?? []);

      setForm((prev) => {
        const validCourtIds = prev.courtIds.filter((id) =>
          nextCourts.some((court) => court._id === id)
        );
        if (validCourtIds.length > 0) {
          return { ...prev, courtIds: validCourtIds };
        }
        if (nextCourts.length > 0) {
          return { ...prev, courtIds: [nextCourts[0]._id] };
        }
        return { ...prev, courtIds: [] };
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(REALTIME_CHANNELS.blockedSlots);
    const handleUpdate = () => {
      void loadData();
    };

    channel.bind(REALTIME_EVENTS.updated, handleUpdate);

    return () => {
      channel.unbind(REALTIME_EVENTS.updated, handleUpdate);
      pusher.unsubscribe(REALTIME_CHANNELS.blockedSlots);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (confirmResolverRef.current) {
        confirmResolverRef.current(false);
        confirmResolverRef.current = null;
      }
    };
  }, []);

  function closeConfirmDialog(result: boolean): void {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolve?.(result);
  }

  function requestConfirmation(dialog: ConfirmDialogState): Promise<boolean> {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog(dialog);
    });
  }

  async function handleCreateBlock(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (form.courtIds.length === 0) {
      setError("Please select at least one court");
      return;
    }

    if (!isValidBlockedSlotTimeRange(form.startTime, form.endTime)) {
      setError("End time must be after start time unless it ends at 12:00 AM");
      return;
    }

    if (form.groupName.trim().length < 2) {
      setError("Group name must be at least 2 characters");
      return;
    }

    if (form.groupRepresentative.trim().length < 2) {
      setError("Group representative must be at least 2 characters");
      return;
    }

    if (bookingDates.length === 0) {
      setError("No future dates found for the selected recurrence");
      return;
    }

    if (bookingDates.includes(today) && form.startTime < nowTime) {
      setError("Start time cannot be in the past");
      return;
    }

    const totalRecords = bookingDates.length * form.courtIds.length;

    if (totalRecords > 1) {
      const firstDate = bookingDates[0];
      const lastDate = bookingDates[bookingDates.length - 1];
      const modeLabel =
        form.mode === "daily"
          ? "daily multi-court"
          : form.mode === "monthly"
            ? "monthly recurring"
            : "yearly recurring";
      const confirmed = await requestConfirmation({
        title: "Confirm Recurring Block",
        message: `You selected ${modeLabel} mode with ${form.courtIds.length} court(s). This will create ${form.courtIds.length} active record(s) and apply recurring blocking across ${bookingDates.length} date(s) (${firstDate} to ${lastDate}). Session records are generated one-by-one as sessions are processed. Continue?`,
        confirmLabel: "Yes, Create Records",
        cancelLabel: "Cancel",
      });

      if (!confirmed) {
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/blocked-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtIds: form.courtIds,
          bookingDates,
          recurrenceWeekdays: form.mode === "daily" || form.selectedWeekdays.length === 0
            ? undefined
            : form.selectedWeekdays,
          startTime: form.startTime,
          endTime: form.endTime,
          groupName: form.groupName.trim(),
          groupRepresentative: form.groupRepresentative.trim(),
          reason: form.reason.trim() || undefined,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | {
            error?: { message?: string };
            data?: {
              created?: Array<{ _id: string }>;
              skipped?: Array<{ courtId: string; reason: string }>;
            };
          }
        | null;

      if (!response.ok) {
        const message = body?.error?.message ?? "Failed to create blocked record";
        if (response.status === 409) {
          setPopupMessage("No records were created because all selected courts overlap existing blocked ranges.");
          return;
        }

        throw new Error(message);
      }

      setForm((prev) => ({ ...prev, reason: "" }));

      const createdCount = body?.data?.created?.length ?? 0;
      const skippedCount = body?.data?.skipped?.length ?? 0;
      if (createdCount > 0 && skippedCount > 0) {
        setSuccessMessage(`Created ${createdCount} active record(s). Skipped ${skippedCount} due to overlap.`);
      } else if (createdCount > 0) {
        setSuccessMessage(`Created ${createdCount} active record(s) successfully.`);
      }

      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create blocked record");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteBlock(id: string): Promise<void> {
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/admin/blocked-slots/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;

        if (response.status === 404) {
          setError("This blocked record no longer exists. Refreshing list...");
          await loadData();
          return;
        }

        throw new Error(body?.error?.message ?? "Failed to delete blocked slot");
      }

      setBlockedSlots((prev) => prev.filter((slot) => slot._id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete blocked slot");
    }
  }

  async function handleDeleteGroup(): Promise<void> {
    if (!groupModalKey || groupModalSlots.length === 0 || isGroupDeleting) {
      return;
    }

    const confirmed = await requestConfirmation({
      title: "Delete Blocking Group",
      message: `Delete this blocking group permanently? This will remove ${groupModalSlots.length} record(s) and cannot be undone.`,
      confirmLabel: "Delete Permanently",
      cancelLabel: "Cancel",
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsGroupDeleting(true);

    let failed = 0;
    let firstFailureMessage: string | null = null;

    for (const slot of groupModalSlots) {
      try {
        const response = await fetch(`/api/admin/blocked-slots/${slot._id}`, {
          method: "DELETE",
        });

        if (!response.ok && response.status !== 404) {
          failed += 1;
          if (!firstFailureMessage) {
            const body = (await response.json().catch(() => null)) as
              | { error?: { message?: string } }
              | null;
            firstFailureMessage = body?.error?.message ?? "Failed to delete one or more blocked records";
          }
        }
      } catch {
        failed += 1;
        if (!firstFailureMessage) {
          firstFailureMessage = "Network error while deleting blocked records";
        }
      }
    }

    await loadData();

    if (failed > 0) {
      setError(firstFailureMessage ?? "Failed to delete one or more blocked records");
      setSuccessMessage(`Deleted ${groupModalSlots.length - failed} record(s). ${failed} failed.`);
    } else {
      setSuccessMessage(`Deleted ${groupModalSlots.length} blocked record(s) permanently.`);
      setGroupModalKey(null);
    }

    setIsGroupDeleting(false);
  }

  async function handleSessionAction(slot: BlockedSlot, action: "begin" | "end"): Promise<void> {
    setError(null);
    setSuccessMessage(null);
    setSessionActionId(slot._id);

    if (action === "begin" && slot.bookingDate > today) {
      setSessionActionId(null);
      setError("Cannot begin a future scheduled session yet.");
      return;
    }

    try {
      const response = await fetch(`/api/admin/blocked-slots/${slot._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string }; data?: Partial<BlockedSlot> & { _id?: string; id?: string } }
        | null;

      if (!response.ok) {
        if (response.status === 404) {
          setError("This blocked record no longer exists. Refreshing list...");
          await loadData();
          return;
        }

        throw new Error(body?.error?.message ?? "Failed to update session");
      }

      const updatedSlot = body?.data;
      const optimisticNow = new Date().toISOString();

      setBlockedSlots((prev) =>
        prev.map((item) => {
          if (String(item._id) !== String(slot._id)) {
            return item;
          }

          const merged = {
            ...item,
            ...(updatedSlot ?? {}),
          };

          if (action === "begin") {
            return {
              ...merged,
              sessionStartedAt: merged.sessionStartedAt ?? optimisticNow,
              sessionEndedAt: null,
              actualDurationHours: null,
              chargedAmount: null,
            };
          }

          return {
            ...merged,
            sessionEndedAt: merged.sessionEndedAt ?? optimisticNow,
          };
        })
      );

      setSuccessMessage(action === "begin" ? "Session started." : "Session ended and payment calculated.");
      await loadData();
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : "Failed to update session");
    } finally {
      setSessionActionId(null);
    }
  }

  async function handleGroupSessionAction(action: "begin" | "end"): Promise<void> {
    setError(null);
    setSuccessMessage(null);
    setGroupSessionAction(action);

    const currentTime = currentTimeHHMM();
    const beginCandidates = groupModalMonitorSlots.filter((slot) => !slot.sessionStartedAt && slot.bookingDate <= today);
    const targets =
      action === "begin"
        ? beginCandidates.filter(
            (slot) =>
              (slot.bookingDate < today || currentTime >= slot.startTime)
          )
        : groupModalMonitorSlots.filter((slot) => !!slot.sessionStartedAt && !slot.sessionEndedAt);

    if (targets.length === 0) {
      setGroupSessionAction(null);
      if (action === "begin") {
        if (beginCandidates.some((slot) => slot.bookingDate === today)) {
          const nextTodayStart = beginCandidates
            .filter((slot) => slot.bookingDate === today && currentTime < slot.startTime)
            .map((slot) => slot.startTime)
            .sort()[0];

          setPopupMessage(
            nextTodayStart
              ? `Cannot begin yet. Earliest configured start time is ${formatTime12h(nextTodayStart)}.`
              : "Cannot begin yet. Please wait for the configured session start time."
          );
          return;
        }

        if (groupModalMonitorSlots.some((slot) => !slot.sessionStartedAt && slot.bookingDate > today)) {
          setPopupMessage("Cannot begin yet. This group is scheduled for a future date.");
          return;
        }
      }
      setError(action === "begin" ? "No eligible records to begin." : "No running records to stop.");
      return;
    }

    const actionLabel = action === "begin" ? "start" : "stop";
    const confirmed = await requestConfirmation({
      title: `${action === "begin" ? "Start" : "Stop"} Group Sessions`,
      message: `This will ${actionLabel} ${targets.length} record(s) for this group. Continue?`,
      confirmLabel: action === "begin" ? "Start Sessions" : "Stop Sessions",
      cancelLabel: "Cancel",
      danger: action !== "begin",
    });

    if (!confirmed) {
      setGroupSessionAction(null);
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    let firstFailureReason: string | null = null;

    for (const target of targets) {
      try {
        const response = await fetch(`/api/admin/blocked-slots/${target._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string }; data?: Partial<BlockedSlot> & { _id?: string; id?: string } }
          | null;

        if (!response.ok) {
          failureCount += 1;
          if (!firstFailureReason) {
            firstFailureReason = body?.error?.message ?? `Request failed with status ${response.status}`;
          }
          continue;
        }

        const updatedSlot = body?.data;
        if (action === "begin" && !updatedSlot?.sessionStartedAt) {
          failureCount += 1;
          if (!firstFailureReason) {
            firstFailureReason = "Begin request succeeded but session did not start on server.";
          }
          continue;
        }

        if (action === "end" && !updatedSlot?.sessionEndedAt) {
          failureCount += 1;
          if (!firstFailureReason) {
            firstFailureReason = "Stop request succeeded but session did not end on server.";
          }
          continue;
        }

        const optimisticNow = new Date().toISOString();

        setBlockedSlots((prev) =>
          prev.map((item) => {
            if (String(item._id) !== String(target._id)) {
              return item;
            }

            const merged = {
              ...item,
              ...(updatedSlot ?? {}),
            };

            if (action === "begin") {
              return {
                ...merged,
                sessionStartedAt: merged.sessionStartedAt ?? optimisticNow,
                sessionEndedAt: null,
                actualDurationHours: null,
                chargedAmount: null,
              };
            }

            return {
              ...merged,
              sessionEndedAt: merged.sessionEndedAt ?? optimisticNow,
            };
          })
        );

        successCount += 1;
      } catch {
        failureCount += 1;
        if (!firstFailureReason) {
          firstFailureReason = "Network error while updating group records.";
        }
      }
    }

    await loadData();

    if (successCount > 0 && failureCount > 0) {
      setSuccessMessage(
        `${action === "begin" ? "Started" : "Stopped"} ${successCount} record(s). ${failureCount} failed.`
      );
      if (firstFailureReason) {
        setError(firstFailureReason);
      }
    } else if (successCount > 0) {
      setSuccessMessage(`${action === "begin" ? "Started" : "Stopped"} ${successCount} record(s).`);
    } else {
      setError(firstFailureReason ?? `Unable to ${action} records right now.`);
    }

    setGroupSessionAction(null);
  }

  function handleOpenGroupEdit(): void {
    if (!groupModalKey || groupModalSlots.length === 0) {
      return;
    }

    const editableSlot = groupModalSlots.find((slot) => !slot.sessionStartedAt) ?? groupModalSlots[0];
    const weekdaySourceSlot =
      groupModalSlots.find((slot) => !slot.sessionStartedAt && Array.isArray(slot.recurrenceWeekdays))
      ?? groupModalSlots.find((slot) => Array.isArray(slot.recurrenceWeekdays));
    const selectedCourtIds = Array.from(new Set(groupModalSlots.map((slot) => slot.courtId)));
    setGroupEditKey(groupModalKey);
    setGroupEditForm({
      courtIds: selectedCourtIds,
      groupName: editableSlot.groupName ?? "",
      groupRepresentative: editableSlot.groupRepresentative ?? "",
      bookingDate: editableSlot.bookingDate,
      recurrenceWeekdays: Array.isArray(weekdaySourceSlot?.recurrenceWeekdays)
        ? Array.from(new Set(weekdaySourceSlot.recurrenceWeekdays)).sort((a, b) => a - b)
        : [],
      startTime: editableSlot.startTime,
      endTime: editableSlot.endTime,
      reason: editableSlot.reason ?? "",
    });
    setGroupEditError(null);
  }

  async function handleGroupEditSave(): Promise<void> {
    if (!groupEditKey) return;

    if (groupEditForm.groupName.trim().length < 2) {
      setGroupEditError("Group name must be at least 2 characters");
      return;
    }

    if (groupEditForm.groupRepresentative.trim().length < 2) {
      setGroupEditError("Group representative must be at least 2 characters");
      return;
    }

    if (!groupEditForm.bookingDate) {
      setGroupEditError("Booking date is required");
      return;
    }

    if (!isValidBlockedSlotTimeRange(groupEditForm.startTime, groupEditForm.endTime)) {
      setGroupEditError("End time must be after start time unless it ends at 12:00 AM");
      return;
    }

    if (groupEditForm.courtIds.length === 0) {
      setGroupEditError("Select at least one court");
      return;
    }

    const targets = blockedSlots.filter((slot) => blockedGroupKey(slot) === groupEditKey);

    if (targets.length === 0) {
      setGroupEditError("No records found for this group.");
      return;
    }

    setIsGroupEditSaving(true);
    setGroupEditError(null);

    let failed = 0;
    let firstFailureMessage: string | null = null;

    const lockedCourtIds = new Set(targets.filter((slot) => !!slot.sessionStartedAt).map((slot) => slot.courtId));
    const selectedCourtIds = Array.from(new Set([...groupEditForm.courtIds, ...Array.from(lockedCourtIds)]));
    const selectedCourtIdSet = new Set(selectedCourtIds);

    for (const target of targets) {
      try {
        if (!selectedCourtIdSet.has(target.courtId)) {
          const deleteResponse = await fetch(`/api/admin/blocked-slots/${target._id}`, {
            method: "DELETE",
          });

          if (!deleteResponse.ok) {
            failed += 1;
            if (!firstFailureMessage) {
              const body = (await deleteResponse.json().catch(() => null)) as
                | { error?: { message?: string } }
                | null;
              firstFailureMessage = body?.error?.message ?? "Failed to remove one or more unselected courts";
            }
          }

          continue;
        }

        const response = await fetch(`/api/admin/blocked-slots/${target._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            target.sessionStartedAt
              ? {
                  groupName: groupEditForm.groupName.trim(),
                  groupRepresentative: groupEditForm.groupRepresentative.trim(),
                  recurrenceWeekdays: groupEditForm.recurrenceWeekdays.length > 0 ? groupEditForm.recurrenceWeekdays : null,
                  reason: groupEditForm.reason.trim() || null,
                }
              : {
                  groupName: groupEditForm.groupName.trim(),
                  groupRepresentative: groupEditForm.groupRepresentative.trim(),
                  bookingDate: groupEditForm.bookingDate,
                  recurrenceWeekdays: groupEditForm.recurrenceWeekdays.length > 0 ? groupEditForm.recurrenceWeekdays : null,
                  startTime: groupEditForm.startTime,
                  endTime: groupEditForm.endTime,
                  reason: groupEditForm.reason.trim() || null,
                }
          ),
        });

        if (!response.ok) {
          failed += 1;
          if (!firstFailureMessage) {
            const body = (await response.json().catch(() => null)) as
              | { error?: { message?: string } }
              | null;
            firstFailureMessage = body?.error?.message ?? "Failed to update one or more group records";
          }
        }
      } catch {
        failed += 1;
        if (!firstFailureMessage) {
          firstFailureMessage = "Network error while updating group records";
        }
      }
    }

    const existingCourtIds = new Set(targets.map((slot) => slot.courtId));
    for (const courtId of selectedCourtIds) {
      if (existingCourtIds.has(courtId)) {
        continue;
      }

      try {
        const createResponse = await fetch("/api/admin/blocked-slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courtIds: [courtId],
            bookingDates: [groupEditForm.bookingDate],
            recurrenceWeekdays: groupEditForm.recurrenceWeekdays.length > 0 ? groupEditForm.recurrenceWeekdays : undefined,
            startTime: groupEditForm.startTime,
            endTime: groupEditForm.endTime,
            groupName: groupEditForm.groupName.trim(),
            groupRepresentative: groupEditForm.groupRepresentative.trim(),
            reason: groupEditForm.reason.trim() || undefined,
          }),
        });

        if (!createResponse.ok) {
          failed += 1;
          if (!firstFailureMessage) {
            const body = (await createResponse.json().catch(() => null)) as
              | { error?: { message?: string } }
              | null;
            firstFailureMessage = body?.error?.message ?? "Failed to add one or more selected courts";
          }
        }
      } catch {
        failed += 1;
        if (!firstFailureMessage) {
          firstFailureMessage = "Network error while adding selected courts";
        }
      }
    }

    if (failed > 0) {
      setGroupEditError(firstFailureMessage ?? "Failed to update one or more group records");
    } else {
      setSuccessMessage("Blocking details updated.");
      setGroupEditKey(null);
    }

    await loadData();
    setIsGroupEditSaving(false);
  }

  return (
    <div className="w-full" style={{ maxWidth: "1900px" }}>
      {groupEditKey ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#1F2937] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Edit Blocking Details</h3>
                <p className="mt-0.5 text-xs text-gray-400">Applies to all records in this group</p>
              </div>
              <button
                type="button"
                onClick={() => setGroupEditKey(null)}
                className="rounded border border-gray-600 bg-[#111827] px-2.5 py-1 text-xs font-semibold text-gray-300 hover:border-gray-500"
              >
                Cancel
              </button>
            </div>

            {groupEditError ? (
              <div className="mb-3 rounded border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                {groupEditError}
              </div>
            ) : null}

            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-400">Courts Involved</label>
                <div className="max-h-36 overflow-y-auto rounded border border-gray-600 bg-[#111827] px-2 py-2">
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {courts.map((court) => {
                      const checked = groupEditForm.courtIds.includes(court._id);
                      const isLocked = groupModalLockedCourtIds.includes(court._id);
                      return (
                        <label key={`group-edit-court-${court._id}`} className="flex items-center gap-2 text-xs text-gray-200">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isLocked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setGroupEditForm((prev) => ({
                                ...prev,
                                courtIds: isChecked
                                  ? Array.from(new Set([...prev.courtIds, court._id]))
                                  : prev.courtIds.filter((id) => id !== court._id),
                              }));
                            }}
                          />
                          <span>{court.name}{isLocked ? " (locked: started session)" : ""}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">Group Name</label>
                <input
                  type="text"
                  value={groupEditForm.groupName}
                  onChange={(e) => setGroupEditForm((prev) => ({ ...prev, groupName: e.target.value }))}
                  maxLength={120}
                  className="w-full rounded border border-gray-600 bg-[#111827] px-2 py-1.5 text-sm text-gray-100 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Representative</label>
                <input
                  type="text"
                  value={groupEditForm.groupRepresentative}
                  onChange={(e) => setGroupEditForm((prev) => ({ ...prev, groupRepresentative: e.target.value }))}
                  maxLength={120}
                  className="w-full rounded border border-gray-600 bg-[#111827] px-2 py-1.5 text-sm text-gray-100 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">Booking Date</label>
                <input
                  type="date"
                  value={groupEditForm.bookingDate}
                  onChange={(e) => setGroupEditForm((prev) => ({ ...prev, bookingDate: e.target.value }))}
                  className="w-full rounded border border-gray-600 bg-[#111827] px-2 py-1.5 text-sm text-gray-100 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">Recurring Weekdays (optional)</label>
                <p className="mb-1 text-[11px] text-gray-500">Select days like Tue/Thu for recurrence. Leave empty for daily recurrence.</p>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {[
                    { value: 0, label: "Sun" },
                    { value: 1, label: "Mon" },
                    { value: 2, label: "Tue" },
                    { value: 3, label: "Wed" },
                    { value: 4, label: "Thu" },
                    { value: 5, label: "Fri" },
                    { value: 6, label: "Sat" },
                  ].map((weekday) => {
                    const checked = groupEditForm.recurrenceWeekdays.includes(weekday.value);
                    return (
                      <label
                        key={`group-edit-weekday-${weekday.value}`}
                        className="flex items-center gap-2 rounded border border-gray-700 px-2 py-1 text-xs text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setGroupEditForm((prev) => ({
                              ...prev,
                              recurrenceWeekdays: isChecked
                                ? Array.from(new Set([...prev.recurrenceWeekdays, weekday.value])).sort((a, b) => a - b)
                                : prev.recurrenceWeekdays.filter((day) => day !== weekday.value),
                            }));
                          }}
                        />
                        <span>{weekday.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Start Time</label>
                  <input
                    type="time"
                    value={groupEditForm.startTime}
                    onChange={(e) => setGroupEditForm((prev) => ({ ...prev, startTime: e.target.value }))}
                    className="w-full rounded border border-gray-600 bg-[#111827] px-2 py-1.5 text-sm text-gray-100 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">End Time</label>
                  <input
                    type="time"
                    value={groupEditForm.endTime}
                    onChange={(e) => setGroupEditForm((prev) => ({ ...prev, endTime: e.target.value }))}
                    className="w-full rounded border border-gray-600 bg-[#111827] px-2 py-1.5 text-sm text-gray-100 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">Reason (optional)</label>
                <input
                  type="text"
                  value={groupEditForm.reason}
                  onChange={(e) => setGroupEditForm((prev) => ({ ...prev, reason: e.target.value }))}
                  maxLength={200}
                  className="w-full rounded border border-gray-600 bg-[#111827] px-2 py-1.5 text-sm text-gray-100 focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGroupEditKey(null)}
                className="rounded border border-gray-600 bg-[#111827] px-3.5 py-1.5 text-xs font-semibold text-gray-300 hover:border-gray-500"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGroupEditSaving}
                onClick={() => void handleGroupEditSave()}
                className="rounded bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isGroupEditSaving ? "Saving..." : "Save Blocking Details"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {popupMessage ? (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-red-500/40 bg-[#1F2937] p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-0.5 text-xl text-red-500">⚠</span>
              <div>
                <p className="mb-1 text-sm font-semibold text-red-400">Action Failed</p>
                <p className="text-sm text-gray-300">{popupMessage}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPopupMessage(null)}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={Boolean(confirmDialog)}
        overlayClassName="z-75"
        title={confirmDialog?.title ?? "Confirm Action"}
        message={confirmDialog?.message ?? ""}
        cancelLabel={confirmDialog?.cancelLabel ?? "Cancel"}
        confirmLabel={confirmDialog?.confirmLabel ?? "Confirm"}
        danger={confirmDialog?.danger ?? false}
        onCancel={() => closeConfirmDialog(false)}
        onConfirm={() => closeConfirmDialog(true)}
      />

      {groupModalKey ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl rounded-xl bg-[#1F2937] p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Group Session Records</h3>
                <p className="mt-1 text-sm text-gray-300">
                  {groupModalIdentity?.groupName} • {groupModalIdentity?.groupRepresentative}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenGroupEdit}
                    disabled={isGroupDeleting}
                    className="rounded border border-amber-600/50 bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    Edit Blocking Details
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteGroup()}
                    disabled={isGroupDeleting}
                    className="rounded border border-red-600/50 bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {isGroupDeleting ? "Deleting..." : "Delete Permanently"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupModalKey(null)}
                    disabled={isGroupDeleting}
                    className="rounded border border-gray-600 bg-[#111827] px-2.5 py-1 text-xs font-semibold text-gray-300 hover:border-gray-500"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-gray-700 bg-[#111827] p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-100">Daily Summary</h4>
                  <div className="rounded border border-cyan-700/40 bg-cyan-950/15 px-2 py-1 text-[11px] text-cyan-100">
                    Recurring Days: <span className="font-semibold">{groupModalRecurringDayLabels.join(", ")}</span>
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded border border-cyan-700/40 bg-cyan-950/15 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-cyan-200/80">Closed Sessions</div>
                    <div className="text-sm font-semibold text-cyan-100">{groupModalClosedCount}</div>
                  </div>
                  <div className="rounded border border-emerald-700/40 bg-emerald-950/15 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">Total Revenue</div>
                    <div className="text-sm font-semibold text-emerald-300">
                      PHP {groupModalRevenueTotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {groupModalDailyBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-400">No daily records yet for this group.</p>
                ) : (
                  <div className="max-h-[55vh] overflow-x-hidden overflow-y-auto">
                    <table className="w-full text-xs sm:text-sm table-fixed">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b border-gray-700">
                          <th className="text-left px-2 py-1.5 font-medium">Date</th>
                          <th className="text-right px-2 py-1.5 font-medium">Closed Sessions</th>
                          <th className="text-right px-2 py-1.5 font-medium">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupModalDailyBreakdown.map((entry) => (
                          <tr key={`${groupModalKey}-${entry.date}`} className="border-b border-gray-700/60 last:border-0">
                            <td className="px-2 py-1.5 text-gray-100">{entry.date}</td>
                            <td className="px-2 py-1.5 text-right text-gray-300">{entry.closedCount}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-emerald-300">
                              PHP {entry.revenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-gray-700 bg-[#111827] p-3">
                <h4 className="mb-2 text-sm font-semibold text-gray-100">Session Actions</h4>
                {error ? (
                  <div className="mb-2 rounded border border-red-700/50 bg-red-900/20 px-2 py-1 text-xs text-red-300">
                    {error}
                  </div>
                ) : null}
                {successMessage ? (
                  <div className="mb-2 rounded border border-emerald-700/50 bg-emerald-900/20 px-2 py-1 text-xs text-emerald-300">
                    {successMessage}
                  </div>
                ) : null}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={groupSessionAction !== null}
                    onClick={() => void handleGroupSessionAction("begin")}
                    className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {groupSessionAction === "begin" ? "Starting..." : `Begin All (${groupBeginEligibleCount})`}
                  </button>
                  <button
                    type="button"
                    disabled={groupSessionAction !== null || groupEndEligibleCount === 0}
                    onClick={() => void handleGroupSessionAction("end")}
                    className="px-2.5 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
                  >
                    {groupSessionAction === "end" ? "Stopping..." : `Stop All (${groupEndEligibleCount})`}
                  </button>
                </div>
                {groupModalMonitorSlots.length === 0 ? (
                  <p className="text-sm text-gray-400">No active session records to monitor for this group.</p>
                ) : (
                  <div className="max-h-[65vh] overflow-x-hidden overflow-y-auto">
                    <table className="w-full text-xs sm:text-sm table-fixed">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b border-gray-700">
                          <th className="text-left px-2 py-1.5 font-medium">Court</th>
                          <th className="text-left px-2 py-1.5 font-medium">Date</th>
                          <th className="text-left px-2 py-1.5 font-medium">Start</th>
                          <th className="text-left px-2 py-1.5 font-medium">End</th>
                          <th className="text-left px-2 py-1.5 font-medium">Session</th>
                          <th className="text-right px-2 py-1.5 font-medium">Payment</th>
                          <th className="text-left px-2 py-1.5 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupModalMonitorSlots.map((slot) => (
                          <tr key={`modal-action-${slot._id}`} className="border-b border-gray-700/60 last:border-0">
                            <td className="px-2 py-1.5 text-gray-100 wrap-break-word">{courtNameById[slot.courtId] ?? slot.courtId}</td>
                            <td className="px-2 py-1.5 text-gray-100 wrap-break-word">{slot.bookingDate}</td>
                            <td className="px-2 py-1.5 text-gray-300">{formatTime12h(slot.startTime)}</td>
                            <td className="px-2 py-1.5 text-gray-300">{formatTime12h(slot.endTime)}</td>
                            <td className="px-2 py-1.5 text-gray-300 wrap-break-word">
                              {blockedSlotSessionLabel(slot, today) === "scheduled"
                                ? "Scheduled"
                                : blockedSlotSessionLabel(slot, today) === "not_started"
                                  ? "Not started"
                                  : blockedSlotSessionLabel(slot, today) === "running"
                                    ? `Running (${formatElapsedDuration(nowTick - new Date(slot.sessionStartedAt as string).getTime())})`
                                    : "Closed"}
                            </td>
                            <td className="px-2 py-1.5 text-right text-emerald-300 font-semibold wrap-break-word">
                              {typeof slot.chargedAmount === "number"
                                ? `PHP ${slot.chargedAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                                : "-"}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] text-gray-400">Use Begin All / Stop All</span>

                                <button
                                  type="button"
                                  onClick={() => void handleDeleteBlock(slot._id)}
                                  className="px-2 py-0.5 rounded bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <div className="text-lg font-semibold text-gray-200 mb-3 border-b border-gray-700 pb-2">
        Booking Blocks
        <p className="mt-1 text-sm text-slate-500 font-normal">
          Prevent selected courts from being booked at specific times.
        </p>
      </div>

      <form
        onSubmit={handleCreateBlock}
        className="mb-4 grid gap-2 rounded-lg border border-gray-700 bg-[#111827] p-3 md:grid-cols-5"
      >
        {bookingDates.length * form.courtIds.length > 1 ? (
          <div className="md:col-span-5 rounded border border-cyan-700/40 bg-cyan-950/15 px-3 py-2 text-xs text-cyan-100">
            Creating <span className="font-semibold">{bookingDates.length * form.courtIds.length}</span> record(s)
            ({bookingDates.length} date{bookingDates.length !== 1 ? "s" : ""} x {form.courtIds.length} court{form.courtIds.length !== 1 ? "s" : ""}).
            <span className="ml-1 text-cyan-200/90">This is recurring or multi-court, not a loop.</span>
          </div>
        ) : null}

        {form.mode !== "daily" ? (
          <div className="md:col-span-5 rounded border border-slate-300 bg-[#1F2937] p-2">
            <span className="mb-2 block text-sm font-medium text-gray-200">Weekdays to block (optional)</span>
            <p className="mb-2 text-xs text-gray-400">
              Leave all unchecked to include every day in the selected month/year.
            </p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
              {[
                { value: 0, label: "Sun" },
                { value: 1, label: "Mon" },
                { value: 2, label: "Tue" },
                { value: 3, label: "Wed" },
                { value: 4, label: "Thu" },
                { value: 5, label: "Fri" },
                { value: 6, label: "Sat" },
              ].map((weekday) => {
                const checked = form.selectedWeekdays.includes(weekday.value);
                return (
                  <label key={`weekday-${weekday.value}`} className="flex items-center gap-2 rounded border border-gray-700 px-2 py-1 text-xs text-gray-200">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          selectedWeekdays: isChecked
                            ? Array.from(new Set([...prev.selectedWeekdays, weekday.value])).sort((a, b) => a - b)
                            : prev.selectedWeekdays.filter((day) => day !== weekday.value),
                        }));
                      }}
                    />
                    <span>{weekday.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="md:col-span-5 rounded border border-slate-300 bg-[#1F2937] p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-200">Select courts ({form.courtIds.length})</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-2 py-0.5 rounded border border-slate-300 text-xs font-semibold text-gray-200 hover:bg-slate-100"
                onClick={() => setForm((prev) => ({ ...prev, courtIds: courts.map((court) => court._id) }))}
              >
                Select all
              </button>
              <button
                type="button"
                className="px-2 py-0.5 rounded border border-slate-300 text-xs font-semibold text-gray-200 hover:bg-slate-100"
                onClick={() => setForm((prev) => ({ ...prev, courtIds: [] }))}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid max-h-32 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {courts.map((court) => {
              const checked = form.courtIds.includes(court._id);
              return (
                <label key={court._id} className="flex items-center gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      setForm((prev) => ({
                        ...prev,
                        courtIds: isChecked
                          ? [...prev.courtIds, court._id]
                          : prev.courtIds.filter((id) => id !== court._id),
                      }));
                    }}
                  />
                  <span>{court.name}</span>
                </label>
              );
            })}
          </div>
        </div>

        <select
          value={form.mode}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              mode: e.target.value as NewBlockForm["mode"],
            }))
          }
          className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
          required
        >
          <option value="daily">Daily (single date)</option>
          <option value="monthly">Monthly recurring (all remaining days in month)</option>
          <option value="yearly">Yearly recurring (all remaining days in year)</option>
        </select>

        {form.mode === "daily" ? (
          <input
            type="date"
            value={form.bookingDate}
            onChange={(e) => setForm((prev) => ({ ...prev, bookingDate: e.target.value }))}
            className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
            required
          />
        ) : form.mode === "monthly" ? (
          <input
            type="month"
            value={form.bookingMonth}
            onChange={(e) => setForm((prev) => ({ ...prev, bookingMonth: e.target.value }))}
            className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
            required
          />
        ) : (
          <input
            type="number"
            value={form.bookingYear}
            min={new Date().getFullYear()}
            max={new Date().getFullYear() + 10}
            onChange={(e) => setForm((prev) => ({ ...prev, bookingYear: e.target.value }))}
            className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
            placeholder="Year"
            required
          />
        )}

        <input
          type="time"
          value={form.startTime}
          onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
          min={bookingDates.includes(today) ? nowTime : undefined}
          className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
          required
        />

        <input
          type="time"
          value={form.endTime}
          onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
          className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
          required
        />

        <input
          type="text"
          value={form.groupName}
          onChange={(e) => setForm((prev) => ({ ...prev, groupName: e.target.value }))}
          className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
          placeholder="Group name"
          maxLength={120}
          required
        />

        <input
          type="text"
          value={form.groupRepresentative}
          onChange={(e) => setForm((prev) => ({ ...prev, groupRepresentative: e.target.value }))}
          className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
          placeholder="Group representative"
          maxLength={120}
          required
        />

        <input
          type="text"
          value={form.reason}
          onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
          className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-2 text-sm"
          placeholder="Reason (optional)"
          maxLength={200}
        />

        <button
          type="submit"
          disabled={isSaving || isLoading}
          className="md:col-span-5 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-semibold text-white hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Saving blocks..." : "Add blocked slot(s)"}
        </button>
      </form>

      {isLoading ? (
        <p className="text-[#10B981] font-medium mb-4">Loading...</p>
      ) : null}

      {error ? (
        <p className="text-red-400 bg-red-900/20 border border-red-700/40 rounded-md px-4 py-2 mb-4 font-medium">{error}</p>
      ) : null}

      {successMessage ? (
        <p className="text-emerald-400 bg-emerald-900/20 border border-emerald-700/40 rounded-md px-4 py-2 mb-4 font-medium">{successMessage}</p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-400">
          Showing {groupedBlockedRows.length} group record{groupedBlockedRows.length !== 1 ? "s" : ""} ({filteredBlockedSlots.length} session record{filteredBlockedSlots.length !== 1 ? "s" : ""})
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Session Day:</label>
          <select
            value={sessionRecordDate}
            onChange={(e) => setSessionRecordDate(e.target.value)}
            className="rounded border border-gray-600 bg-[#1F2937] text-gray-200 px-2 py-1 text-sm"
          >
            <option value="all">All days</option>
            {sessionRecordDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded border border-cyan-700/40 bg-cyan-950/15 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-cyan-200/80">Session Day</div>
          <div className="text-sm font-semibold text-cyan-100">{sessionRecordDate === "all" ? "All days" : sessionRecordDate}</div>
        </div>
        <div className="rounded border border-cyan-700/40 bg-cyan-950/15 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-cyan-200/80">Group View</div>
          <div className="text-sm font-semibold text-cyan-100">Click a group in table to view modal</div>
        </div>
        <div className="rounded border border-cyan-700/40 bg-cyan-950/15 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-cyan-200/80">Closed Sessions</div>
          <div className="text-sm font-semibold text-cyan-100">{completedFilteredSessions.length}</div>
        </div>
      </div>


      <div className="overflow-x-hidden">
        <table className="w-full border-collapse bg-[#1F2937] rounded-xl shadow text-xs sm:text-sm table-fixed">
          <thead>
            <tr className="bg-[#0B0F1A] text-gray-400">
              <th className="px-1.5 py-1.5 font-semibold text-left">Group</th>
              <th className="px-1.5 py-1.5 font-semibold text-left">Representative</th>
              <th className="px-1.5 py-1.5 font-semibold text-left">Records</th>
              <th className="px-1.5 py-1.5 font-semibold text-left">Courts</th>
              <th className="px-1.5 py-1.5 font-semibold text-left">Session</th>
              <th className="px-1.5 py-1.5 font-semibold text-right">Payment</th>
              <th className="px-1.5 py-1.5 font-semibold text-left">Latest Created</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && groupedBlockedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center italic text-slate-500">
                  No blocked group records found for the selected day.
                </td>
              </tr>
            ) : null}
            {groupedBlockedRows.map((group) => (
              <tr key={group.groupKey} className="border-b border-gray-700 last:border-b-0">
                <td className="px-1.5 py-1.5 wrap-break-word">
                  <button
                    type="button"
                    onClick={() => setGroupModalKey(group.groupKey)}
                    className="text-sm font-semibold text-cyan-300 underline-offset-2 hover:underline"
                    title="Open group records"
                  >
                    {group.groupName}
                  </button>
                </td>
                <td className="px-1.5 py-1.5 text-gray-100 wrap-break-word">{group.groupRepresentative}</td>
                <td className="px-1.5 py-1.5 text-gray-100 wrap-break-word">{group.slots.length}</td>
                <td className="px-1.5 py-1.5 text-gray-100 wrap-break-word">{group.courts.join(", ")}</td>
                <td className="px-1.5 py-1.5 text-gray-100 wrap-break-word">
                  <div className="text-xs text-gray-300">
                    {group.runningCount > 0 ? <div className="text-emerald-400">Running: {group.runningCount}</div> : null}
                    {group.notStartedCount > 0 ? <div>Not started: {group.notStartedCount}</div> : null}
                    {group.scheduledCount > 0 ? <div className="text-amber-300">Scheduled: {group.scheduledCount}</div> : null}
                    {group.closedCount > 0 ? <div className="text-cyan-300">Closed: {group.closedCount}</div> : null}
                    {group.runningCount === 0 && group.notStartedCount === 0 && group.scheduledCount === 0 && group.closedCount === 0 ? (
                      <div className="text-gray-500">No session data</div>
                    ) : null}
                  </div>
                </td>
                <td className="px-1.5 py-1.5 text-right wrap-break-word">
                  {group.totalRevenue > 0 ? (
                    <span className="text-emerald-400 font-semibold">
                      PHP {group.totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                    </span>
                  ) : <span className="text-xs text-gray-500">-</span>}
                </td>
                <td className="px-1.5 py-1.5 text-gray-100 wrap-break-word">{new Date(group.latestCreatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
