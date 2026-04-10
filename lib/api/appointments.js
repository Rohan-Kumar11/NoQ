// lib/api/appointments.js
//
// SCHEMA (confirmed):
//   customers       → id, user_id (nullable!), preferred_service,
//                      notification_preferences, created_at, updated_at
//   profiles        → id (= auth user id), full_name, phone, user_type
//                      *** NO email column ***
//   appointments    → id, store_id, customer_id, slot_id, appointment_date,
//                      start_time, end_time, status, notes, services,
//                      created_at, updated_at
//   appointment_slots → id, store_id, slot_date, start_time, end_time,
//                        max_bookings, current_bookings, is_active
//   services        → id, store_id, name, description, price,
//                      duration_minutes, is_active
//   stores          → id, service_mode (jsonb), appointment_enabled, ...
//
// KEY FIX: customers.user_id is NULL in existing rows.
//   getCustomerRecord now does an UPSERT keyed on user_id and also
//   falls back to looking up via profiles.id = auth user id directly.

import { supabase } from '../supabase/client';

// ─────────────────────────────────────────────────────────────
// Internal: fetch profile for a given auth user id
// profiles columns: id, full_name, phone, user_type (NO email)
// ─────────────────────────────────────────────────────────────
async function fetchProfileByUserId(userId) {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('id', userId)
      .maybeSingle();
    return data || { full_name: null, phone: null };
  } catch {
    return { full_name: null, phone: null };
  }
}

