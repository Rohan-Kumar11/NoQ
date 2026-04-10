// lib/services/sms.js

const FAST2SMS_API_URL = 'https://www.fast2sms.com/dev/bulkV2';

/**
 * Send SMS via Fast2SMS
 * @param {string|string[]} phoneNumbers - 10-digit Indian mobile number(s)
 * @param {string} message - SMS message text
 */
export async function sendSMS(phoneNumbers, message) {
  try {
    const numbers = Array.isArray(phoneNumbers)
      ? phoneNumbers.join(',')
      : phoneNumbers;

    const response = await fetch(FAST2SMS_API_URL, {
      method: 'POST',
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q',           // 'q' = Quick SMS (no DLT needed for testing)
        message: message,
        language: 'english',
        numbers: numbers,
      }),
    });

    const data = await response.json();

    if (!data.return) {
      throw new Error(data.message?.[0] || 'SMS sending failed');
    }

    return { success: true, data };
  } catch (error) {
    console.error('SMS send error:', error);
    return { success: false, error: error.message };
  }
}