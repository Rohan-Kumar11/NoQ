'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEvent } from '@/lib/api/events';
import toast from 'react-hot-toast';
import EventSidebar from '../../components/EventSidebar';
import styles from './CreateEvent.module.css';

const EVENT_TYPES = [
  { value: 'food_distribution', label: '🍱 Food Distribution', desc: 'NGO meals, ration distribution, free food drives' },
  { value: 'dinner',            label: '🍽️ Large Dinner',      desc: 'Community dinners, banquets, mass feedings' },
  { value: 'registration',      label: '📋 Registration',      desc: 'Mass sign-ups, admissions, document collection' },
  { value: 'conference',        label: '🎤 Conference',         desc: 'Seminars, workshops, academic events' },
  { value: 'general',           label: '📅 General Event',      desc: 'Any other event with queue management' },
];

const QUEUE_MODES = [
  {
    value: 'registration',
    icon: '📋',
    title: 'Registration Based',
    desc: 'People register in advance. You manage who attended vs who cancelled. No live queue ordering.',
    bullets: ['Fixed or open capacity', 'Attendee list with check-in', 'Manage registrations from dashboard'],
  },
  {
    value: 'queue_based',
    icon: '🎫',
    title: 'Queue Based',
    desc: 'People join a live numbered queue in real time. Order matters. No-shows are moved to the end.',
    bullets: ['Live token numbers & positions', 'Auto-reorder on cancel', 'Timeout = moved to end of queue'],
  },
];