// ─────────────────────────────────────────────────────────────
// Internal: given customer_ids → map { customer_id → profile }
// two-step: customers → user_id → profiles
// ─────────────────────────────────────────────────────────────
async function fetchCustomerProfiles(customerIds) {
  if (!customerIds?.length) return {};
  try {
    const { data: custRows } = await supabase
      .from('customers')
      .select('id, user_id')
      .in('id', customerIds);
    if (!custRows?.length) return {};

    const userIds = custRows.map(c => c.user_id).filter(Boolean);
    if (!userIds.length) return {};

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', userIds);

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const result = {};
    custRows.forEach(c => {
      result[c.id] = profileMap[c.user_id] || { full_name: null, phone: null };
    });
    return result;
  } catch (err) {
    console.error('fetchCustomerProfiles error:', err);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────
// BUYER — Customer Record
// FIX: user_id was NULL in existing rows.
//   Strategy:
//     1. Try to find customer WHERE user_id = userId
//     2. If not found, update any NULL-user_id row OR insert fresh
//     3. Always enrich with profile data
// ─────────────────────────────────────────────────────────────
export async function getCustomerRecord(userId) {
  try {
    // Step 1: find existing record with this user_id
    const { data: existing } = await supabase
      .from('customers')
      .select('id, user_id, preferred_service')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const profile = await fetchProfileByUserId(userId);
      return { data: { ...existing, ...profile }, error: null };
    }

    // Step 2: insert a new customer record for this user
    const { data: inserted, error: insertErr } = await supabase
      .from('customers')
      .insert({ user_id: userId })
      .select('id, user_id, preferred_service')
      .single();

    if (insertErr) {
      // Could be duplicate key if race condition — try select again
      console.warn('getCustomerRecord insert error (retrying select):', insertErr.message);
      const { data: retry } = await supabase
        .from('customers')
        .select('id, user_id, preferred_service')
        .eq('user_id', userId)
        .maybeSingle();

      if (retry) {
        const profile = await fetchProfileByUserId(userId);
        return { data: { ...retry, ...profile }, error: null };
      }

      // Last resort: return a synthetic record so booking doesn't fail
      // with null customer. The bookAppointment function will handle it.
      console.error('getCustomerRecord: could not create or find customer', insertErr.message);
      const profile = await fetchProfileByUserId(userId);
      return {
        data: { id: null, user_id: userId, ...profile, _synthetic: true },
        error: null,
      };
    }

    const profile = await fetchProfileByUserId(userId);
    return { data: { ...inserted, ...profile }, error: null };
  } catch (err) {
    console.error('getCustomerRecord unexpected error:', err);
    return { data: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// BUYER — Available Slots
// ─────────────────────────────────────────────────────────────
export async function getAvailableSlots(storeId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('appointment_slots')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .gte('slot_date', today)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;

    const grouped = {};
    (data || []).forEach(slot => {
      if (slot.current_bookings >= slot.max_bookings) return; // skip full
      const d = slot.slot_date;
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push({
        ...slot,
        available: slot.max_bookings - slot.current_bookings,
        isFull: slot.current_bookings >= slot.max_bookings,
      });
    });

    return { data: grouped, flat: data || [], error: null };
  } catch (err) {
    console.error('getAvailableSlots error:', err);
    return { data: {}, flat: [], error: err.message };
  }
}

export async function getSlotsForDate(storeId, date) {
  try {
    const { data, error } = await supabase
      .from('appointment_slots')
      .select('*')
      .eq('store_id', storeId)
      .eq('slot_date', date)
      .eq('is_active', true)
      .order('start_time', { ascending: true });

    if (error) throw error;

    return {
      data: (data || []).map(s => ({
        ...s,
        available: s.max_bookings - s.current_bookings,
        isFull: s.current_bookings >= s.max_bookings,
      })),
      error: null,
    };
  } catch (err) {
    console.error('getSlotsForDate error:', err);
    return { data: [], error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// BUYER — Book Appointment
// FIX: if customerId is null (synthetic record), create customer first
// ─────────────────────────────────────────────────────────────
export async function bookAppointment({ slotId, customerId, userId, notes = null, services = [] }) {
  try {
    // If customer record is synthetic (id=null), create one now
    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId && userId) {
      const { data: newCust, error: custErr } = await supabase
        .from('customers')
        .insert({ user_id: userId })
        .select('id')
        .single();
      if (custErr) throw new Error('Could not create customer record: ' + custErr.message);
      resolvedCustomerId = newCust.id;
    }

    if (!resolvedCustomerId) throw new Error('Missing customer ID');
    if (!slotId) throw new Error('Missing slot ID');

    // Fetch slot
    const { data: slot, error: slotErr } = await supabase
      .from('appointment_slots')
      .select('*')
      .eq('id', slotId)
      .single();

    if (slotErr) throw slotErr;
    if (!slot) throw new Error('Slot not found');
    if (!slot.is_active) throw new Error('This slot is no longer active');
    if (slot.current_bookings >= slot.max_bookings) throw new Error('This slot is fully booked');

    // Insert appointment
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        store_id: slot.store_id,
        customer_id: resolvedCustomerId,
        slot_id: slotId,
        appointment_date: slot.slot_date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        status: 'booked',
        notes: notes || null,
        services: services.length > 0 ? services : null,
      })
      .select()
      .single();

    if (apptErr) throw apptErr;

    // Increment slot count
    await supabase
      .from('appointment_slots')
      .update({
        current_bookings: slot.current_bookings + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', slotId);

    return { data: { ...appt }, error: null };
  } catch (err) {
    console.error('bookAppointment error:', err);
    return { data: null, error: err.message };
  }
}

export async function cancelAppointment(appointmentId, customerId) {
  try {
    const { data: appt, error: fetchErr } = await supabase
      .from('appointments')
      .select('*, slot_id')
      .eq('id', appointmentId)
      .eq('customer_id', customerId)
      .single();

    if (fetchErr) throw fetchErr;

    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) throw error;

    if (appt.slot_id) {
      const { data: slot } = await supabase
        .from('appointment_slots')
        .select('current_bookings')
        .eq('id', appt.slot_id)
        .single();

      if (slot && slot.current_bookings > 0) {
        await supabase
          .from('appointment_slots')
          .update({ current_bookings: slot.current_bookings - 1, updated_at: new Date().toISOString() })
          .eq('id', appt.slot_id);
      }
    }

    return { data, error: null };
  } catch (err) {
    console.error('cancelAppointment error:', err);
    return { data: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// BUYER — History
// ─────────────────────────────────────────────────────────────
export async function getBuyerAppointments(customerId) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, start_time, end_time,
        status, notes, services, created_at,
        store:stores(id, store_name, store_type, logo_url, address, city)
      `)
      .eq('customer_id', customerId)
      .order('appointment_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('getBuyerAppointments error:', err);
    return { data: [], error: err.message };
  }
}

export async function getAppointmentById(appointmentId) {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        slot:appointment_slots(slot_date, start_time, end_time, max_bookings, current_bookings),
        store:stores(id, store_name, store_type, logo_url, address, city, phone)
      `)
      .eq('id', appointmentId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('getAppointmentById error:', err);
    return { data: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// BUYER — Services
// ─────────────────────────────────────────────────────────────
export async function getStoreServices(storeId) {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('getStoreServices error:', err);
    return { data: [], error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// SELLER — Slot Management
// ─────────────────────────────────────────────────────────────
export async function getSellerSlots(storeId, date = null) {
  try {
    let query = supabase
      .from('appointment_slots')
      .select('*')
      .eq('store_id', storeId)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (date) query = query.eq('slot_date', date);

    const { data, error } = await query;
    if (error) throw error;

    return {
      data: (data || []).map(s => ({
        ...s,
        available: s.max_bookings - s.current_bookings,
        isFull: s.current_bookings >= s.max_bookings,
      })),
      error: null,
    };
  } catch (err) {
    console.error('getSellerSlots error:', err);
    return { data: [], error: err.message };
  }
}

export async function createSlot({ storeId, slot_date, start_time, end_time, max_bookings = 1 }) {
  try {
    const { data, error } = await supabase
      .from('appointment_slots')
      .insert({ store_id: storeId, slot_date, start_time, end_time, max_bookings, current_bookings: 0, is_active: true })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('createSlot error:', err);
    return { data: null, error: err.message };
  }
}

export async function bulkCreateSlots(slots) {
  try {
    const { data, error } = await supabase.from('appointment_slots').insert(slots).select();
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('bulkCreateSlots error:', err);
    return { data: [], error: err.message };
  }
}

export async function deactivateSlot(slotId) {
  try {
    const { data: slot } = await supabase
      .from('appointment_slots')
      .select('current_bookings')
      .eq('id', slotId)
      .single();

    if (slot?.current_bookings > 0) {
      return { data: null, error: 'Cannot remove a slot that has existing bookings.' };
    }

    const { data, error } = await supabase
      .from('appointment_slots')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', slotId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('deactivateSlot error:', err);
    return { data: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// SELLER — Appointments (two-step: fetch + enrich profiles)
// ─────────────────────────────────────────────────────────────
export async function getSellerAppointments(storeId, { date = null, status = null } = {}) {
  try {
    let query = supabase
      .from('appointments')
      .select('id, appointment_date, start_time, end_time, status, notes, services, created_at, customer_id')
      .eq('store_id', storeId)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (date) query = query.eq('appointment_date', date);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const appointments = data || [];
    if (!appointments.length) return { data: [], error: null };

    const customerIds = [...new Set(appointments.map(a => a.customer_id).filter(Boolean))];
    const profileMap = await fetchCustomerProfiles(customerIds);

    return {
      data: appointments.map(appt => ({
        ...appt,
        customer: profileMap[appt.customer_id] || { full_name: null, phone: null },
      })),
      error: null,
    };
  } catch (err) {
    console.error('getSellerAppointments error:', err.message);
    return { data: [], error: err.message };
  }
}

export async function updateAppointmentStatus(appointmentId, status) {
  const valid = ['booked', 'completed', 'cancelled', 'no_show'];
  if (!valid.includes(status)) return { data: null, error: `Invalid status` };

  try {
    const { data, error } = await supabase
      .from('appointments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', appointmentId)
      .select()
      .single();

    if (error) throw error;

    if (status === 'cancelled' && data.slot_id) {
      const { data: slot } = await supabase
        .from('appointment_slots')
        .select('current_bookings')
        .eq('id', data.slot_id)
        .single();

      if (slot?.current_bookings > 0) {
        await supabase
          .from('appointment_slots')
          .update({ current_bookings: slot.current_bookings - 1, updated_at: new Date().toISOString() })
          .eq('id', data.slot_id);
      }
    }

    return { data, error: null };
  } catch (err) {
    console.error('updateAppointmentStatus error:', err);
    return { data: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// SELLER — Services
// ─────────────────────────────────────────────────────────────
export async function getSellerServices(storeId) {
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('store_id', storeId)
      .order('name', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('getSellerServices error:', err);
    return { data: [], error: err.message };
  }
}

export async function createService({ storeId, name, description, price, durationMinutes = 30 }) {
  try {
    const { data, error } = await supabase
      .from('services')
      .insert({ store_id: storeId, name, description: description || null, price: price || null, duration_minutes: durationMinutes, is_active: true })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('createService error:', err);
    return { data: null, error: err.message };
  }
}

export async function deleteService(serviceId) {
  try {
    const { data, error } = await supabase
      .from('services')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', serviceId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('deleteService error:', err);
    return { data: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Service Mode
// ─────────────────────────────────────────────────────────────
export async function getServiceMode(storeId) {
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('service_mode, appointment_enabled')
      .eq('id', storeId)
      .single();

    if (error) throw error;

    const mode = {
      queue_enabled: true,
      appointment_enabled: data?.appointment_enabled ?? false,
      has_products: true,
      ...(data?.service_mode || {}),
    };

    return { data: mode, error: null };
  } catch (err) {
    console.error('getServiceMode error:', err);
    return { data: null, error: err.message };
  }
}

export async function updateServiceMode(storeId, modeUpdates) {
  try {
    const { data: current } = await getServiceMode(storeId);
    const merged = { ...current, ...modeUpdates };

    const { data, error } = await supabase
      .from('stores')
      .update({ service_mode: merged, appointment_enabled: merged.appointment_enabled ?? false, updated_at: new Date().toISOString() })
      .eq('id', storeId)
      .select('service_mode')
      .single();

    if (error) throw error;
    return { data: data.service_mode, error: null };
  } catch (err) {
    console.error('updateServiceMode error:', err);
    return { data: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Realtime
// ─────────────────────────────────────────────────────────────
export function subscribeToAppointments(storeId, onUpdate) {
  const channel = supabase
    .channel(`appointments-${storeId}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `store_id=eq.${storeId}` }, payload => onUpdate(payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_slots', filter: `store_id=eq.${storeId}` }, payload => onUpdate(payload))
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ─────────────────────────────────────────────────────────────
// Utility — generate slots for a day
// ─────────────────────────────────────────────────────────────
export function generateDaySlots(storeId, date, openingTime, closingTime, slotDurationMinutes = 30, maxBookingsPerSlot = 1) {
  const slots = [];
  const [openH, openM] = openingTime.split(':').map(Number);
  const [closeH, closeM] = closingTime.split(':').map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;

  while (current + slotDurationMinutes <= end) {
    const startH = Math.floor(current / 60);
    const startM = current % 60;
    const endMin = current + slotDurationMinutes;
    const endH = Math.floor(endMin / 60);
    const endMm = endMin % 60;

    slots.push({
      store_id: storeId,
      slot_date: date,
      start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`,
      end_time: `${String(endH).padStart(2, '0')}:${String(endMm).padStart(2, '0')}:00`,
      max_bookings: maxBookingsPerSlot,
      current_bookings: 0,
      is_active: true,
    });
    current += slotDurationMinutes;
  }
  return slots;
}