import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth-server"
import { createClient } from "@supabase/supabase-js"

async function getAdminSupabase(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single()

  if (!profile?.is_admin) return null
  return { supabase, user }
}

export async function GET(req: NextRequest) {
  const ctx = await getAdminSupabase(req)
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await ctx.supabase
    .from("reminder_configs")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reminders: data })
}

export async function POST(req: NextRequest) {
  const ctx = await getAdminSupabase(req)
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { name, message_template, reminder_type, day_of_week, conditions, is_active } = body

  if (!name || !message_template) {
    return NextResponse.json({ error: "name and message_template are required" }, { status: 400 })
  }

  const { data, error } = await ctx.supabase
    .from("reminder_configs")
    .insert({
      name,
      message_template,
      reminder_type: reminder_type || "daily",
      day_of_week: day_of_week ?? null,
      conditions: conditions || {},
      is_active: is_active !== false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reminder: data })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAdminSupabase(req)
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, ...updates } = await req.json()
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.message_template !== undefined) updateData.message_template = updates.message_template
  if (updates.reminder_type !== undefined) updateData.reminder_type = updates.reminder_type
  if (updates.day_of_week !== undefined) updateData.day_of_week = updates.day_of_week
  if (updates.conditions !== undefined) updateData.conditions = updates.conditions
  if (updates.is_active !== undefined) updateData.is_active = updates.is_active

  const { error } = await ctx.supabase
    .from("reminder_configs")
    .update(updateData)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAdminSupabase(req)
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 })
  }

  const { error } = await ctx.supabase
    .from("reminder_configs")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
