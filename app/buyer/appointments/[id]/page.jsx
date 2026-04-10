'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  ChevronLeft, Calendar, Clock, CheckCircle,
  Loader2, ChevronRight, Bell, BellOff, Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { fetchStoreById } from '@/lib/api/stores';
import {
  getAvailableSlots,
  getSlotsForDate,
  getStoreServices,
  bookAppointment,
  getCustomerRecord,
  subscribeToAppointments,
} from '@/lib/api/appointments';
import { getCategoryConfig } from '@/lib/categoryConfig';
import QRPaymentModal from '@/app/components/QRPaymentModal';
import toast from 'react-hot-toast';

import './appointments.css';

// ─── Helpers ─────────────────────────────────────────────────
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateShort(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// ─── Step Bar ─────────────────────────────────────────────────
function StepBar({ step, color }) {
  const steps = ['Date', 'Time', 'Tests', 'Confirm'];
  return (
    <div className="appt-stepbar">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done   = step > idx;
        const active = step === idx;
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div className="appt-stepbar-item">
              <div
                className={`appt-stepbar-circle ${done ? 'done' : active ? 'active' : 'pending'}`}
                style={done || active ? { background: color, borderColor: color, boxShadow: active ? `0 0 0 4px ${color}22` : 'none' } : {}}
              >
                {done ? '✓' : idx}
              </div>
              <span className={`appt-stepbar-label ${active ? 'active' : ''}`} style={active ? { color } : {}}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`appt-stepbar-connector ${step > idx ? 'done' : 'pending'}`}
                style={step > idx ? { background: color } : {}}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Reminder Toggle ──────────────────────────────────────────
function ReminderSection({ enabled, onChange, color }) {
  return (
    <div className="appt-reminder-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {enabled ? <Bell size={18} color={color} /> : <BellOff size={18} color="#8896A8" />}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--appt-font-display)', fontWeight: 600, fontSize: '0.875rem', color: 'var(--appt-text-1)' }}>
            Set Reminder
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--appt-text-3)', marginTop: 1 }}>
            {enabled ? '1 hour before your appointment' : 'No reminder set'}
          </div>
        </div>
      </div>
      <label className="appt-toggle">
        <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} />
        <span className="appt-toggle-slider" />
      </label>
    </div>
  );
}

