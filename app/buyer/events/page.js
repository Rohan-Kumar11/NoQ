'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, Users2, MapPin, Clock,
  Calendar, Zap, Filter, BookMarked
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import {
  getActiveEvents,
  registerForEvent,
  cancelRegistration,
  checkUserRegistration,
} from '@/lib/api/events';
import toast from 'react-hot-toast';
import BuyerNavbar from '@/app/components/BuyerNavbar';
import './events.css';

export default function BuyerEvents() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [userRegistrations, setUserRegistrations] = useState({});
  const [registeringId, setRegisteringId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/get-started'); return; }
      setUserId(user.id);
    };
    init();
  }, [router]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await getActiveEvents({ filter, limit: 50 });
      if (error) { toast.error('Failed to load events'); return; }
      setEvents(data || []);
      if (userId && data?.length > 0) {
        const regMap = {};
        await Promise.all(data.map(async (ev) => {
          const { data: regData } = await checkUserRegistration(ev.id);
          regMap[ev.id] = regData;
        }));
        setUserRegistrations(regMap);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, userId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleRegister = async (eventId, eventName, queueMode) => {
    setRegisteringId(eventId);
    try {
      if (queueMode === 'queue_based') {
        const { joinQueueBasedEvent } = await import('@/lib/api/queueBased');
        const { data, error } = await joinQueueBasedEvent(eventId);
        if (error) { toast.error(error); return; }
        toast.success(`🎫 Joined! Token: ${data.token_number}`);
        router.push(`/buyer/queue/${data.id}`);
      } else {
        const reg = userRegistrations[eventId];
        if (reg?.isRegistered) {
          const { error } = await cancelRegistration(eventId);
          if (error) { toast.error(error); return; }
          toast.success('Registration cancelled');
          setUserRegistrations(prev => ({ ...prev, [eventId]: { isRegistered: false } }));
        } else {
          const { error } = await registerForEvent(eventId);
          if (error) { toast.error(error); return; }
          toast.success(`Registered for "${eventName}"! 🎉`);
          setUserRegistrations(prev => ({ ...prev, [eventId]: { isRegistered: true } }));
        }
      }
    } finally { setRegisteringId(null); }
  };

  const getEventTypeIcon = (type) => ({
    food_distribution: '🍱', large_dinner: '🍽️',
    registration: '📋', conference: '🎤', general: '📅',
  }[type] || '📅');

  const getEventTypeLabel = (type) => ({
    food_distribution: 'Food Distribution', large_dinner: 'Large Dinner',
    registration: 'Registration', conference: 'Conference', general: 'General',
  }[type] || 'Event');

  const formatEventDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatEventTime = (d) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const EVENT_TYPES = ['all', 'food_distribution', 'large_dinner', 'registration', 'conference', 'general'];

  const filteredEvents = events.filter(ev => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      ev.name?.toLowerCase().includes(q) ||
      ev.location?.toLowerCase().includes(q) ||
      ev.description?.toLowerCase().includes(q);
    const matchesType = typeFilter === 'all' || ev.event_type === typeFilter;
    const matchesFilter = filter === 'all' || ev.status === filter;
    return matchesSearch && matchesType && matchesFilter;
  });

  return (
    <div className="ev-page">

      <BuyerNavbar />

      {/* ── Main ── */}
      <div className="ev-main">

        {/* Hero */}
        <div className="ev-hero">
          <div className="ev-hero-badge"><Zap size={13} /> Live Events</div>
          <h1 className="ev-hero-title">Join Events Near You</h1>
          <p className="ev-hero-sub">
            Food distributions, community dinners, registrations & more — register now and get your unique registration number.
          </p>
        </div>

        {/* Search + filter bar */}
        <div className="ev-controls">
          <div className="ev-search-row">
            <div className="ev-search-wrap">
              <Search className="ev-search-ico" size={16} />
              <input
                type="text"
                placeholder="Search events, locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ev-search-input"
              />
              {searchQuery && (
                <button className="ev-search-clear" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              className={`ev-filter-toggle ${showFilters ? 'ev-filter-toggle--on' : ''}`}
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter size={15} />
              Filters
            </button>
          </div>

          {showFilters && (
            <div className="ev-filter-panel">
              <div className="ev-filter-group">
                <span className="ev-filter-label">Status</span>
                <div className="ev-pills">
                  {[{ v: 'all', l: 'All' }, { v: 'active', l: '🟢 Live Now' }, { v: 'upcoming', l: '📅 Upcoming' }].map(({ v, l }) => (
                    <button key={v} className={`ev-pill ${filter === v ? 'ev-pill--on' : ''}`} onClick={() => setFilter(v)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="ev-filter-group">
                <span className="ev-filter-label">Type</span>
                <div className="ev-pills">
                  {EVENT_TYPES.map(t => (
                    <button key={t} className={`ev-pill ${typeFilter === t ? 'ev-pill--on' : ''}`} onClick={() => setTypeFilter(t)}>
                      {t === 'all' ? 'All Types' : getEventTypeLabel(t)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="ev-tabs">
            {[{ v: 'all', l: 'All Events' }, { v: 'active', l: '🟢 Live Now' }, { v: 'upcoming', l: '📅 Upcoming' }].map(({ v, l }) => (
              <button key={v} className={`ev-tab ${filter === v ? 'ev-tab--on' : ''}`} onClick={() => setFilter(v)}>
                {l}
                <span className="ev-tab-count">
                  {v === 'all' ? events.length : events.filter(e => e.status === v).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="ev-loading"><div className="ev-spinner" /><p>Finding events...</p></div>
        ) : filteredEvents.length === 0 ? (
          <div className="ev-empty">
            <div className="ev-empty-ico">🎪</div>
            <h3>No events found</h3>
            <p>{events.length === 0 ? 'No active events right now. Check back soon!' : 'Try adjusting your filters.'}</p>
            {searchQuery && (
              <button className="ev-clear-search" onClick={() => setSearchQuery('')}>Clear search</button>
            )}
          </div>
        ) : (
          <div className="ev-list">
            {filteredEvents.map((event) => {
              const isLive = event.status === 'active';
              const isUpcoming = event.status === 'upcoming';
              const reg = userRegistrations[event.id];
              const isRegistered = reg?.isRegistered;
              const isFull = event.max_capacity && (event.registered_count || 0) >= event.max_capacity;
              const isRegistering = registeringId === event.id;
              const canRegister = isLive || isUpcoming;

              return (
                <div key={event.id} className={`ev-card ${isLive ? 'ev-card--live' : ''}`}>
                  {isLive && (
                    <div className="ev-live-strip">
                      <span className="ev-live-dot" />
                      LIVE — Registration Open
                    </div>
                  )}

                  <div className="ev-card-body">
                    <div className="ev-card-icon-wrap">
                      <div className="ev-card-icon">{getEventTypeIcon(event.event_type)}</div>
                    </div>

                    <div className="ev-card-info">
                      <div className="ev-card-row1">
                        <div>
                          <h3 className="ev-card-name">{event.name}</h3>
                          <span className="ev-type-tag">{getEventTypeLabel(event.event_type)}</span>
                        </div>
                        <span className={`ev-status-tag ${isLive ? 'ev-status-tag--live' : 'ev-status-tag--upcoming'}`}>
                          {isLive ? '🟢 Live' : '📅 Upcoming'}
                        </span>
                      </div>

                      {event.description && (
                        <p className="ev-card-desc">{event.description}</p>
                      )}

                      <div className="ev-card-meta">
                        <span><MapPin size={12} />{event.location}</span>
                        <span><Calendar size={12} />{formatEventDate(event.start_time)}</span>
                        <span><Clock size={12} />{formatEventTime(event.start_time)} – {formatEventTime(event.end_time)}</span>
                        {event.avg_service_time && <span><Clock size={12} />~{event.avg_service_time} min/person</span>}
                        {event.max_capacity && (
                          <span><Users2 size={12} />{event.registered_count || 0}/{event.max_capacity} spots</span>
                        )}
                      </div>

                      {event.organizer_name && (
                        <p className="ev-card-organizer">By {event.organizer_name}</p>
                      )}
                    </div>

                    <div className="ev-card-actions">
                      {event.queue_mode === 'queue_based' ? (
                        isLive ? (
                          <button
                            className="ev-btn-reg"
                            onClick={() => handleRegister(event.id, event.name, event.queue_mode)}
                            disabled={isRegistering}
                          >
                            {isRegistering ? '⏳' : '🎫 Join Queue'}
                          </button>
                        ) : (
                          <span className="ev-reg-hint">Queue opens when event goes live</span>
                        )
                      ) : (
                        <>
                          {canRegister && (
                            <button
                              className={`ev-btn-reg ${isRegistered ? 'ev-btn-reg--done' : ''}`}
                              onClick={() => handleRegister(event.id, event.name, event.queue_mode)}
                              disabled={isRegistering || (isFull && !isRegistered)}
                            >
                              {isRegistering ? '⏳' : isRegistered ? '✓ Registered' : isFull ? 'Full' : '+ Register'}
                            </button>
                          )}
                          {isRegistered && (
                            <span className="ev-reg-hint">Check "My Events" for your registration number</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}