"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Shirt, FolderIcon as Hanger, Plus, TrendingUp, Package, Palette, Zap, Sparkles } from "lucide-react"
import Link from "next/link"

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Приветствие */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">Админ панель</h2>
            <p className="text-lg text-gray-500">Управление системой гардероба и базовыми элементами</p>
          </div>

          {/* Админ действия */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <Link href="/admin/wardrobe">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-[#EC9DE2]/15 to-[#89AEFF]/15 rounded-xl group-hover:from-[#EC9DE2]/25 group-hover:to-[#89AEFF]/25 transition-colors">
                      <Shirt className="h-5 w-5 text-[#B97DC6]" />
                    </div>
                    <CardTitle className="text-base">Гардероб</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">Элементы гардероба и новые вещи</p>
                  <Button className="w-full bg-gradient-to-r from-[#EC9DE2] to-[#89AEFF] hover:opacity-90 border-0 text-white rounded-xl" size="sm">
                    Открыть
                  </Button>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <Link href="/admin/outfits">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-purple-100 to-blue-50 rounded-xl group-hover:from-purple-200 group-hover:to-blue-100 transition-colors">
                      <Hanger className="h-5 w-5 text-purple-500" />
                    </div>
                    <CardTitle className="text-base">Образы</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">Просмотр и управление образами</p>
                  <Button variant="outline" className="w-full rounded-xl" size="sm">
                    Открыть
                  </Button>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <Link href="/admin/wardrobe/basics">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl group-hover:from-pink-100 group-hover:to-purple-100 transition-colors">
                      <Package className="h-5 w-5 text-pink-500" />
                    </div>
                    <CardTitle className="text-base">Базовые элементы</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">Основы гардероба и материалы</p>
                  <Button variant="outline" className="w-full rounded-xl" size="sm">
                    Открыть
                  </Button>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <Link href="/admin/combinations">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-amber-50 to-rose-50 rounded-xl group-hover:from-amber-100 group-hover:to-rose-100 transition-colors">
                      <Palette className="h-5 w-5 text-amber-500" />
                    </div>
                    <CardTitle className="text-base">Сочетания</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">Цветовые сочетания и комбинации</p>
                  <Button variant="outline" className="w-full rounded-xl" size="sm">
                    Открыть
                  </Button>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <Link href="/admin/outfit-scoring">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl group-hover:from-purple-100 group-hover:to-blue-100 transition-colors">
                      <Sparkles className="h-5 w-5 text-purple-500" />
                    </div>
                    <CardTitle className="text-base">ML-оценка образов</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">OutfitTransformer · smoke-тест сочетаемости</p>
                  <Button variant="outline" className="w-full rounded-xl" size="sm">
                    Открыть
                  </Button>
                </CardContent>
              </Link>
            </Card>
          </div>

          {/* Статистика системы */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-[#B97DC6]" />
                  Статистика системы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-[#EC9DE2]/5 to-transparent rounded-xl">
                  <div className="flex items-center gap-3">
                    <Shirt className="h-5 w-5 text-[#B97DC6]" />
                    <span className="text-sm text-gray-700">Элементов гардероба</span>
                  </div>
                  <span className="font-semibold text-gray-900">-</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50/50 to-transparent rounded-xl">
                  <div className="flex items-center gap-3">
                    <Hanger className="h-5 w-5 text-purple-500" />
                    <span className="text-sm text-gray-700">Созданных образов</span>
                  </div>
                  <span className="font-semibold text-gray-900">-</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-pink-50/50 to-transparent rounded-xl">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-pink-500" />
                    <span className="text-sm text-gray-700">Базовых элементов</span>
                  </div>
                  <span className="font-semibold text-gray-900">-</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50/50 to-transparent rounded-xl">
                  <div className="flex items-center gap-3">
                    <Palette className="h-5 w-5 text-amber-500" />
                    <span className="text-sm text-gray-700">Цветовых сочетаний</span>
                  </div>
                  <span className="font-semibold text-gray-900">-</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Быстрые действия
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3">
                  <Link href="/admin/wardrobe/add" className="block">
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#EC9DE2]/10 to-[#89AEFF]/10 rounded-xl hover:from-[#EC9DE2]/20 hover:to-[#89AEFF]/20 transition-all cursor-pointer border border-[#EC9DE2]/20">
                      <div className="p-2 bg-gradient-to-br from-[#EC9DE2] to-[#89AEFF] rounded-xl">
                        <Plus className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Добавить элемент</div>
                        <div className="text-sm text-gray-500">Новая вещь в гардероб</div>
                      </div>
                    </div>
                  </Link>

                  <Link href="/admin/wardrobe/basics" className="block">
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl hover:from-purple-100 hover:to-pink-100 transition-all cursor-pointer border border-purple-100">
                      <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                        <Package className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Базовые элементы</div>
                        <div className="text-sm text-gray-500">Управление основами</div>
                      </div>
                    </div>
                  </Link>

                  <Link href="/admin/combinations" className="block">
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-amber-50 to-rose-50 rounded-xl hover:from-amber-100 hover:to-rose-100 transition-all cursor-pointer border border-amber-100">
                      <div className="p-2 bg-gradient-to-br from-amber-500 to-rose-500 rounded-xl">
                        <Palette className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">Создать сочетание</div>
                        <div className="text-sm text-gray-500">Новые комбинации</div>
                      </div>
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
