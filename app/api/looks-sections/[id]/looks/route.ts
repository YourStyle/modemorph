import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sectionId = Number.parseInt(params.id)
    if (isNaN(sectionId)) {
      return NextResponse.json({ error: "Invalid section ID" }, { status: 400 })
    }

    const body = await request.json()
    const { look_id } = body

    if (!look_id) {
      return NextResponse.json({ error: "Look ID is required" }, { status: 400 })
    }

    // Verify the section belongs to the user
    const { data: section, error: sectionError } = await supabase
      .from("looks_sections")
      .select("id")
      .eq("id", sectionId)
      .eq("user_id", user.id)
      .single()

    if (sectionError || !section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 })
    }

    // Verify the look belongs to the user
    const { data: look, error: lookError } = await supabase
      .from("user_looks")
      .select("id")
      .eq("id", look_id)
      .eq("user_id", user.id)
      .single()

    if (lookError || !look) {
      return NextResponse.json({ error: "Look not found" }, { status: 404 })
    }

    // Add look to section
    const { data: sectionLook, error } = await supabase
      .from("section_looks")
      .insert({
        section_id: sectionId,
        look_id: look_id,
      })
      .select()
      .single()

    if (error) {
      if (error.code === "23505") {
        // Unique constraint violation
        return NextResponse.json({ error: "Look already in section" }, { status: 409 })
      }
      console.error("Error adding look to section:", error)
      return NextResponse.json({ error: "Failed to add look to section" }, { status: 500 })
    }

    return NextResponse.json(sectionLook, { status: 201 })
  } catch (error) {
    console.error("Error in POST /api/looks-sections/[id]/looks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sectionId = Number.parseInt(params.id)
    if (isNaN(sectionId)) {
      return NextResponse.json({ error: "Invalid section ID" }, { status: 400 })
    }

    const url = new URL(request.url)
    const lookId = url.searchParams.get("look_id")

    if (!lookId) {
      return NextResponse.json({ error: "Look ID is required" }, { status: 400 })
    }

    // Verify the section belongs to the user
    const { data: section, error: sectionError } = await supabase
      .from("looks_sections")
      .select("id")
      .eq("id", sectionId)
      .eq("user_id", user.id)
      .single()

    if (sectionError || !section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 })
    }

    const { error } = await supabase
      .from("section_looks")
      .delete()
      .eq("section_id", sectionId)
      .eq("look_id", Number.parseInt(lookId))

    if (error) {
      console.error("Error removing look from section:", error)
      return NextResponse.json({ error: "Failed to remove look from section" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/looks-sections/[id]/looks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
