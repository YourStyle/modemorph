import { SqlExecutor } from "@/components/sql-executor"

export default function SqlPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">SQL Executor</h1>
          <p className="text-gray-600 mt-2">Инструменты для выполнения SQL скриптов и исправления схемы базы данных</p>
        </div>
        <SqlExecutor />
      </div>
    </div>
  )
}
