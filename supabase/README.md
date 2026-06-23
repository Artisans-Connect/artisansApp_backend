# Supabase Auth Setup

The mobile app requests password recovery with:

```text
https://craft-match-verification-portal.vercel.app/update-password
```

For hosted Supabase, make sure the dashboard matches `config.toml`:

1. Authentication > URL Configuration
   - Site URL: `https://craft-match-verification-portal.vercel.app`
   - Redirect URLs:
     - `https://craft-match-verification-portal.vercel.app/email-verified`
     - `https://craft-match-verification-portal.vercel.app/update-password`
     - `craftmatch://login`

2. Authentication > Email Templates
   - Confirm signup: use `templates/confirm_email.html`
   - Reset password: use `templates/reset_password.html`

3. Authentication > SMTP Settings
   - Configure a custom SMTP provider for reliable delivery.
   - Supabase's default sender is useful for development, but delivery can be delayed, rate-limited, or filtered.

The reset password template intentionally uses `{{ .ConfirmationURL }}`. Supabase builds that link from the app's `redirectTo` value, then the verification portal handles the `code` or token session on `/update-password`.
