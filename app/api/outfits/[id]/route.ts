import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const outfitId = parseInt(params.id)

    if (isNaN(outfitId)) {
      return NextResponse.json(
        { error: 'Invalid outfit ID' },
        { status: 400 }
      )
    }

    const { data: outfit, error } = await supabase
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
      .eq('id', outfitId)
      .single()

    if (error) {
      console.error('Error fetching outfit:', error)
      return NextResponse.json(
        { error: 'Outfit not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ outfit })

  } catch (error) {
    console.error('Error in GET /api/outfits/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const outfitId = parseInt(params.id)
    const body = await request.json()

    if (isNaN(outfitId)) {
      return NextResponse.json(
        { error: 'Invalid outfit ID' },
        { status: 400 }
      )
    }

    const { name, description, season, occasion, preview_image_url, item_ids } = body

    // Обновляем основную информацию об образе
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (season !== undefined) updateData.season = season
    if (occasion !== undefined) updateData.occasion = occasion
    if (preview_image_url !== undefined) updateData.preview_image_url = preview_image_url

    const { data: outfit, error: outfitError } = await supabase
      .from('outfits')
      .update(updateData)
      .eq('id', outfitId)
      .select()
      .single()

    if (outfitError) {
      console.error('Error updating outfit:', outfitError)
      return NextResponse.json(
        { error: 'Failed to update outfit' },
        { status: 500 }
      )
    }

    // Если переданы новые вещи, обновляем их
    if (item_ids && Array.isArray(item_ids)) {
      // Удаляем старые связи
      const { error: deleteError } = await supabase
        .from('outfit_items')
        .delete()
        .eq('outfit_id', outfitId)

      if (deleteError) {
        console.error('Error deleting old outfit items:', deleteError)
        return NextResponse.json(
          { error: 'Failed to update outfit items' },
          { status: 500 }
        )
      }

      // Создаем новые связи
      if (item_ids.length > 0) {
        const outfitItems = item_ids.map((itemId: number, index: number) => ({
          outfit_id: outfitId,
          wardrobe_item_id: itemId,
          position: index + 1
        }))

        const { error: itemsError } = await supabase
          .from('outfit_items')
          .insert(outfitItems)

        if (itemsError) {
          console.error('Error creating new outfit items:', itemsError)
          return NextResponse.json(
            { error: 'Failed to update outfit items' },
            { status: 500 }
          )
        }
      }
    }

    return NextResponse.json({ outfit })

  } catch (error) {
    console.error('Error in PUT /api/outfits/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const outfitId = parseInt(params.id)

    if (isNaN(outfitId)) {
      return NextResponse.json(
        { error: 'Invalid outfit ID' },
        { status: 400 }
      )
    }

    // Сначала удаляем связанные элементы
    const { error: itemsError } = await supabase
      .from('outfit_items')
      .delete()
      .eq('outfit_id', outfitId)

    if (itemsError) {
      console.error('Error deleting outfit items:', itemsError)
      return NextResponse.json(
        { error: 'Failed to delete outfit items' },
        { status: 500 }
      )
    }

    // Затем удаляем сам образ
    const { error: outfitError } = await supabase
      .from('outfits')
      .delete()
      .eq('id', outfitId)

    if (outfitError) {
      console.error('Error deleting outfit:', outfitError)
      return NextResponse.json(
        { error: 'Failed to delete outfit' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error in DELETE /api/outfits/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
