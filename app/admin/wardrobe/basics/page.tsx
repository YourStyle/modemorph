import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BasicItemsManager } from "@/components/basic-items-manager"
import { BasicMaterialsManager } from "@/components/basic-materials-manager"
import { CombinationsManager } from "@/components/combinations-manager"
import { Package, Palette, Shuffle } from "lucide-react"

export default function BasicsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Управление базовыми элементами</h1>
            <p className="text-gray-600 mt-2">
              Настройка базовых вещей, материалов и их сочетаний для вашего гардероба
            </p>
          </div>

          <Tabs defaultValue="items" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="items" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Базовые вещи
              </TabsTrigger>
              <TabsTrigger value="materials" className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Материалы
              </TabsTrigger>
              <TabsTrigger value="combinations" className="flex items-center gap-2">
                <Shuffle className="h-4 w-4" />
                Сочетания
              </TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="mt-6">
              <BasicItemsManager />
            </TabsContent>

            <TabsContent value="materials" className="mt-6">
              <BasicMaterialsManager />
            </TabsContent>

            <TabsContent value="combinations" className="mt-6">
              <CombinationsManager />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
