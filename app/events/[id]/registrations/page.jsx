'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  getEventById,
  getEventRegistrations,
  acceptRegistration,
  rejectRegistration,
} from '@/lib/api/events';
import toast from 'react-hot-toast';
import EventSidebar from '../../../components/EventSidebar';
import styles from './Manageregistrations.module.css';

const STATUS_CONFIG = {
  registered: { label: 'Pending',  color: '#b45309', bg: '#fef3c7', dot: '#f59e0b' },
  checked_in: { label: 'Accepted', color: '#065f46', bg: '#d1fae5', dot: '#10b981' },
  cancelled:  { label: 'Rejected', color: '#991b1b', bg: '#fee2e2', dot: '#ef4444' },
};

export default function ManageRegistrations() {
  const router = useRouter();
  const params = useParams();
  const eventId = params?.id;

  const [loading, setLoading] = useState(true);
  const [event, setEvent]   = useState(null);
  const [regs, setRegs]     = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [actionLoading, setActionLoading] = useState({}); // { [regId]: 'accept'|'reject' }
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [{ data: ev, error: evErr }, { data: regData, error: regErr }] = await Promise.all([
        getEventById(eventId),
        getEventRegistrations(eventId),
      ]);
      if (evErr || !ev) { toast.error('Event not found'); router.push('/events/dashboard'); return; }
      setEvent(ev);
      setRegs(regData || []);
    } catch {
      toast.error('Failed to load registrations');
    } finally {
      setLoading(false);
    }
  }, [eventId, router]);

  useEffect(() => { load(); }, [load]);

  // Reset page when search/tab changes
  useEffect(() => { setCurrentPage(1); }, [search, activeTab]);

  const counts = {
    all:        regs.length,
    registered: regs.filter(r => r.status === 'registered').length,
    checked_in: regs.filter(r => r.status === 'checked_in').length,
    cancelled:  regs.filter(r => r.status === 'cancelled').length,
  };

  const filtered = regs.filter(r => {
    const matchTab = activeTab === 'all' || r.status === activeTab;
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || (r.profiles?.full_name || '').toLowerCase().includes(q)
      || (r.registration_token || '').toLowerCase().includes(q)
      || (r.profiles?.phone || '').includes(q);
    return matchTab && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleAccept = async (reg) => {
    setActionLoading(p => ({ ...p, [reg.id]: 'accept' }));
    const { error } = await acceptRegistration(reg.id);
    setActionLoading(p => { const n = { ...p }; delete n[reg.id]; return n; });
    if (error) { toast.error(error); return; }
    toast.success(`✅ ${reg.profiles?.full_name || 'Attendee'} accepted`);
    setRegs(prev => prev.map(r => r.id === reg.id ? { ...r, status: 'checked_in' } : r));
  };

  const handleReject = async (reg) => {
    const reason = prompt(`Reason for rejecting ${reg.profiles?.full_name || 'this attendee'}?`);
    if (reason === null) return;
    setActionLoading(p => ({ ...p, [reg.id]: 'reject' }));
    const { error } = await rejectRegistration(reg.id, reason || 'Rejected by organizer');
    setActionLoading(p => { const n = { ...p }; delete n[reg.id]; return n; });
    if (error) { toast.error(error); return; }
    toast.success(`Rejected`);
    setRegs(prev => prev.map(r => r.id === reg.id ? { ...r, status: 'cancelled', notes: reason || 'Rejected by organizer' } : r));
  };

  const formatDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  const formatTime = (iso) => iso
    ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    : '';

  if (loading) return (
    <div className={styles.page}>
      <EventSidebar />
      <main className={styles.main}>
        <div className={styles.loadWrap}>
          <div className={styles.spinner} />
          <p>Loading registrations…</p>
        </div>
      </main>
    </div>
  );

  return (
    <div className={styles.page}>
      <EventSidebar />

      <main className={styles.main}>

        {/* ── Header ── */}
        <header className={styles.header}>
          <button className={styles.back} onClick={() => router.push('/events/dashboard')}>
            ← Back
          </button>

          <div className={styles.headerCenter}>
            <div className={styles.headerMeta}>
              <span className={styles.headerLabel}>Registration Manager</span>
              <h1 className={styles.headerTitle}>{event?.name}</h1>
              <div className={styles.headerSub}>
                <span>📍 {event?.location}</span>
                <span>📅 {formatDate(event?.start_time)}</span>
                <span className={`${styles.eventStatusPill} ${styles[`status_${event?.status}`]}`}>
                  {event?.status === 'active' ? '🟢 Live' : event?.status === 'upcoming' ? '📅 Upcoming' : event?.status}
                </span>
              </div>
            </div>
          </div>

          <button
            className={styles.refreshBtn}
            onClick={load}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </header>

        {/* ── Stat Cards ── */}
        <div className={styles.statRow}>
          <div className={`${styles.statCard} ${styles.statAll}`}>
            <div className={styles.statNum}>{counts.all}</div>
            <div className={styles.statLbl}>Total Registered</div>
          </div>
          <div className={`${styles.statCard} ${styles.statPending}`}>
            <div className={styles.statNum}>{counts.registered}</div>
            <div className={styles.statLbl}>Pending Review</div>
          </div>
          <div className={`${styles.statCard} ${styles.statAccepted}`}>
            <div className={styles.statNum}>{counts.checked_in}</div>
            <div className={styles.statLbl}>Accepted</div>
          </div>
          <div className={`${styles.statCard} ${styles.statRejected}`}>
            <div className={styles.statNum}>{counts.cancelled}</div>
            <div className={styles.statLbl}>Rejected</div>
          </div>
        </div>

        {/* ── Search + Tabs ── */}
        <div className={styles.toolbar}>
          {/* Search */}
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              ref={searchRef}
              className={styles.searchInput}
              type="text"
              placeholder="Search by name or registration number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
            />
            {search && (
              <button className={styles.clearBtn} onClick={() => { setSearch(''); searchRef.current?.focus(); }}>✕</button>
            )}
          </div>

          {/* Status Tabs */}
          <div className={styles.tabs}>
            {[
              { key: 'all',        label: 'All',      count: counts.all },
              { key: 'registered', label: 'Pending',  count: counts.registered },
              { key: 'checked_in', label: 'Accepted', count: counts.checked_in },
              { key: 'cancelled',  label: 'Rejected', count: counts.cancelled },
            ].map(tab => (
              <button
                key={tab.key}
                className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''} ${styles[`tab_${tab.key}`]}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className={styles.tabBadge}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Results summary ── */}
        <div className={styles.resultsMeta}>
          <span>
            {filtered.length === 0
              ? 'No results'
              : `Showing ${((currentPage - 1) * PAGE_SIZE) + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length} registrations`}
          </span>
          {search && <span className={styles.searchTag}>"{search}" <button onClick={() => setSearch('')}>✕</button></span>}
        </div>

        {/* ── Table ── */}
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📋</div>
            <p className={styles.emptyTitle}>{search ? 'No matches found' : 'No registrations yet'}</p>
            <p className={styles.emptySub}>{search ? `Try a different name or registration number.` : 'Share the event link so attendees can register.'}</p>
            {search && <button className={styles.emptyClear} onClick={() => setSearch('')}>Clear search</button>}
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Attendee</th>
                    <th>Reg. Number</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((reg, idx) => {
                    const sc     = STATUS_CONFIG[reg.status] || STATUS_CONFIG.registered;
                    const name   = reg.profiles?.full_name || 'Unknown';
                    const phone  = reg.profiles?.phone     || '—';
                    const token  = reg.registration_token  || '—';
                    const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                    const busy   = !!actionLoading[reg.id];

                    return (
                      <tr key={reg.id} className={`${styles.row} ${busy ? styles.rowBusy : ''}`}>
                        <td className={styles.rowNum}>{rowNum}</td>

                        <td className={styles.nameCell}>
                          <div className={styles.avatar}>{name.charAt(0).toUpperCase()}</div>
                          <span className={styles.nameText}>{name}</span>
                        </td>

                        <td>
                          <span className={styles.tokenPill}>{token}</span>
                        </td>

                        <td className={styles.phoneCell}>{phone}</td>

                        <td>
                          <span
                            className={styles.statusPill}
                            style={{ background: sc.bg, color: sc.color }}
                          >
                            <span className={styles.statusDot} style={{ background: sc.dot }} />
                            {sc.label}
                          </span>
                        </td>

                        <td className={styles.dateCell}>
                          <span>{formatDate(reg.created_at)}</span>
                          <span className={styles.timeSmall}>{formatTime(reg.created_at)}</span>
                        </td>

                        <td className={styles.actionsCell}>
                          {reg.status === 'registered' && (
                            <>
                              <button
                                className={styles.acceptBtn}
                                onClick={() => handleAccept(reg)}
                                disabled={busy}
                              >
                                {actionLoading[reg.id] === 'accept' ? '…' : '✓ Accept'}
                              </button>
                              <button
                                className={styles.rejectBtn}
                                onClick={() => handleReject(reg)}
                                disabled={busy}
                              >
                                {actionLoading[reg.id] === 'reject' ? '…' : '✕ Reject'}
                              </button>
                            </>
                          )}
                          {reg.status === 'checked_in' && (
                            <span className={styles.confirmedTag}>Confirmed ✓</span>
                          )}
                          {reg.status === 'cancelled' && (
                            <span className={styles.rejectedTag}>Rejected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  ← Prev
                </button>

                <div className={styles.pageNumbers}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                    .reduce((acc, p, i, arr) => {
                      if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '…'
                        ? <span key={`ellipsis-${i}`} className={styles.ellipsis}>…</span>
                        : <button
                            key={p}
                            className={`${styles.pageNum} ${currentPage === p ? styles.pageNumActive : ''}`}
                            onClick={() => setCurrentPage(p)}
                          >{p}</button>
                    )
                  }
                </div>

                <button
                  className={styles.pageBtn}
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}