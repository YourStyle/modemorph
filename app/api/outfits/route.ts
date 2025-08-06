import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createClient()

    const { data: outfits, error } = await supabase
      .from('outfits')
      .select(`
        id,
        name,
        description,
        season,
        occasion,
        preview_image_url,
        likes,
        views_count,
        favorites_count,
        created_at,
        updated_at,
        outfit_items (
          id,
          position,
          wardrobe_items (
            id,
            item_name,
            image_url,
            clothing_type,
            color,
            basic_wardrobe_items (
              name_ru,
              name_en
            )
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching outfits:', error)
      return NextResponse.json(
        { error: 'Failed to fetch outfits' },
        { status: 500 }
      )
    }

    return NextResponse.json({ outfits: outfits || [] })

  } catch (error) {
    console.error('Error in GET /api/outfits:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()

    const { name, description, season, occasion, preview_image_url, item_ids } = body

    if (!name || !preview_image_url || !item_ids || item_ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Создаем образ
    const { data: outfit, error: outfitError } = await supabase
      .from('outfits')
      .insert({
        name,
        description,
        season,
        occasion,
        preview_image_url,
        likes: 0,
        views_count: 0,
        favorites_count: 0
      })
      .select()
      .single()

    if (outfitError) {
      console.error('Error creating outfit:', outfitError)
      return NextResponse.json(
        { error: 'Failed to create outfit' },
        { status: 500 }
      )
    }

    // Создаем связи с вещами
    const outfitItems = item_ids.map((itemId: number, index: number) => ({
      outfit_id: outfit.id,
      wardrobe_item_id: itemId,
      position: index + 1
    }))

    const { error: itemsError } = await supabase
      .from('outfit_items')
      .insert(outfitItems)

    if (itemsError) {
      console.error('Error creating outfit items:', itemsError)
      // Удаляем созданный образ в случае ошибки
      await supabase.from('outfits').delete().eq('id', outfit.id)
      return NextResponse.json(
        { error: 'Failed to create outfit items' },
        { status: 500 }
      )
    }

    return NextResponse.json({ outfit }, { status: 201 })

  } catch (error) {
    console.error('Error in POST /api/outfits:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
