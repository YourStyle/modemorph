import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Shapes returned to the client /app/inspiration
type FeedOutfit = {
  id: string
  title: string
  description?: string
  items: {
    id: string
    name: string
    image_url: string
    url?: string | null
    color?: string | null
    shade?: string | null
    style?: string | null
    material?: string | null
    size_type?: string | null
    has_print?: string | null
    has_details?: string | null
    notes?: string | null
    is_basic?: boolean
  }[]
  tags: string[]
  likes: number
  isLiked: boolean
  isSaved?: boolean
  preview_image_url?: string
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = await createClient({ token });
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50)
    const gender = url.searchParams.get("gender")

    let outfitsQuery = supabase
      .from("outfits")
      .select("id, name, description, preview_image_url, created_at, gender")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (gender) {
      outfitsQuery = outfitsQuery.or(`gender.eq.${gender},gender.eq.unisex,gender.is.null`)
    }

    const { data: outfits, error: outfitsErr } = await outfitsQuery

    if (outfitsErr) {
      console.warn("Fetch outfits error:", outfitsErr)
      return NextResponse.json({ outfits: [], nextCursor: null }, { headers: { "Cache-Control": "no-store" } })
    }

    const ids = (outfits ?? []).map((o) => Number(o.id)).filter((n) => Number.isFinite(n)) as number[]

    const itemsByOutfit = new Map<number, FeedOutfit["items"]>()
    const likesByOutfit = new Map<number, number>()
    const likedByMe = new Set<number>()

    if (ids.length > 0) {
      const { data: itemsRows, error: itemsErr } = await supabase
        .from("outfit_items")
        .select(
          `
          outfit_id,
          wardrobe_items (
            id,
            item_name,
            image_url,
            url,
            color,
            shade,
            style,
            material,
            size_type,
            has_print,
            has_details,
            notes,
            is_basic
          )
        `,
        )
        .in("outfit_id", ids)

      if (!itemsErr && itemsRows) {
        for (const row of itemsRows as any[]) {
          const outfitId = Number(row.outfit_id)
          const w = row.wardrobe_items
          if (!w) continue
          const arr = itemsByOutfit.get(outfitId) ?? []
          arr.push({
            id: String(w.id),
            name: w.item_name ?? "",
            image_url: w.image_url ?? "",
            url: w.url ?? null,
            color: w.color ?? null,
            shade: w.shade ?? null,
            style: w.style ?? null,
            material: w.material ?? null,
            size_type: w.size_type ?? null,
            has_print: w.has_print ?? null,
            has_details: w.has_details ?? null,
            notes: w.notes ?? null,
            is_basic: !!w.is_basic,
          })
          itemsByOutfit.set(outfitId, arr)
        }
      } else if (itemsErr) {
        console.warn("Fetch outfit items error:", itemsErr)
      }

      const { data: likeRows, error: likesErr } = await supabase
        .from("user_likes")
        .select("outfit_id")
        .in("outfit_id", ids)

      if (!likesErr && likeRows) {
        for (const r of likeRows) {
          const k = Number(r.outfit_id)
          likesByOutfit.set(k, (likesByOutfit.get(k) ?? 0) + 1)
        }
      } else if (likesErr) {
        console.warn("Fetch liked rows error:", likesErr)
      }

      if (user) {
        const { data: mine } = await supabase
          .from("user_likes")
          .select("outfit_id")
          .eq("user_id", user.id)
          .in("outfit_id", ids)
        for (const r of mine ?? []) likedByMe.add(Number(r.outfit_id))
      }
    }

    const feed: FeedOutfit[] =
      outfits?.map((o) => {
        const idNum = Number(o.id)
        return {
          id: String(o.id),
          title: o.name ?? "",
          description: o.description ?? "",
          items: itemsByOutfit.get(idNum) ?? [],
          tags: [],
          likes: likesByOutfit.get(idNum) ?? 0,
          isLiked: likedByMe.has(idNum),
          isSaved: false,
          preview_image_url: o.preview_image_url ?? "",
        }
      }) ?? []

    // Randomize the order on each request
    shuffleInPlace(feed)

    return NextResponse.json({ outfits: feed, nextCursor: null }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("GET /api/outfits/inspiration error:", e)
    return NextResponse.json({ outfits: [], nextCursor: null }, { headers: { "Cache-Control": "no-store" } })
  }
}
