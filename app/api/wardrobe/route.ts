import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    const { data: items, error } = await supabase
      .from('wardrobe_items')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching wardrobe items:', error)
      return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
    }

    return NextResponse.json(items || [])
  } catch (error) {
    console.error('Error in GET /api/wardrobe:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    
    const { data: item, error } = await supabase
      .from('wardrobe_items')
      .insert({
        name: body.name,
        image_url: body.image_url,
        color: body.color,
        clothing_type: body.clothing_type,
        is_basic: body.is_basic || false,
        is_hidden: body.is_hidden || false
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating wardrobe item:', error)
      return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
    }

    return NextResponse.json(item)
  } catch (error) {
    console.error('Error in POST /api/wardrobe:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
