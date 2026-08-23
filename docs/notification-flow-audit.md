# Notification Flow Audit

## Current path

1. Domain services call notification helpers exported by `src/services/notifyService.ts`.
2. `notifyService.sendToUser` inserts an in-app row into `notifications`.
3. It loads active FCM tokens from `notification_devices` and the legacy `profiles.fcm_token` column.
4. Each token is sent through Firebase Admin Messaging using `src/config/firebase.ts`.
5. FCM failures are logged and swallowed by `sendToUser`, so the originating business workflow is not failed.

## Producers

Notification helpers are used by jobs, applications, matching, negotiation, chat, settlement, and worker action services. Notification type metadata is centralized in `src/services/notificationPayloads.ts`, including priority, client/worker route, action label, and job grouping key.

## Token lifecycle

- `PUT /api/profiles/me/fcm-token` updates the legacy profile token.
- `POST /api/profiles/me/notification-devices` upserts a hashed device token and clears revocation.
- `DELETE /api/profiles/me/notification-devices/:tokenHash` revokes a device token.
- Active device selection requires `revoked_at IS NULL`.

## Persistence

The migration `supabase/migrations/20260605200000_notifications_and_persistent_dispatches.sql` creates `notifications` and `notification_devices`, enables RLS, and adds realtime publication for notifications. Notification rows currently contain user, type, title, body, data, read timestamp, and creation timestamp. There is no delivery-attempt table or provider status.

## Known gaps for fallback work

- FCM sending is coupled directly to Firebase Admin in `notifyService`.
- There is no provider interface or channel-neutral notification command.
- FCM send success is provider acceptance, not confirmed user delivery.
- Invalid-token cleanup is not performed from send failures.
- No idempotency key or delivery-attempt record prevents duplicate fallback sends.
- No SMS/WhatsApp credentials, adapters, feature flags, or fallback scheduler exist.

## Safety boundary

The first implementation should preserve all existing `notify*` helper signatures and FCM payload behavior. New channels must remain disabled until independently tested and feature-flagged.
