"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Heart, Share, Bookmark, Sparkles } from "lucide-react"
import { AIAssistantLoader } from "@/components/ai-assistant-loader"

const inspirationPosts = [
  {
    id: 1,
    image: "/placeholder.svg?height=400&width=300",
    title: "Минималистичный офисный стиль",
    tags: ["офис", "минимализм", "классика"],
    likes: 124,
    isLiked: false,
    isSaved: false,
  },
  {
    id: 2,
    image: "/placeholder.svg?height=400&width=300",
    title: "Casual weekend look",
    tags: ["выходные", "комфорт", "casual"],
    likes: 89,
    isLiked: true,
    isSaved: false,
  },
  {
    id: 3,
    image: "/placeholder.svg?height=400&width=300",
    title: "Вечерний образ для свидания",
    tags: ["вечер", "романтика", "элегантность"],
    likes: 156,
    isLiked: false,
    isSaved: true,
  },
]

export default function InspirationPage() {
  const [posts, setPosts] = useState(inspirationPosts)
  const [isGenerating, setIsGenerating] = useState(false)

  const toggleLike = (id: number) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === id
          ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 }
          : post,
      ),
    )
  }

  const toggleSave = (id: number) => {
    setPosts((prev) => prev.map((post) => (post.id === id ? { ...post, isSaved: !post.isSaved } : post)))
  }

  const generateNewIdeas = () => {
    setIsGenerating(true)
    setTimeout(() => {
      setIsGenerating(false)
    }, 3000)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-white px-6 py-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-bold text-gray-900">Идеи</h1>
            <p className="text-gray-600 text-sm">Вдохновение для ваших образов</p>
          </div>
          <Button onClick={generateNewIdeas} disabled={isGenerating} className="bg-gray-900 hover:bg-gray-800">
            <Sparkles className="w-4 h-4 mr-2" />
            {isGenerating ? "Генерация..." : "Новые идеи"}
          </Button>
        </div>
      </div>

      <div className="px-4 py-6">
        {/* AI Generation Status */}
        {isGenerating && (
          <Card className="mb-6 bg-gradient-to-r from-purple-50 to-pink-50 border-0">
            <CardContent className="p-6 text-center">
              <div className="flex justify-center mb-4">
                <div
                  className="relative"
                  style={{
                    background: "conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b, #10b981, #3b82f6)",
                    borderRadius: "50%",
                    padding: "4px",
                    animation: "spin 2s linear infinite",
                  }}
                >
                  <div className="bg-white rounded-full p-2">
                    <AIAssistantLoader size={40} />
                  </div>
                </div>
              </div>
              <h3 className="font-serif font-semibold text-gray-900 mb-2">ИИ создает новые идеи для вас</h3>
              <p className="text-gray-600 text-sm">Анализируем тренды и ваш стиль...</p>
            </CardContent>
          </Card>
        )}

        {/* Inspiration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post) => (
            <Card key={post.id} className="border-0 shadow-sm overflow-hidden">
              <div className="aspect-[3/4] bg-gray-100 relative">
                <img src={post.image || "/placeholder.svg"} alt={post.title} className="w-full h-full object-cover" />
                <div className="absolute top-3 right-3">
                  <Button
                    size="sm"
                    variant={post.isSaved ? "default" : "secondary"}
                    className="w-8 h-8 p-0 rounded-full"
                    onClick={() => toggleSave(post.id)}
                  >
                    <Bookmark className={`w-4 h-4 ${post.isSaved ? "fill-current" : ""}`} />
                  </Button>
                </div>
              </div>

              <CardContent className="p-4">
                <h3 className="font-serif font-semibold text-gray-900 mb-2">{post.title}</h3>

                <div className="flex flex-wrap gap-2 mb-3">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button size="sm" variant="ghost" className="p-0 h-auto" onClick={() => toggleLike(post.id)}>
                      <Heart
                        className={`w-5 h-5 mr-1 ${post.isLiked ? "fill-red-500 text-red-500" : "text-gray-500"}`}
                      />
                      <span className="text-sm text-gray-600">{post.likes}</span>
                    </Button>

                    <Button size="sm" variant="ghost" className="p-0 h-auto">
                      <Share className="w-5 h-5 text-gray-500" />
                    </Button>
                  </div>

                  <Button size="sm" variant="outline">
                    Повторить образ
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Load More */}
        <div className="text-center mt-8">
          <Button variant="outline" className="px-8 bg-transparent">
            Загрузить еще
          </Button>
        </div>
      </div>
    </div>
  )
}
