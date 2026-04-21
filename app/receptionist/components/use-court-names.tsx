import React, { useEffect, useState, FC } from "react";

interface Court {
  _id: string;
  name: string;
  price?: number;
}

export function useCourtNames() {
  const catalog = useCourtCatalog();
  return Object.fromEntries(Object.entries(catalog).map(([id, value]) => [id, value.name]));
}

export function useCourtCatalog() {
  const [courtMap, setCourtMap] = useState<Record<string, { name: string; price: number }>>({});
  useEffect(() => {
    fetch("/api/admin/courts", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const map: Record<string, { name: string; price: number }> = {};
        (data.data || []).forEach((court: Court) => {
          map[court._id] = {
            name: court.name,
            price: typeof court.price === "number" ? court.price : 0,
          };
        });
        setCourtMap(map);
      });
  }, []);
  return courtMap;
}
