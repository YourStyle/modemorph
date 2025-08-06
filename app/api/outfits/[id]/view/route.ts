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

    // Получаем текущее количество просмотров
    const { data: currentOutfit, error: fetchError } = await supabase
      .from('outfits')
      .select('views_count')
      .eq('id', outfitId)
      .single()

    if (fetchError) {
      console.error('Error fetching current views:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch outfit' },
        { status: 500 }
      )
    }

    // Увеличиваем счетчик просмотров
    const newViewsCount = (currentOutfit.views_count || 0) + 1

    const { error: updateError } = await supabase
      .from('outfits')
      .update({ views_count: newViewsCount })
      .eq('id', outfitId)

    if (updateError) {
      console.error('Error updating views count:', updateError)
      return NextResponse.json(
        { error: 'Failed to update views count' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      views_count: newViewsCount 
    })

  } catch (error) {
    console.error('Error in POST /api/outfits/[id]/view:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
