import React, { useEffect, useState, FC } from "react";

interface Court {
  _id: string;
  name: string;
}

export function useCourtNames() {
  const [courtMap, setCourtMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/admin/courts")
      .then((res) => res.json())
      .then((data) => {
        const map: Record<string, string> = {};
        (data.data || []).forEach((court: Court) => {
          map[court._id] = court.name;
        });
        setCourtMap(map);
      });
  }, []);
  return courtMap;
}
