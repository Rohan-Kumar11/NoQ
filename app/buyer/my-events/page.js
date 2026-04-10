'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin, Clock, Calendar,
  Ticket, CheckCircle, XCircle, AlertCircle,
  ChevronRight, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getMyRegisteredEvents, cancelRegistration } from '@/lib/api/events';
import toast from 'react-hot-toast';
import BuyerNavbar from '@/app/components/BuyerNavbar';
import './my-events.css';

export default function MyEvents() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/get-started'); return; }
    };
    init();
  }, [router]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await getMyRegisteredEvents();
      if (error) { toast.error('Failed to load your events'); return; }
      setEvents(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleCancelRegistration = async (eventId, eventName) => {
    if (!confirm(`Cancel your registration for "${eventName}"?`)) return;
    setCancellingId(eventId);
    try {
      const { error } = await cancelRegistration(eventId);
      if (error) { toast.error(error); return; }
      toast.success('Registration cancelled');
      setEvents(prev => prev.map(ev =>
        ev.id === eventId ? { ...ev, registrationStatus: 'cancelled' } : ev
      ));
    } finally {
      setCancellingId(null);
    }
  };

  const getEventTypeIcon = (type) => ({
    food_distribution: '🍱', large_dinner: '🍽️',
    registration: '📋', conference: '🎤', general: '📅',
  }[type] || '📅');

  const getEventTypeLabel = (type) => ({
    food_distribution: 'Food Distribution', large_dinner: 'Large Dinner',
    registration: 'Registration', conference: 'Conference', general: 'General',
  }[type] || 'Event');

  const formatDate = (d) => {
    if (!d) return '—';
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (d) => {
    if (!d) return '—';
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const getRegStatusConfig = (regStatus, eventStatus) => {
    if (regStatus === 'cancelled')   return { label: 'You Cancelled',    icon: XCircle,     cls: 'mev-badge--cancelled' };
    if (regStatus === 'checked_in')  return { label: 'Checked In',       icon: CheckCircle, cls: 'mev-badge--checkedin' };
    if (eventStatus === 'completed') return { label: 'Event Ended',      icon: AlertCircle, cls: 'mev-badge--ended' };
    if (eventStatus === 'cancelled') return { label: 'Event Cancelled',  icon: XCircle,     cls: 'mev-badge--cancelled' };
    if (eventStatus === 'active')    return { label: 'Live Now',         icon: CheckCircle, cls: 'mev-badge--live' };
    return { label: 'Registered', icon: CheckCircle, cls: 'mev-badge--registered' };
  };

  const filteredEvents = events.filter(ev => {
    if (filter === 'upcoming') return ev.status === 'upcoming' && ev.registrationStatus === 'registered';
    if (filter === 'live')     return ev.status === 'active';
    if (filter === 'past')     return ['completed', 'cancelled'].includes(ev.status) || ev.registrationStatus === 'cancelled';
    return true;
  });

  const counts = {
    all:      events.length,
    upcoming: events.filter(e => e.status === 'upcoming' && e.registrationStatus === 'registered').length,
    live:     events.filter(e => e.status === 'active').length,
    past:     events.filter(e => ['completed', 'cancelled'].includes(e.status) || e.registrationStatus === 'cancelled').length,
  };

  return (
    <div className="mev-page">

      <BuyerNavbar />

      {/* ── Main ── */}
      <div className="mev-main">

        {/* Header */}
        <div className="mev-header">
          <div>
            <h1 className="mev-title">My Events</h1>
            <p className="mev-sub">All events you've registered for, with your registration numbers.</p>
          </div>
          <button className="mev-refresh-btn" onClick={loadEvents} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'mev-spinning' : ''} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="mev-tabs">
          {[
            { v: 'all',      l: 'All' },
            { v: 'live',     l: '🟢 Live Now' },
            { v: 'upcoming', l: '📅 Upcoming' },
            { v: 'past',     l: '✓ Past' },
          ].map(({ v, l }) => (
            <button
              key={v}
              className={`mev-tab ${filter === v ? 'mev-tab--on' : ''}`}
              onClick={() => setFilter(v)}
            >
              {l}
              <span className="mev-tab-count">{counts[v]}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="mev-loading">
            <div className="mev-spinner" />
            <p>Loading your events...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="mev-empty">
            <div className="mev-empty-ico">🎟️</div>
            <h3>{filter === 'all' ? "You haven't registered for any events yet" : `No ${filter} events`}</h3>
            <p>{filter === 'all' ? 'Browse events and register to see them here.' : 'Check other tabs.'}</p>
            {filter === 'all' && (
              <button className="mev-browse-btn" onClick={() => router.push('/buyer/events')}>
                Browse Events
              </button>
            )}
          </div>
        ) : (
          <div className="mev-list">
            {filteredEvents.map((event) => {
              const isExpanded = expandedId === event.registrationId;
              const statusCfg = getRegStatusConfig(event.registrationStatus, event.status);
              const StatusIcon = statusCfg.icon;
              const isLive     = event.status === 'active';
              const isUpcoming = event.status === 'upcoming' && event.registrationStatus === 'registered';
              const isPast     = ['completed', 'cancelled'].includes(event.status) || event.registrationStatus === 'cancelled';
              const canCancel  = (isUpcoming || isLive) && event.registrationStatus === 'registered';
              const isCancelledByOrg  = event.status === 'cancelled';
              const isCancelledByUser = event.registrationStatus === 'cancelled' && event.status !== 'cancelled';

              return (
                <div
                  key={event.registrationId}
                  className={`mev-card ${isLive ? 'mev-card--live' : ''} ${isPast ? 'mev-card--past' : ''} ${isCancelledByOrg ? 'mev-card--org-cancelled' : ''}`}
                >
                  {isLive && (
                    <div className="mev-live-strip">
                      <span className="mev-live-dot" /> LIVE — Event is happening now
                    </div>
                  )}

                  {isCancelledByOrg && (
                    <div className="mev-cancelled-strip">
                      ❌ This event has been cancelled by the organizer
                    </div>
                  )}

                  {/* Card main row */}
                  <div
                    className="mev-card-row"
                    onClick={() => setExpandedId(isExpanded ? null : event.registrationId)}
                  >
                    <div className="mev-card-icon">
                      {getEventTypeIcon(event.event_type)}
                    </div>

                    <div className="mev-card-info">
                      <div className="mev-card-top">
                        <div>
                          <h3 className="mev-card-name">
                            {event.name
                              ? event.name
                              : <span className="mev-name-fallback">Event Cancelled</span>
                            }
                          </h3>
                          <span className="mev-type-tag">
                            {getEventTypeLabel(event.event_type)}
                          </span>
                        </div>
                        <span className={`mev-badge ${statusCfg.cls}`}>
                          <StatusIcon size={11} />
                          {statusCfg.label}
                        </span>
                      </div>

                      <div className="mev-card-meta">
                        {event.location
                          ? <span><MapPin size={11} />{event.location}</span>
                          : <span className="mev-meta-na"><MapPin size={11} />Location unavailable</span>
                        }
                        {event.start_time && !isNaN(new Date(event.start_time).getTime())
                          ? <>
                              <span><Calendar size={11} />{formatDate(event.start_time)}</span>
                              <span><Clock size={11} />{formatTime(event.start_time)}</span>
                            </>
                          : <span className="mev-meta-na"><Calendar size={11} />Date unavailable</span>
                        }
                      </div>
                    </div>

                    <ChevronRight
                      size={16}
                      className={`mev-chevron ${isExpanded ? 'mev-chevron--open' : ''}`}
                    />
                  </div>

                  {/* ── Expanded details ── */}
                  {isExpanded && (
                    <div className="mev-expand">

                      {isCancelledByOrg && (
                        <div className="mev-cancelled-notice">
                          <div className="mev-cancelled-notice-icon">❌</div>
                          <div>
                            <div className="mev-cancelled-notice-title">
                              This event was cancelled by the organizer
                            </div>
                            {event.cancellation_reason && (
                              <div className="mev-cancelled-notice-reason">
                                <span className="mev-cancelled-reason-label">Reason: </span>
                                {event.cancellation_reason}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {isCancelledByUser && (
                        <div className="mev-user-cancelled-notice">
                          <AlertCircle size={15} />
                          You cancelled your registration for this event.
                        </div>
                      )}

                      <div className={`mev-token-section ${isCancelledByOrg ? 'mev-token-section--voided' : ''}`}>
                        <div className="mev-token-label">
                          <Ticket size={14} /> Registration Number
                        </div>
                        <div className="mev-token-box">
                          <span className="mev-token-value">
                            {event.registrationToken || '—'}
                          </span>
                          {event.registrationToken && !isCancelledByOrg && (
                            <button
                              className="mev-token-copy"
                              onClick={() => {
                                navigator.clipboard.writeText(event.registrationToken);
                                toast.success('Registration number copied!');
                              }}
                            >
                              Copy
                            </button>
                          )}
                        </div>
                        <p className="mev-token-hint">
                          {isCancelledByOrg
                            ? 'This event was cancelled. Your registration number is no longer valid.'
                            : isCancelledByUser
                            ? 'You cancelled your registration. This number is no longer valid.'
                            : 'Show this registration number to the organizer at the venue for check-in.'}
                        </p>
                      </div>

                      <div className="mev-details-grid">
                        <div className="mev-detail-item">
                          <span className="mev-detail-label">Date</span>
                          <span className="mev-detail-value">{formatDate(event.start_time)}</span>
                        </div>
                        <div className="mev-detail-item">
                          <span className="mev-detail-label">Time</span>
                          <span className="mev-detail-value">
                            {formatTime(event.start_time)}
                            {event.end_time && !isNaN(new Date(event.end_time).getTime())
                              ? ` – ${formatTime(event.end_time)}`
                              : ''}
                          </span>
                        </div>
                        <div className="mev-detail-item">
                          <span className="mev-detail-label">Location</span>
                          <span className="mev-detail-value">{event.location || '—'}</span>
                        </div>
                        {event.venue_details && (
                          <div className="mev-detail-item">
                            <span className="mev-detail-label">Venue Details</span>
                            <span className="mev-detail-value">{event.venue_details}</span>
                          </div>
                        )}
                        <div className="mev-detail-item">
                          <span className="mev-detail-label">Organizer</span>
                          <span className="mev-detail-value">{event.organizer_name || '—'}</span>
                        </div>
                        <div className="mev-detail-item">
                          <span className="mev-detail-label">Registered on</span>
                          <span className="mev-detail-value">{formatDate(event.registeredAt)}</span>
                        </div>
                      </div>

                      {event.description && (
                        <p className="mev-event-desc">{event.description}</p>
                      )}

                      {canCancel && (
                        <div className="mev-actions">
                          <button
                            className="mev-btn-cancel"
                            onClick={() => handleCancelRegistration(event.id, event.name)}
                            disabled={cancellingId === event.id}
                          >
                            {cancellingId === event.id ? '⏳ Cancelling...' : 'Cancel Registration'}
                          </button>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}