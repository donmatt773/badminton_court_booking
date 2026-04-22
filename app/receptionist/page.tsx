"use client";
import React, { useEffect, useRef, useState, FC } from 'react';
import { useRouter } from 'next/navigation';


import { BookingTable, type StatusTab } from './components/booking-table';

import { CourtTable } from './components/court-table';
import { BlockedSlotManager } from './components/blocked-slot-manager';
import { ScheduleCalendar } from './components/schedule-calendar';
import { WalkInBookingModal } from './components/walk-in-booking-modal';
import { ProfileTab } from './components/profile-tab';

const CourtViewer: FC = () => (
  <div
    className="bg-[#111827] rounded-xl shadow-lg p-4 w-full"
  >
    <div className="text-lg font-semibold text-gray-200 mb-3 border-b border-gray-700 pb-2">Courts</div>
    <CourtTable />
  </div>
);
const SchedulesViewer: FC = () => (
  <div
    className="bg-[#111827] rounded-xl shadow-lg p-4 w-full"
  >
    <div className="text-lg font-semibold text-gray-200 mb-3 border-b border-gray-700 pb-2">Schedules Calendar</div>
    <ScheduleCalendar />
  </div>
);

type RevenueBooking = {
  _id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  appliedHourlyRate?: number | null;
  durationHours?: number | null;
  chargedAmount?: number | null;
  pricingSnapshotSource?: string | null;
  status: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  customer?: { name?: string } | null;
};

type RevenueCourt = {
  _id: string;
  name: string;
  price: number;
};

type RevenueBlockedSession = {
  _id: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  sessionStartedAt?: string | null;
  sessionEndedAt?: string | null;
  hourlyRateSnapshot?: number | null;
  actualDurationHours?: number | null;
  chargedAmount?: number | null;
};

