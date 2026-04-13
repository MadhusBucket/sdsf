# Security Checklist

## Status key: ✅ Verified in code · ⚙️ Requires Supabase dashboard · ⚠️ Note

---

## 1. Authentication & Access Control

| Check | Status | Notes |
|---|---|---|
| All dashboard/document/create routes require login | ✅ | `middleware.ts` redirects unauthenticated users to `/login` |
| PDF generation route requires login | ✅ | Middleware matcher includes `/api/generate-pdf`; route also checks `auth.getUser()` |
| Drive upload route requires login | ✅ | Route itself calls `auth.getUser()` and returns 401 if unauthenticated |
| Only allowlisted emails can log in | ✅ | `ALLOWED_EMAILS` env var enforced in `app/(auth)/actions.ts` |
| Magic link is the only login method | ✅ | No password auth surface |

---

## 2. Data Isolation (Row-Level Security)

### What the app code does
Every server-side query filters by the authenticated user's ID:
- `documents`: `.eq("user_id", user.id)` in every select, and `user_id` is set on insert
- `companies`: `.eq("user_id", user.id)` in every select, and `user_id` is set on insert
- `profiles`: `.eq("id", userId)` (profile ID = auth user ID)

### What you must verify in Supabase Dashboard → Authentication → Policies

⚙️ **Enable RLS on all three tables** (`documents`, `companies`, `profiles`) if not already done.

⚙️ **Recommended RLS policies:**

```sql
-- documents: users see and modify only their own rows
CREATE POLICY "users_own_documents" ON documents
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- companies: users see and modify only their own rows
CREATE POLICY "users_own_companies" ON companies
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- profiles: users see and modify only their own profile
CREATE POLICY "users_own_profile" ON profiles
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

⚠️ **Without these RLS policies, a user who obtains the `anon` key could query other users' data directly using the Supabase client.** The app-level filtering alone is not sufficient — RLS is the authoritative enforcement layer.

---

## 3. Sensitive Environment Variables

| Variable | Exposure | Status |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Server-only | ✅ Only used in `app/api/drive/upload/route.ts` |
| `MERCHANT_BANK_*` | Server-only | ✅ Only read in `lib/pdf/merchantFromEnv.ts`, called from `app/api/generate-pdf/route.ts` |
| `MERCHANT_GSTIN`, `MERCHANT_NAME` | Server-only | ✅ Same as above |
| `ALLOWED_EMAILS` | Server-only | ✅ Only used in server action `app/(auth)/actions.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (by design) | ✅ Safe — public anon key is intended for client use |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (by design) | ✅ Safe — RLS + auth are the security layer, not the anon key |
| `.env.local` file | Not committed | ✅ `.env*` is in `.gitignore` |

⚠️ When deploying, set all non-`NEXT_PUBLIC_` variables as **server-only** env vars in your hosting provider (Vercel: "Environment Variables" without the "Expose to Browser" flag).

---

## 4. Input Sanitisation & XSS Prevention

| Surface | Status | Notes |
|---|---|---|
| PDF HTML template (all user fields) | ✅ | Every user-supplied string goes through `escapeHtml()` in `lib/pdf/escapeHtml.ts` before being inserted into HTML. `nl2br()` also escapes before converting newlines. |
| Company name/address in PDF | ✅ | Passed through `escapeHtml()` / `nl2br()` |
| Line item descriptions in PDF | ✅ | `escapeHtml()` applied |
| Merchant details (env vars) in PDF | ✅ | `escapeHtml()` applied |
| UI rendering of user data | ✅ | React escapes all values by default; no `dangerouslySetInnerHTML` in the codebase |

---

## 5. Rate Limiting

| Endpoint | Limit | Status |
|---|---|---|
| `GET /api/generate-pdf` | 20 requests / minute / user | ✅ In-memory rate limiter added |
| `POST /api/drive/upload` | No explicit limit | ⚠️ See note below |

⚠️ The in-memory rate limiter in `generate-pdf` is **best-effort** — it resets if the serverless function instance is recycled. For strict enforcement in a multi-instance deployment (e.g. Vercel), replace it with [Upstash Redis rate limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview).

⚠️ `/api/drive/upload` has no rate limit. It is auth-guarded, so only your allowlisted user can call it. Low risk for this use case, but consider adding a limit if abuse is a concern.

---

## 6. Console Logging

| Status | Notes |
|---|---|
| ✅ | No `console.log` of sensitive data anywhere in the codebase |
| ✅ | All logging is `console.error` on caught exceptions (error objects only) |
| ✅ | Error responses to the client include a generic message; stack traces are only printed server-side |

---

## 7. Production Deployment Checklist

Before going live, confirm each item:

- [ ] RLS enabled on `documents`, `companies`, `profiles` tables in Supabase
- [ ] RLS policies created (see Section 2 above)
- [ ] All server-only env vars set in hosting provider without "Expose to Browser"
- [ ] `ALLOWED_EMAILS` is set and contains only intended users
- [ ] `GOOGLE_DRIVE_ROOT_FOLDER_ID` is set (if Drive upload is re-enabled)
- [ ] Supabase Auth → Email templates customised if needed
- [ ] Supabase Auth → "Confirm email" setting reviewed (magic link flow)
- [ ] Review Supabase → API → Exposed schemas (should only expose `public`)
- [ ] Consider adding Upstash Redis rate limiter for `/api/generate-pdf` in production
- [ ] Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` has only the intended permissions (it should — RLS enforces access)
- [ ] Set `Cache-Control: private, no-store` on all sensitive API responses (already done for PDF route)
