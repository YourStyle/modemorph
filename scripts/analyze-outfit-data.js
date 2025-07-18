// Анализ данных из CSV файлов
async function analyzeOutfitData() {
  try {
    console.log("🔍 Загружаем данные из CSV файлов...")

    // Загружаем данные об образах
    const outfitsResponse = await fetch(
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/outfits_rows-UapYlJsK9gunLj8blzA1Ev78eslynO.csv",
    )
    const outfitsText = await outfitsResponse.text()

    // Загружаем данные о вещах в образах
    const outfitItemsResponse = await fetch(
      "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/outfit_items_rows-0lOA3PiClZd0eCOE2i8NjDcIdRTUG6.csv",
    )
    const outfitItemsText = await outfitItemsResponse.text()

    console.log("📊 Данные об образах:")
    console.log(outfitsText)

    console.log("\n📦 Данные о вещах в образах:")
    console.log(outfitItemsText)

    // Парсим CSV данные
    const parseCSV = (text) => {
      const lines = text.trim().split("\n")
      const headers = lines[0].split(",")
      return lines.slice(1).map((line) => {
        const values = line.split(",")
        const obj = {}
        headers.forEach((header, index) => {
          obj[header] = values[index]
        })
        return obj
      })
    }

    const outfits = parseCSV(outfitsText)
    const outfitItems = parseCSV(outfitItemsText)

    console.log("\n✅ Распарсенные образы:", outfits)
    console.log("✅ Распарсенные вещи в образах:", outfitItems)

    // Анализируем структуру данных
    console.log("\n🔍 Анализ данных:")
    console.log("Количество образов:", outfits.length)
    console.log("Количество связей образ-вещь:", outfitItems.length)

    if (outfits.length > 0) {
      console.log("Первый образ:", outfits[0])
    }

    if (outfitItems.length > 0) {
      console.log("Первая связь образ-вещь:", outfitItems[0])
    }

    // Проверяем связи
    outfits.forEach((outfit) => {
      const relatedItems = outfitItems.filter((item) => item.outfit_id === outfit.id)
      console.log(
        `Образ ${outfit.id} (${outfit.name}) имеет ${relatedItems.length} вещей:`,
        relatedItems.map((item) => `wardrobe_item_id: ${item.wardrobe_item_id}`),
      )
    })
  } catch (error) {
    console.error("❌ Ошибка при анализе данных:", error)
  }
}

// Запускаем анализ
analyzeOutfitData()
