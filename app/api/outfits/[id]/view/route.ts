import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
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

    // Увеличиваем счетчик просмотров
    const { error } = await supabase
      .from('outfits')
      .update({ 
        views_count: supabase.sql`views_count + 1` 
      })
      .eq('id', outfitId)

    if (error) {
      console.error('Error incrementing view count:', error)
      return NextResponse.json(
        { error: 'Failed to increment view count' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error in POST /api/outfits/[id]/view:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
