"use client";
import React, { useState, FC } from "react";

import { BookingTable } from "./components/booking-table";
import { CourtTable } from "./components/court-table";
import { ScheduleCalendar } from "./components/schedule-calendar";
import { ProfileTab } from "./components/profile-tab";

const CourtViewer: FC = () => (
  <div className="bg-[#111827] rounded-xl shadow-lg p-8 w-full max-w-3xl">
    <div className="text-lg font-semibold text-gray-200 mb-6 border-b border-gray-700 pb-2">
      Courts
    </div>
    <CourtTable />
  </div>
);

const SchedulesViewer: FC = () => (
  <div className="bg-[#111827] rounded-xl shadow-lg p-8 w-full max-w-5xl">
    <div className="text-lg font-semibold text-gray-200 mb-6 border-b border-gray-700 pb-2">
      Schedules Calendar
    </div>
    <ScheduleCalendar />
  </div>
);

type TabKey = "requests" | "courts" | "schedules" | "profile";

interface Tab {
  key: TabKey;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { key: "requests",  label: "Request Viewer",   icon: "📋" },
  { key: "courts",    label: "Court Viewer",      icon: "🏸" },
  { key: "schedules", label: "Schedules Viewer",  icon: "📅" },
  { key: "profile",   label: "My Profile",        icon: "👤" },
];

const ReceptionistDashboard: FC = () => {
  const [activeTab, setActiveTab]     = useState<TabKey>("requests");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  let content: React.ReactNode;
  if (activeTab === "requests") {
    content = (
      <div className="bg-[#111827] rounded-xl shadow-lg p-6 w-full max-w-7xl mx-auto">
        <div className="text-lg font-semibold text-gray-200 mb-6 border-b border-gray-700 pb-2">
          Booking Requests
        </div>
        <BookingTable />
      </div>
    );
  } else if (activeTab === "courts") {
    content = <CourtViewer />;
  } else if (activeTab === "schedules") {
    content = <SchedulesViewer />;
  } else {
    content = (
      <div className="bg-[#111827] rounded-xl shadow-lg p-8 w-full max-w-xl">
        <div className="text-lg font-semibold text-gray-200 mb-6 border-b border-gray-700 pb-2">
          My Profile
        </div>
        <ProfileTab />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F1A] font-sans flex flex-col">
      {/* ── Mobile top bar ── */}
      <header className="flex items-center justify-between bg-[#060B14] text-white px-4 py-3 md:hidden">
        <span className="text-emerald-400 font-bold text-lg tracking-wide">Receptionist</span>
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="text-white focus:outline-none"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? (
            /* X icon */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            /* Hamburger */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6"  x2="21" y2="6"  />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </header>

      <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
        {/* ── Sidebar ── */}
        <aside
          className={[
            "bg-[#060B14] text-white flex flex-col items-stretch py-6 shadow-lg",
            "transition-all duration-200",
            /* Desktop: always visible, fixed width */
            "md:w-56 md:flex md:min-h-screen",
            /* Mobile: show/hide as overlay */
            sidebarOpen ? "flex" : "hidden",
            "md:relative absolute z-40 w-full",
          ].join(" ")}
        >
          {/* Brand — hidden on mobile (already in top bar) */}
          <div className="text-2xl font-bold tracking-wide mb-8 text-center text-emerald-400 hidden md:block">
            Receptionist
          </div>

          <nav className="flex flex-col gap-2 px-4">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={[
                  "flex items-center gap-3 text-white text-sm font-medium",
                  "text-left py-3 px-4 rounded-lg cursor-pointer transition-colors",
                  activeTab === tab.key
                    ? "bg-emerald-600"
                    : "hover:bg-[#1F2937]",
                ].join(" ")}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSidebarOpen(false);
                }}
              >
                <span style={{ fontSize: 16 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 flex justify-center items-start p-6 md:p-8 overflow-auto min-w-0">
          {content}
        </main>
      </div>
    </div>
  );
};

export default ReceptionistDashboard;
