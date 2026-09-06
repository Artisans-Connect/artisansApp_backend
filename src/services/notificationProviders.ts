import { firebaseAdmin } from "../config/firebase";
import axios from "axios";
import { env } from "../config/env";

export type NotificationProviderPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export interface NotificationProvider {
  readonly channel: "fcm" | "whatsapp" | "sms";
  send(destination: string, payload: NotificationProviderPayload): Promise<string | undefined>;
}

export const fcmProvider: NotificationProvider = {
  channel: "fcm",
  async send(token, payload) {
    return firebaseAdmin.messaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: {
        priority: "high",
        notification: {
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
          channelId: "high_importance_channel",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: { sound: "default", badge: 1, contentAvailable: true },
        },
      },
    });
  },
};

export const smsProvider: NotificationProvider = {
  channel: "sms",
  async send(phone, payload) {
    if (!env.MOOLRE_API_VASKEY || !env.MOOLRE_SMS_SENDER_ID) {
      throw new Error("Moolre SMS credentials are not configured");
    }
    const response = await axios.post(
      `${env.MOOLRE_API_BASE_URL}/open/sms/send`,
      { type: 1, senderid: env.MOOLRE_SMS_SENDER_ID, messages: [{ recipient: phone, message: `${payload.title}: ${payload.body}`, ref: `cm_sms_${Date.now()}` }] },
      { headers: { "X-API-VASKEY": env.MOOLRE_API_VASKEY, "Content-Type": "application/json" }, timeout: 10_000 },
    );
    if (Number(response.data?.status) !== 1) throw new Error(response.data?.message || "Moolre SMS request failed");
    return String(response.data?.data?.id ?? response.data?.data ?? response.data?.code ?? "") || undefined;
  },
};

export const whatsappProvider: NotificationProvider = {
  channel: "whatsapp",
  async send(phone, payload) {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("WhatsApp Cloud API credentials are not configured");
    }
    const response = await axios.post(
      `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: env.WHATSAPP_TEMPLATE_NAME,
          language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
          components: [{ type: "body", parameters: [
            { type: "text", text: payload.title },
            { type: "text", text: payload.body },
          ] }],
        },
      },
      { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` }, timeout: 10_000 },
    );
    return response.data?.messages?.[0]?.id;
  },
};
