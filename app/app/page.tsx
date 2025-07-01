"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ImageUploadForm } from "@/components/image-upload-form"
import { Camera, Shirt, Palette, Sparkles } from "lucide-react"
import Link from "next/link"

export default function AppHomePage() {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Welcome to Your Wardrobe</h1>
          <p className="text-xl text-muted-foreground">
            Organize your clothes, create outfits, and discover your style
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Upload Photo Card */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Add New Item
              </CardTitle>
              <CardDescription>Upload a photo of your clothing item and let AI analyze it</CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full">
                    <Camera className="h-4 w-4 mr-2" />
                    Upload Photo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Item to Wardrobe</DialogTitle>
                    <DialogDescription>
                      Upload a photo of your clothing item and our AI will analyze it for you.
                    </DialogDescription>
                  </DialogHeader>
                  <ImageUploadForm onSuccess={() => setUploadDialogOpen(false)} />
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* My Wardrobe Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shirt className="h-5 w-5" />
                My Wardrobe
              </CardTitle>
              <CardDescription>Browse and manage all your clothing items</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full bg-transparent" variant="outline">
                <Link href="/app/wardrobe">
                  <Shirt className="h-4 w-4 mr-2" />
                  View Wardrobe
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Create Outfit Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Create Outfit
              </CardTitle>
              <CardDescription>Mix and match your items to create new outfits</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full bg-transparent" variant="outline" disabled>
                <Palette className="h-4 w-4 mr-2" />
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          {/* Style Suggestions Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Style Suggestions
              </CardTitle>
              <CardDescription>Get AI-powered outfit recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full bg-transparent" variant="outline" disabled>
                <Sparkles className="h-4 w-4 mr-2" />
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats Card */}
          <Card className="hover:shadow-lg transition-shadow md:col-span-2">
            <CardHeader>
              <CardTitle>Your Wardrobe Stats</CardTitle>
              <CardDescription>Overview of your clothing collection</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">0</div>
                  <div className="text-sm text-muted-foreground">Total Items</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">0</div>
                  <div className="text-sm text-muted-foreground">Outfits Created</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
