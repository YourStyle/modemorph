# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ModeMorph is a Next.js 15 fashion wardrobe management app built for Telegram Mini Apps with AI-powered photo analysis, outfit generation, and virtual try-on features. It uses Supabase for database/auth, integrates with a Python AI service, and supports Telegram-based authentication.

## Development Commands

```bash
# Development
pnpm dev                    # Start Next.js dev server
pnpm build                  # Production build
pnpm build:debug            # Build with source maps
pnpm start                  # Production server
pnpm start:debug            # Production with source maps and debugging
pnpm lint                   # Run ESLint
```

## Architecture

### Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database/Auth**: Supabase (PostgreSQL)
- **UI**: React 19, Tailwind CSS, Radix UI, shadcn/ui
- **State**: React Context API
- **Package Manager**: pnpm 9.15.0
- **AI Backend**: External Python service (Railway)

### Authentication System

**Critical**: This app uses **session-based auth** instead of cookie-based auth to support Telegram Mini Apps in Safari/iOS.

- **Client-side**: `lib/tma/session-auth.ts` - TMASessionAuth class manages access tokens in sessionStorage (with in-memory fallback for Safari private mode)
- **Server-side**: `lib/auth-server.ts` - Reads `Authorization: Bearer <token>` headers
- **API Client**: `lib/api-client.ts` - Automatically adds auth headers using sessionAuth
- **API Transport**: `lib/api-transport.ts` - Alternative transport layer with enhanced error handling

All API requests must include the Authorization header. Use `getAuthUser(req)` in API routes to verify users.

### Directory Structure

```
app/
├── app/               # Authenticated pages (wardrobe, looks, inspiration, ai-assistant)
├── auth/              # Auth pages (login, signup, reset, mini-registration)
├── admin/             # Admin dashboard pages
├── payment/           # Payment flows (success, fail, waiting)
└── api/               # API routes (organized by resource)

components/            # React components (shared UI)
contexts/              # React contexts (auth, AI analysis, background tasks, selected items)
hooks/                 # Custom React hooks (features, limits, analytics, background tasks)
lib/                   # Utilities and services
├── api.ts            # Type-safe API client functions
├── api-client.ts     # Core API client with session auth
├── api-transport.ts  # Enhanced API transport layer
├── auth-server.ts    # Server-side auth utilities
├── tma/              # Telegram Mini App utilities
└── supabase/         # Supabase client/server configs
```

### Key API Patterns

**API Routes**: Follow REST conventions in `app/api/`
```typescript
// API route structure
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)  // Verify auth
  if (!user) return new Response('Unauthorized', { status: 401 })
  // ... handle request
}
```

**Client API Calls**: Use `lib/api-client.ts` or `lib/api.ts`
```typescript
import { api } from '@/lib/api-client'

// Automatically includes auth headers
const data = await api.get('/api/wardrobe')
const result = await api.post('/api/wardrobe', itemData)
```

### Feature Usage & Limits System

The app tracks feature usage and enforces limits:

**Hook**: `hooks/use-feature.ts`
```typescript
const { log, consume } = useFeature()

// Log user actions (doesn't consume limits)
await log('wardrobe_items_anlyzed', 'click', { pagePath: '/app' })

// Consume features (checks/enforces limits)
const result = await consume('ai_requests', { requestId }, 1)
if (!result.ok && result.code === 'payment_required') {
  // Show paywall
}
```

**Features**:
- `wardrobe_items_anlyzed` - Photo analysis
- `ai_requests` - AI assistant requests
- `ideas_viewed` - Inspiration feed
- `outfits_saved` - Outfit saves
- `vton_used` - Virtual try-on

**Limit Reconciliation**: Use `useReconcileLimits(true)` hook to sync limits on page load.

### State Management Contexts

**AI Analysis Context** (`contexts/ai-analysis-context.tsx`)
- Manages photo analysis sessions across minimize/restore
- Tracks analysis progress, items, and status
- Used by AddToClosetSheet and BackgroundTasksWidget

**Background Tasks Context** (`contexts/background-tasks-context.tsx`)
- Manages async photo analysis tasks
- Shows progress in widget
- Handles task completion/errors

