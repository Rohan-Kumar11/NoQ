'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getOrganizerEvents, getEventAnalytics } from '@/lib/api/events';
import toast from 'react-hot-toast';
import EventSidebar from '../../components/EventSidebar';
import styles from './EventAnalytics.module.css';

export default function GlobalEventAnalytics() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Aggregate totals across all events
  const [totals, setTotals] = useState({
    totalEvents: 0,
    totalServed: 0,
    totalJoined: 0,
    avgCompletion: 0,
    liveEvents: 0,
  });

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/get-started'); return; }

      const { data, error } = await getOrganizerEvents();
      if (error) { toast.error('Failed to load events'); return; }

      const evList = data || [];
      setEvents(evList);

      // Compute aggregate totals
      let totalServed = 0, totalJoined = 0, completionRates = [], liveEvents = 0;
      await Promise.all(
        evList.map(async (ev) => {
          if (ev.status === 'active') liveEvents++;
          if (ev.status === 'completed' || ev.status === 'active') {
            const { data: a } = await getEventAnalytics(ev.id);
            if (a) {
              totalServed += a.total_served || 0;
              totalJoined += a.total_joined || 0;
              if (a.completion_rate) completionRates.push(a.completion_rate);
            }
          }
        })
      );

      setTotals({
        totalEvents: evList.length,
        totalServed,
        totalJoined,
        avgCompletion: completionRates.length
          ? Math.round(completionRates.reduce((a, b) => a + b, 0) / completionRates.length)
          : 0,
        liveEvents,
      });

      // Auto-select first event that has data
      const firstWithData = evList.find(e => ['completed', 'active'].includes(e.status));
      if (firstWithData) setSelectedEventId(firstWithData.id);
    } catch (err) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Load analytics when event selection changes
  useEffect(() => {
    if (!selectedEventId) return;
    (async () => {
      setAnalyticsLoading(true);
      const { data, error } = await getEventAnalytics(selectedEventId);
      if (error) toast.error('Failed to load event analytics');
      else setAnalytics(data);
      setAnalyticsLoading(false);
    })();
  }, [selectedEventId]);

  const maxThroughput = analytics?.throughput_by_hour?.length > 0
    ? Math.max(...analytics.throughput_by_hour.map(d => d.count), 1)
    : 1;

  const getStatusColor = (status) => ({
    active: '#10b981',
    upcoming: '#3b82f6',
    completed: '#8b5cf6',
    cancelled: '#ef4444',
  }[status] || '#6b7280');

  const formatEventDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <EventSidebar />
        <main className={styles.mainContent}>
          <div className={styles.loadingContainer}>
            <div className={styles.loader} />
            <p>Loading analytics...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <EventSidebar />

      <main className={styles.mainContent}>
        {/* Header */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <h1 className={styles.pageTitle}>📈 Analytics</h1>
            <p className={styles.pageSubtitle}>Across all your events</p>
          </div>
          <button
            className={styles.createBtn}
            onClick={() => router.push('/events/create')}
          >
            ➕ New Event
          </button>
        </header>

        {/* Aggregate Stats */}
        <div className={styles.aggregateGrid}>
          <div className={`${styles.aggCard} ${styles.aggPurple}`}>
            <div className={styles.aggIcon}>🎪</div>
            <div className={styles.aggContent}>
              <div className={styles.aggValue}>{totals.totalEvents}</div>
              <div className={styles.aggLabel}>Total Events</div>
            </div>
          </div>
          <div className={`${styles.aggCard} ${styles.aggGreen}`}>
            <div className={styles.aggIcon}>🟢</div>
            <div className={styles.aggContent}>
              <div className={styles.aggValue}>{totals.liveEvents}</div>
              <div className={styles.aggLabel}>Live Now</div>
            </div>
          </div>
          <div className={`${styles.aggCard} ${styles.aggBlue}`}>
            <div className={styles.aggIcon}>👥</div>
            <div className={styles.aggContent}>
              <div className={styles.aggValue}>{totals.totalJoined}</div>
              <div className={styles.aggLabel}>Total Attendees</div>
            </div>
          </div>
          <div className={`${styles.aggCard} ${styles.aggTeal}`}>
            <div className={styles.aggIcon}>✅</div>
            <div className={styles.aggContent}>
              <div className={styles.aggValue}>{totals.totalServed}</div>
              <div className={styles.aggLabel}>Total Served</div>
            </div>
          </div>
          <div className={`${styles.aggCard} ${styles.aggOrange}`}>
            <div className={styles.aggIcon}>📊</div>
            <div className={styles.aggContent}>
              <div className={styles.aggValue}>{totals.avgCompletion}%</div>
              <div className={styles.aggLabel}>Avg Completion</div>
            </div>
          </div>
        </div>

        {/* Per-Event Selector + Detail */}
        <div className={styles.detailSection}>
          <div className={styles.eventSelectorCard}>
            <h2 className={styles.sectionTitle}>📋 Event Breakdown</h2>
            <div className={styles.eventList}>
              {events.length === 0 ? (
                <div className={styles.emptyList}>
                  <span>No events yet</span>
                  <button onClick={() => router.push('/events/create')}>Create one →</button>
                </div>
              ) : (
                events.map((ev) => (
                  <button
                    key={ev.id}
                    className={`${styles.eventListItem} ${selectedEventId === ev.id ? styles.eventListItemActive : ''}`}
                    onClick={() => setSelectedEventId(ev.id)}
                  >
                    <div className={styles.eventListLeft}>
                      <span
                        className={styles.eventStatusDot}
                        style={{ background: getStatusColor(ev.status) }}
                      />
                      <div>
                        <div className={styles.eventListName}>{ev.name}</div>
                        <div className={styles.eventListMeta}>
                          {formatEventDate(ev.start_time)} · {ev.location}
                        </div>
                      </div>
                    </div>
                    <span className={styles.eventListArrow}>›</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Analytics Detail Panel */}
          <div className={styles.analyticsDetailCard}>
            {!selectedEventId ? (
              <div className={styles.emptyDetail}>
                <span className={styles.emptyDetailIcon}>📊</span>
                <p>Select an event to view its analytics</p>
              </div>
            ) : analyticsLoading ? (
              <div className={styles.loadingContainer}>
                <div className={styles.loader} />
                <p>Loading...</p>
              </div>
            ) : !analytics ? (
              <div className={styles.emptyDetail}>
                <span className={styles.emptyDetailIcon}>📭</span>
                <p>No analytics data available for this event yet</p>
              </div>
            ) : (
              <>
                <div className={styles.detailHeader}>
                  <h3 className={styles.detailTitle}>{analytics.event_name}</h3>
                  <button
                    className={styles.viewFullBtn}
                    onClick={() => router.push(`/events/${selectedEventId}/analytics`)}
                  >
                    Full Report →
                  </button>
                </div>

                {/* Mini stats */}
                <div className={styles.miniStats}>
                  {[
                    { icon: '👥', label: 'Joined',    value: analytics.total_joined },
                    { icon: '✅', label: 'Served',    value: analytics.total_served },
                    { icon: '⏳', label: 'Waiting',   value: analytics.currently_waiting },
                    { icon: '❌', label: 'Cancelled', value: analytics.total_cancelled },
                    { icon: '⏱️', label: 'Avg Service', value: `${analytics.avg_service_time_minutes}m` },
                    { icon: '📈', label: 'Completion', value: `${analytics.completion_rate}%` },
                  ].map((s, i) => (
                    <div key={i} className={styles.miniStat}>
                      <span className={styles.miniStatIcon}>{s.icon}</span>
                      <span className={styles.miniStatValue}>{s.value}</span>
                      <span className={styles.miniStatLabel}>{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Throughput chart */}
                {analytics.throughput_by_hour?.length > 0 && (
                  <div className={styles.miniChartSection}>
                    <div className={styles.miniChartLabel}>Throughput by Hour</div>
                    <div className={styles.miniBarChart}>
                      {analytics.throughput_by_hour.map((d, i) => (
                        <div key={i} className={styles.miniBarGroup}>
                          <div className={styles.miniBarWrapper}>
                            <div
                              className={styles.miniBar}
                              style={{ height: `${(d.count / maxThroughput) * 100}%` }}
                            >
                              <span className={styles.miniBarTip}>{d.count}</span>
                            </div>
                          </div>
                          <div className={styles.miniBarHour}>{d.hour}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Funnel */}
                <div className={styles.miniFunnelSection}>
                  <div className={styles.miniChartLabel}>Attendee Funnel</div>
                  {[
                    { label: 'Registered', value: analytics.total_registered, color: '#8b5cf6' },
                    { label: 'Joined Queue', value: analytics.total_joined, color: '#3b82f6' },
                    { label: 'Served', value: analytics.total_served, color: '#10b981' },
                    { label: 'Cancelled', value: analytics.total_cancelled, color: '#ef4444' },
                  ].map((item, i) => {
                    const max = Math.max(analytics.total_registered || 0, analytics.total_joined || 0, 1);
                    const pct = Math.round((item.value / max) * 100);
                    return (
                      <div key={i} className={styles.miniFunnelItem}>
                        <span className={styles.miniFunnelLabel}>{item.label}</span>
                        <div className={styles.miniFunnelBarWrap}>
                          <div
                            className={styles.miniFunnelBar}
                            style={{ width: `${pct}%`, background: item.color }}
                          />
                        </div>
                        <span className={styles.miniFunnelValue}>{item.value}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Events table summary */}
        {events.length > 0 && (
          <div className={styles.summaryTableCard}>
            <h2 className={styles.sectionTitle}>📋 All Events Summary</h2>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Capacity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td>
                        <div className={styles.tableName}>{ev.name}</div>
                        <div className={styles.tableSub}>📍 {ev.location}</div>
                      </td>
                      <td>
                        <span className={styles.typeChip}>
                          {({ food_distribution: '🍱', large_dinner: '🍽️', registration: '📋', conference: '🎤', general: '📅' })[ev.event_type] || '📅'}
                          {' '}{ev.event_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={styles.tableDate}>{formatEventDate(ev.start_time)}</td>
                      <td>
                        <span
                          className={styles.statusChip}
                          style={{
                            background: `${getStatusColor(ev.status)}18`,
                            color: getStatusColor(ev.status),
                            border: `1px solid ${getStatusColor(ev.status)}40`,
                          }}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td className={styles.tableCapacity}>
                        {ev.max_capacity ? ev.max_capacity : '∞'}
                      </td>
                      <td>
                        <div className={styles.tableActions}>
                          <button
                            className={styles.tableActionBtn}
                            onClick={() => router.push(`/events/${ev.id}/analytics`)}
                            title="View detailed analytics"
                          >
                            📊
                          </button>
                          {['active', 'upcoming'].includes(ev.status) && (
                            <button
                              className={styles.tableActionBtn}
                              onClick={() => router.push(`/events/${ev.id}/manage`)}
                              title="Manage queue"
                            >
                              🎫
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}