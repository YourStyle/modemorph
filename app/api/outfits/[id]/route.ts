import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    
    const { data: outfit, error } = await supabase
      .from('outfits')
      .select(`
        *,
        outfit_items (
          id,
          wardrobe_item_id,
          wardrobe_items (
            id,
            name,
            image_url,
            color,
            clothing_type,
            is_basic
          )
        )
      `)
      .eq('id', params.id)
      .single()

    if (error) {
      console.error('Error fetching outfit:', error)
      return NextResponse.json({ error: 'Outfit not found' }, { status: 404 })
    }

    return NextResponse.json(outfit)
  } catch (error) {
    console.error('Error in GET /api/outfits/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const body = await request.json()
    
    const { data: outfit, error } = await supabase
      .from('outfits')
      .update({
        name: body.name,
        description: body.description,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating outfit:', error)
      return NextResponse.json({ error: 'Failed to update outfit' }, { status: 500 })
    }

    return NextResponse.json(outfit)
  } catch (error) {
    console.error('Error in PUT /api/outfits/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    
    // Сначала удаляем связанные элементы
    await supabase
      .from('outfit_items')
      .delete()
      .eq('outfit_id', params.id)

    // Затем удаляем сам образ
    const { error } = await supabase
      .from('outfits')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('Error deleting outfit:', error)
      return NextResponse.json({ error: 'Failed to delete outfit' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/outfits/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
