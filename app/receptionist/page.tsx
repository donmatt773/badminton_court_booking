"use client";
import React, { useEffect, useState, FC } from 'react';
import { useRouter } from 'next/navigation';

import { BookingTable } from './components/booking-table';

import { CourtTable } from './components/court-table';
import { BlockedSlotManager } from './components/blocked-slot-manager';
import { ScheduleCalendar } from './components/schedule-calendar';

const CourtViewer: FC = () => (
  <div
    className="bg-white rounded-xl shadow-lg p-4 min-w-80 w-full"
    style={{ maxWidth: "1280px", minHeight: "calc(100vh - 2rem)" }}
  >
    <div className="text-lg font-semibold text-slate-700 mb-3 border-b border-slate-200 pb-2">Courts</div>
    <CourtTable />
  </div>
);
const SchedulesViewer: FC = () => (
  <div
    className="bg-white rounded-xl shadow-lg p-4 min-w-80 w-full"
    style={{ maxWidth: "1800px", minHeight: "calc(100vh - 2rem)" }}
  >
    <div className="text-lg font-semibold text-slate-700 mb-3 border-b border-slate-200 pb-2">Schedules Calendar</div>
    <ScheduleCalendar />
  </div>
);

type TabKey = 'requests' | 'courts' | 'schedules' | 'blocking';
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
  { key: 'requests', label: 'Request Viewer' },
  { key: 'courts', label: 'Court Viewer' },
  { key: 'schedules', label: 'Schedules Viewer' },
  { key: 'blocking', label: 'Blocking' },
];

const ReceptionistDashboard: FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('requests');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const router = useRouter();

  async function checkSession(): Promise<void> {
    try {
      const response = await fetch('/api/admin/me', {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        router.replace('/Login');
        return;
      }

      const body = (await response.json()) as { data?: SessionUser };
      const user = body?.data;

      if (!user) {
        router.replace('/Login');
        return;
      }

      if (user.role === 'ADMIN') {
        router.replace('/admin');
        return;
      }
    } catch {
      router.replace('/Login');
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
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      router.replace('/Login');
    }
  }

  let content: React.ReactNode;
  if (activeTab === 'requests') {
    content = (
      <div
        className="bg-white rounded-xl shadow-lg p-4 w-full mx-auto"
        style={{ maxWidth: "1900px", minHeight: "calc(100vh - 2rem)" }}
      >
        <div className="text-lg font-semibold text-slate-700 mb-3 border-b border-slate-200 pb-2">Booking Requests</div>
        <BookingTable />
      </div>
    );
  } else if (activeTab === 'courts') {
    content = <CourtViewer />;
  } else if (activeTab === 'schedules') {
    content = <SchedulesViewer />;
  } else if (activeTab === 'blocking') {
    content = (
      <div
        className="bg-white rounded-xl shadow-lg p-4 w-full mx-auto"
        style={{ maxWidth: "1900px", minHeight: "calc(100vh - 2rem)" }}
      >
        <BlockedSlotManager />
      </div>
    );
  }

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#f2f6f4] flex items-center justify-center">
        <p className="text-[#3b6b53] text-base font-medium">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2f6f4] font-sans flex flex-row">
      <aside className="w-52 shrink-0 bg-[#0d2418] text-white flex flex-col items-stretch py-6 shadow-lg">
        <div className="text-xl font-bold tracking-wide mb-6 text-center text-[#1D9E75]">🏸 Receptionist</div>
        <nav className="flex flex-col gap-1 px-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`border-none text-[#7ab89a] text-sm font-medium text-left py-2.5 px-3 rounded-lg cursor-pointer transition hover:bg-white/8 hover:text-white${activeTab === tab.key ? ' bg-[#1D9E75] text-white hover:bg-[#17876a]' : ''}`}
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
      <div className="flex-1 min-w-0 overflow-hidden flex justify-center items-stretch py-3 px-4">
        {content}
      </div>
    </div>
  );
};

export default ReceptionistDashboard;
