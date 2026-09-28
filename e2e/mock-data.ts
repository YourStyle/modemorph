// e2e/mock-data.ts
// Realistic-shaped fixtures for every /api/* route the smoke suite hits.
// Kept in one file so a reviewer can see the whole contract at a glance.

export const PLACEHOLDER_IMG = "/placeholder.svg"

export const profileSession = {
  profile: {
    id: "e2e-user-0001",
    full_name: "Александра Смоук",
    avatar_url: null,
    is_admin: false,
    gender: "female",
    dominant_style: "casual",
    style_tags: "минимализм,кэжуал",
    role: "user",
    pending_gift: null,
  },
}

export const meProfile = {
  profile: {
    gender: "female",
    dominant_style: "повседневный",
    style_tags: "минимализм,кэжуал",
  },
}

export const weatherCached = {
  temperature: 18,
  condition: "Clouds",
  description: "облачно",
  location: "Москва",
}

export const wardrobeUserItems = [
  { id: 101, item_name: "Белая рубашка", image_url: PLACEHOLDER_IMG, clothing_type: "shirt", created_at: "2026-09-01T10:00:00Z" },
  { id: 102, item_name: "Синие джинсы", image_url: PLACEHOLDER_IMG, clothing_type: "jeans", created_at: "2026-09-02T10:00:00Z" },
  { id: 103, item_name: "Чёрные кроссовки", image_url: PLACEHOLDER_IMG, clothing_type: "sneakers", created_at: "2026-09-03T10:00:00Z" },
  { id: 104, item_name: "Бежевое пальто", image_url: PLACEHOLDER_IMG, clothing_type: "coat", created_at: "2026-09-04T10:00:00Z" },
  { id: 105, item_name: "Клетчатая юбка", image_url: PLACEHOLDER_IMG, clothing_type: "skirt", created_at: "2026-09-05T10:00:00Z" },
]

export const basicWardrobeItems = [
  { id: 201, item_name: "Серый свитер", description: "Базовый свитер оверсайз", clothing_type: "sweater", image_url: PLACEHOLDER_IMG, material: "хлопок", style: "кэжуал", color: "серый", shade: "светлый", has_print: "нет", has_details: "нет", gender: "female" },
  { id: 202, item_name: "Чёрные брюки", description: "Прямые брюки", clothing_type: "pants", image_url: PLACEHOLDER_IMG, material: "хлопок", style: "минимализм", color: "чёрный", shade: "тёмный", has_print: "нет", has_details: "нет", gender: "female" },
]

function outfitItem(id: number, name: string, extra: Record<string, any> = {}) {
  return {
    id: String(id),
    name,
    item_name: name,
    image_url: PLACEHOLDER_IMG,
    color: "белый",
    shade: "светлый",
    has_print: "нет",
    notes: null,
    user_id: "e2e-user-0001",
    url: null,
    ...extra,
  }
}

export const recommendationsResponse = {
  stale: false,
  sections: [
    {
      title: "Повседневный образ",
      looks_count: 2,
      source: "user_only",
      rec_session_id: "sess-1",
      suggestions: [
        { id: "sg-1", title: "Офис-кэжуал", suggested_items_count: 2, items: [outfitItem(101, "Белая рубашка"), outfitItem(102, "Синие джинсы")] },
        { id: "sg-2", title: "Прогулка", suggested_items_count: 2, items: [outfitItem(103, "Чёрные кроссовки"), outfitItem(104, "Бежевое пальто")] },
      ],
    },
    {
      title: "На выход",
      looks_count: 1,
      source: "mix",
      rec_session_id: "sess-2",
      suggestions: [
        { id: "sg-3", title: "Вечерний образ", suggested_items_count: 2, items: [outfitItem(105, "Клетчатая юбка"), outfitItem(101, "Белая рубашка")] },
      ],
    },
    {
      title: "Премиум подборка",
      source: "ai",
      locked: true,
      suggestions: [
        {
          id: "sg-locked-1",
          title: "Закрытый образ",
          suggested_items_count: 4,
          items: [outfitItem(301, "Вещь 1"), outfitItem(302, "Вещь 2"), outfitItem(303, "Вещь 3"), outfitItem(304, "Вещь 4")],
        },
      ],
    },
  ],
}

export const userLooksEmpty: any[] = []

export const looksSectionsEmpty: any[] = []

