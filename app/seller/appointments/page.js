'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Calendar, Clock, Loader2, Trash2, Check, X, RefreshCw } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import styles from './SellerAppointments.module.css';
import { supabase } from '@/lib/supabase/client';
import { getSellerStoreId } from '@/lib/api/queue';
import {
  getSellerSlots,
  createSlot,
  deactivateSlot,
  bulkCreateSlots,
  generateDaySlots,
  getSellerAppointments,
  updateAppointmentStatus,
  getSellerServices,
  createService,
  deleteService,
  subscribeToAppointments,
} from '@/lib/api/appointments';
import toast from 'react-hot-toast';

// Auto-reload interval
const RELOAD_INTERVAL = 15_000; // 15 seconds

// ── Date helpers ──────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

const STATUS_LABELS = {
  booked: 'Booked', completed: 'Completed',
  cancelled: 'Cancelled', no_show: 'No Show',
};

const STATUS_COLORS = {
  booked:    '#2563EB',
  completed: '#059669',
  cancelled: '#DC2626',
  no_show:   '#D97706',
};

// ── Appointments Tab ──────────────────────────────────────────
function AppointmentsTab({ storeId }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState('booked');
  const [dateFilter, setDateFilter]     = useState('');
  const [dbError, setDbError]           = useState(null);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setDbError(null);
    try {
      const { data, error } = await getSellerAppointments(storeId, {
        status: filter === 'all' ? null : filter,
        date: dateFilter || null,
      });
      if (error) setDbError(error);
      setAppointments(data || []);
      setLastUpdated(new Date());
    } catch (err) {
      setDbError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [storeId, filter, dateFilter]);

  // Initial load + when filters change
  useEffect(() => { load(false); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const unsub = subscribeToAppointments(storeId, () => load(true));
    return unsub;
  }, [storeId, load]);

  // Polling fallback every 15s
  useEffect(() => {
    pollRef.current = setInterval(() => load(true), RELOAD_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [load]);

  const handleStatus = async (apptId, status) => {
    const { error } = await updateAppointmentStatus(apptId, status);
    if (error) { toast.error(error); return; }
    toast.success(`Marked as ${STATUS_LABELS[status]}`);
    load(true);
  };

  return (
    <div>
      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          {['booked', 'completed', 'cancelled', 'no_show', 'all'].map(s => (
            <button
              key={s}
              className={`${styles.filterBtn} ${filter === s ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter(s)}
            >
              {STATUS_LABELS[s] || 'All'}
            </button>
          ))}
        </div>
        <input
          type="date"
          className={styles.dateInput}
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
        />
        {dateFilter && (
          <button className={styles.clearBtn} onClick={() => setDateFilter('')}>Clear</button>
        )}
        {/* Live indicator */}
        {lastUpdated && (
          <div className={styles.reloadIndicator}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
            Live
          </div>
        )}
      </div>

      {dbError && (
        <div className={styles.errorBanner}>⚠️ {dbError}</div>
      )}

      {loading ? (
        <div className={styles.loading}>
          <Loader2 className={styles.spinner} />
          <p>Loading appointments…</p>
        </div>
      ) : appointments.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📅</div>
          <p>No {filter !== 'all' ? STATUS_LABELS[filter]?.toLowerCase() : ''} appointments found.</p>
        </div>
      ) : (
        <div className={styles.appointmentsList}>
          {appointments.map(appt => (
            <div key={appt.id} className={styles.appointmentCard}>
              <div className={styles.apptHeader}>
                <div className={styles.apptDateTime}>
                  <span className={styles.apptDate}>{formatDate(appt.appointment_date)}</span>
                  <span className={styles.apptTime}>
                    {formatTime(appt.start_time)} – {formatTime(appt.end_time)}
                  </span>
                </div>
                <span
                  className={styles.apptStatusBadge}
                  style={{
                    background: `${STATUS_COLORS[appt.status]}12`,
                    color: STATUS_COLORS[appt.status],
                    border: `1px solid ${STATUS_COLORS[appt.status]}25`,
                  }}
                >
                  {STATUS_LABELS[appt.status]}
                </span>
              </div>

              <div className={styles.apptCustomer}>
                <span className={styles.apptCustomerIcon}>👤</span>
                <div>
                  <div className={styles.apptCustomerName}>
                    {appt.customer?.full_name || 'Patient'}
                  </div>
                  {appt.customer?.phone && (
                    <div className={styles.apptCustomerPhone}>📞 {appt.customer.phone}</div>
                  )}
                </div>
              </div>

              {Array.isArray(appt.services) && appt.services.length > 0 && (
                <div className={styles.apptServices}>
                  {appt.services.map((s, i) => (
                    <span key={i} className={styles.apptServiceTag}>
                      {s.name}{s.price ? ` — ₹${s.price}` : ''}
                    </span>
                  ))}
                </div>
              )}

              {appt.notes && (
                <div className={styles.apptNotes}>📝 {appt.notes}</div>
              )}

              {appt.status === 'booked' && (
                <div className={styles.apptActions}>
                  <button
                    className={`${styles.apptActionBtn} ${styles.apptActionComplete}`}
                    onClick={() => handleStatus(appt.id, 'completed')}
                  >
                    <Check size={14} /> Complete
                  </button>
                  <button
                    className={`${styles.apptActionBtn} ${styles.apptActionNoShow}`}
                    onClick={() => handleStatus(appt.id, 'no_show')}
                  >
                    No Show
                  </button>
                  <button
                    className={`${styles.apptActionBtn} ${styles.apptActionCancel}`}
                    onClick={() => handleStatus(appt.id, 'cancelled')}
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Slots Tab ─────────────────────────────────────────────────
function SlotsTab({ storeId }) {
  const [slots, setSlots]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [showBulk, setShowBulk]     = useState(false);
  const [dateFilter, setDateFilter] = useState(today());
  const pollRef = useRef(null);

  const [newSlot, setNewSlot] = useState({
    slot_date: today(), start_time: '09:00', end_time: '09:30', max_bookings: 1,
  });
  const [creating, setCreating] = useState(false);

  const [bulkForm, setBulkForm] = useState({
    date: today(), open: '09:00', close: '17:00', duration: 30, max: 1,
  });
  const [bulkCreating, setBulkCreating] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await getSellerSlots(storeId, dateFilter || null);
    setSlots(data || []);
    if (!silent) setLoading(false);
  }, [storeId, dateFilter]);

  useEffect(() => { load(false); }, [load]);

  // Realtime + polling
  useEffect(() => {
    const unsub = subscribeToAppointments(storeId, () => load(true));
    pollRef.current = setInterval(() => load(true), RELOAD_INTERVAL);
    return () => { unsub(); clearInterval(pollRef.current); };
  }, [storeId, load]);

  const handleCreate = async () => {
    setCreating(true);
    const { error } = await createSlot({ storeId, ...newSlot });
    if (error) { toast.error(error); }
    else { toast.success('Slot created'); setShowForm(false); load(true); }
    setCreating(false);
  };

  const handleBulkCreate = async () => {
    setBulkCreating(true);
    const slotsToCreate = generateDaySlots(
      storeId, bulkForm.date, bulkForm.open, bulkForm.close,
      Number(bulkForm.duration), Number(bulkForm.max),
    );
    if (!slotsToCreate.length) { toast.error('No slots generated — check times'); setBulkCreating(false); return; }
    const { error } = await bulkCreateSlots(slotsToCreate);
    if (error) { toast.error(error); }
    else { toast.success(`${slotsToCreate.length} slots created`); setShowBulk(false); load(true); }
    setBulkCreating(false);
  };

  const handleDeactivate = async slotId => {
    if (!window.confirm('Remove this slot?')) return;
    const { error } = await deactivateSlot(slotId);
    if (error) { toast.error(error); return; }
    toast.success('Slot removed');
    load(true);
  };

  const previewCount = generateDaySlots('x', bulkForm.date, bulkForm.open, bulkForm.close, Number(bulkForm.duration), 1).length;

  return (
    <div>
      <div className={styles.slotToolbar}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="date"
            className={styles.dateInput}
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
          />
          <button className={styles.iconBtn} onClick={() => load(false)} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={styles.secondaryBtn} onClick={() => { setShowBulk(v => !v); setShowForm(false); }}>
            <Calendar size={15} /> Bulk Generate
          </button>
          <button className={styles.primaryBtn} onClick={() => { setShowForm(v => !v); setShowBulk(false); }}>
            <Plus size={15} /> Add Slot
          </button>
        </div>
      </div>

      {showForm && (
        <div className={styles.inlineForm}>
          <h3 className={styles.formTitle}>Add a slot</h3>
          <div className={styles.formGrid}>
            {[
              { label: 'Date',         type: 'date',   key: 'slot_date'    },
              { label: 'Start time',   type: 'time',   key: 'start_time'   },
              { label: 'End time',     type: 'time',   key: 'end_time'     },
              { label: 'Max bookings', type: 'number', key: 'max_bookings' },
            ].map(f => (
              <div key={f.key} className={styles.formGroup}>
                <label>{f.label}</label>
                <input
                  type={f.type}
                  min={f.type === 'number' ? 1 : undefined}
                  value={newSlot[f.key]}
                  onChange={e => setNewSlot(p => ({ ...p, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  className={styles.input}
                />
              </div>
            ))}
          </div>
          <div className={styles.formActions}>
            <button className={styles.secondaryBtn} onClick={() => setShowForm(false)}>Cancel</button>
            <button className={styles.primaryBtn} onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Slot'}
            </button>
          </div>
        </div>
      )}

      {showBulk && (
        <div className={styles.inlineForm}>
          <h3 className={styles.formTitle}>Bulk generate slots for a day</h3>
          <div className={styles.formGrid}>
            {[
              { label: 'Date',              type: 'date',   key: 'date',     step: undefined },
              { label: 'Opening time',      type: 'time',   key: 'open',     step: undefined },
              { label: 'Closing time',      type: 'time',   key: 'close',    step: undefined },
              { label: 'Slot duration (min)',type:'number',  key: 'duration', step: 5 },
              { label: 'Max bookings / slot',type:'number',  key: 'max',      step: undefined },
            ].map(f => (
              <div key={f.key} className={styles.formGroup}>
                <label>{f.label}</label>
                <input
                  type={f.type}
                  min={f.type === 'number' ? (f.key === 'duration' ? 5 : 1) : undefined}
                  step={f.step}
                  value={bulkForm[f.key]}
                  onChange={e => setBulkForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className={styles.input}
                />
              </div>
            ))}
          </div>
          <p className={styles.formHint}>
            This will create <strong>{previewCount}</strong> slot{previewCount !== 1 ? 's' : ''}.
          </p>
          <div className={styles.formActions}>
            <button className={styles.secondaryBtn} onClick={() => setShowBulk(false)}>Cancel</button>
            <button className={styles.primaryBtn} onClick={handleBulkCreate} disabled={bulkCreating}>
              {bulkCreating ? 'Creating…' : 'Generate Slots'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}><Loader2 className={styles.spinner} /><p>Loading slots…</p></div>
      ) : slots.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🗓</div>
          <p>No slots for {dateFilter ? formatDate(dateFilter) : 'any date'}.</p>
        </div>
      ) : (
        <div className={styles.slotsGrid}>
          {slots.map(slot => (
            <div
              key={slot.id}
              className={[
                styles.slotCard,
                slot.isFull ? styles.slotFull : '',
                !slot.is_active ? styles.slotInactive : '',
              ].join(' ')}
            >
              <div className={styles.slotTime}>{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</div>
              <div className={styles.slotDate}>{formatDate(slot.slot_date)}</div>
              <div className={styles.slotMeta}>
                <span className={`${styles.slotCapacity} ${slot.isFull ? styles.slotCapacityFull : ''}`}>
                  {slot.current_bookings}/{slot.max_bookings} booked
                </span>
                {!slot.is_active && <span className={styles.slotInactiveBadge}>Inactive</span>}
              </div>
              {slot.current_bookings === 0 && slot.is_active && (
                <button className={styles.slotDeleteBtn} onClick={() => handleDeactivate(slot.id)} title="Remove">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Services Tab ──────────────────────────────────────────────
function ServicesTab({ storeId }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSvc, setNewSvc]     = useState({ name: '', description: '', price: '', duration_minutes: 30 });

  const load = async () => {
    setLoading(true);
    const { data } = await getSellerServices(storeId);
    setServices(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [storeId]);

  const handleCreate = async () => {
    if (!newSvc.name.trim()) { toast.error('Service name is required'); return; }
    setCreating(true);
    const { error } = await createService({
      storeId,
      name: newSvc.name.trim(),
      description: newSvc.description || null,
      price: newSvc.price ? Number(newSvc.price) : null,
      durationMinutes: Number(newSvc.duration_minutes),
    });
    if (error) { toast.error(error); }
    else {
      toast.success('Service added');
      setShowForm(false);
      setNewSvc({ name: '', description: '', price: '', duration_minutes: 30 });
      load();
    }
    setCreating(false);
  };

  const handleDelete = async id => {
    if (!window.confirm('Remove this service?')) return;
    const { error } = await deleteService(id);
    if (error) { toast.error(error); return; }
    toast.success('Service removed');
    load();
  };

  return (
    <div>
      <div className={styles.slotToolbar}>
        <p className={styles.servicesSubtext}>
          Tests / services displayed to patients during booking. Prices are informational.
        </p>
        <button className={styles.primaryBtn} onClick={() => setShowForm(v => !v)}>
          <Plus size={15} /> Add Service
        </button>
      </div>

      {showForm && (
        <div className={styles.inlineForm}>
          <h3 className={styles.formTitle}>Add a test / service</h3>
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>Service name *</label>
              <input
                placeholder="e.g. Complete Blood Count"
                value={newSvc.name}
                onChange={e => setNewSvc(p => ({ ...p, name: e.target.value }))}
                className={styles.input}
              />
            </div>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>Description</label>
              <input
                placeholder="Brief description"
                value={newSvc.description}
                onChange={e => setNewSvc(p => ({ ...p, description: e.target.value }))}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Price (₹)</label>
              <input
                type="number" min="0" placeholder="0"
                value={newSvc.price}
                onChange={e => setNewSvc(p => ({ ...p, price: e.target.value }))}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Duration (min)</label>
              <input
                type="number" min="5" step="5"
                value={newSvc.duration_minutes}
                onChange={e => setNewSvc(p => ({ ...p, duration_minutes: e.target.value }))}
                className={styles.input}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <button className={styles.secondaryBtn} onClick={() => setShowForm(false)}>Cancel</button>
            <button className={styles.primaryBtn} onClick={handleCreate} disabled={creating}>
              {creating ? 'Adding…' : 'Add Service'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}><Loader2 className={styles.spinner} /></div>
      ) : services.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🧪</div>
          <p>No services yet. Add tests / services for patients to select.</p>
        </div>
      ) : (
        <div className={styles.servicesList}>
          {services.map(svc => (
            <div key={svc.id} className={styles.serviceCard}>
              <div className={styles.serviceInfo}>
                <div className={styles.serviceName}>{svc.name}</div>
                {svc.description && <div className={styles.serviceDesc}>{svc.description}</div>}
                <div className={styles.serviceMeta}>
                  {svc.price != null && <span>₹{svc.price}</span>}
                  {svc.duration_minutes && <span>⏱ {svc.duration_minutes} min</span>}
                </div>
              </div>
              <button className={styles.serviceDeleteBtn} onClick={() => handleDelete(svc.id)}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function SellerAppointmentsPage() {
  const [storeId, setStoreId]     = useState(null);
  const [storeName, setStoreName] = useState('');
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('appointments');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const detect = () => {
      const sidebar = document.querySelector('[class*="sidebar"]');
      if (sidebar) setSidebarCollapsed(sidebar.offsetWidth < 120);
    };
    detect();
    const obs = new ResizeObserver(detect);
    const sidebar = document.querySelector('[class*="sidebar"]');
    if (sidebar) obs.observe(sidebar);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: store } = await getSellerStoreId();
      if (store) { setStoreId(store.id); setStoreName(store.store_name); }
      setLoading(false);
    })();
  }, []);

  const tabs = [
    { id: 'appointments', label: 'Appointments',    icon: '📅' },
    { id: 'slots',        label: 'Manage Slots',    icon: '🗓' },
    { id: 'services',     label: 'Tests / Services', icon: '🧪' },
  ];

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <Sidebar />
        <main className={styles.mainContent}>
          <div className={styles.loading}>
            <Loader2 className={styles.spinner} />
            <p>Loading…</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <Sidebar />
      <main className={[styles.mainContent, sidebarCollapsed ? styles.mainContentCollapsed : ''].join(' ')}>
        <header className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>Appointments</h1>
            {storeName && <p className={styles.pageSubtitle}>{storeName}</p>}
          </div>
        </header>

        <div className={styles.tabsNav}>
          {tabs.map(t => (
            <button
              key={t.id}
              className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {storeId && activeTab === 'appointments' && <AppointmentsTab storeId={storeId} />}
        {storeId && activeTab === 'slots'        && <SlotsTab storeId={storeId} />}
        {storeId && activeTab === 'services'     && <ServicesTab storeId={storeId} />}

        {!storeId && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🏪</div>
            <p>No store found. Please complete your store registration first.</p>
          </div>
        )}
      </main>
    </div>
  );
}