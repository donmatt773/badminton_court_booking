
"use client";
import React, { useEffect, useState } from 'react';

type Report = {
  id: number;
  customer: string;
  message: string;
  createdAt: string;
};

import styles from '../receptionist.module.css';

export default function CustomerReportList() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch reports');
        return res.json();
      })
      .then(setReports)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {loading && <p className={styles['dashboard-loading']}>Loading...</p>}
      {error && <p className={styles['dashboard-error']}>{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {reports.length === 0 && !loading && (
          <li className={styles['dashboard-empty']}>No customer requests yet.</li>
        )}
        {reports.map((report) => (
          <li
            key={report.id}
            style={{
              background: '#1F2937',
              borderRadius: '0.7rem',
              marginBottom: '1.2rem',
              padding: '1.2rem 1rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              borderLeft: '4px solid #10B981',
            }}
          >
            <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '1.1rem' }}>{report.customer}</div>
            <div style={{ color: '#94a3b8', margin: '0.5rem 0 0.7rem 0' }}>{report.message}</div>
            <div style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'right' }}>
              {new Date(report.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
