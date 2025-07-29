import { YandexS3Test } from "@/components/yandex-s3-test"

export default function YandexS3TestPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Тестирование Yandex Cloud Object Storage</h1>
          <p className="text-gray-600 mt-2">Проверка загрузки, получения списка и удаления файлов из Yandex S3</p>
        </div>
        <YandexS3Test />
      </div>
    </div>
  )
}
