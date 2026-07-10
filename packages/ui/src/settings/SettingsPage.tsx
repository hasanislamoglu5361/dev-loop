import React from 'react';

interface SettingsSection {
  name: string;
  items: Record<string, unknown>;
}

const SECRET_KEYS = ['api_key', 'secret', 'token', 'password', 'key'];

function redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    const isSecret = SECRET_KEYS.some(s => key.toLowerCase().includes(s));
    if (isSecret && typeof value === 'string') {
      result[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSecrets(value as Record<string, unknown>);
      continue;
    }

    if (Array.isArray(value) && typeof value[0] === 'string') {
      const allSecret = value.every(v => SECRET_KEYS.some(s => key.toLowerCase().includes(s)));
      result[key] = allSecret ? '[REDACTED]' : value;
      continue;
    }

    result[key] = value;
  }
  return result;
}

function renderValue(value: unknown): ReturnType<typeof React.createElement> {
  if (value === null || value === undefined) return <span className="empty">-</span>;
  if (typeof value === 'boolean') {
    return <span className={`status-badge status-${value ? 'success' : 'failure'}`}>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return <span>{value.join(', ')}</span>;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <ul className="nested-settings">
        {entries.map(([k, v]) => (
          <li key={k}>
            <strong>{formatKey(k)}:</strong> {renderValue(v)}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="value">{String(value)}</span>;
}

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

export function SettingsPage({ sections }: { sections?: SettingsSection[] }): ReturnType<typeof React.createElement> {
  if (!sections?.length) {
    return (
      <div className="settings-page">
        <header className="page-header">
          <h2>Settings</h2>
        </header>
        <p>No settings configured.</p>
      </div>
    );
  }

  const allItems = sections.reduce((acc, s) => ({ ...acc, [s.name]: redactSecrets(s.items) }), {} as Record<string, Record<string, unknown>>);

  return (
    <div className="settings-page">
      <header className="page-header">
        <h2>Settings</h2>
        <p>All configuration values. Secrets are redacted.</p>
      </header>

      <section className="settings-sections">
        {sections.map(section => (
          <div key={section.name} className="settings-section">
            <h3>{section.name}</h3>
            <dl className="settings-grid">
              {Object.entries(redactSecrets(section.items)).map(([key, value]) => (
                <React.Fragment key={key}>
                  <dt>{formatKey(key)}</dt>
                  <dd>{renderValue(value)}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}

export default SettingsPage;