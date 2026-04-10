'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Zap, ArrowRight, MapPin, Clock, Users2 } from 'lucide-react';
import { getActiveEvents } from '@/lib/api/events';
import './EventsStrip.css';

export default function EventsStrip() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await getActiveEvents({ limit: 6 });
        setEvents(data || []);
      } catch {}
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return null;
  if (events.length === 0) return null;

  const liveEvents  = events.filter(e => e.status === 'active');
  const upcomingEvents = events.filter(e => e.status === 'upcoming');

  const getIcon = (type) => ({
    food_distribution: '🍱', large_dinner: '🍽️',
    registration: '📋', conference: '🎤', general: '📅',
  }[type] || '📅');

  const fmtTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <section className="es-section">
      {/* Header */}
      <div className="es-header">
        <div className="es-header-left">
          <div className="es-header-icon"><Calendar size={18} /></div>
          <div>
            <h2 className="es-title">Temporary Events</h2>
            <p className="es-sub">Join virtual queues for community events near you</p>
          </div>
        </div>
        <button className="es-see-all" onClick={() => router.push('/buyer/events')}>
          See all events <ArrowRight size={15} />
        </button>
      </div>

      {/* Live Now strip */}
      {liveEvents.length > 0 && (
        <div className="es-live-section">
          <div className="es-live-label">
            <span className="es-live-dot" />
            Live Now — Queues Open
          </div>
          <div className="es-cards">
            {liveEvents.slice(0, 3).map(ev => (
              <div key={ev.id} className="es-card es-card--live">
                <div className="es-card-top">
                  <span className="es-card-ico">{getIcon(ev.event_type)}</span>
                  <span className="es-live-badge">Live</span>
                </div>
                <h3 className="es-card-name">{ev.name}</h3>
                <div className="es-card-meta">
                  <span><MapPin size={11} />{ev.location}</span>
                  <span><Clock size={11} />{fmtTime(ev.start_time)}</span>
                  {ev.live_queue_count > 0 && (
                    <span><Users2 size={11} />{ev.live_queue_count} in queue</span>
                  )}
                </div>
                {ev.live_queue_count > 0 && (
                  <div className="es-wait">~{ev.live_queue_count * (ev.avg_service_time || 5)} min wait</div>
                )}
                <button
                  className="es-join-btn"
                  onClick={() => router.push('/buyer/events')}
                >
                  🎫 Join Queue
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming strip */}
      {upcomingEvents.length > 0 && (
        <div className="es-upcoming-section">
          <div className="es-upcoming-label">Upcoming</div>
          <div className="es-upcoming-list">
            {upcomingEvents.slice(0, 3).map(ev => (
              <div key={ev.id} className="es-upcoming-card" onClick={() => router.push('/buyer/events')}>
                <span className="es-upcoming-ico">{getIcon(ev.event_type)}</span>
                <div className="es-upcoming-info">
                  <div className="es-upcoming-name">{ev.name}</div>
                  <div className="es-upcoming-meta">
                    <span><MapPin size={11} />{ev.location}</span>
                    <span><Calendar size={11} />{fmtDate(ev.start_time)}</span>
                    <span><Clock size={11} />{fmtTime(ev.start_time)}</span>
                  </div>
                </div>
                <span className="es-upcoming-badge">📅 Upcoming</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer CTA */}
      <button className="es-footer-cta" onClick={() => router.push('/buyer/events')}>
        <Zap size={15} />
        Browse All {events.length} Events
        <ArrowRight size={15} />
      </button>
    </section>
  );
}