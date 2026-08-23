import { firebaseAdmin } from "../config/firebase";

export type NotificationProviderPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export interface NotificationProvider {
  readonly channel: "fcm" | "whatsapp" | "sms";
  sendToToken(token: string, payload: NotificationProviderPayload): Promise<void>;
}

export const fcmProvider: NotificationProvider = {
  channel: "fcm",
  async sendToToken(token, payload) {
    await firebaseAdmin.messaging().send({
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