// ─── Confirmation Page ────────────────────────────────────────
function ConfirmationPage({ appt, store, config, selectedServices, notes, reminder, onViewAppointments, onBackToStore, storeId }) {
  const router = useRouter();
  const totalAmount = selectedServices.reduce((s, svc) => s + (svc.price || 0), 0);

  return (
    <div className="appt-confirm-page appt-fade-up" style={{ fontFamily: 'var(--appt-font-body)' }}>
      {/* Success banner */}
      <div className="appt-confirm-banner" style={{ background: `linear-gradient(135deg, ${config.color}18 0%, ${config.color}08 100%)`, borderBottom: `1px solid ${config.color}20` }}>
        <div className="appt-confirm-banner-icon" style={{ background: `${config.color}20`, border: `2px solid ${config.color}30` }}>
          <CheckCircle size={40} color={config.color} />
        </div>
        <h1 className="appt-confirm-banner-title" style={{ fontFamily: 'var(--appt-font-display)', color: 'var(--appt-text-1)' }}>
          Appointment Confirmed!
        </h1>
        <p className="appt-confirm-banner-sub">
          Your booking at <strong>{store?.store_name}</strong> is confirmed.
        </p>

        {/* Live tracking badge */}
        <div className="appt-live-badge">
          <span className="appt-live-dot" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#059669' }}>Live — Updates automatically</span>
        </div>
      </div>

      <div className="appt-confirm-body">
        {/* Booking ID */}
        <div className="appt-confirm-id-row">
          <span style={{ fontSize: '0.78rem', color: 'var(--appt-text-3)', fontWeight: 600 }}>BOOKING ID</span>
          <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--appt-text-2)', fontWeight: 700 }}>
            #{appt.id?.slice(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Details card */}
        <div className="appt-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          {/* Store */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--appt-border)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${config.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>
              {config.icon}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--appt-font-display)', fontWeight: 700, color: config.color, fontSize: '0.95rem' }}>{store?.store_name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--appt-text-3)', marginTop: 2 }}>{store?.address && `${store.address}, `}{store?.city}</div>
            </div>
          </div>

          {/* Date / Time / Status */}
          <div className="appt-confirm-detail-grid">
            <div className="appt-confirm-detail-item">
              <Calendar size={15} color="var(--appt-text-3)" />
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--appt-text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--appt-text-1)', marginTop: 2 }}>{formatDate(appt.appointment_date)}</div>
              </div>
            </div>

            <div className="appt-confirm-detail-item">
              <Clock size={15} color="var(--appt-text-3)" />
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--appt-text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--appt-text-1)', marginTop: 2 }}>
                  {formatTime(appt.start_time)} – {formatTime(appt.end_time)}
                </div>
              </div>
            </div>

            <div className="appt-confirm-detail-item">
              <CheckCircle size={15} color={config.color} />
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--appt-text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
                <span className="appt-badge appt-badge-booked" style={{ marginTop: 4, display: 'inline-flex' }}>Booked</span>
              </div>
            </div>

            <div className="appt-confirm-detail-item">
              <span style={{ fontSize: '1rem' }}>💳</span>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--appt-text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment</div>
                <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 999, background: '#ECFDF5', color: '#059669', border: '1px solid rgba(5,150,105,0.2)', fontWeight: 700, marginTop: 4, display: 'inline-flex' }}>
                  ✓ Paid
                </span>
              </div>
            </div>
          </div>

          {/* Tests */}
          {selectedServices.length > 0 && (
            <>
              <div className="appt-divider" />
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--appt-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Selected Tests
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedServices.map(svc => (
                  <div key={svc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--appt-surface-2)', borderRadius: 10 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--appt-text-1)' }}>{svc.name}</span>
                    {svc.price && <span style={{ fontWeight: 700, color: config.color, fontSize: '0.875rem' }}>₹{svc.price}</span>}
                  </div>
                ))}
              </div>
              {totalAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '1px dashed var(--appt-border)', marginTop: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Total Paid</span>
                  <span style={{ fontWeight: 800, color: config.color, fontSize: '1.05rem' }}>₹{totalAmount}</span>
                </div>
              )}
            </>
          )}

          {/* Notes */}
          {notes && (
            <>
              <div className="appt-divider" />
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--appt-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--appt-text-2)', fontStyle: 'italic', background: 'var(--appt-surface-2)', padding: '8px 12px', borderRadius: 10 }}>{notes}</div>
            </>
          )}
        </div>

        {/* Reminder section */}
        {reminder && (
          <div className="appt-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${config.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bell size={18} color={config.color} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--appt-text-1)' }}>Reminder Set</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--appt-text-3)', marginTop: 2 }}>You'll be reminded 1 hour before your appointment</div>
            </div>
            <CheckCircle size={16} color={config.color} style={{ marginLeft: 'auto', flexShrink: 0 }} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <button
            onClick={onViewAppointments}
            className="appt-btn appt-btn-accent"
            style={{ background: config.gradient || config.color, width: '100%', padding: '0.95rem', fontSize: '0.95rem', borderRadius: 14 }}
          >
            View My Appointments
          </button>
          <button
            onClick={() => window.print()}
            className="appt-btn appt-btn-outline"
            style={{ width: '100%', borderRadius: 14 }}
          >
            <Download size={16} />
            Download Receipt
          </button>
          <button
            onClick={onBackToStore}
            className="appt-btn appt-btn-ghost"
            style={{ width: '100%', borderRadius: 14, color: 'var(--appt-text-2)', padding: '0.7rem' }}
          >
            Back to Store
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function AppointmentBookingPage() {
  const router       = useRouter();
  const params       = useParams();
  const searchParams = useSearchParams();
  const storeId      = params.id;
  const preselectedServiceId = searchParams.get('service');

  const [step, setStep]             = useState(1);
  const [store, setStore]           = useState(null);
  const [config, setConfig]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [booking, setBooking]       = useState(false);
  const [booked, setBooked]         = useState(false);
  const [bookedAppt, setBookedAppt] = useState(null);

  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate]     = useState(null);
  const [slotsForDate, setSlotsForDate]     = useState([]);
  const [slotsLoading, setSlotsLoading]     = useState(false);
  const [selectedSlot, setSelectedSlot]     = useState(null);

  const [services, setServices]             = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [notes, setNotes]                   = useState('');
  const [reminder, setReminder]             = useState(true);

  const [currentUser, setCurrentUser] = useState(null);
  const [customer, setCustomer]       = useState(null);

  // QR Payment modal
  const [showQR, setShowQR]               = useState(false);
  const [pendingBooking, setPendingBooking] = useState(false);

  // Auto-reload interval ref
  const reloadRef = useRef(null);

  // ── Init ────────────────────────────────────────────────────
  useEffect(() => {
    if (storeId) init();
    return () => { if (reloadRef.current) clearInterval(reloadRef.current); };
  }, [storeId]);

  const init = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Please login'); router.push('/auth/signin'); return; }
      setCurrentUser(user);

      const [storeRes, custRes] = await Promise.all([
        fetchStoreById(storeId),
        getCustomerRecord(user.id),
      ]);

      if (storeRes.data) {
        setStore(storeRes.data);
        let type = (storeRes.data.store_type || 'retail').toLowerCase().trim();
        if (type === 'cafe') type = 'café';
        setConfig(getCategoryConfig(type));
      }

      // Always set customer — even synthetic records are valid for display
      if (custRes.data) {
        setCustomer(custRes.data);
      } else {
        // Fallback: create minimal customer object so booking doesn't null-check fail
        console.warn('getCustomerRecord returned null, using userId fallback');
        setCustomer({ id: null, user_id: user.id, full_name: null });
      }

      const [slotsRes, svcsRes] = await Promise.all([
        getAvailableSlots(storeId),
        getStoreServices(storeId),
      ]);

      setAvailableDates(Object.keys(slotsRes.data || {}).sort());
      setServices(svcsRes.data || []);

      if (preselectedServiceId && svcsRes.data) {
        const svc = svcsRes.data.find(s => s.id === preselectedServiceId);
        if (svc) setSelectedServices([svc]);
      }

      // Auto-reload slots every 30s
      reloadRef.current = setInterval(() => refreshSlots(), 30_000);
    } catch (err) {
      console.error('init error:', err);
      toast.error('Failed to load appointment info');
    } finally {
      setLoading(false);
    }
  };

  const refreshSlots = async () => {
    try {
      const slotsRes = await getAvailableSlots(storeId);
      setAvailableDates(Object.keys(slotsRes.data || {}).sort());
      if (selectedDate) {
        const { data } = await getSlotsForDate(storeId, selectedDate);
        setSlotsForDate(data || []);
      }
    } catch { /* silent */ }
  };

  // Load slots when date changes
  useEffect(() => {
    if (!selectedDate) return;
    (async () => {
      setSlotsLoading(true);
      setSelectedSlot(null);
      try {
        const { data } = await getSlotsForDate(storeId, selectedDate);
        setSlotsForDate(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setSlotsLoading(false);
      }
    })();
  }, [selectedDate]);

  // ── Step logic ──────────────────────────────────────────────
  const goNext = () => setStep(s => Math.min(s + 1, 4));
  const goBack = () => {
    if (step === 1) router.back();
    else setStep(s => s - 1);
  };

  const canProceed = useMemo(() => {
    if (step === 1) return !!selectedDate;
    if (step === 2) return !!selectedSlot;
    if (step === 3) return true;
    return false;
  }, [step, selectedDate, selectedSlot]);

  // ── Confirm → open QR modal ─────────────────────────────────
  const handleConfirmClick = () => {
    // Validate upfront
    if (!selectedSlot) { toast.error('Please select a time slot'); return; }
    if (!currentUser)  { toast.error('Please login to continue'); return; }
    // customer can be synthetic (id=null) — bookAppointment handles that
    setShowQR(true);
  };

  // ── After QR payment success → book ────────────────────────
  const handlePaymentSuccess = async (transactionId) => {
    setShowQR(false);
    setPendingBooking(true);
    try {
      const servicePayload = selectedServices.map(s => ({
        id: s.id, name: s.name, price: s.price,
      }));

      const { data, error } = await bookAppointment({
        slotId:     selectedSlot.id,
        customerId: customer?.id || null,
        userId:     currentUser?.id,  // fallback if customerId null
        notes:      notes || null,
        services:   servicePayload,
      });

      if (error) { toast.error('Booking failed: ' + error); return; }

      setBookedAppt(data);
      setBooked(true);
      toast.success('Appointment booked!', { icon: '📅', duration: 4000 });

      // Clear auto-reload — booking done
      if (reloadRef.current) clearInterval(reloadRef.current);
    } catch (err) {
      console.error('handlePaymentSuccess error:', err);
      toast.error('Booking failed. Please try again.');
    } finally {
      setPendingBooking(false);
    }
  };

  const toggleService = (service) => {
    setSelectedServices(prev =>
      prev.find(s => s.id === service.id)
        ? prev.filter(s => s.id !== service.id)
        : [...prev, service]
    );
  };

  // Derived amount for QR modal
  const totalAmount = selectedServices.reduce((s, svc) => s + (svc.price || 0), 0);

  // ── Loading ─────────────────────────────────────────────────
  if (loading || !config) {
    return (
      <div className="appt-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12, color: 'var(--appt-text-3)' }}>
        <Loader2 className="appt-spin" size={32} />
        <span style={{ fontFamily: 'var(--appt-font-display)', fontSize: '0.9rem' }}>Loading...</span>
      </div>
    );
  }

  // ── Pending booking (after payment, before API response) ────
  if (pendingBooking) {
    return (
      <div className="appt-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
        <Loader2 className="appt-spin" size={32} color={config.color} />
        <span style={{ fontFamily: 'var(--appt-font-display)', fontSize: '0.9rem', color: 'var(--appt-text-2)' }}>Confirming your appointment...</span>
      </div>
    );
  }

  // ── Confirmation page ───────────────────────────────────────
  if (booked && bookedAppt) {
    return (
      <div className="appt-page">
        <ConfirmationPage
          appt={bookedAppt}
          store={store}
          config={config}
          selectedServices={selectedServices}
          notes={notes}
          reminder={reminder}
          onViewAppointments={() => router.push('/buyer/appointments')}
          onBackToStore={() => router.push(`/buyer/store/${storeId}`)}
          storeId={storeId}
        />
      </div>
    );
  }

  // ── Main flow ───────────────────────────────────────────────
  return (
    <div className="appt-page">
      {/* QR Payment Modal */}
      <QRPaymentModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        orderData={{
          storeName: store?.store_name || 'Store',
          orderNumber: `APT-${Date.now().toString().slice(-6)}`,
          totalAmount: totalAmount > 0 ? totalAmount : 1,
        }}
        onPaymentSuccess={handlePaymentSuccess}
      />

      <div className="appt-booking-container">
        {/* Header */}
        <header className="appt-booking-header" style={{ borderBottom: `2px solid ${config.color}22` }}>
          <button className="appt-btn appt-btn-ghost appt-booking-back" onClick={goBack}>
            <ChevronLeft size={22} />
          </button>
          <div className="appt-booking-header-info">
            <h1 className="appt-booking-title" style={{ color: config.color, fontFamily: 'var(--appt-font-display)' }}>
              Book Appointment
            </h1>
            <p className="appt-booking-subtitle">{store?.store_name}</p>
          </div>
          {/* Live reload indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
            <span className="appt-live-dot" title="Auto-refreshing" />
          </div>
        </header>

        <StepBar step={step} color={config.color} />

        <div className="appt-booking-body">
          {/* ── Step 1: Date ───────────────────────────────── */}
          {step === 1 && (
            <div className="appt-fade-up">
              <div className="appt-section-header">
                <Calendar size={18} color={config.color} />
                Select a date
              </div>

              {availableDates.length === 0 ? (
                <div className="appt-empty-state">
                  <span style={{ fontSize: '2.5rem' }}>📅</span>
                  <p>No available slots at this time. Please check back later.</p>
                </div>
              ) : (
                <div className="appt-date-grid">
                  {availableDates.map(date => {
                    const d = new Date(date + 'T00:00:00');
                    const isSelected = selectedDate === date;
                    const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
                    const dayNum  = d.getDate();
                    const month   = d.toLocaleDateString('en-IN', { month: 'short' });

                    return (
                      <button
                        key={date}
                        className={`appt-date-btn ${isSelected ? 'selected' : ''}`}
                        style={{
                          borderColor:  isSelected ? config.color : 'var(--appt-border)',
                          background:   isSelected ? `${config.color}12` : 'var(--appt-surface)',
                          boxShadow:    isSelected ? `0 0 0 2px ${config.color}40` : 'var(--appt-shadow-sm)',
                        }}
                        onClick={() => setSelectedDate(date)}
                      >
                        <span className="appt-date-day">{dayName}</span>
                        <span className="appt-date-num" style={{ color: isSelected ? config.color : 'var(--appt-text-1)' }}>{dayNum}</span>
                        <span className="appt-date-month">{month}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Time ───────────────────────────────── */}
          {step === 2 && (
            <div className="appt-fade-up">
              <div className="appt-section-header">
                <Clock size={18} color={config.color} />
                {formatDateShort(selectedDate)}
              </div>

              {slotsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5rem', gap: 10, color: 'var(--appt-text-3)' }}>
                  <Loader2 className="appt-spin" size={24} color={config.color} />
                  <span style={{ fontFamily: 'var(--appt-font-display)', fontSize: '0.875rem' }}>Loading slots…</span>
                </div>
              ) : slotsForDate.length === 0 ? (
                <div className="appt-empty-state">
                  <span style={{ fontSize: '2.5rem' }}>⏰</span>
                  <p>No slots available for this date.</p>
                </div>
              ) : (
                <div className="appt-slot-grid">
                  {slotsForDate.map(slot => {
                    const isSelected = selectedSlot?.id === slot.id;
                    const full = slot.isFull;
                    return (
                      <button
                        key={slot.id}
                        className={`appt-slot-btn ${isSelected ? 'selected' : ''} ${full ? 'full' : ''}`}
                        disabled={full}
                        style={{
                          borderColor: isSelected ? config.color : full ? 'var(--appt-border)' : 'var(--appt-border)',
                          background:  isSelected ? `${config.color}12` : full ? 'var(--appt-surface-2)' : 'var(--appt-surface)',
                          boxShadow:   isSelected ? `0 0 0 2px ${config.color}40` : 'var(--appt-shadow-sm)',
                        }}
                        onClick={() => !full && setSelectedSlot(slot)}
                      >
                        <span className="appt-slot-time" style={{ color: isSelected ? config.color : full ? 'var(--appt-text-3)' : 'var(--appt-text-1)' }}>
                          {formatTime(slot.start_time)}
                        </span>
                        <span className="appt-slot-end">– {formatTime(slot.end_time)}</span>
                        <span
                          className="appt-slot-pill"
                          style={{
                            background: full ? '#FEF2F2' : '#ECFDF5',
                            color: full ? '#DC2626' : '#059669',
                          }}
                        >
                          {full ? 'Full' : `${slot.available} left`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Tests ──────────────────────────────── */}
          {step === 3 && (
            <div className="appt-fade-up">
              <div className="appt-section-header">
                <span>🧪</span>
                Select tests
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--appt-text-3)', fontWeight: 500 }}>optional</span>
              </div>

              {services.length === 0 ? (
                <div className="appt-empty-state">
                  <span style={{ fontSize: '2.5rem' }}>✅</span>
                  <p>No specific tests listed. Your slot is ready to confirm.</p>
                </div>
              ) : (
                <div className="appt-services-list">
                  {services.map(service => {
                    const selected = !!selectedServices.find(s => s.id === service.id);
                    return (
                      <button
                        key={service.id}
                        className={`appt-service-item ${selected ? 'selected' : ''}`}
                        style={{
                          borderColor: selected ? config.color : 'var(--appt-border)',
                          background:  selected ? `${config.color}09` : 'var(--appt-surface)',
                          boxShadow:   selected ? `0 0 0 2px ${config.color}30` : 'var(--appt-shadow-sm)',
                        }}
                        onClick={() => toggleService(service)}
                      >
                        <div
                          className="appt-service-check"
                          style={{
                            background:  selected ? config.color : 'transparent',
                            borderColor: selected ? config.color : 'var(--appt-border-2)',
                          }}
                        >
                          {selected && <span style={{ color: '#fff', fontSize: '0.65rem', lineHeight: 1 }}>✓</span>}
                        </div>
                        <div className="appt-service-info">
                          <div className="appt-service-name">{service.name}</div>
                          {service.description && <div className="appt-service-desc">{service.description}</div>}
                          {service.duration_minutes && (
                            <div className="appt-service-duration">⏱ {service.duration_minutes} min</div>
                          )}
                        </div>
                        {service.price && (
                          <div className="appt-service-price" style={{ color: config.color }}>
                            ₹{service.price}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Notes */}
              <div style={{ marginTop: '1.25rem' }}>
                <label className="appt-notes-label">Additional notes</label>
                <textarea
                  className="appt-notes-input"
                  placeholder="Any special requirements or info..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Reminder */}
              <ReminderSection enabled={reminder} onChange={setReminder} color={config.color} />
            </div>
          )}

          {/* ── Step 4: Confirm ────────────────────────────── */}
          {step === 4 && (
            <div className="appt-fade-up">
              <div className="appt-section-header">
                <CheckCircle size={18} color={config.color} />
                Review your booking
              </div>

              <div className="appt-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                {/* Store */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.1rem' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${config.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>
                    {config.icon}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--appt-font-display)', fontWeight: 700, color: config.color }}>{store?.store_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--appt-text-3)', marginTop: 2 }}>
                      {store?.address && `${store.address}, `}{store?.city}
                    </div>
                  </div>
                </div>

                <div className="appt-divider" />

                {/* Details */}
                <div className="appt-review-rows">
                  {[
                    { label: 'Date', value: formatDate(selectedDate) },
                    { label: 'Time', value: `${formatTime(selectedSlot?.start_time)} – ${formatTime(selectedSlot?.end_time)}` },
                    { label: 'Patient', value: customer?.full_name || 'You' },
                  ].map(({ label, value }) => (
                    <div key={label} className="appt-review-row">
                      <span className="appt-review-label">{label}</span>
                      <span className="appt-review-value">{value}</span>
                    </div>
                  ))}

                  {selectedServices.length > 0 && (
                    <div className="appt-review-row appt-review-row-col">
                      <span className="appt-review-label">Tests</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                        {selectedServices.map(s => (
                          <span key={s.id} className="appt-badge appt-badge-booked" style={{ background: `${config.color}12`, color: config.color, border: `1px solid ${config.color}25` }}>
                            {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {notes && (
                    <div className="appt-review-row appt-review-row-col">
                      <span className="appt-review-label">Notes</span>
                      <span style={{ fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--appt-text-2)', marginTop: 3 }}>{notes}</span>
                    </div>
                  )}
                </div>

                {totalAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid ${config.color}20` }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Estimated total</span>
                    <span style={{ fontWeight: 800, color: config.color, fontSize: '1.05rem' }}>₹{totalAmount}</span>
                  </div>
                )}
              </div>

              {/* Reminder summary */}
              <div className="appt-card" style={{ padding: '0.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
                {reminder
                  ? <Bell size={16} color={config.color} />
                  : <BellOff size={16} color="var(--appt-text-3)" />
                }
                <span style={{ fontSize: '0.85rem', color: 'var(--appt-text-2)', flex: 1 }}>
                  {reminder ? 'Reminder set for 1 hour before' : 'No reminder'}
                </span>
                <button
                  style={{ fontSize: '0.75rem', color: config.color, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setStep(3)}
                >
                  Change
                </button>
              </div>

              {/* Payment notice */}
              {totalAmount > 0 && (
                <div style={{ padding: '0.85rem 1rem', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12, fontSize: '0.8rem', color: '#92400E', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0 }}>💳</span>
                  <span>You'll be asked to complete a quick QR payment for ₹{totalAmount} before confirming.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="appt-booking-footer">
          {step < 4 ? (
            <button
              className="appt-btn appt-btn-accent"
              style={{
                width: '100%',
                padding: '0.95rem',
                fontSize: '0.95rem',
                borderRadius: 14,
                background: canProceed ? (config.gradient || config.color) : 'var(--appt-surface-3)',
                color: canProceed ? '#fff' : 'var(--appt-text-3)',
                cursor: canProceed ? 'pointer' : 'not-allowed',
                boxShadow: canProceed ? `0 4px 16px ${config.color}40` : 'none',
              }}
              disabled={!canProceed}
              onClick={goNext}
            >
              {step === 1 ? 'Choose Time Slot' : step === 2 ? 'Select Tests' : 'Review Booking'}
              <ChevronRight size={18} />
            </button>
          ) : (
            <button
              className="appt-btn appt-btn-accent"
              style={{
                width: '100%',
                padding: '0.95rem',
                fontSize: '0.95rem',
                borderRadius: 14,
                background: config.gradient || config.color,
                boxShadow: `0 4px 16px ${config.color}40`,
              }}
              disabled={booking}
              onClick={handleConfirmClick}
            >
              {totalAmount > 0 ? `Pay ₹${totalAmount} & Confirm` : 'Confirm Appointment'}
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}