export default function CreateEvent() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: basic, 2: mode + settings, 3: review
  const [form, setForm] = useState({
    name: '',
    description: '',
    eventType: 'general',
    location: '',
    venueDetails: '',
    startTime: '',
    endTime: '',
    queueMode: 'registration',          // NEW
    maxCapacity: '',
    avgServiceTime: '5',
    autoCallNext: false,
    waitingTimeoutMinutes: '5',         // NEW — for queue_based
    upiId: '',
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async () => {
    if (!form.name || !form.location || !form.startTime || !form.endTime) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (new Date(form.endTime) <= new Date(form.startTime)) {
      toast.error('End time must be after start time');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await createEvent({
        name: form.name,
        description: form.description || null,
        location: form.location,
        venueDetails: form.venueDetails || null,
        startTime: form.startTime,
        endTime: form.endTime,
        eventType: form.eventType,
        queueMode: form.queueMode,
        maxCapacity: form.maxCapacity ? parseInt(form.maxCapacity) : null,
        avgServiceTime: parseInt(form.avgServiceTime) || 5,
        autoCallNext: form.autoCallNext,
        waitingTimeoutMinutes: parseInt(form.waitingTimeoutMinutes) || 5,
        upiId: form.upiId || null,
      });

      if (error) { toast.error(error); return; }
      toast.success('Event created successfully! 🎉');
      router.push('/events/dashboard');
    } catch (err) {
      toast.error('Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  const selectedType = EVENT_TYPES.find(t => t.value === form.eventType);
  const isQueueBased = form.queueMode === 'queue_based';

  return (
    <div className={styles.dashboard}>
      <EventSidebar />

      <main className={styles.mainContent}>
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <button className={styles.backBtn} onClick={() => router.push('/events/dashboard')}>
              ← Back
            </button>
            <h1 className={styles.pageTitle}>Create New Event</h1>
          </div>
        </header>

        {/* Step Indicator */}
        <div className={styles.stepIndicator}>
          {['Basic Info', 'Mode & Settings', 'Review'].map((label, i) => (
            <div key={i} className={styles.stepItem}>
              <div className={`${styles.stepCircle} ${step > i + 1 ? styles.stepDone : step === i + 1 ? styles.stepActive : ''}`}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`${styles.stepLabel} ${step === i + 1 ? styles.stepLabelActive : ''}`}>{label}</span>
              {i < 2 && <div className={`${styles.stepLine} ${step > i + 1 ? styles.stepLineDone : ''}`} />}
            </div>
          ))}
        </div>

        <div className={styles.formCard}>

          {/* ── STEP 1: Basic Info ── */}
          {step === 1 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>📋 Basic Event Information</h2>

              <div className={styles.formGroup}>
                <label className={styles.label}>Event Name <span className={styles.required}>*</span></label>
                <input className={styles.input} name="name" value={form.name} onChange={handleChange} placeholder="e.g. Annual Food Distribution Drive" />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Event Type <span className={styles.required}>*</span></label>
                <div className={styles.typeGrid}>
                  {EVENT_TYPES.map(type => (
                    <button key={type.value} type="button"
                      className={`${styles.typeCard} ${form.eventType === type.value ? styles.typeCardActive : ''}`}
                      onClick={() => setForm(prev => ({ ...prev, eventType: type.value }))}>
                      <span className={styles.typeLabel}>{type.label}</span>
                      <span className={styles.typeDesc}>{type.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Description</label>
                <textarea className={styles.textarea} name="description" value={form.description} onChange={handleChange} placeholder="Brief description of your event (optional)" rows={3} />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Location / Venue Name <span className={styles.required}>*</span></label>
                  <input className={styles.input} name="location" value={form.location} onChange={handleChange} placeholder="e.g. Community Hall, Sector 5" />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Venue Details / Address</label>
                  <input className={styles.input} name="venueDetails" value={form.venueDetails} onChange={handleChange} placeholder="Full address or directions" />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Start Date & Time <span className={styles.required}>*</span></label>
                  <input className={styles.input} type="datetime-local" name="startTime" value={form.startTime} onChange={handleChange} min={new Date().toISOString().slice(0, 16)} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>End Date & Time <span className={styles.required}>*</span></label>
                  <input className={styles.input} type="datetime-local" name="endTime" value={form.endTime} onChange={handleChange} min={form.startTime || new Date().toISOString().slice(0, 16)} />
                </div>
              </div>

              <div className={styles.stepActions}>
                <button className={styles.nextBtn} onClick={() => {
                  if (!form.name || !form.location || !form.startTime || !form.endTime) {
                    toast.error('Please fill all required fields'); return;
                  }
                  setStep(2);
                }}>Next: Mode & Settings →</button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Queue Mode + Settings ── */}
          {step === 2 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>⚙️ Event Mode & Settings</h2>

              {/* Queue Mode Selector */}
              <div className={styles.formGroup}>
                <label className={styles.label}>How will attendees participate? <span className={styles.required}>*</span></label>
                <div className={styles.modeGrid}>
                  {QUEUE_MODES.map(mode => (
                    <button key={mode.value} type="button"
                      className={`${styles.modeCard} ${form.queueMode === mode.value ? styles.modeCardActive : ''}`}
                      onClick={() => setForm(prev => ({ ...prev, queueMode: mode.value }))}>
                      <div className={styles.modeIcon}>{mode.icon}</div>
                      <div className={styles.modeCardBody}>
                        <div className={styles.modeTitle}>{mode.title}</div>
                        <div className={styles.modeDesc}>{mode.desc}</div>
                        <ul className={styles.modeBullets}>
                          {mode.bullets.map(b => <li key={b}>✓ {b}</li>)}
                        </ul>
                      </div>
                      {form.queueMode === mode.value && <div className={styles.modeCheck}>✓</div>}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.settingsDivider} />

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Max Capacity</label>
                  <input className={styles.input} type="number" name="maxCapacity" value={form.maxCapacity} onChange={handleChange} placeholder="Leave blank for unlimited" min="1" />
                  <span className={styles.hint}>Max attendees / queue slots</span>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Avg. Time Per Person (min)</label>
                  <input className={styles.input} type="number" name="avgServiceTime" value={form.avgServiceTime} onChange={handleChange} min="1" max="60" />
                  <span className={styles.hint}>Used to estimate wait times</span>
                </div>
              </div>

              {/* Queue-based only settings */}
              {isQueueBased && (
                <div className={styles.queueOnlySection}>
                  <div className={styles.queueOnlyLabel}>🎫 Queue-Based Settings</div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Waiting Timeout (minutes)</label>
                      <input className={styles.input} type="number" name="waitingTimeoutMinutes" value={form.waitingTimeoutMinutes} onChange={handleChange} min="1" max="60" />
                      <span className={styles.hint}>If a called person doesn't show in this time, they move to end of queue</span>
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.label}>UPI ID (optional)</label>
                <input className={styles.input} name="upiId" value={form.upiId} onChange={handleChange} placeholder="yourname@upi" />
              </div>

              <div className={styles.toggleGroup}>
                <div className={styles.toggleItem}>
                  <div>
                    <div className={styles.toggleTitle}>🤖 Auto-Call Next</div>
                    <div className={styles.toggleDesc}>Automatically call the next token after marking current as served</div>
                  </div>
                  <label className={styles.toggleSwitch}>
                    <input type="checkbox" name="autoCallNext" checked={form.autoCallNext} onChange={handleChange} />
                    <span className={styles.toggleSlider}></span>
                  </label>
                </div>
              </div>

              <div className={styles.stepActions}>
                <button className={styles.backStepBtn} onClick={() => setStep(1)}>← Back</button>
                <button className={styles.nextBtn} onClick={() => setStep(3)}>Review Event →</button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Review ── */}
          {step === 3 && (
            <div className={styles.stepContent}>
              <h2 className={styles.stepTitle}>✅ Review Your Event</h2>

              <div className={styles.reviewCard}>
                <div className={styles.reviewSection}>
                  <h3>Event Details</h3>
                  <div className={styles.reviewRow}><span>Name</span><strong>{form.name}</strong></div>
                  <div className={styles.reviewRow}><span>Type</span><strong>{selectedType?.label}</strong></div>
                  <div className={styles.reviewRow}><span>Location</span><strong>{form.location}</strong></div>
                  {form.venueDetails && <div className={styles.reviewRow}><span>Address</span><strong>{form.venueDetails}</strong></div>}
                  {form.description && <div className={styles.reviewRow}><span>Description</span><strong>{form.description}</strong></div>}
                </div>

                <div className={styles.reviewSection}>
                  <h3>Schedule</h3>
                  <div className={styles.reviewRow}>
                    <span>Start</span>
                    <strong>{new Date(form.startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                  </div>
                  <div className={styles.reviewRow}>
                    <span>End</span>
                    <strong>{new Date(form.endTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                  </div>
                </div>

                <div className={styles.reviewSection}>
                  <h3>Mode & Queue Settings</h3>
                  <div className={styles.reviewRow}>
                    <span>Mode</span>
                    <strong>{isQueueBased ? '🎫 Queue Based' : '📋 Registration Based'}</strong>
                  </div>
                  <div className={styles.reviewRow}><span>Max Capacity</span><strong>{form.maxCapacity || 'Unlimited'}</strong></div>
                  <div className={styles.reviewRow}><span>Avg Time/Person</span><strong>{form.avgServiceTime} min</strong></div>
                  {isQueueBased && (
                    <div className={styles.reviewRow}><span>Waiting Timeout</span><strong>{form.waitingTimeoutMinutes} min</strong></div>
                  )}
                  <div className={styles.reviewRow}><span>Auto-Call Next</span><strong>{form.autoCallNext ? '✅ Enabled' : '❌ Disabled'}</strong></div>
                  {form.upiId && <div className={styles.reviewRow}><span>UPI ID</span><strong>{form.upiId}</strong></div>}
                </div>
              </div>

              <div className={styles.reviewNote}>
                <span>💡</span>
                <p>
                  Your event starts in <strong>upcoming</strong> status. Click <strong>"Go Live"</strong> on the dashboard when you're ready to open{' '}
                  {isQueueBased ? 'the live queue' : 'registrations'}.
                </p>
              </div>

              <div className={styles.stepActions}>
                <button className={styles.backStepBtn} onClick={() => setStep(2)}>← Back</button>
                <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
                  {loading ? '⏳ Creating...' : '🎉 Create Event'}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}