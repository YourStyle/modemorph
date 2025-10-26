# Database Schema Documentation

**Last Updated:** 2025-01-26
**Database:** Supabase PostgreSQL
**Project:** ModeMorph

---

## Tables

### `user_profiles`
User profile information.

**Columns:**
- `id` - UUID, Primary Key
- `user_id` - UUID, Foreign Key to auth.users
- `is_admin` - boolean
- `created_at` - timestamp

---

### `limits`
Current usage limits for users (resets based on subscription).

**Columns:**
- `user_profile_id` - UUID, Foreign Key to user_profiles
- `wardrobe_items_anlyzed` - integer (photo analysis limit)
- `ai_requests` - integer (AI assistant requests limit)
- `ideas_viewed` - integer (inspiration feed limit)
- `outfits_saved` - integer (saved outfits limit)
- `vton_used` - integer (virtual try-on limit)

**Notes:**
- Auto-topup from credits when limits are exhausted (handled by `use_feature` RPC)
- Reset to unlimited when subscription is active

---

### `user_subscriptions`
User subscription information.

**Columns:**
- `id` - UUID, Primary Key
- `user_profile_id` - UUID, Foreign Key to user_profiles
- `subscription_type` - text ("monthly" | "yearly")
- `status` - text ("active" | "inactive" | "cancelled")
- `start_date` - timestamp
- `expires_at` - timestamp

**Business Rules:**
- Only one active subscription per user
- When active: unlimited feature usage
- Monthly: expires in 1 month
- Yearly: expires in 1 year

---

### `user_credits`
User credit balance (can be purchased or granted).

**Columns:**
- `user_profile_id` - UUID, Foreign Key to user_profiles
- `credits_balance` - integer (current balance)

**Usage:**
- Credits auto-deducted when limits are exhausted and no active subscription
- Can purchase credits via `credit_packs`

---

### `credit_packs`
Available credit packages for purchase.

**Columns:**
- `id` - integer, Primary Key
- `name` - text (e.g., "10 кредитов", "40 кредитов")
- `credits` - integer (amount of credits in pack)
- `price_rub` - integer (price in Russian rubles)
- `is_active` - boolean (whether pack is available for purchase)

**Example Packs:**
- Pack 10: 99₽ → 10 credits
- Pack 40: 299₽ → 40 credits
- Pack 100: 599₽ → 100 credits
- Pack 200: 999₽ → 200 credits

---

### `payments`
Payment transaction records.

**Columns:**
- `id` - UUID, Primary Key
- `user_id` - UUID, Foreign Key to auth.users
- `invoice_id` - integer (Robokassa invoice ID)
- `amount` - numeric (payment amount)
- `status` - text ("pending" | "paid" | "failed")
- `meta` - jsonb (payment metadata)

**Meta Structure for Subscriptions:**
```json
{
  "action": "subscribe",
  "type": "monthly" | "yearly",
  "post_applied": boolean,  // idempotency flag (set by webhook)
  "post_applied_at": timestamp,  // set by webhook
  "post_error": string  // error message if processing failed
}
```

**Meta Structure for Credits:**
```json
{
  "action": "buy_credits",
  "credits": number,  // amount of credits to add
  "packName": string,  // e.g., "10 кредитов"
  "post_applied": boolean,  // idempotency flag (set by webhook)
  "post_applied_at": timestamp,  // set by webhook
  "post_error": string  // error message if processing failed
}
```

---

## RPC Functions

### `reconcile_limits(p_user_profile_id UUID)`
Reconciles user limits based on subscription status.

**Purpose:**
- Called before checking/consuming features
- Resets limits if subscription is active
- Ensures limits are up-to-date

**Returns:** void

---

### `use_feature(p_user_profile_id UUID, p_feature TEXT, p_count INTEGER)`
Attempts to consume a feature with auto-topup from credits.

**Parameters:**
- `p_user_profile_id` - User profile ID
- `p_feature` - Feature name (wardrobe_items_anlyzed, ai_requests, etc.)
- `p_count` - Number of uses to consume

**Logic:**
1. Check if subscription is active → allow (unlimited)
2. Check if sufficient limit remaining → deduct and allow
3. Check if sufficient credits → convert credits to limit and allow
4. Otherwise → deny (return false)

**Returns:** boolean (true if allowed, false if denied)

---

### `can_use_feature(p_user_profile_id UUID, p_feature TEXT, p_count INTEGER)`
Checks if user can use a feature (without consuming).

**Parameters:**
- Same as `use_feature`

**Logic:**
- Similar to `use_feature` but doesn't modify limits/credits
- Used for pre-flight checks

**Returns:** boolean

---

### `add_credits(p_user_profile_id UUID, p_amount INTEGER, p_reason TEXT, p_description TEXT)`
Adds credits to user account.

