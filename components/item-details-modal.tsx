"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  temp_min?: number | null
  temp_max?: number | null
  shop_url?: string | null
}

interface ItemDetailsModalProps {
  item: WardrobeItem
  isOpen: boolean
  onClose: () => void
  onRefresh?: () => void
  isAdmin?: boolean
}

export function ItemDetailsModal({ item, isOpen, onClose, isAdmin = false }: ItemDetailsModalProps) {
  const [imageError, setImageError] = useState(false)

  const hex = item.color ? colorToHex(item.color) : null
  const colorLabel = item.color ? colorDisplayName(item.color) : null

  const body = (
    <div className="space-y-5 pb-2">
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
        {isAdmin && item.gender && (
          <Badge variant="secondary" className="text-xs">{item.gender}</Badge>
        )}
        {isAdmin && item.is_basic && (
          <Badge variant="default" className="text-xs">Basic</Badge>
        )}
        {isAdmin && item.is_hidden && (
          <Badge variant="destructive" className="text-xs">Скрыто</Badge>
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
      {isAdmin && item.description_en && (
        <p className="text-sm text-foreground/60 leading-relaxed italic">{item.description_en}</p>
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

      {/* Admin-only metadata */}
      {isAdmin && (
        <div className="border-t pt-4 space-y-2 text-xs text-muted-foreground font-mono">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span>ID:</span><span>{item.id}</span>
            {item.item_name_en && (<><span>EN name:</span><span>{item.item_name_en}</span></>)}
            {item.basic_item_id != null && (<><span>Basic ID:</span><span>{item.basic_item_id}</span></>)}
            {item.basic_material_id != null && (<><span>Material ID:</span><span>{item.basic_material_id}</span></>)}
            {item.user_id && (<><span>User:</span><span className="truncate">{item.user_id}</span></>)}
            {(item.temp_min != null || item.temp_max != null) && (
              <><span>Temp:</span><span>{item.temp_min ?? "?"}°…{item.temp_max ?? "?"}°</span></>
            )}
            <span>Created:</span><span>{new Date(item.created_at).toLocaleString("ru-RU")}</span>
            <span>Updated:</span><span>{new Date(item.updated_at).toLocaleString("ru-RU")}</span>
          </div>
        </div>
      )}

      {/* Shop link */}
      {(item.url || item.shop_url) && (
        <Button asChild variant="outline" className="w-full rounded-2xl h-11">
          <a href={item.url || item.shop_url || "#"} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            В магазин
          </a>
        </Button>
      )}
    </div>
  )

  if (isAdmin) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-8">{item.item_name}</DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <CommonSheet
      isOpen={isOpen}
      onClose={onClose}
      title={item.item_name}
      backgroundColor="white"
      swipeAction="close"
    >
      <div className="pb-6">{body}</div>
    </CommonSheet>
  )
}
