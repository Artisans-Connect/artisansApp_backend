# SMS and WhatsApp Manual Setup Plan

This branch is proposed future functionality. Do not enable SMS or WhatsApp fallback in production until the provider setup, staging validation, cost review, and rollout checks are complete.

## 1. Push the feature branch

```powershell
cd C:\Users\user\Downloads\FinalYearProject\artisansApp_backend_notification_fallback
git push -u origin feature/fcm-whatsapp-sms-fallback
```

## 2. Apply the Supabase migration

Apply this migration using the normal Supabase migration workflow or SQL editor:

```text
supabase/migrations/20260823000000_notification_delivery_tracking.sql
```

It creates the `notification_deliveries` table used to track channel and provider attempts.

## 3. Create development provider credentials

Configure these values in the backend deployment environment or secret manager. Never commit them to Git.

### Hubtel SMS

```env
HUBTEL_SMS_ENDPOINT=https://smsc.hubtel.com/v1/messages/send
HUBTEL_CLIENT_ID=
HUBTEL_CLIENT_SECRET=
HUBTEL_SENDER_ID=CraftMatch
```

### Meta WhatsApp Cloud API

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TEMPLATE_NAME=craftmatch_notification
WHATSAPP_TEMPLATE_LANGUAGE=en
```

## 4. Create and approve the WhatsApp template

Create `craftmatch_notification` in Meta WhatsApp Manager. Its body must accept two parameters in this order:

```text
{{1}} = notification title
{{2}} = notification body
```

Meta must approve the template before it can be used outside the test environment.

## 5. Prepare test recipients

Provide:

- A development phone number that can receive Hubtel SMS messages.
- A WhatsApp number registered as an allowed Meta test recipient.
- Test CraftMatch profiles whose phone fields use the provider-required international format.

## 6. Configure non-production application services

The development or staging backend requires:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
FIREBASE_SERVICE_ACCOUNT_PATH=
```

`FIREBASE_SERVICE_ACCOUNT_BASE64` can be used instead of the Firebase path.

## 7. Keep production fallback disabled

```env
SMS_FALLBACK_ENABLED=false
WHATSAPP_FALLBACK_ENABLED=false
```

Enable one channel at a time only after sandbox and staging verification. WhatsApp should be enabled before SMS so SMS remains the last and most expensive fallback.

## 8. Final validation before future deployment

- Verify FCM behavior remains unchanged.
- Confirm invalid FCM tokens are revoked correctly.
- Test WhatsApp and SMS independently.
- Test provider failures, timeouts, retries, and delayed responses.
- Confirm duplicate messages are suppressed.
- Verify delivery webhook signatures and status updates.
- Review provider costs and rate limits.
- Monitor the `notification_deliveries` table during staged activation.
