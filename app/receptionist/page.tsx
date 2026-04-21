"use client";
import React, { useEffect, useRef, useState, FC } from 'react';
import { useRouter } from 'next/navigation';

import { BookingTable } from './components/booking-table';

import { CourtTable } from './components/court-table';
import { BlockedSlotManager } from './components/blocked-slot-manager';
import { ScheduleCalendar } from './components/schedule-calendar';
import { WalkInBookingModal } from './components/walk-in-booking-modal';
import { ProfileTab } from './components/profile-tab';

const CourtViewer: FC = () => (
  <div
    className="bg-[#111827] rounded-xl shadow-lg p-4 min-w-80 w-full"
    style={{ maxWidth: "1280px", minHeight: "calc(100vh - 2rem)" }}
  >
    <div className="text-lg font-semibold text-gray-200 mb-3 border-b border-gray-700 pb-2">Courts</div>
    <CourtTable />
  </div>
);
const SchedulesViewer: FC = () => (
  <div
    className="bg-[#111827] rounded-xl shadow-lg p-4 min-w-80 w-full"
    style={{ maxWidth: "1800px" }}
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

function hoursFromTimes(start: string, end: string): number {
  const [sh] = start.split(":").map(Number);
  const [eh] = end.split(":").map(Number);
  return isNaN(sh) || isNaN(eh) ? 0 : Math.max(0, eh - sh);
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const RevenueViewer: FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<RevenueBooking[]>([]);
  const [courts, setCourts] = useState<RevenueCourt[]>([]);
  const [filterMonth, setFilterMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [bRes, cRes] = await Promise.all([
          fetch('/api/admin/bookings', { credentials: 'include' }),
          fetch('/api/admin/courts', { credentials: 'include' }),
        ]);
        if (!bRes.ok || !cRes.ok) throw new Error('Failed to fetch data');
        const [bBody, cBody] = await Promise.all([bRes.json(), cRes.json()]) as [
          { data?: RevenueBooking[] },
          { data?: RevenueCourt[] },
        ];
        if (!mounted) return;
        setBookings(bBody.data ?? []);
        setCourts(cBody.data ?? []);
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
    new Set(bookings.map((b) => b.bookingDate.slice(0, 7)))
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

  function calcAmount(b: RevenueBooking): number {
    return (priceMap[b.courtId] ?? 0) * hoursFromTimes(b.startTime, b.endTime);
  }

  const totalRevenue = filtered.reduce((sum, b) => sum + calcAmount(b), 0);
  const cashRevenue  = filtered.filter((b) => b.paymentMethod === "cash" || !b.paymentMethod).reduce((sum, b) => sum + calcAmount(b), 0);
  const onlineRevenue = filtered.filter((b) => b.paymentMethod === "online").reduce((sum, b) => sum + calcAmount(b), 0);

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

  return (
    <div
      className="bg-[#111827] rounded-xl shadow-lg p-5 min-w-80 w-full"
      style={{ maxWidth: "1280px", minHeight: "calc(100vh - 2rem)" }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-gray-700 pb-3">
        <div>
          <div className="text-lg font-semibold text-gray-200">Revenue Overview</div>
          <div className="text-xs text-gray-500 mt-0.5">Calculated from PAID &amp; COMPLETE bookings × court hourly rate</div>
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
            onClick={() => setFilterMonth(new Date().toISOString().slice(0, 7))}
            className="text-xs text-emerald-400 hover:underline"
          >
            This month
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
              <p className="text-xs text-gray-500 mt-1">{filtered.length} paid booking{filtered.length !== 1 ? "s" : ""} · {MONTHS[parseInt(filterMonthNum) - 1]} {filterYear}</p>
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
                  {courtRows.map((row) => (
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
            )}
          </div>

          {/* Recent paid transactions */}
          <div className="rounded-lg border border-gray-700 bg-[#0B0F1A] overflow-hidden">
            <p className="text-xs uppercase tracking-wide text-gray-500 px-4 py-3 border-b border-gray-700">Recent Paid Transactions</p>
            {allPaidThisMonth.length === 0 ? (
              <p className="text-sm text-gray-500 px-4 py-3">No transactions this period.</p>
            ) : (
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
                    {allPaidThisMonth.slice(0, 20).map((b) => (
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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [bookingTableKey, setBookingTableKey] = useState(0);
  const [bookingActiveTab, setBookingActiveTab] = useState<string>("pending");
  const [bookingSelectedCount, setBookingSelectedCount] = useState(0);
  const [bookingSearchCustomer, setBookingSearchCustomer] = useState("");
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
          </div>
          <div className="flex items-center gap-2">
            {(["completed", "cancelled", "rejected"] as string[]).includes(bookingActiveTab) && (
              <button
                type="button"
                disabled={bookingSelectedCount === 0}
                onClick={() => void archiveFnRef.current?.()}
                className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-[#1F2937] px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Archive{bookingSelectedCount > 0 ? ` (${bookingSelectedCount})` : ""}
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
    content = <RevenueViewer />;
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
    <div className="min-h-screen bg-[#0B0F1A] font-sans flex flex-row">
      <aside className="w-52 shrink-0 bg-[#060B14] text-white flex flex-col items-stretch py-6 shadow-lg border-r border-white/10">
        <div className="text-xl font-bold tracking-wide mb-6 text-center text-emerald-400">🏸 Receptionist</div>
        <nav className="flex flex-col gap-1 px-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`border-none text-gray-400 text-sm font-medium text-left py-2.5 px-3 rounded-lg cursor-pointer transition hover:bg-white/6 hover:text-white${activeTab === tab.key ? ' bg-emerald-600 text-white hover:bg-emerald-700' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-3 pt-8">
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
      <div className="flex-1 min-w-0 overflow-hidden flex justify-center items-stretch py-3 px-4 bg-[#0B0F1A]">
        {content}
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
