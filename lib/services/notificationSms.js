// lib/services/notificationSms.js

import { sendSMS } from './sms';

/**
 * Converts a notification object into a concise SMS string.
 * SMS has a 160-char limit per segment, keep messages short.
 */
function buildSmsMessage(notification) {
  const { type, title, message } = notification;

  const templates = {
    order_accepted:  `✅ Order Accepted: ${message}`,
    order_ready:     `🛎️ Ready for Pickup: ${message}`,
    order_completed: `🎉 Order Completed: ${message}`,
    order_cancelled: `❌ Order Cancelled: ${message}`,
    token_generated: `🎟️ Token: ${message}`,
    payment:         `💰 Payment: ${message}`,
    time_update:     `⏰ Time Update: ${message}`,
    promotion:       `🎁 Offer: ${message}`,
  };

  // Use template if available, otherwise use title + message
  return templates[type] || `${title}: ${message}`;
}

/**
 * Send SMS for a notification if the user has a phone number.
 * Call this right after inserting into the notifications table.
 *
 * @param {object} notification - The notification object from Supabase
 * @param {string} phoneNumber  - User's 10-digit Indian mobile number
 */
export async function sendNotificationSms(notification, phoneNumber) {
  if (!phoneNumber) {
    console.log('No phone number provided, skipping SMS');
    return { success: false, error: 'No phone number' };
  }

  // Sanitize: strip country code if present (e.g. +91XXXXXXXXXX → XXXXXXXXXX)
  const cleanNumber = phoneNumber.replace(/^\+?91/, '').replace(/\D/g, '');

  if (cleanNumber.length !== 10) {
    return { success: false, error: 'Invalid phone number' };
  }

  const smsText = buildSmsMessage(notification);

  return await sendSMS(cleanNumber, smsText);
}