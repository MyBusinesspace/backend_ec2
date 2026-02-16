/**
 * WhatsApp Cloud API Service
 * Sends OTP codes via WhatsApp plain text messages.
 */

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';

interface WhatsAppSendResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Send an OTP code via WhatsApp plain text message.
 * @param phone - E.164 formatted phone number (e.g. +34612345678)
 * @param code - The 6-digit OTP code
 */
export const sendWhatsAppOtp = async (phone: string, code: string): Promise<WhatsAppSendResult> => {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId || phoneNumberId === 'YOUR_PHONE_NUMBER_ID_HERE') {
        console.error('[WhatsApp] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
        return { success: false, error: 'WhatsApp not configured' };
    }

    // Remove the + prefix for the WhatsApp API (it expects just digits)
    const whatsappPhone = phone.replace(/^\+/, '');
    const maskedPhone = phone.slice(0, 4) + '***' + phone.slice(-4);

    try {
        const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: whatsappPhone,
                type: 'text',
                text: {
                    body: `Your verification code is: ${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
                },
            }),
        });

        const data = await response.json() as {
            error?: { message?: string };
            messages?: Array<{ id?: string }>;
        };

        if (!response.ok) {
            console.error(`[WhatsApp] Failed to send OTP to ${maskedPhone}:`, data.error?.message || 'Unknown error');
            return {
                success: false,
                error: data.error?.message || 'Failed to send WhatsApp message',
            };
        }

        const messageId = data.messages?.[0]?.id;
        console.log(`[WhatsApp] OTP sent to ${maskedPhone}, messageId: ${messageId}`);

        return { success: true, messageId };
    } catch (error) {
        console.error(`[WhatsApp] Error sending OTP to ${maskedPhone}:`, error);
        return { success: false, error: 'Network error sending WhatsApp message' };
    }
};
