# Notification Fallback Rollout

## Default production behavior

Both fallback channels default to disabled. Existing FCM and in-app notification behavior remains primary.

```env
SMS_FALLBACK_ENABLED=false
WHATSAPP_FALLBACK_ENABLED=false
```

## SMS configuration

```env
HUBTEL_SMS_ENDPOINT=https://smsc.hubtel.com/v1/messages/send
HUBTEL_CLIENT_ID=
HUBTEL_CLIENT_SECRET=
HUBTEL_SENDER_ID=CraftMatch
```

## WhatsApp configuration

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TEMPLATE_NAME=craftmatch_notification
WHATSAPP_TEMPLATE_LANGUAGE=en
```

The Meta template must be approved and contain two body parameters in this order: notification title and notification body.

## Activation sequence

1. Apply the notification delivery migration.
2. Configure sandbox/development credentials and approved test recipients.
3. Test each provider independently with both flags disabled in production.
4. Enable WhatsApp for test users/environment first.
5. Enable SMS only after failure and duplicate-delivery review.
6. Monitor `notification_deliveries` failures and provider costs.

Fallback currently occurs only when every FCM token send fails or no token exists, and only for `action_required` notifications. A successful provider response means accepted for sending, not confirmed handset delivery.
