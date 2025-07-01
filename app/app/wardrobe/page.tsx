"use client"

import { UserWardrobeGrid } from "@/components/user-wardrobe-grid"

export default function UserWardrobePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Wardrobe</h1>
          <p className="text-muted-foreground">
            All your clothing items in one place. Upload new items or browse your collection.
          </p>
        </div>

        <UserWardrobeGrid />
      </div>
    </div>
  )
}