**Auth Context** (`contexts/auth-context.tsx`)
- Manages user authentication state
- Integrates with sessionAuth

**Selected Items Context** (`contexts/selected-items-context.tsx`)
- Manages outfit builder item selection

### Photo Analysis Flow

1. User uploads photos via `AddToClosetSheet` component
2. **Limits Check**: `handleAnalyze()` shows loader, calls `/api/check-limits` with auth token
3. **Analysis**: Calls AI service `/ai-photo-parse` endpoint
4. **Processing**: `loadBasicItemImages()` fetches/uploads images
5. **Save**: User adds items to wardrobe via `/api/wardrobe-user-items`
6. **Minimize**: Can minimize to background widget via `useBackgroundPhotoAnalysis`

**Important**: When checking limits, always pass the Authorization token:
```typescript
const authToken = session?.access_token
const response = await fetch('/api/check-limits', {
  headers: {
    'Content-Type': 'application/json',
    ...(authToken && { Authorization: `Bearer ${authToken}` }),
  },
  body: JSON.stringify({ featureType, count, meta })
})
```

### AI Integration

**AI Service URL**: `NEXT_PUBLIC_AI_API_URL` (defaults to Railway deployment)

**Endpoints**:
- `/ai-photo-parse` - Analyze clothing photos
- `/user-prompt-rec` - Generate outfit recommendations
- `/vton` - Virtual try-on
- `/regenerate` - Image regeneration

**Authentication**: All AI requests include `Authorization: Bearer <token>` header

### Environment Variables

Required:
```env
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY         # Supabase service role key (server-only)
NEXT_PUBLIC_AI_API_URL            # AI service URL (Railway)
```

Optional for local development:
```env
NEXT_PUBLIC_TG_MOCK_INIT_DATA     # Mock Telegram user data for local testing
```

### Database Tables (Key)

- `user_profiles` - User profile data
- `wardrobe_user_items` - User's wardrobe items
- `wardrobe_items` / `basic_wardrobe_items` - Basic clothing catalog
- `outfits` / `outfit_items` - User outfit compositions
- `user_looks` - Saved looks/outfits
- `user_likes` - Liked outfits
- `user_events` - Analytics events
- `user_limits` - Feature usage limits
- `user_subscription` - Subscription status

### Common Patterns

**Loading States**: Use `checkingLimits` state + custom loader for limit checks:
```typescript
const [checkingLimits, setCheckingLimits] = useState(false)

// Show animated SVG loader during limit check
{checkingLimits && <LimitsLoader />}
```

**Error Handling**: Check for payment_required (402) errors:
```typescript
if (error.message?.includes('402') || error.message?.includes('payment_required')) {
  setShowPaywall(true)
}
```

**File Uploads**: Use FormData without Content-Type header:
```typescript
const formData = new FormData()
formData.append('file', file)
await api.post('/api/upload', formData, {
  headers: {} // Let browser set Content-Type with boundary
})
```

**Telegram Mini App**: Access via `window.Telegram.WebApp` (auto-initialized in development with mock data if `NEXT_PUBLIC_TG_MOCK_INIT_DATA` is set)

### Key Components

- `AddToClosetSheet` - Photo upload/analysis with minimize support
- `PhotoAnalysisForm` - AI photo analysis UI with games/quotes during processing
- `BackgroundTasksWidget` - Shows minimized tasks progress
- `PaywallModal` - Subscription paywall
- `CommonSheet` - Mobile bottom sheet wrapper

### Debugging

**Session Debug**:
```javascript
// In browser console
window.debugTMASession()
```

**API Logs**: Check browser console for `[ApiTransport]`, `[API Client]`, `[SessionAuth]` logs

### Important Notes

1. **Always use session-based auth** - Never rely on cookies
2. **Pass Authorization header** in all API calls that need auth
3. **Check limits before consuming** features
4. **Show loading states** during limit checks (beautiful animated loaders, no forms)
5. **Handle 401 errors** by clearing session and reloading
6. **Use api-client.ts** for all HTTP requests to ensure auth headers
7. **Test in Telegram** - Safari/iOS behavior differs from desktop