**Parameters:**
- `p_user_profile_id` - User profile ID
- `p_amount` - Number of credits to add
- `p_reason` - Reason code ("purchase", "grant", "refund")
- `p_description` - Human-readable description

**Usage:**
- Called after successful payment
- Called by admin for manual credit grants
- Creates transaction record in credits history

**Returns:** void (throws error on failure)

---

### `activate_subscription_and_reset_limits(p_user_profile_id UUID)`
Activates subscription benefits and resets limits.

**Purpose:**
- Called after subscription payment is confirmed
- Resets all limits to unlimited (or high values)
- May grant bonus credits

**Returns:** void (throws error on failure)

---

### `log_usage_event(p_user_profile_id UUID, p_feature TEXT, p_action TEXT, p_count INTEGER, ...)`
Logs analytics event for feature usage.

**Parameters:**
- `p_user_profile_id` - User profile ID
- `p_feature` - Feature name
- `p_action` - Action type (check, consume_success, consume_fail)
- `p_count` - Count
- Additional metadata parameters

**Purpose:** Analytics and debugging

---

## Payment Flow

### Subscription Purchase
1. User clicks "Получить доступ" → calls `startRoboPayment()`
2. Payment meta: `{ action: "subscribe", type: "monthly"|"yearly" }`
3. User completes payment on Robokassa
4. Robokassa POST to `/api/payments/robokassa/result`
5. Webhook verifies signature, finds payment by invoice_id
6. Checks `meta.action === "subscribe"`
7. Creates record in `user_subscriptions` with type, status="active", dates
8. Calls `activate_subscription_and_reset_limits()`
9. Sets `meta.post_applied = true` for idempotency

### Credits Purchase
1. User clicks credit pack → calls `startRoboPayment()`
2. Payment meta: `{ action: "buy_credits", credits: 10|40|100|200, packName: "..." }`
3. User completes payment on Robokassa
4. Robokassa POST to `/api/payments/robokassa/result`
5. Webhook verifies signature, finds payment
6. Checks `meta.action === "buy_credits"`
7. Calls `add_credits(profile.id, meta.credits, "purchase", packName)`
8. Sets `meta.post_applied = true`

---

## Feature Limit Check Flow

### Using `/api/check-limits`

**Check Mode (featureType not provided):**
```typescript
POST /api/check-limits
{
  "feature": "wardrobe_items_anlyzed",
  "count": 1,
  "meta": {}
}
```
Response: `{ success: true, canUse: true/false, remaining: number }`

**Consume Mode (featureType provided):**
```typescript
POST /api/check-limits
{
  "featureType": "wardrobe_items_anlyzed",
  "count": 1,
  "meta": {}
}
```
- Calls `use_feature()` RPC
- Returns 402 Payment Required if denied
- Response: `{ success: true, canUse: true, remaining: number }`

---

## Common Issues & Fixes

### Issue: Credits not added after payment
**Cause:** Missing `action: "buy_credits"` in payment meta
**Fix:** Ensure `startRoboPayment()` includes correct action field

### Issue: Subscription not activated after payment
**Cause:** Missing `action: "subscribe"` in payment meta
**Fix:** Ensure meta includes action field

### Issue: Admin grant subscription fails with check constraint error
**Cause:** Using wrong field for `subscription_type` - was using `subscriptionType: "pro"` instead of `subscriptionDuration: "monthly"|"yearly"`
**Fix:** Use `subscriptionDuration` field which contains valid values ("monthly" or "yearly")
**File:** app/api/admin/grant-credits/route.ts:65

### Issue: 402 errors not showing paywall
**Cause:** Error not properly caught/checked in frontend
**Fix:** Check for `errorMessage.includes('402')` in catch block

### Issue: Multiple check-limits calls
**Cause:** Retries or duplicate requests
**Fix:** Add debouncing or request deduplication

---

## Feature Type Mapping

| Feature Key | Description | Usage Context |
|-------------|-------------|---------------|
| `wardrobe_items_anlyzed` | Photo analysis | AddToClosetSheet |
| `ai_requests` | AI assistant queries | AI Assistant page |
| `ideas_viewed` | Inspiration feed views | Inspiration page |
| `outfits_saved` | Saved outfit count | Outfit builder |
| `vton_used` | Virtual try-on uses | VTON feature |

---

## Database Credentials (from .env)

```bash
SUPABASE_URL=https://cipjxxtdmfhoqixtiruy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Service role for admin operations
POSTGRES_PASSWORD=UOClJEtrW92UaNQp
POSTGRES_HOST=db.cipjxxtdmfhoqixtiruy.supabase.co
```

**Security Notes:**
- Service role key bypasses RLS - use only in server-side code
- Never expose service role key to client
- Use anon key for client-side Supabase operations