function hoursFromTimes(start: string, end: string): number {
  const [sh] = start.split(":").map(Number);
  const [eh] = end.split(":").map(Number);
  return isNaN(sh) || isNaN(eh) ? 0 : Math.max(0, eh - sh);
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const BUSINESS_NAME = "C-One Sports Center";
const BUSINESS_ADDRESS = "Sports Center Complex, Main Road";
const BUSINESS_LOGO_PATH = "/assets/LOGO-NEW-SPORTSCENTER.png";
const PAGE_SIZE = 10;

const PaginationControls: FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-800">
      <p className="text-xs text-gray-500">Page {currentPage} of {totalPages}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded border border-gray-700 bg-[#0B0F1A] px-2.5 py-1 text-xs text-gray-200 hover:border-emerald-500 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded border border-gray-700 bg-[#0B0F1A] px-2.5 py-1 text-xs text-gray-200 hover:border-emerald-500 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
};

function toYearMonth(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 7);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const RevenueViewer: FC<{ staffName: string }> = ({ staffName }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<RevenueBooking[]>([]);
  const [courts, setCourts] = useState<RevenueCourt[]>([]);
  const [blockedSessions, setBlockedSessions] = useState<RevenueBlockedSession[]>([]);
  const [filterMonth, setFilterMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [blockedSessionsPage, setBlockedSessionsPage] = useState(1);
  const [legacyReviewPage, setLegacyReviewPage] = useState(1);
  const [courtRevenuePage, setCourtRevenuePage] = useState(1);
  const [recentTransactionsPage, setRecentTransactionsPage] = useState(1);

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [bRes, cRes, blockedRes] = await Promise.all([
          fetch('/api/admin/bookings', { credentials: 'include' }),
          fetch('/api/admin/courts', { credentials: 'include' }),
          fetch('/api/admin/blocked-slots', { credentials: 'include' }),
        ]);
        if (!bRes.ok || !cRes.ok || !blockedRes.ok) throw new Error('Failed to fetch data');
        const [bBody, cBody, blockedBody] = await Promise.all([bRes.json(), cRes.json(), blockedRes.json()]) as [
          { data?: RevenueBooking[] },
          { data?: RevenueCourt[] },
          { data?: RevenueBlockedSession[] },
        ];
        if (!mounted) return;
        setBookings(bBody.data ?? []);
        setCourts(cBody.data ?? []);
        setBlockedSessions(blockedBody.data ?? []);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load revenue data');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  // Derive available months from booking dates
  const availableMonths = Array.from(
    new Set([
      ...bookings.map((b) => b.bookingDate.slice(0, 7)),
      ...blockedSessions
        .filter((session) => !!session.sessionEndedAt)
        .map((session) => toYearMonth(session.sessionEndedAt as string)),
    ])
  ).sort().reverse();

  const priceMap = Object.fromEntries(courts.map((c) => [c._id, c.price ?? 0]));
  const courtNameMap = Object.fromEntries(courts.map((c) => [c._id, c.name]));

  const paidStatuses = new Set(["PAID", "COMPLETE"]);

  const filtered = bookings.filter(
    (b) => paidStatuses.has(b.status) && b.bookingDate.startsWith(filterMonth)
  );

  const allPaidThisMonth = bookings.filter(
    (b) => paidStatuses.has(b.status) && b.bookingDate.startsWith(filterMonth)
  );

  const reviewableLegacyBookings = allPaidThisMonth.filter(
    (b) => b.pricingSnapshotSource === "backfilled_current_court_rate"
  );

  function calcAmount(b: RevenueBooking): number {
    if (typeof b.chargedAmount === "number") {
      return b.chargedAmount;
    }

    return (priceMap[b.courtId] ?? 0) * hoursFromTimes(b.startTime, b.endTime);
  }

  const totalRevenue = filtered.reduce((sum, b) => sum + calcAmount(b), 0);
  const cashRevenue  = filtered.filter((b) => b.paymentMethod === "cash" || !b.paymentMethod).reduce((sum, b) => sum + calcAmount(b), 0);
  const onlineRevenue = filtered.filter((b) => b.paymentMethod === "online").reduce((sum, b) => sum + calcAmount(b), 0);

  const completedBlockedSessions = blockedSessions.filter(
    (session) =>
      !!session.sessionEndedAt &&
      typeof session.chargedAmount === "number" &&
      toYearMonth(session.sessionEndedAt as string) === filterMonth
  );

  const blockedSessionsRevenue = completedBlockedSessions.reduce(
    (sum, session) => sum + (session.chargedAmount ?? 0),
    0
  );

  const combinedRevenue = totalRevenue + blockedSessionsRevenue;

  // Per-court breakdown
  const courtRevenue: Record<string, { name: string; amount: number; count: number }> = {};
  for (const b of filtered) {
    const id = b.courtId;
    if (!courtRevenue[id]) courtRevenue[id] = { name: courtNameMap[id] ?? id, amount: 0, count: 0 };
    courtRevenue[id].amount += calcAmount(b);
    courtRevenue[id].count += 1;
  }
  const courtRows = Object.values(courtRevenue).sort((a, b) => b.amount - a.amount);

  // Monthly trend (last 6 months)
  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  }).reverse();
  const trend = trendMonths.map((m) => ({
    label: MONTHS[parseInt(m.slice(5, 7)) - 1],
    total: bookings
      .filter((b) => paidStatuses.has(b.status) && b.bookingDate.startsWith(m))
      .reduce((sum, b) => sum + calcAmount(b), 0),
  }));
  const trendMax = Math.max(...trend.map((t) => t.total), 1);

  const [filterYear, filterMonthNum] = filterMonth.split("-");
  const monthLabel = `${MONTHS[parseInt(filterMonthNum) - 1]} ${filterYear}`;

  useEffect(() => {
    setBlockedSessionsPage(1);
    setLegacyReviewPage(1);
    setCourtRevenuePage(1);
    setRecentTransactionsPage(1);
  }, [filterMonth]);

  function paginateRows<RowType>(rows: RowType[], currentPage: number) {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * PAGE_SIZE;

    return {
      currentPage: safePage,
      totalPages,
      rows: rows.slice(startIndex, startIndex + PAGE_SIZE),
    };
  }

  const paginatedBlockedSessions = paginateRows(
    completedBlockedSessions
      .slice()
      .sort((a, b) => new Date(b.sessionEndedAt as string).getTime() - new Date(a.sessionEndedAt as string).getTime()),
    blockedSessionsPage
  );
  const paginatedLegacyReview = paginateRows(reviewableLegacyBookings, legacyReviewPage);
  const paginatedCourtRows = paginateRows(courtRows, courtRevenuePage);
  const paginatedRecentTransactions = paginateRows(allPaidThisMonth, recentTransactionsPage);

  async function loadLogoDataUrl(): Promise<string | null> {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const dataUrl = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Canvas unavailable"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("Logo load failed"));
        img.src = BUSINESS_LOGO_PATH;
      });
      return dataUrl;
    } catch {
      return null;
    }
  }

  async function exportRevenuePdf(): Promise<void> {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF();
    const money = (value: number) => `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

    let y = 16;
    const logoDataUrl = await loadLogoDataUrl();
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 14, 10, 18, 18);
    }

    doc.setFontSize(14);
    doc.text(BUSINESS_NAME, 36, y);
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(BUSINESS_ADDRESS, 36, y + 5);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(16);
    doc.text("Revenue Report", 14, 36);
    doc.setFontSize(10);
    doc.text(`Period: ${monthLabel}`, 14, 42);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 47);
    doc.text(`Generated by: ${staffName || "Receptionist"}`, 14, 52);

    autoTable(doc, {
      startY: 57,
      head: [["Metric", "Value"]],
      body: [
        ["Booking Revenue", money(totalRevenue)],
        ["Blocked Session Revenue", money(blockedSessionsRevenue)],
        ["Combined Revenue", money(combinedRevenue)],
        ["Cash Revenue", money(cashRevenue)],
        ["Online Revenue", money(onlineRevenue)],
        ["Paid Bookings", String(filtered.length)],
        ["Closed Blocked Sessions", String(completedBlockedSessions.length)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [16, 185, 129] },
    });

    const firstTableY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 65;
    autoTable(doc, {
      startY: firstTableY + 8,
      head: [["Court", "Bookings", "Revenue", "Share"]],
      body: courtRows.map((row) => [
        row.name,
        String(row.count),
        money(row.amount),
        `${totalRevenue > 0 ? ((row.amount / totalRevenue) * 100).toFixed(1) : "0.0"}%`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 58, 95] },
    });

    const secondTableY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
    autoTable(doc, {
      startY: secondTableY + 8,
      head: [["Customer", "Court", "Date", "Time", "Method", "Amount"]],
      body: allPaidThisMonth.slice(0, 40).map((b) => [
        b.customer?.name ?? "-",
        courtNameMap[b.courtId] ?? b.courtId,
        b.bookingDate,
        `${b.startTime}-${b.endTime}`,
        b.paymentMethod === "online" ? "Online" : "Cash",
        money(calcAmount(b)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`revenue-${filterMonth}.pdf`);
  }

  async function exportBlockedSessionsRevenuePdf(): Promise<void> {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF();
    const money = (value: number) => `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

    let y = 16;
    const logoDataUrl = await loadLogoDataUrl();
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", 14, 10, 18, 18);
    }

    doc.setFontSize(14);
    doc.text(BUSINESS_NAME, 36, y);
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(BUSINESS_ADDRESS, 36, y + 5);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(16);
    doc.text("Blocked Sessions Revenue Report", 14, 36);
    doc.setFontSize(10);
    doc.text(`Period: ${monthLabel}`, 14, 42);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 47);
    doc.text(`Generated by: ${staffName || "Receptionist"}`, 14, 52);

    autoTable(doc, {
      startY: 57,
      head: [["Metric", "Value"]],
      body: [
        ["Blocked Sessions Revenue", money(blockedSessionsRevenue)],
        ["Closed Sessions", String(completedBlockedSessions.length)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [8, 145, 178] },
    });

    const firstTableY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 65;
    autoTable(doc, {
      startY: firstTableY + 8,
      head: [["Court", "Date", "Session In", "Session Out", "Hours", "Rate", "Amount"]],
      body: completedBlockedSessions
        .slice()
        .sort((a, b) => new Date(b.sessionEndedAt as string).getTime() - new Date(a.sessionEndedAt as string).getTime())
        .map((session) => [
          courtNameMap[session.courtId] ?? session.courtId,
          session.bookingDate,
          new Date(session.sessionStartedAt as string).toLocaleString(),
          new Date(session.sessionEndedAt as string).toLocaleString(),
          (session.actualDurationHours ?? 0).toFixed(2),
          money(session.hourlyRateSnapshot ?? 0),
          money(session.chargedAmount ?? 0),
        ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [6, 95, 110] },
    });

    doc.save(`blocked-sessions-revenue-${filterMonth}.pdf`);
  }

  function exportBlockedSessionsRevenueCsv(): void {
    if (completedBlockedSessions.length === 0) {
      return;
    }

    const escapeCsv = (value: string | number): string => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const rows = [
      ["Court", "Date", "Session In", "Session Out", "Duration Hours", "Rate", "Amount"],
      ...completedBlockedSessions
        .slice()
        .sort((a, b) => new Date(b.sessionEndedAt as string).getTime() - new Date(a.sessionEndedAt as string).getTime())
        .map((session) => [
          courtNameMap[session.courtId] ?? session.courtId,
          session.bookingDate,
          new Date(session.sessionStartedAt as string).toLocaleString(),
          new Date(session.sessionEndedAt as string).toLocaleString(),
          (session.actualDurationHours ?? 0).toFixed(2),
          (session.hourlyRateSnapshot ?? 0).toFixed(2),
          (session.chargedAmount ?? 0).toFixed(2),
        ]),
      ["TOTAL", "", "", "", "", "", blockedSessionsRevenue.toFixed(2)],
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `blocked-sessions-revenue-${filterMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportLegacyRevenueReviewCsv(): void {
    if (reviewableLegacyBookings.length === 0) {
      return;
    }

    const escapeCsv = (value: string | number): string => {
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const rows = [
      ["Customer", "Court", "Date", "Start Time", "End Time", "Duration Hours", "Applied Hourly Rate", "Amount", "Payment Method", "Snapshot Source"],
      ...reviewableLegacyBookings.map((booking) => [
        booking.customer?.name ?? "-",
        courtNameMap[booking.courtId] ?? booking.courtId,
        booking.bookingDate,
        booking.startTime,
        booking.endTime,
        booking.durationHours ?? hoursFromTimes(booking.startTime, booking.endTime),
        booking.appliedHourlyRate ?? 0,
        calcAmount(booking),
        booking.paymentMethod === "online" ? "Online" : "Cash",
        booking.pricingSnapshotSource ?? "-",
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `legacy-revenue-review-${filterMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="bg-[#111827] rounded-xl shadow-lg p-5 w-full"
      style={{ maxWidth: "1280px", minHeight: "calc(100vh - 2rem)" }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-gray-700 pb-3">
        <div>
          <div className="text-lg font-semibold text-gray-200">Revenue Overview</div>
          <div className="text-xs text-gray-500 mt-0.5">Uses stored booking snapshots when available, with fallback only for unsnapshotted records.</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Month:</label>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="text-sm bg-[#0B0F1A] border border-gray-700 text-gray-200 rounded px-2 py-1 focus:outline-none"
          >
            {(availableMonths.length ? availableMonths : [filterMonth]).map((m) => {
              const [y, mo] = m.split("-");
              return (
                <option key={m} value={m}>
                  {MONTHS[parseInt(mo) - 1]} {y}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            onClick={() => setFilterMonth(new Date().toISOString().slice(0, 7))}
            className="text-xs text-emerald-400 hover:underline"
          >
            This month
          </button>
          <button
            type="button"
            onClick={() => void exportRevenuePdf()}
            disabled={loading}
            className="rounded border border-gray-700 bg-[#0B0F1A] px-2.5 py-1 text-xs text-gray-200 hover:border-emerald-500 disabled:opacity-40"
          >
            Export PDF
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-emerald-400">Loading revenue overview…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && !error && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-700 bg-[#0B0F1A] px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-emerald-400">₱{totalRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-gray-500 mt-1">{filtered.length} paid booking{filtered.length !== 1 ? "s" : ""} · {monthLabel}</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-[#0B0F1A] px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">💵 Cash</p>
              <p className="text-2xl font-bold text-yellow-400">₱{cashRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-gray-500 mt-1">{filtered.filter((b) => b.paymentMethod !== "online").length} booking{filtered.filter((b) => b.paymentMethod !== "online").length !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-[#0B0F1A] px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">📱 Online</p>
              <p className="text-2xl font-bold text-blue-400">₱{onlineRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-gray-500 mt-1">{filtered.filter((b) => b.paymentMethod === "online").length} booking{filtered.filter((b) => b.paymentMethod === "online").length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-cyan-700/50 bg-cyan-950/20 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-cyan-300 mb-1">Blocked Sessions Revenue</p>
              <p className="text-2xl font-bold text-cyan-300">₱{blockedSessionsRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-cyan-100/70 mt-1">{completedBlockedSessions.length} closed session{completedBlockedSessions.length !== 1 ? "s" : ""} · {monthLabel}</p>
            </div>
            <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-emerald-300 mb-1">Combined Revenue</p>
              <p className="text-2xl font-bold text-emerald-300">₱{combinedRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-emerald-100/70 mt-1">Booking + blocked sessions</p>
            </div>
          </div>

          <div className="rounded-lg border border-cyan-700/40 bg-cyan-950/10 overflow-hidden">
            <div className="border-b border-cyan-700/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-cyan-200/80">Closed Blocked Sessions</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportBlockedSessionsRevenueCsv}
                  disabled={completedBlockedSessions.length === 0}
                  className="rounded border border-cyan-600/60 bg-cyan-900/30 px-2.5 py-1 text-xs text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-40"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => void exportBlockedSessionsRevenuePdf()}
                  disabled={loading || completedBlockedSessions.length === 0}
                  className="rounded border border-cyan-600/60 bg-cyan-900/30 px-2.5 py-1 text-xs text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-40"
                >
                  Export PDF
                </button>
              </div>
            </div>
            {completedBlockedSessions.length === 0 ? (
              <p className="text-sm text-cyan-100/70 px-4 py-3">No closed blocked sessions for this period.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-130">
                    <thead>
                      <tr className="text-xs text-cyan-100/80 border-b border-cyan-700/30">
                        <th className="text-left px-4 py-2 font-medium">Court</th>
                        <th className="text-left px-4 py-2 font-medium">Date</th>
                        <th className="text-left px-4 py-2 font-medium">Session In</th>
                        <th className="text-left px-4 py-2 font-medium">Session Out</th>
                        <th className="text-right px-4 py-2 font-medium">Hours</th>
                        <th className="text-right px-4 py-2 font-medium">Rate</th>
                        <th className="text-right px-4 py-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedBlockedSessions.rows.map((session) => (
                          <tr key={`blocked-revenue-${session._id}`} className="border-b border-cyan-700/20 last:border-0">
                            <td className="px-4 py-2 text-cyan-50">{courtNameMap[session.courtId] ?? session.courtId}</td>
                            <td className="px-4 py-2 text-cyan-100/80">{session.bookingDate}</td>
                            <td className="px-4 py-2 text-cyan-100/80">{new Date(session.sessionStartedAt as string).toLocaleString()}</td>
                            <td className="px-4 py-2 text-cyan-100/80">{new Date(session.sessionEndedAt as string).toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-cyan-100/80">{(session.actualDurationHours ?? 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right text-cyan-100/80">₱{(session.hourlyRateSnapshot ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-2 text-right font-semibold text-cyan-300">₱{(session.chargedAmount ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  currentPage={paginatedBlockedSessions.currentPage}
                  totalPages={paginatedBlockedSessions.totalPages}
                  onPageChange={setBlockedSessionsPage}
                />
              </>
            )}
          </div>

          {reviewableLegacyBookings.length > 0 && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 overflow-hidden">
              <div className="border-b border-amber-700/40 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-amber-300">Legacy Revenue Review</p>
                  <p className="mt-1 text-sm text-amber-100">
                    {reviewableLegacyBookings.length} paid booking{reviewableLegacyBookings.length !== 1 ? "s" : ""} in {monthLabel} were backfilled using the court price currently stored in the database.
                  </p>
                  <p className="mt-1 text-xs text-amber-200/80">
                    Review these rows if court prices changed after the original payment date.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportLegacyRevenueReviewCsv}
                  className="rounded border border-amber-600/60 bg-amber-900/30 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-900/50"
                >
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-130">
                  <thead>
                    <tr className="text-xs text-amber-200/70 border-b border-amber-700/30">
                      <th className="text-left px-4 py-2 font-medium">Customer</th>
                      <th className="text-left px-4 py-2 font-medium">Court</th>
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-left px-4 py-2 font-medium">Time</th>
                      <th className="text-right px-4 py-2 font-medium">Rate</th>
                      <th className="text-right px-4 py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLegacyReview.rows.map((b) => (
                      <tr key={`legacy-${b._id}`} className="border-b border-amber-700/20 last:border-0">
                        <td className="px-4 py-2 text-amber-50">{b.customer?.name ?? "—"}</td>
                        <td className="px-4 py-2 text-amber-100/80">{courtNameMap[b.courtId] ?? b.courtId}</td>
                        <td className="px-4 py-2 text-amber-100/80">{b.bookingDate}</td>
                        <td className="px-4 py-2 text-amber-100/80">{b.startTime}–{b.endTime}</td>
                        <td className="px-4 py-2 text-right text-amber-100/80">
                          ₱{(b.appliedHourlyRate ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-amber-300">
                          ₱{calcAmount(b).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                currentPage={paginatedLegacyReview.currentPage}
                totalPages={paginatedLegacyReview.totalPages}
                onPageChange={setLegacyReviewPage}
              />
            </div>
          )}

          {/* Monthly trend bar chart */}
          <div className="rounded-lg border border-gray-700 bg-[#0B0F1A] px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">6-Month Trend</p>
            <div className="flex items-end gap-2 h-24">
              {trend.map((t) => {
                const heightPct = (t.total / trendMax) * 100;
                const isCurrent = t.label === MONTHS[parseInt(filterMonthNum) - 1];
                return (
                  <div key={t.label} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] text-gray-400">₱{t.total >= 1000 ? `${(t.total/1000).toFixed(1)}k` : t.total.toFixed(0)}</span>
                    <div className="w-full rounded-t" style={{
                      height: `${Math.max(4, heightPct)}%`,
                      background: isCurrent ? "#10B981" : "#1E3A5F",
                      transition: "height 0.3s",
                    }} />
                    <span className={`text-[10px] ${isCurrent ? "text-emerald-400 font-semibold" : "text-gray-500"}`}>{t.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-court breakdown */}
          <div className="rounded-lg border border-gray-700 bg-[#0B0F1A] overflow-hidden">
            <p className="text-xs uppercase tracking-wide text-gray-500 px-4 py-3 border-b border-gray-700">Revenue by Court</p>
            {courtRows.length === 0 ? (
              <p className="text-sm text-gray-500 px-4 py-3">No paid bookings for this period.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-800">
                      <th className="text-left px-4 py-2 font-medium">Court</th>
                      <th className="text-right px-4 py-2 font-medium">Bookings</th>
                      <th className="text-right px-4 py-2 font-medium">Revenue</th>
                      <th className="text-right px-4 py-2 font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCourtRows.rows.map((row) => (
                      <tr key={row.name} className="border-b border-gray-800 last:border-0">
                        <td className="px-4 py-2 text-gray-200">{row.name}</td>
                        <td className="px-4 py-2 text-right text-gray-400">{row.count}</td>
                        <td className="px-4 py-2 text-right font-semibold text-emerald-400">₱{row.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-2 text-right text-gray-400">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalRevenue > 0 ? (row.amount / totalRevenue) * 100 : 0}%` }} />
                            </div>
                            <span className="text-xs w-9 text-right">{totalRevenue > 0 ? ((row.amount / totalRevenue) * 100).toFixed(0) : 0}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls
                  currentPage={paginatedCourtRows.currentPage}
                  totalPages={paginatedCourtRows.totalPages}
                  onPageChange={setCourtRevenuePage}
                />
              </>
            )}
          </div>

          {/* Recent paid transactions */}
          <div className="rounded-lg border border-gray-700 bg-[#0B0F1A] overflow-hidden">
            <p className="text-xs uppercase tracking-wide text-gray-500 px-4 py-3 border-b border-gray-700">Recent Paid Transactions</p>
            {allPaidThisMonth.length === 0 ? (
              <p className="text-sm text-gray-500 px-4 py-3">No transactions this period.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-130">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-800">
                        <th className="text-left px-4 py-2 font-medium">Customer</th>
                        <th className="text-left px-4 py-2 font-medium">Court</th>
                        <th className="text-left px-4 py-2 font-medium">Date</th>
                        <th className="text-left px-4 py-2 font-medium">Time</th>
                        <th className="text-left px-4 py-2 font-medium">Method</th>
                        <th className="text-right px-4 py-2 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRecentTransactions.rows.map((b) => (
                        <tr key={b._id} className="border-b border-gray-800 last:border-0">
                          <td className="px-4 py-2 text-gray-200">{b.customer?.name ?? "—"}</td>
                          <td className="px-4 py-2 text-gray-400">{courtNameMap[b.courtId] ?? b.courtId}</td>
                          <td className="px-4 py-2 text-gray-400">{b.bookingDate}</td>
                          <td className="px-4 py-2 text-gray-400">{b.startTime}–{b.endTime}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.paymentMethod === "online" ? "bg-blue-900/50 text-blue-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                              {b.paymentMethod === "online" ? "Online" : "Cash"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-emerald-400">
                            ₱{calcAmount(b).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  currentPage={paginatedRecentTransactions.currentPage}
                  totalPages={paginatedRecentTransactions.totalPages}
                  onPageChange={setRecentTransactionsPage}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

type TabKey = 'requests' | 'courts' | 'schedules' | 'blocking' | 'revenue' | 'profile';
interface Tab {
  key: TabKey;
  label: string;
}

type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'RECEPTIONIST';
};

const TABS: Tab[] = [
  { key: 'requests', label: 'Booking Management' },
  { key: 'courts', label: 'Court Viewer' },
  { key: 'schedules', label: 'Schedules Viewer' },
  { key: 'blocking', label: 'Blocking' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'profile', label: 'My Profile' },
];

const ReceptionistDashboard: FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('requests');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [bookingTableKey, setBookingTableKey] = useState(0);
  const [bookingActiveTab, setBookingActiveTab] = useState<StatusTab>("pending");
  const [bookingSelectedCount, setBookingSelectedCount] = useState(0);
  const [bookingSearchCustomer, setBookingSearchCustomer] = useState("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const archiveFnRef = useRef<(() => Promise<void>) | null>(null);
  const restoreFnRef = useRef<(() => Promise<void>) | null>(null);
  const router = useRouter();

  async function checkSession(): Promise<void> {
    try {
      const response = await fetch('/api/admin/me', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        router.replace('/login');
        return;
      }

      const body = (await response.json()) as { data?: SessionUser };
      const user = body?.data;

      if (!user) {
        router.replace('/login');
        return;
      }

      if (user.role === 'ADMIN') {
        router.replace('/admin');
        return;
      }

      setSessionUser(user);
    } catch {
      router.replace('/login');
      return;
    } finally {
      setIsCheckingSession(false);
    }
  }

  useEffect(() => {
    void checkSession();
  }, []);

  async function handleLogout(): Promise<void> {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } finally {
      router.replace('/login');
    }
  }

  let content: React.ReactNode;
  if (activeTab === 'requests') {
    content = (
      <div
        className="bg-[#111827] rounded-xl shadow-lg p-4 w-full mx-auto"
        style={{ maxWidth: "1900px", minHeight: "calc(100vh - 2rem)" }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-700 pb-2 mb-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-lg font-semibold text-gray-200">Booking Management</div>
            <input
              type="text"
              value={bookingSearchCustomer}
              onChange={(e) => setBookingSearchCustomer(e.target.value)}
              placeholder="Search customer name..."
              className="w-full max-w-xs rounded-lg border border-gray-700 bg-[#1F2937] px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={() => setBookingActiveTab("archived")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                bookingActiveTab === "archived"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-[#1F2937] border border-gray-700 text-gray-400 hover:bg-gray-700"
              }`}
            >
              Archived
            </button>
          </div>
          <div className="flex items-center gap-2">
            {(["completed", "cancelled", "rejected"] as string[]).includes(bookingActiveTab) && (
              <button
                type="button"
                disabled={bookingSelectedCount === 0}
                onClick={() => void archiveFnRef.current?.()}
                className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-[#1F2937] px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                remove{bookingSelectedCount > 0 ? ` (${bookingSelectedCount})` : ""}
              </button>
            )}
            {bookingActiveTab === "archived" && (
              <button
                type="button"
                disabled={bookingSelectedCount === 0}
                onClick={() => void restoreFnRef.current?.()}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-100 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-200 disabled:text-gray-500 transition dark:border-emerald-600 dark:bg-emerald-800 dark:text-emerald-100 dark:hover:bg-emerald-700 dark:disabled:border-gray-600 dark:disabled:bg-gray-800 dark:disabled:text-gray-400"
              >
                Restore{bookingSelectedCount > 0 ? ` (${bookingSelectedCount})` : ""}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowWalkIn(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20"
            >
              <span className="text-base leading-none">+</span> Walk-in Booking
            </button>
          </div>
        </div>
        <BookingTable
          key={bookingTableKey}
          onTabChange={setBookingActiveTab}
          archiveFnRef={archiveFnRef}
          restoreFnRef={restoreFnRef}
          onSelectionChange={setBookingSelectedCount}
          searchCustomer={bookingSearchCustomer}
          externalActiveTab={bookingActiveTab}
        />
      </div>
    );
  } else if (activeTab === 'courts') {
    content = <CourtViewer />;
  } else if (activeTab === 'schedules') {
    content = <SchedulesViewer />;
  } else if (activeTab === 'blocking') {
    content = (
      <div
        className="bg-[#111827] rounded-xl shadow-lg p-4 w-full mx-auto"
        style={{ maxWidth: "1900px", minHeight: "calc(100vh - 2rem)" }}
      >
        <BlockedSlotManager />
      </div>
    );
  } else if (activeTab === 'revenue') {
    content = <RevenueViewer staffName={sessionUser?.name ?? "Receptionist"} />;
  } else if (activeTab === 'profile') {
    content = (
      <div
        className="bg-[#111827] rounded-xl shadow-lg p-8 w-full mx-auto"
        style={{ maxWidth: "640px", minHeight: "calc(100vh - 2rem)" }}
      >
        <div className="text-lg font-semibold text-gray-200 mb-6 border-b border-gray-700 pb-2">My Profile</div>
        <ProfileTab />
      </div>
    );
  }

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#0B0F1A] flex items-center justify-center">
        <p className="text-gray-400 text-base font-medium">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] font-sans flex flex-col md:flex-row">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-56 bg-[#060B14] text-white shadow-xl transition-transform duration-200 md:static md:translate-x-0 md:w-52 md:shrink-0 md:border-r md:border-white/10 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <span className="text-base font-bold text-emerald-400">🏸 Receptionist</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-400 hover:text-white text-xl leading-none"
            aria-label="Close menu"
          >✕</button>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-3 flex-1 overflow-y-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`border-none text-gray-400 text-sm font-medium text-left py-2.5 px-3 rounded-lg cursor-pointer transition hover:bg-white/6 hover:text-white${activeTab === tab.key ? ' bg-emerald-600 text-white hover:bg-emerald-700' : ''}`}
              onClick={() => { setActiveTab(tab.key); setSidebarOpen(false); }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-4">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full rounded-lg border border-red-900/40 bg-red-950/30 px-4 py-2.5 text-left text-sm font-medium text-red-400 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#060B14] border-b border-white/10 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
            aria-label="Open menu"
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-emerald-400">🏸 Receptionist</span>
        </div>

        <div className="flex-1 min-w-0 overflow-hidden flex justify-center items-stretch py-3 px-4 bg-[#0B0F1A]">
        {content}
        </div>
      </div>

      {showWalkIn && (
        <WalkInBookingModal
          onClose={() => setShowWalkIn(false)}
          onCreated={() => setBookingTableKey((k) => k + 1)}
        />
      )}
    </div>
  );
};

export default ReceptionistDashboard;
