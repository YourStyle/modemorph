"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Package } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { colorToHex, colorDisplayName } from "@/lib/color-map"
import { CommonSheet } from "./common-sheet"

export interface WardrobeItem {
  id: number
  item_name: string
  image_url?: string
  color?: string
  shade?: string
  style?: string
  material?: string
  url?: string
  size_type?: string
  has_print?: string | boolean
  has_details?: string | boolean
  notes?: string
  basic_item_id?: number | null
  created_at: string
  updated_at: string
  basic_material_id?: number | null
  is_hidden?: boolean
  user_id?: string | null
  clothing_type?: string
  item_name_en?: string | null
  description?: string | null
  description_en?: string | null
  is_basic?: boolean | null
  gender?: string | null
}

interface ItemDetailsModalProps {
  item: WardrobeItem
  isOpen: boolean
  onClose: () => void
  onRefresh?: () => void
}

export function ItemDetailsModal({ item, isOpen, onClose }: ItemDetailsModalProps) {
  const [imageError, setImageError] = useState(false)

  const hex = item.color ? colorToHex(item.color) : null
  const colorLabel = item.color ? colorDisplayName(item.color) : null

  return (
    <CommonSheet
      isOpen={isOpen}
      onClose={onClose}
      title={item.item_name}
      backgroundColor="white"
      swipeAction="close"
    >
      <div className="space-y-5 pb-6">
        {/* Image */}
        <div className="aspect-[4/3] bg-secondary/30 rounded-2xl overflow-hidden">
          {item.image_url && !imageError ? (
            <Image
              src={item.image_url}
              alt={item.item_name}
              width={600}
              height={450}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info chips */}
        <div className="flex flex-wrap gap-2">
          {item.clothing_type && (
            <Badge variant="secondary" className="text-xs">{item.clothing_type}</Badge>
          )}
          {item.style && (
            <Badge variant="secondary" className="text-xs">{item.style}</Badge>
          )}
          {item.material && (
            <Badge variant="secondary" className="text-xs">{item.material}</Badge>
          )}
          {item.size_type && (
            <Badge variant="secondary" className="text-xs">{item.size_type}</Badge>
          )}
        </div>

        {/* Color */}
        {item.color && (
          <div className="flex items-center gap-2.5">
            {hex && (
              <div className="w-7 h-7 rounded-full border border-black/5 shadow-sm flex-shrink-0" style={{ backgroundColor: hex }} />
            )}
            <div>
              <span className="text-sm font-medium text-foreground">{colorLabel}</span>
              {item.shade && <span className="text-sm text-muted-foreground ml-1.5">({item.shade})</span>}
            </div>
          </div>
        )}

        {/* Description */}
        {item.description && (
          <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
        )}

        {/* Characteristics */}
        {(item.has_print || item.has_details) && (
          <div className="flex flex-wrap gap-2">
            {(item.has_print === true ||
              item.has_print === "true" ||
              (typeof item.has_print === "string" && item.has_print !== "нет")) && (
              <Badge variant="outline" className="text-xs">
                Принт: {typeof item.has_print === "boolean" ? "да" : item.has_print}
              </Badge>
            )}
            {(item.has_details === true ||
              item.has_details === "true" ||
              (typeof item.has_details === "string" && item.has_details !== "нет")) && (
              <Badge variant="outline" className="text-xs">
                Детали: {typeof item.has_details === "boolean" ? "да" : item.has_details}
              </Badge>
            )}
          </div>
        )}

        {/* Notes */}
        {item.notes && (
          <div className="bg-secondary/50 rounded-xl p-3">
            <p className="text-sm text-foreground/70">{item.notes}</p>
          </div>
        )}

        {/* Shop link */}
        {item.url && (
          <Button asChild variant="outline" className="w-full rounded-2xl h-11">
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              В магазин
            </a>
          </Button>
        )}
      </div>
    </CommonSheet>
  )
}
