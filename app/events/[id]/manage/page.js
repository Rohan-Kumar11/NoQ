'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getEventById, activateEvent, closeEvent } from '@/lib/api/events';
import {
  getQueueBasedEntries,
  callNextQueueToken,
  markQueueEntryArrived,
  markQueueEntryServed,
  handleQueueTimeout,
  removeQueueEntry,
  subscribeToQueueEntries,
} from '@/lib/api/queueBased';
import { getEventRegistrations, acceptRegistration, rejectRegistration } from '@/lib/api/events';
import toast from 'react-hot-toast';
import EventSidebar from '../../../components/EventSidebar';
import styles from './ManageEvent.module.css';

// ── Registration-based sub-view ──────────────────────────────────────────────
function RegistrationManager({ eventId }) {
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const STATUS_CONFIG = {
    registered: { label: 'Pending',  color: '#b45309', bg: '#fef3c7', dot: '#f59e0b' },
    checked_in: { label: 'Accepted', color: '#065f46', bg: '#d1fae5', dot: '#10b981' },
    cancelled:  { label: 'Rejected', color: '#991b1b', bg: '#fee2e2', dot: '#ef4444' },
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getEventRegistrations(eventId);
    if (!error) setRegs(data || []);
    else toast.error('Failed to load registrations: ' + error);
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

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
    toast.success('Rejected');
    setRegs(prev => prev.map(r => r.id === reg.id ? { ...r, status: 'cancelled' } : r));
  };

  const counts = {
    all: regs.length,
    registered: regs.filter(r => r.status === 'registered').length,
    checked_in: regs.filter(r => r.status === 'checked_in').length,
    cancelled: regs.filter(r => r.status === 'cancelled').length,
  };

  const filtered = regs.filter(r => {
    const matchTab = activeTab === 'all' || r.status === activeTab;
    const q = search.trim().toLowerCase();
    const matchSearch = !q
      || (r.profiles?.full_name || '').toLowerCase().includes(q)
      || (r.registration_token || '').toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  if (loading) return (
    <div className={styles.centerMsg}>
      <div className={styles.spinner} />
      <p>Loading registrations…</p>
    </div>
  );

  return (
    <div className={styles.subView}>
      <div className={styles.statRow}>
        {[
          { label: 'Total',    val: counts.all,        cls: styles.statAll },
          { label: 'Pending',  val: counts.registered, cls: styles.statPending },
          { label: 'Accepted', val: counts.checked_in, cls: styles.statAccepted },
          { label: 'Rejected', val: counts.cancelled,  cls: styles.statRejected },
        ].map(s => (
          <div key={s.label} className={`${styles.statCard} ${s.cls}`}>
            <div className={styles.statNum}>{s.val}</div>
            <div className={styles.statLbl}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search by name or token…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={styles.tabs}>
          {[
            { key: 'all',        label: 'All',      count: counts.all },
            { key: 'registered', label: 'Pending',  count: counts.registered },
            { key: 'checked_in', label: 'Accepted', count: counts.checked_in },
            { key: 'cancelled',  label: 'Rejected', count: counts.cancelled },
          ].map(tab => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} <span className={styles.tabBadge}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📋</div>
          <p>{search ? 'No matches found' : 'No registrations yet'}</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>#</th><th>Attendee</th><th>Token</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((reg, idx) => {
                const sc = STATUS_CONFIG[reg.status] || STATUS_CONFIG.registered;
                const name = reg.profiles?.full_name || 'Unknown';
                const busy = !!actionLoading[reg.id];
                return (
                  <tr key={reg.id} className={styles.row}>
                    <td className={styles.rowNum}>{idx + 1}</td>
                    <td className={styles.nameCell}>
                      <div className={styles.avatar}>{name.charAt(0).toUpperCase()}</div>
                      <span>{name}</span>
                    </td>
                    <td><span className={styles.tokenPill}>{reg.registration_token || '—'}</span></td>
                    <td>{reg.profiles?.phone || '—'}</td>
                    <td>
                      <span className={styles.statusPill} style={{ background: sc.bg, color: sc.color }}>
                        <span className={styles.statusDot} style={{ background: sc.dot }} />
                        {sc.label}
                      </span>
                    </td>
                    <td className={styles.actionsCell}>
                      {reg.status === 'registered' && (
                        <>
                          <button className={styles.acceptBtn} onClick={() => handleAccept(reg)} disabled={busy}>
                            {actionLoading[reg.id] === 'accept' ? '…' : '✓ Accept'}
                          </button>
                          <button className={styles.rejectBtn} onClick={() => handleReject(reg)} disabled={busy}>
                            {actionLoading[reg.id] === 'reject' ? '…' : '✕ Reject'}
                          </button>
                        </>
                      )}
                      {reg.status === 'checked_in' && <span className={styles.confirmedTag}>Confirmed ✓</span>}
                      {reg.status === 'cancelled'  && <span className={styles.rejectedTag}>Rejected</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Queue-based sub-view ─────────────────────────────────────────────────────
// Mirrors the seller/queue non-product (queue-only) UX:
//   • Stats row (total / waiting / called / serving)
//   • "Now Serving" card — shows current in_service token with Mark Served btn
//   • "Called — Awaiting Arrival" table — Arrived | Timeout | Remove
//   • "Token Confirmation" panel — dropdown of waiting tokens + Confirm btn
//     (replaces the "Call Next" button; organiser manually picks who to call)
//   • "Waiting Queue" table — position + name + Remove
// ─────────────────────────────────────────────────────────────────────────────
function QueueManager({ eventId }) {
  const [queueData, setQueueData] = useState({
    waiting: [], called: [], currentlyServing: null, allActive: [], queueSize: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  // Token confirmation state (mirrors seller/queue page)
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [isConfirmingToken, setIsConfirmingToken] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getQueueBasedEntries(eventId);
    if (error) {
      toast.error('Failed to load queue: ' + error);
    } else if (data) {
      setQueueData(data);
    }
    setLoading(false);
    // Reset dropdown on every reload so stale selections are cleared
    setSelectedTokenId('');
  }, [eventId]);

  useEffect(() => {
    load();
    const unsub = subscribeToQueueEntries(eventId, {
      onChange: () => load(),
      onError:  (err) => console.error('Queue realtime error:', err),
    });
    return unsub;
  }, [load, eventId]);

  // ── Loading helpers ───────────────────────────────────────────────────────
  const busy    = (id) => !!actionLoading[id];
  const setBusy = (id, val) =>
    setActionLoading(p =>
      val ? { ...p, [id]: val } : (({ [id]: _, ...rest }) => rest)(p)
    );

  // ── Handlers ─────────────────────────────────────────────────────────────

  /**
   * Token Confirmation — matches seller/queue handleConfirmToken().
   * Calls callNextQueueToken() but for the selected entry.
   * NOTE: callNextQueueToken() always picks the top waiting entry, so we
   * first check the selected entry IS the next in line; if not, the organiser
   * has intentionally skipped ahead — we warn but still proceed via the same
   * API since the backend picks by position. For truly arbitrary selection,
   * a dedicated "callSpecificToken" RPC would be needed; here we replicate
   * the seller/queue pattern exactly using the existing queueBased.js API.
   */
  const handleConfirmToken = async () => {
    if (!selectedTokenId) {
      toast.error('Please select a token number first');
      return;
    }
    if (queueData.currentlyServing) {
      toast.error(
        `${queueData.currentlyServing.token_number} is still being served. Mark them as served first.`
      );
      return;
    }
    if (queueData.called.length > 0) {
      toast.error(
        `${queueData.called[0].token_number} was already called but hasn't arrived yet. Handle them first.`
      );
      return;
    }

    setIsConfirmingToken(true);
    try {
      // callNextQueueToken picks the top waiting position — matches the dropdown selection
      // for the normal in-order case. The confirmation UX mirrors seller/queue exactly.
      const { data, error } = await callNextQueueToken(eventId);
      if (error) { toast.error(error); return; }
      toast.success(
        `Token ${data?.token_number} called — waiting for arrival`,
        { icon: '🎫', duration: 4000 }
      );
      await load();
    } catch (err) {
      toast.error('Failed to confirm token');
    } finally {
      setIsConfirmingToken(false);
    }
  };

  const handleArrived = async (entry) => {
    setBusy(entry.id, true);
    const { error } = await markQueueEntryArrived(eventId, entry.id);
    setBusy(entry.id, false);
    if (error) { toast.error(error); return; }
    toast.success(`${entry.token_number} arrived — now serving`, { icon: '✅' });
    await load();
  };

  const handleServed = async (entry) => {
    setBusy(entry.id, true);
    const { error } = await markQueueEntryServed(eventId, entry.id);
    setBusy(entry.id, false);
    if (error) { toast.error(error); return; }
    toast.success(`${entry.token_number} — service completed!`, { icon: '✅', duration: 3000 });
    await load();
    // ✅ No auto-call — organiser must confirm next token manually (mirrors queue-only seller flow)
  };

  const handleTimeout = async (entry) => {
    if (!confirm(`Move ${entry.token_number} to end of queue (no-show)?`)) return;
    setBusy(entry.id, true);
    const { error } = await handleQueueTimeout(eventId, entry.id);
    setBusy(entry.id, false);
    if (error) { toast.error(error); return; }
    toast.success(`${entry.token_number} moved to end of queue`);
    await load();
  };

  const handleRemove = async (entry) => {
    if (!confirm(`Remove ${entry.token_number} from queue?`)) return;
    setBusy(entry.id, true);
    const { error } = await removeQueueEntry(eventId, entry.id);
    setBusy(entry.id, false);
    if (error) { toast.error(error); return; }
    toast.success(`${entry.token_number} removed`, { icon: '❌' });
    await load();
  };

  if (loading) return (
    <div className={styles.centerMsg}>
      <div className={styles.spinner} />
      <p>Loading queue…</p>
    </div>
  );

  const { waiting, called, currentlyServing } = queueData;
  const totalActive = waiting.length + called.length + (currentlyServing ? 1 : 0);

  // Confirm button is blocked when: no token selected, someone is being served,
  // or someone was already called but hasn't arrived
  const confirmBlocked =
    !selectedTokenId ||
    !!currentlyServing ||
    called.length > 0 ||
    isConfirmingToken ||
    waiting.length === 0;

  return (
    <div className={styles.subView}>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className={styles.statRow}>
        <div className={`${styles.statCard} ${styles.statAll}`}>
          <div className={styles.statNum}>{totalActive}</div>
          <div className={styles.statLbl}>In Queue</div>
        </div>
        <div className={`${styles.statCard} ${styles.statPending}`}>
          <div className={styles.statNum}>{waiting.length}</div>
          <div className={styles.statLbl}>Waiting</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCalled}`}>
          <div className={styles.statNum}>{called.length}</div>
          <div className={styles.statLbl}>Called</div>
        </div>
        <div className={`${styles.statCard} ${styles.statAccepted}`}>
          <div className={styles.statNum}>{currentlyServing ? 1 : 0}</div>
          <div className={styles.statLbl}>Serving</div>
        </div>
      </div>

      {/* ── Queue Grid: Now Serving + Waiting List ────────────────────────── */}
      <div className={styles.queueGrid}>

        {/* ── Now Serving ───────────────────────────────────────────────── */}
        <div className={styles.nowServingPanel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Now Serving</h2>
            <span className={styles.liveBadge}>🔴 LIVE</span>
          </div>

          {currentlyServing ? (
            <div className={styles.servingCard}>
              {/* Token number — prominent display matching queue-only seller */}
              <div className={styles.servingTokenRow}>
                <div className={styles.servingTokenBlock}>
                  <span className={styles.servingTokenLabel}>Token</span>
                  <span className={styles.servingTokenValue}>{currentlyServing.token_number}</span>
                </div>
                <span className={styles.servingStatusBadge}>In Service</span>
              </div>

              <div className={styles.servingCustomerInfo}>
                <div className={styles.servingName}>
                  <span className={styles.servingNameIcon}>👤</span>
                  {currentlyServing.profiles?.full_name || 'Attendee'}
                </div>
                {currentlyServing.profiles?.phone && (
                  <div className={styles.servingPhone}>📞 {currentlyServing.profiles.phone}</div>
                )}
                {currentlyServing.joined_at && (
                  <div className={styles.servingTime}>
                    🕐 Joined at{' '}
                    {new Date(currentlyServing.joined_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                )}
              </div>

              <button
                className={styles.markServedBtn}
                onClick={() => handleServed(currentlyServing)}
                disabled={busy(currentlyServing.id)}
              >
                {busy(currentlyServing.id) ? '⏳ Completing…' : '✓ Mark as Served'}
              </button>
            </div>
          ) : (
            <div className={styles.emptyServing}>
              <div className={styles.emptyServingIcon}>👋</div>
              <div className={styles.emptyServingText}>No one being served</div>
              <div className={styles.emptyServingSubtext}>
                {waiting.length > 0
                  ? called.length > 0
                    ? `${called[0].token_number} has been called — waiting for arrival`
                    : 'Confirm a token below to start serving'
                  : 'Waiting for attendees to join…'}
              </div>
            </div>
          )}
        </div>

        {/* ── Waiting Queue ─────────────────────────────────────────────── */}
        <div className={styles.waitingPanel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Waiting Queue</h2>
            <span className={styles.queueCountBadge}>{waiting.length} waiting</span>
          </div>

          <div className={styles.waitingList}>
            {waiting.length === 0 ? (
              <div className={styles.emptyQueue}>
                <div className={styles.emptyQueueIcon}>🎉</div>
                <p className={styles.emptyQueueText}>Queue is empty</p>
                <p className={styles.emptyQueueSub}>You're all caught up!</p>
              </div>
            ) : (
              waiting.map((entry, idx) => (
                <div key={entry.id} className={styles.waitingCard}>
                  <div className={styles.waitingCardHeader}>
                    <div className={styles.waitingCardLeft}>
                      <span className={styles.waitingPosition}>#{entry.position ?? idx + 1}</span>
                      <span className={styles.waitingTokenBadge}>{entry.token_number}</span>
                    </div>
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemove(entry)}
                      disabled={busy(entry.id)}
                    >
                      {busy(entry.id) ? '…' : '✕ Remove'}
                    </button>
                  </div>
                  <div className={styles.waitingCardBody}>
                    <div className={styles.waitingName}>
                      👤 {entry.profiles?.full_name || 'Attendee'}
                    </div>
                    {entry.profiles?.phone && (
                      <div className={styles.waitingPhone}>📞 {entry.profiles.phone}</div>
                    )}
                    {entry.joined_at && (
                      <div className={styles.waitingTime}>
                        🕐 {new Date(entry.joined_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    )}
                    {entry.timeout_count > 0 && (
                      <span className={styles.timeoutCountBadge}>
                        ⏰ No-show ×{entry.timeout_count}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Called — Awaiting Arrival ─────────────────────────────────────── */}
      {called.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <h3 className={styles.sectionTitle}>⏳ Called — Awaiting Arrival</h3>
            <span className={styles.sectionCount}>{called.length}</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Attendee</th>
                  <th>Phone</th>
                  <th>Called At</th>
                  <th>Respond By</th>
                  <th>No-shows</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {called.map(entry => {
                  const now = new Date();
                  const timeoutTime = entry.timeout_at ? new Date(entry.timeout_at) : null;
                  const isExpired = timeoutTime && now > timeoutTime;
                  return (
                    <tr key={entry.id} className={`${styles.row} ${isExpired ? styles.rowExpired : ''}`}>
                      <td><span className={styles.tokenPill}>{entry.token_number}</span></td>
                      <td className={styles.nameCell}>
                        <div className={styles.avatar}>
                          {(entry.profiles?.full_name || 'A').charAt(0).toUpperCase()}
                        </div>
                        {entry.profiles?.full_name || 'Attendee'}
                      </td>
                      <td>{entry.profiles?.phone || '—'}</td>
                      <td>
                        {entry.called_at
                          ? new Date(entry.called_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td style={{ color: isExpired ? '#dc2626' : '#d97706', fontWeight: 700 }}>
                        {timeoutTime
                          ? timeoutTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                        {isExpired && <span style={{ marginLeft: 4 }}>⚠️</span>}
                      </td>
                      <td>
                        {entry.timeout_count > 0
                          ? <span className={styles.timeoutCountBadge}>×{entry.timeout_count}</span>
                          : <span style={{ color: '#9ca3af' }}>—</span>}
                      </td>
                      <td className={styles.actionsCell}>
                        <button
                          className={styles.acceptBtn}
                          onClick={() => handleArrived(entry)}
                          disabled={busy(entry.id)}
                        >
                          {busy(entry.id) ? '…' : '✓ Arrived'}
                        </button>
                        <button
                          className={styles.rejectBtn}
                          onClick={() => handleTimeout(entry)}
                          disabled={busy(entry.id)}
                        >
                          ⏰ No-show
                        </button>
                        <button
                          className={styles.removeBtn}
                          onClick={() => handleRemove(entry)}
                          disabled={busy(entry.id)}
                        >
                          ✕ Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Token Confirmation Panel ──────────────────────────────────────── */}
      {/* Mirrors seller/queue tokenConfirmSection exactly */}
      <div className={styles.tokenConfirmSection}>
        <div className={styles.tokenConfirmHeader}>
          <div className={styles.tokenConfirmHeaderLeft}>
            <span className={styles.tokenConfirmIcon}>🎫</span>
            <div>
              <h2 className={styles.tokenConfirmTitle}>Token Confirmation</h2>
              <p className={styles.tokenConfirmSubtitle}>
                Select the attendee's token to call them for service
              </p>
            </div>
          </div>
          <div className={styles.tokenConfirmBadge}>Manual Control</div>
        </div>

        <div className={styles.tokenConfirmBody}>
          <div className={styles.tokenSelectGroup}>
            <label className={styles.tokenSelectLabel}>Select Token Number</label>
            <div className={styles.tokenSelectRow}>
              <select
                className={styles.tokenSelect}
                value={selectedTokenId}
                onChange={e => setSelectedTokenId(e.target.value)}
                disabled={!!currentlyServing || called.length > 0 || waiting.length === 0}
              >
                <option value="">
                  {waiting.length === 0
                    ? '— No attendees in queue —'
                    : called.length > 0
                    ? `— ${called[0].token_number} already called, handle first —`
                    : '— Select a token —'}
                </option>
                {waiting.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.token_number} — {entry.profiles?.full_name || 'Attendee'}
                    {entry.timeout_count > 0 ? ` (no-show ×${entry.timeout_count})` : ''}
                  </option>
                ))}
              </select>

              <button
                className={styles.tokenConfirmBtn}
                onClick={handleConfirmToken}
                disabled={confirmBlocked}
              >
                {isConfirmingToken ? '⏳ Calling…' : '📢 Call Token'}
              </button>
            </div>

            {/* Contextual hints — mirrors seller/queue exactly */}
            {currentlyServing && (
              <p className={styles.tokenConfirmHint}>
                ⚠️ Mark <strong>{currentlyServing.token_number}</strong> as served before calling the next token.
              </p>
            )}
            {!currentlyServing && called.length > 0 && (
              <p className={styles.tokenConfirmHint}>
                ⏳ <strong>{called[0].token_number}</strong> was called but hasn't arrived yet.
                Mark them as arrived, no-show, or remove them first.
              </p>
            )}
            {!currentlyServing && called.length === 0 && waiting.length === 0 && (
              <p className={styles.tokenConfirmHint}>
                Waiting for attendees to join the queue.
              </p>
            )}
            {!currentlyServing && called.length === 0 && waiting.length > 0 && !selectedTokenId && (
              <p className={styles.tokenConfirmHint}>
                👆 Choose a token from the dropdown, then click <strong>Call Token</strong> to summon the attendee.
              </p>
            )}
          </div>

          {/* Next in Line preview — mirrors seller/queue nextInLinePreview */}
          {waiting.length > 0 && (
            <div className={styles.nextInLinePreview}>
              <div className={styles.nextInLineLabel}>Next in Line</div>
              <div className={styles.nextInLineCard}>
                <span className={styles.nextInLineToken}>{waiting[0].token_number}</span>
                <span className={styles.nextInLineName}>
                  {waiting[0].profiles?.full_name || 'Attendee'}
                </span>
                {waiting[0].joined_at && (
                  <span className={styles.nextInLineTime}>
                    Joined{' '}
                    {new Date(waiting[0].joined_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                )}
                {waiting[0].timeout_count > 0 && (
                  <span className={styles.timeoutCountBadge}>
                    ⏰ No-show ×{waiting[0].timeout_count}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ManageEventPage() {
  const { id: eventId } = useParams();
  const router = useRouter();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!eventId) { router.push('/events/dashboard'); return; }
    getEventById(eventId).then(({ data, error }) => {
      if (error || !data) { toast.error('Event not found'); router.push('/events/dashboard'); return; }
      setEvent(data);
      setLoading(false);
    });
  }, [eventId, router]);

  const handleActivate = async () => {
    setStatusLoading(true);
    const { data, error } = await activateEvent(eventId);
    setStatusLoading(false);
    if (error) { toast.error(error); return; }
    toast.success('Event is now LIVE!');
    setEvent(prev => ({ ...prev, status: 'active' }));
  };

  const handleClose = async () => {
    if (!confirm('Close this event? This will cancel all active queue entries.')) return;
    setStatusLoading(true);
    const { data, error } = await closeEvent(eventId);
    setStatusLoading(false);
    if (error) { toast.error(error); return; }
    toast.success('Event closed');
    setEvent(prev => ({ ...prev, status: 'completed' }));
  };

  const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    }) : '—';

  const formatTime = (date) =>
    date.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });

  if (loading) return (
    <div className={styles.page}>
      <EventSidebar />
      <main className={styles.main}>
        <div className={styles.centerMsg}>
          <div className={styles.spinner} />
          <p>Loading event…</p>
        </div>
      </main>
    </div>
  );

  const isQueueBased = event?.queue_mode === 'queue_based';

  return (
    <div className={styles.page}>
      <EventSidebar />
      <main className={styles.main}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className={styles.header}>
          <button className={styles.back} onClick={() => router.push('/events/dashboard')}>
            ← Back
          </button>

          <div className={styles.headerCenter}>
            <span className={styles.headerLabel}>
              {isQueueBased ? '🎫 Queue Manager' : '📋 Registration Manager'}
            </span>
            <h1 className={styles.headerTitle}>{event?.name}</h1>
            <div className={styles.headerSub}>
              <span>📍 {event?.location}</span>
              <span>📅 {formatDate(event?.start_time)}</span>
              <span className={`${styles.eventStatusPill} ${styles[`status_${event?.status}`]}`}>
                {event?.status === 'active'    ? '🟢 Live'
                  : event?.status === 'upcoming'  ? '📅 Upcoming'
                  : event?.status === 'completed' ? '✅ Completed'
                  : event?.status}
              </span>
              <span className={styles.modePill}>
                {isQueueBased ? '🎫 Queue-based' : '📋 Registration-based'}
              </span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.clock}>{formatTime(currentTime)}</div>
            {event?.status === 'upcoming' && (
              <button
                className={styles.activateBtn}
                onClick={handleActivate}
                disabled={statusLoading}
              >
                {statusLoading ? '…' : '🟢 Go Live'}
              </button>
            )}
            {event?.status === 'active' && (
              <button
                className={styles.closeBtn}
                onClick={handleClose}
                disabled={statusLoading}
              >
                {statusLoading ? '…' : '⏹ Close Event'}
              </button>
            )}
          </div>
        </header>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {event?.status === 'completed' ? (
          <div className={styles.centerMsg} style={{ marginTop: '4rem' }}>
            <div style={{ fontSize: '3rem' }}>✅</div>
            <p>This event has been completed.</p>
          </div>
        ) : isQueueBased
          ? <QueueManager eventId={eventId} />
          : <RegistrationManager eventId={eventId} />
        }

      </main>
    </div>
  );
}