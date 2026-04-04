import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

interface AnalyticsData {
  trips: {
    total: number;
    last_7_days: number;
    last_30_days: number;
    by_day: { date: string; count: number }[];
  };
  members: {
    total: number;
    confirmed: number;
    confirmation_rate: number;
  };
  engagement: {
    trips_with_3_plus_members: number;
    destinations_added: number;
    votes_cast: number;
    budgets_submitted: number;
    availability_submitted: number;
    insights_generated: number;
  };
  recent_trips: {
    id: string;
    name: string;
    join_token: string;
    member_count: number;
    created_at: string;
  }[];
}

// ─── Password Gate ──────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(false);

    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { 'x-admin-password': password },
      });

      if (res.ok) {
        sessionStorage.setItem('groupism_admin_authed', 'true');
        onAuth(password);
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ background: '#0C0C0A', minHeight: '100vh' }}
      className="flex items-center justify-center px-4"
    >
      <form onSubmit={handleSubmit} className="w-full max-w-xs text-center">
        <h1
          className="font-display text-4xl mb-8"
          style={{ color: '#E8E4DC', fontWeight: 300 }}
        >
          admin.
        </h1>
        <div className={shake ? 'animate-shake' : ''}>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="password"
            className="w-full px-4 py-3 rounded text-sm font-ui outline-none mb-3"
            style={{
              background: '#1A1A17',
              border: '1px solid #2A2A25',
              color: '#E8E4DC',
            }}
          />
        </div>
        {error && (
          <p className="text-xs mb-3" style={{ color: '#B5503A' }}>
            wrong password
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded text-sm font-ui font-medium transition-opacity"
          style={{
            background: '#D4900A',
            color: '#0C0C0A',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '...' : 'enter'}
        </button>
      </form>
    </div>
  );
}

// ─── Skeleton Cards ─────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="rounded-lg p-6 overflow-hidden relative"
          style={{ background: '#1A1A17' }}
        >
          <div className="h-3 w-20 rounded mb-3" style={{ background: '#2A2A25' }} />
          <div className="h-8 w-16 rounded mb-2" style={{ background: '#2A2A25' }} />
          <div className="h-3 w-24 rounded" style={{ background: '#2A2A25' }} />
          <div
            className="absolute inset-0 animate-shimmer"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)',
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard({ password }: { password: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const passwordRef = useRef(password);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { 'x-admin-password': passwordRef.current },
      });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const cardStyle = {
    background: '#1A1A17',
    borderRadius: '8px',
    padding: '24px',
  };

  const labelColor = '#6B6560';
  const valueColor = '#E8E4DC';
  const amberColor = '#D4900A';
  const terraColor = '#B5503A';
  const borderColor = '#2A2A25';

  if (error && !data) {
    return (
      <div className="text-center py-20 text-sm" style={{ color: terraColor }}>
        failed to load — check Railway logs
      </div>
    );
  }

  if (initialLoad) return <SkeletonCards />;

  return (
    <div className="space-y-8">
      {/* Section 1: Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div style={cardStyle}>
          <p className="eyebrow mb-2">total trips</p>
          <p className="font-mono-code text-3xl" style={{ color: valueColor }}>
            {data!.trips.total}
          </p>
          <p className="text-xs mt-1" style={{ color: amberColor }}>
            +{data!.trips.last_7_days} last 7 days
          </p>
        </div>
        <div style={cardStyle}>
          <p className="eyebrow mb-2">total members</p>
          <p className="font-mono-code text-3xl" style={{ color: valueColor }}>
            {data!.members.total}
          </p>
          <p className="text-xs mt-1" style={{ color: amberColor }}>
            {data!.members.confirmation_rate}% confirmed
          </p>
        </div>
        <div style={cardStyle}>
          <p className="eyebrow mb-2">ai insights</p>
          <p className="font-mono-code text-3xl" style={{ color: valueColor }}>
            {data!.engagement.insights_generated}
          </p>
          <p className="text-xs mt-1" style={{ color: labelColor }}>
            generated
          </p>
        </div>
      </div>

      {/* Section 2: Trips Over Time */}
      <div style={cardStyle}>
        <p className="eyebrow mb-4">trips created — last 14 days</p>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data!.trips.by_day}>
              <XAxis
                dataKey="date"
                tickFormatter={d => d.slice(5)}
                tick={{ fill: labelColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: borderColor }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: labelColor, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                width={24}
              />
              <Tooltip
                contentStyle={{
                  background: '#1A1A17',
                  border: `1px solid ${borderColor}`,
                  borderRadius: 6,
                  fontSize: 12,
                  color: valueColor,
                }}
                labelFormatter={d => d}
                cursor={{ fill: 'rgba(212,144,10,0.08)' }}
              />
              <Bar dataKey="count" fill={amberColor} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 3: Engagement Table */}
      <div style={cardStyle}>
        <p className="eyebrow mb-4">engagement</p>
        <table className="w-full text-sm">
          <tbody>
            {[
              ['Destinations Added', data!.engagement.destinations_added],
              ['Votes Cast', data!.engagement.votes_cast],
              ['Budgets Submitted', data!.engagement.budgets_submitted],
              ['Availability Submissions', data!.engagement.availability_submitted],
              ['Trips with 3+ Members', data!.engagement.trips_with_3_plus_members],
              ['Confirmation Rate', `${data!.members.confirmation_rate}%`],
            ].map(([label, value], i) => (
              <tr
                key={i}
                style={{ borderBottom: `1px solid ${borderColor}` }}
              >
                <td className="py-3 font-ui" style={{ color: labelColor }}>
                  {label}
                </td>
                <td
                  className="py-3 text-right font-mono-code"
                  style={{ color: valueColor }}
                >
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 4: Recent Trips */}
      <div style={cardStyle}>
        <p className="eyebrow mb-4">recent trips</p>
        <div className="space-y-0">
          {data!.recent_trips.map(trip => (
            <div
              key={trip.id}
              className="flex items-baseline justify-between py-3"
              style={{ borderBottom: `1px solid ${borderColor}` }}
            >
              <div className="min-w-0 flex-1 mr-4">
                <span className="font-display text-sm" style={{ color: valueColor }}>
                  {trip.name}
                </span>
                <a
                  href={`https://groupism-p9g9.vercel.app/trip/${trip.join_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 font-mono-code text-xs hover:underline"
                  style={{ color: labelColor }}
                >
                  {trip.join_token}
                </a>
              </div>
              <div className="flex items-baseline gap-4 shrink-0">
                <span className="font-mono-code text-xs" style={{ color: amberColor }}>
                  {trip.member_count} members
                </span>
                <span className="font-mono-code text-xs" style={{ color: labelColor }}>
                  {new Date(trip.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
            </div>
          ))}
          {data!.recent_trips.length === 0 && (
            <p className="py-4 text-sm text-center" style={{ color: labelColor }}>
              no trips yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem('groupism_admin_authed') === 'true'
  );
  const [password, setPassword] = useState('');

  const handleAuth = (pw: string) => {
    setPassword(pw);
    setAuthed(true);
  };

  if (!authed) return <PasswordGate onAuth={handleAuth} />;

  return (
    <div
      style={{ background: '#0C0C0A', minHeight: '100vh', color: '#E8E4DC' }}
      className="px-4 py-8"
    >
      <div className="max-w-4xl mx-auto">
        <p className="font-ui text-sm mb-8" style={{ color: '#6B6560', fontWeight: 400 }}>
          groupism / admin
        </p>
        <Dashboard password={password} />
      </div>
    </div>
  );
}
