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
    case "active": return "#10B981";
    case "inactive": return "#64748b";
    case "maintenance": return "#92600a";
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
      .then((data) => {
        const safeCourts = Array.isArray(data?.data)
          ? data.data.filter((court: Court | null) => court && typeof court._id === "string")
          : [];
        setCourts(safeCourts);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ overflowX: "auto" }}>
      {loading && <p className="text-[#10B981] font-medium mb-4">Loading...</p>}
      {error && <p className="text-red-600 bg-red-50 rounded-md px-4 py-2 mb-4 font-medium">{error}</p>}
      <table className="w-full border-collapse bg-[#1F2937] rounded-xl shadow text-sm" style={{ minWidth: "1100px" }}>
        <thead>
          <tr className="bg-[#0B0F1A] text-gray-400">
            <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Name</th>
            <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Surface Type</th>
            <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">Status</th>
            <th className="px-2 py-2 font-semibold text-left whitespace-nowrap">View Schedule</th>
          </tr>
        </thead>
        <tbody>
          {courts.length === 0 && !loading && (
            <tr>
              <td colSpan={4} className="text-slate-500 text-center italic py-6">No courts found.</td>
            </tr>
          )}
          {courts.map((court) => (
            <tr key={court._id} className="border-b border-gray-700 last:border-b-0">
              <td className="px-2 py-2 text-gray-100 whitespace-nowrap">{court.name}</td>
              <td className="px-2 py-2 capitalize text-gray-100 whitespace-nowrap">{court.surfaceType}</td>
              <td className="px-2 py-2 font-semibold whitespace-nowrap" style={{ color: statusColor(court.status) }}>{court.status}</td>
              <td className="px-2 py-2">
                <button
                  className="px-2 py-0.5 rounded bg-[#10B981] text-white text-sm font-semibold hover:bg-[#059669]"
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
