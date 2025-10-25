"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Shirt, FolderIcon as Hanger, Plus, TrendingUp, Package, Palette, Zap } from "lucide-react"
import Link from "next/link"

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Приветствие */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Добро пожаловать в админ панель!</h2>
            <p className="text-xl text-gray-600">Управляйте системой гардероба и базовыми элементами</p>
          </div>

          {/* Админ действия */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <Link href="/admin/wardrobe">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Shirt className="h-6 w-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-lg">Управление гардеробом</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">Управляйте элементами гардероба и добавляйте новые вещи</p>
                  <Button className="w-full">
                    <Shirt className="h-4 w-4 mr-2" />
                    Открыть гардероб
                  </Button>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <Link href="/admin/outfits">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Hanger className="h-6 w-6 text-green-600" />
                    </div>
                    <CardTitle className="text-lg">Управление образами</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">Просматривайте и управляйте всеми созданными образами</p>
                  <Button variant="outline" className="w-full">
                    <Hanger className="h-4 w-4 mr-2" />
                    Открыть образы
                  </Button>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <Link href="/admin/wardrobe/basics">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Package className="h-6 w-6 text-purple-600" />
                    </div>
                    <CardTitle className="text-lg">Базовые элементы</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">Управляйте базовыми элементами гардероба и материалами</p>
                  <Button variant="outline" className="w-full">
                    <Package className="h-4 w-4 mr-2" />
                    Базовые элементы
                  </Button>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <Link href="/admin/combinations">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Palette className="h-6 w-6 text-orange-600" />
                    </div>
                    <CardTitle className="text-lg">Сочетания</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">Управляйте цветовыми сочетаниями и комбинациями</p>
                  <Button variant="outline" className="w-full">
                    <Palette className="h-4 w-4 mr-2" />
                    Открыть сочетания
                  </Button>
                </CardContent>
              </Link>
            </Card>
          </div>

          {/* Статистика системы */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Статистика системы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Shirt className="h-5 w-5 text-blue-600" />
                    <span>Элементов гардероба</span>
                  </div>
                  <span className="font-semibold">-</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Hanger className="h-5 w-5 text-green-600" />
                    <span>Созданных образов</span>
                  </div>
                  <span className="font-semibold">-</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-purple-600" />
                    <span>Базовых элементов</span>
                  </div>
                  <span className="font-semibold">-</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Palette className="h-5 w-5 text-orange-600" />
                    <span>Цветовых сочетаний</span>
                  </div>
                  <span className="font-semibold">-</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-600" />
                  Быстрые действия
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3">
                  <Link href="/admin/wardrobe/add" className="block">
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg hover:from-blue-100 hover:to-blue-200 transition-all cursor-pointer border border-blue-200">
                      <div className="p-2 bg-blue-600 rounded-lg">
                        <Plus className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-blue-900">Добавить элемент</div>
                        <div className="text-sm text-blue-700">Новая вещь в гардероб</div>
                      </div>
                    </div>
                  </Link>

                  <Link href="/admin/wardrobe/basics" className="block">
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg hover:from-purple-100 hover:to-purple-200 transition-all cursor-pointer border border-purple-200">
                      <div className="p-2 bg-purple-600 rounded-lg">
                        <Package className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-purple-900">Базовые элементы</div>
                        <div className="text-sm text-purple-700">Управление основами</div>
                      </div>
                    </div>
                  </Link>

                  <Link href="/admin/combinations" className="block">
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg hover:from-orange-100 hover:to-orange-200 transition-all cursor-pointer border border-orange-200">
                      <div className="p-2 bg-orange-600 rounded-lg">
                        <Palette className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-orange-900">Создать сочетание</div>
                        <div className="text-sm text-orange-700">Новые комбинации</div>
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
