"use client";
import React, { useState, FC } from 'react';

import { BookingTable } from './components/booking-table';

import { CourtTable } from './components/court-table';
import { ScheduleCalendar } from './components/schedule-calendar';

const CourtViewer: FC = () => (
  <div className="bg-white rounded-xl shadow-lg p-8 min-w-80 max-w-xl w-full">
    <div className="text-lg font-semibold text-slate-700 mb-6 border-b border-slate-200 pb-2">Courts</div>
    <CourtTable />
  </div>
);
const SchedulesViewer: FC = () => (
  <div className="bg-white rounded-xl shadow-lg p-8 min-w-80 max-w-5xl w-full">
    <div className="text-lg font-semibold text-slate-700 mb-6 border-b border-slate-200 pb-2">Schedules Calendar</div>
    <ScheduleCalendar />
  </div>
);

type TabKey = 'requests' | 'courts' | 'schedules';
interface Tab {
  key: TabKey;
  label: string;
}
const TABS: Tab[] = [
  { key: 'requests', label: 'Request Viewer' },
  { key: 'courts', label: 'Court Viewer' },
  { key: 'schedules', label: 'Schedules Viewer' },
];

const ReceptionistDashboard: FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('requests');

  let content: React.ReactNode;
  if (activeTab === 'requests') {
    content = (
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-7xl mx-auto">
        <div className="text-lg font-semibold text-slate-700 mb-6 border-b border-slate-200 pb-2">Booking Requests</div>
        <BookingTable />
      </div>
    );
  } else if (activeTab === 'courts') {
    content = <CourtViewer />;
  } else if (activeTab === 'schedules') {
    content = <SchedulesViewer />;
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-200 font-sans flex flex-row">
      <aside className="w-55 bg-slate-800 text-white flex flex-col items-stretch py-8 shadow-lg">
        <div className="text-2xl font-bold tracking-wide mb-10 text-center text-sky-400">Receptionist</div>
        <nav className="flex flex-col gap-5 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`bg-none border-none text-white text-base font-medium text-left py-3 px-4 rounded-lg cursor-pointer transition hover:bg-blue-600${activeTab === tab.key ? ' bg-blue-600' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex justify-center items-start py-8">
        {content}
      </div>
    </div>
  );
};

export default ReceptionistDashboard;