export const inspirationOutfits = {
  outfits: [
    {
      id: "outfit-1",
      title: "Повседневный образ",
      description: "Лёгкий кэжуал на каждый день",
      items: [outfitItem(101, "Белая рубашка"), outfitItem(102, "Синие джинсы")],
      tags: ["casual"],
      likes: 12,
      isLiked: false,
      isSaved: false,
      preview_image_url: PLACEHOLDER_IMG,
      vibe: null,
    },
    {
      id: "outfit-2",
      title: "Вечерний выход",
      description: "Элегантный образ на вечер",
      items: [outfitItem(105, "Клетчатая юбка"), outfitItem(104, "Бежевое пальто")],
      tags: ["evening"],
      likes: 5,
      isLiked: false,
      isSaved: false,
      preview_image_url: PLACEHOLDER_IMG,
      vibe: null,
    },
  ],
  nextCursor: null,
}

export const inspirationVibes = { vibes: [] as any[] }
export const userLikes = { liked: [] as string[] }

export const checkLimitsOk = { canUse: true, remaining: 100 }

// components/invite-friend-card.tsx renders nothing until this resolves with
// a referral object — required for the "Пригласи подругу" card assertion.
export const discountsMine = {
  referral: { code: "FRIEND15", percent_off: 15, reward_days: 7, invited: 3 },
}

export const meAdmin = {
  profile: { id: "e2e-admin-0001", role: "admin", is_admin: true, full_name: "Admin E2E" },
}

export const adminPayingUsers = { paying_users: [] as any[] }
export const adminSources = { sources: [] as any[] }

