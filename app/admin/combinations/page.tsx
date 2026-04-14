import { CombinationsManager } from "@/components/combinations-manager"

export default function CombinationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Управление сочетаниями</h1>
        <p className="text-gray-500 mt-2">Создавайте и управляйте цветовыми сочетаниями для элементов гардероба</p>
      </div>

      <CombinationsManager />
    </div>
  )
}
