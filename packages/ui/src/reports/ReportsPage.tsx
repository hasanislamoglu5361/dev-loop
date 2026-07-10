import React, { useState } from 'react';

type ReportFormat = 'csv' | 'pdf' | 'json';

interface ReportEntry {
  id: string;
  name?: string;
  format?: ReportFormat;
  createdAt?: string;
  sizeBytes?: number;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportsPage({ reports = [] }: { reports?: ReportEntry[] }): ReturnType<typeof React.createElement> {
  const [formatFilter, setFormatFilter] = useState<ReportFormat | 'all'>('all');

  const filtered = formatFilter === 'all' ? reports : reports.filter(r => r.format === formatFilter);

  return (
    <div className="reports-page">
      <header className="page-header">
        <h2>Reports</h2>
        <p>{reports.length} report(s) generated.</p>
      </header>

      {reports.length > 0 && (
        <nav className="filter-nav">
          {['all', 'csv', 'pdf', 'json'].map(f => (
            <button key={f} type="button" onClick={() => setFormatFilter(f as ReportFormat | 'all')} className={formatFilter === f ? 'active' : ''}>
              {(f || 'All').toUpperCase()}
            </button>
          ))}
        </nav>
      )}

      {filtered.length === 0 ? (
        <p>{reports.length === 0 ? 'No reports generated yet.' : `No ${formatFilter.toUpperCase()} reports found.`}</p>
      ) : (
        <table className="reports-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Format</th>
              <th>Size</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(report => (
              <tr key={report.id}>
                <td>{report.name ?? report.id}</td>
                <td><span className="format-badge">{(report.format ?? 'unknown').toUpperCase()}</span></td>
                <td>{formatSize(report.sizeBytes)}</td>
                <td>{report.createdAt ? new Date(report.createdAt).toLocaleString() : '-'}</td>
                <td><button type="button" onClick={() => alert(`Download ${report.id}`)}>Download</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default ReportsPage;