// Full AnalyticsData shape (app/admin/analytics/page.tsx) — every top-level
// section the page renders must be present, with the exact field names the
// component destructures/accesses without optional chaining.
export const adminAnalytics = {
  _errors: [] as Array<{ metric: string; error: string }>,
  meta: {
    excludes_test_accounts: true,
    test_accounts_excluded: 3,
    accounts: 455,
    profiles_with_data: 295,
    accounts_without_profile: 160,
    population_note: "Доли считаются от заполнивших профиль.",
    total_users: 295,
    activity_cutoff: "2026-06-11",
    rec_instrumentation_since: "2026-05-01",
  },
  onboarding: {
    users_with_first_item: 210,
    users_wardrobe_15: 90,
    users_wardrobe_25: 54,
    users_wardrobe_50: 12,
  },
  ahaMoment: {
    users_first_outfit: 140,
    users_first_tryon: 60,
    users_clicked_recommendation: 180,
  },
  recommendations: {
    served_rows: 5000,
    served_sessions: 900,
    served_users: 250,
    impressions: 4200,
    impression_sessions: 850,
    impression_users: 240,
    clicks: 630,
    click_users: 150,
    ctr: 15,
    ctr_basis: { sessions: 850, impressions: 4200, clicks: 630 },
    ctr_min_impressions: 100,
    instrumentation_since: "2026-05-01",
  },
  value: {
    total_outfits_saved: 320,
    users_saved_outfits: 130,
    repeat_task_rate: 42.5,
    outfits_per_active_user: 2.4,
  },
  engagement: {
    users_used_ai: 95,
    total_ai_requests: 410,
    ai_adoption_pct: 32.2,
    ai_adoption_basis: "profiles_with_data",
    ai_adoption_denominator: 295,
    ai_users_who_saved_look: 40,
    ai_users_who_saved_look_pct: 42.1,
  },
  retention: {
    d1_retention: 35,
    d7_retention: 20,
    d30_retention: 10,
    d1_users: 80,
    d7_users: 45,
    d30_users: 20,
    eligible_d1: 230,
    eligible_d7: 220,
    eligible_d30: 200,
    measurement: {
      cutoff: "2026-06-11",
      instrumented_users: 260,
      denominator: 295,
      denominator_basis: "profiles_with_data",
      accounts: 455,
      total_users: 295,
      coverage_pct: 88.1,
      basis: "paid_actions_only",
    },
  },
  monetization: {
    paywall_shown: 500,
    paid_subscriptions: 25,
    premium_users: 30,
    premium_paid: 25,
    premium_granted: 5,
    conversion_rate: 5,
    conversion_overlap_days: 0,
    paywall_window: ["2026-05-01", "2026-09-28"] as [string, string],
    paid_window: ["2026-05-15", "2026-09-28"] as [string, string],
  },
  paymentFunnel: {
    attempts: 90,
    pending: 53,
    paid: 37,
    users_attempted: 70,
    users_paid: 30,
    paid_pct: 41.1,
    unconfirmed_pct: 58.9,
    total_revenue: 148500,
    by_month: [
      { month: "2026-07", attempts: 30, pending: 18, paid: 12, users: 10, revenue: 48000, paid_pct: 40, unconfirmed_pct: 60 },
      { month: "2026-08", attempts: 35, pending: 20, paid: 15, users: 12, revenue: 60000, paid_pct: 42.8, unconfirmed_pct: 57.2 },
      { month: "2026-09", attempts: 25, pending: 15, paid: 10, users: 8, revenue: 40500, paid_pct: 40, unconfirmed_pct: 60 },
    ],
    status_caveat: {
      statuses_observed: ["pending", "paid"],
      has_failure_status: false,
      unconfirmed_label: "Не подтверждено",
      reason: "У платежей нет статуса неудачи, только pending и paid.",
      unblocks_when: "Заработает, когда провайдер начнёт присылать статус отказа.",
    },
  },
  revenue: {
    mrr: 12500,
    total_revenue: 148500,
    paying_users: 30,
    arpu: 503,
    arppu: 4950,
  } as { mrr: number; total_revenue: number; paying_users: number; arpu: number; arppu: number } | null,
  revenueGate: {
    payers: 30,
    required: 10,
    unlocked: true,
    removed_metrics: [] as string[],
    gated_metrics: [] as string[],
    gated_reason: "",
    shown_anyway: [] as string[],
    shown_anyway_reason: "",
  },
  funnel: [
    { stage: "Регистрация", users: 455, total: 455, conv_from_prev_pct: 100, conv_from_start_pct: 100, off_path: 0 },
    { stage: "Профиль", users: 295, total: 295, conv_from_prev_pct: 64.8, conv_from_start_pct: 64.8, off_path: 160 },
    { stage: "Первая вещь", users: 210, total: 210, conv_from_prev_pct: 71.2, conv_from_start_pct: 46.2, off_path: 85 },
    { stage: "Первый образ", users: 140, total: 140, conv_from_prev_pct: 66.7, conv_from_start_pct: 30.8, off_path: 70 },
  ],
  funnelMeta: {
    basis: "accounts",
    starts_at: "accounts",
    description: "Воронка считается от аккаунтов, а не от профилей.",
    excluded_stages: ["AI-ассистент"],
    excluded_reason: "AI-ассистент — не этап воронки, а отдельная метрика вовлечения.",
  },
  registration_steps: {
    instrumented_since: "2026-05-01",
    has_data: true,
    steps: [
      { step: 1, label: "Пол и имя", reached: 300, completed: 280, went_back: 5, submitted: 280, failed: 0, drop_pct: 6.7 },
      { step: 2, label: "Стиль", reached: 280, completed: 260, went_back: 3, submitted: 260, failed: 0, drop_pct: 7.1 },
    ],
  },
  timeline: [
    { date: "2026-09-24", items_added: 12, outfits_created: 4, ai_requests: 8, registrations: 3, active_users: 40 },
    { date: "2026-09-25", items_added: 15, outfits_created: 6, ai_requests: 10, registrations: 5, active_users: 44 },
    { date: "2026-09-26", items_added: 9, outfits_created: 3, ai_requests: 7, registrations: 2, active_users: 38 },
    { date: "2026-09-27", items_added: 18, outfits_created: 7, ai_requests: 12, registrations: 6, active_users: 50 },
  ],
  timelineMeta: { from: "2026-09-24", to: "2026-09-27", days: 4, zero_filled: false },
  stickiness: {
    dau: 40,
    mau: 210,
    ratio: 19,
    ratio_suppressed: false,
    ratio_suppressed_reason: null,
    mau_window_start: "2026-08-28",
    avg_days_active: 5.2,
    dau_is_partial: true,
    cutoff: "2026-06-11",
  },
  cohortRetention: [
    {
      week: "2026-09-01",
      cohort_size: 25,
      low_sample: false,
      suppressed_reason: null,
      week_1: 10, week_1_pct: 40, week_1_elapsed: true,
      week_2: 6, week_2_pct: 24, week_2_elapsed: true,
      week_3: 4, week_3_pct: 16, week_3_elapsed: true,
      week_4: 3, week_4_pct: 12, week_4_elapsed: false,
    },
  ],
  cohortMinSize: 5,
  activation: [
    { action: "Сохранил образ", did_total: 130, did_retained: 60, did_retention_pct: 46.1, didnt_total: 165, didnt_retained: 40, didnt_retention_pct: 24.2 },
  ],
  timeToValue: {
    avg_to_first_item_hours: 2.4,
    median_to_first_item_hours: 1.1,
    avg_to_first_outfit_hours: 8.6,
    median_to_first_outfit_hours: 5.2,
    users_reached_first_outfit: 140,
    first_outfit_activation_rate: 47.5,
    first_outfit_activation_basis: "profiles_with_data",
    first_outfit_activation_denominator: 295,
  },
}
