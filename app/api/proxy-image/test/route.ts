import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const testResults = []

  // Тестовые URL изображений из вашего blob storage
  const testImages = [
    "https://bgkosez9szawb1ks.public.blob.vercel-storage.com/test-image-1.jpg",
    "https://bgkosez9szawb1ks.public.blob.vercel-storage.com/test-image-2.png",
    "https://qkoy1wcphb97gms9.public.blob.vercel-storage.com/old-image.jpg", // старое хранилище
  ]

  for (const imageUrl of testImages) {
    const testResult = {
      originalUrl: imageUrl,
      directAccess: { success: false, error: "", responseTime: 0 },
      proxyAccess: { success: false, error: "", responseTime: 0 },
    }

    // Тест прямого доступа
    try {
      const startTime = Date.now()
      const directResponse = await fetch(imageUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      })
      testResult.directAccess.responseTime = Date.now() - startTime
      testResult.directAccess.success = directResponse.ok
      if (!directResponse.ok) {
        testResult.directAccess.error = `${directResponse.status} ${directResponse.statusText}`
      }
    } catch (error) {
      testResult.directAccess.error = error instanceof Error ? error.message : "Unknown error"
    }

    // Тест доступа через прокси
    try {
      const startTime = Date.now()
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
      const proxyResponse = await fetch(new URL(proxyUrl, request.url).toString(), {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      })
      testResult.proxyAccess.responseTime = Date.now() - startTime
      testResult.proxyAccess.success = proxyResponse.ok
      if (!proxyResponse.ok) {
        testResult.proxyAccess.error = `${proxyResponse.status} ${proxyResponse.statusText}`
      }
    } catch (error) {
      testResult.proxyAccess.error = error instanceof Error ? error.message : "Unknown error"
    }

    testResults.push(testResult)
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    testResults,
    summary: {
      totalTests: testResults.length,
      directSuccessRate: testResults.filter((r) => r.directAccess.success).length / testResults.length,
      proxySuccessRate: testResults.filter((r) => r.proxyAccess.success).length / testResults.length,
      averageDirectResponseTime:
        testResults.reduce((sum, r) => sum + r.directAccess.responseTime, 0) / testResults.length,
      averageProxyResponseTime:
        testResults.reduce((sum, r) => sum + r.proxyAccess.responseTime, 0) / testResults.length,
    },
  })
}
