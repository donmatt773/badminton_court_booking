"use client";
import React, { useEffect, useState, FC } from "react";
import { CourtScheduleModal } from "./court-schedule-modal";

export interface Court {
  _id: string;
  name: string;
  surfaceType: "wooden" | "rubber";
  status: "active" | "inactive" | "maintenance";
}

const statusColor = (status: Court["status"]): string => {
  switch (status) {
    case "active": return "#059669";
    case "inactive": return "#64748b";
    case "maintenance": return "#f59e42";
    default: return "#334155";
  }
};


const CourtTable: FC = () => {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modalCourt, setModalCourt] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/courts")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch courts");
        return res.json();
      })
      .then((data) => setCourts(data.data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ overflowX: "auto" }}>
      {loading && <p className="text-blue-600 font-medium mb-4">Loading...</p>}
      {error && <p className="text-red-600 bg-red-50 rounded-md px-4 py-2 mb-4 font-medium">{error}</p>}
      <table className="w-full border-collapse bg-white rounded-xl shadow">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="px-4 py-3 font-semibold text-left">Name</th>
            <th className="px-4 py-3 font-semibold text-left">Surface Type</th>
            <th className="px-4 py-3 font-semibold text-left">Status</th>
            <th className="px-4 py-3 font-semibold text-left">View Schedule</th>
          </tr>
        </thead>
        <tbody>
          {courts.length === 0 && !loading && (
            <tr>
              <td colSpan={4} className="text-slate-500 text-center italic py-6">No courts found.</td>
            </tr>
          )}
          {courts.map((court) => (
            <tr key={court._id} className="border-b border-slate-200 last:border-b-0">
              <td className="px-4 py-3 text-slate-800">{court.name}</td>
              <td className="px-4 py-3 capitalize text-slate-800">{court.surfaceType}</td>
              <td className="px-4 py-3 font-semibold" style={{ color: statusColor(court.status) }}>{court.status}</td>
              <td className="px-4 py-3">
                <button
                  className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  onClick={() => setModalCourt({ id: court._id, name: court.name })}
                >
                  View Schedule
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {modalCourt && (
        <CourtScheduleModal
          courtId={modalCourt.id}
          courtName={modalCourt.name}
          open={!!modalCourt}
          onClose={() => setModalCourt(null)}
        />
      )}
    </div>
  );
};

export { CourtTable };
