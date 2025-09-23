"use client"

import type React from "react"
import {useState, useEffect, useRef} from "react"
import {Button} from "@/components/ui/button"
import {Card, CardContent} from "@/components/ui/card"
import {Badge} from "@/components/ui/badge"
import {Upload, X, Loader2, Check, Plus, AlertCircle} from "lucide-react"
import {AIAssistantLoader} from "@/components/ai-assistant-loader"
import Image from "next/image"
import {createClient} from "@/lib/supabase/client"
import {PhotoRegenerationModal} from "./photo-regeneration-modal"
import { api } from "@/lib/api-client"
import FallingObjectsGame from "@/components/falling-objects-game"
import QuoteCard from "@/components/quote-card"

interface ResponseItem {
    index: number
    basic_item_id: number | null
    need_gen: boolean
    clothing_item: string
    description: string
    item_name: string
    material: string
    style: string
    has_print: string
    color: string
    shade: string
    has_details: string
    img_url?: string
    image_url?: string
}

interface RejectedPhoto {
    acceptable: false
    reason: string
    headers?: any
    params?: any
    query?: any
    body?: any
    webhookUrl?: string
    executionMode?: string
}

interface ItemWithImage extends ResponseItem {
    finalImageUrl?: string
    isAdding?: boolean
    isAdded?: boolean
}

interface UploadedPhoto {
    file: File
    preview: string
    id: string
}

interface PhotoAnalysisResult {
    success: boolean
    items: ItemWithImage[]
    error?: string
    rejectionReason?: string
    fileName: string
}

interface PhotoAnalysisFormProps {
    initialPhotos?: UploadedPhoto[]
    onSuccess?: (payload?: {
        items: ItemWithImage[]
        photos: UploadedPhoto[]
        analysisResults: PhotoAnalysisResult[]
    }) => void
    onReset?: () => void
}

type ViewMode = "choose" | "quotes" | "game" | null

function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array]
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

const GameShell: React.FC<React.PropsWithChildren<{ height: number }>> = ({children, height}) => (
    <div
        className="w-full rounded-xl border border-white/10 bg-white/5 flex items-center justify-center"
        style={{height: `${height}px`}}
    >
        {children}
    </div>
)

const ProgressBlock: React.FC<{ progress: number; progressText: string }> = ({progress, progressText}) => (
    <div className="w-full max-w-sm mx-auto mt-4">
        <div className="relative h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-[width] duration-200"
                style={{width: `${progress}%`}}
            />
        </div>
        <div className="flex justify-between text-xs mt-2 text-neutral-400">
            <span>{progressText}</span>
            <span>{Math.round(progress)}%</span>
        </div>
    </div>
)



type LoadingExperienceProps = {
    viewMode: ViewMode
    setViewMode: (m: ViewMode) => void
    gameHeight: number
    quotes: { text: string; author: string }[]
    quoteIndex: number
    progress: number
    progressText: string
}

const LoadingExperience: React.FC<LoadingExperienceProps> = ({
                                                                 viewMode,
                                                                 setViewMode,
                                                                 gameHeight,
                                                                 quotes,
                                                                 quoteIndex,
                                                                 progress,
                                                                 progressText,
                                                             }) => {
    const pickGame = () => setViewMode("game")
    const pickQuotes = () => setViewMode("quotes")

    useEffect(() => {
      console.log("LoadingExperience MOUNT")
      return () => console.log("LoadingExperience UNMOUNT")
    }, [])

    if (viewMode === null || viewMode === "choose") {
        return (
            <>
                <GameShell height={gameHeight}>
                    <div className="w-full px-4 sm:px-6 max-w-2xl mx-auto text-center select-none"
                         style={{touchAction: "manipulation"}}>
                        <p className="text-sm text-neutral-300 mb-3">Пока ИИ работает, выберите, что показать:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button className="h-11 rounded-xl bg-primary text-white px-4"
                                    onPointerUp={pickGame}>Сыграть в игру
                            </button>
                            <button className="h-11 rounded-xl border px-4" onPointerUp={pickQuotes}>Посмотреть цитаты
                            </button>
                        </div>
                    </div>
                </GameShell>
                <ProgressBlock progress={progress} progressText={progressText}/>
            </>
        )
    }

    if (viewMode === "quotes") {
        return (
            <>
                <GameShell height={gameHeight}>
                    <div className="text-center max-w-md w-full">
                        <h2 className="text-lg font-semibold mb-2">ИИ анализирует ваши фото</h2>
                        <QuoteCard className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center shadow mx-4">
                            <p className="italic text-black">"{quotes[quoteIndex].text}"</p>
                            <p className="mt-2 font-medium text-black">— {quotes[quoteIndex].author}</p>
                        </QuoteCard>
                        <p className="mt-3 text-xs text-neutral-400">Можно переключиться на игру в любой момент</p>
                        <div className="mt-3">
                            <button className="border rounded px-3 py-1" onPointerUp={pickGame}>Переключиться на игру
                            </button>
                        </div>
                    </div>
                </GameShell>
                <ProgressBlock progress={progress} progressText={progressText}/>
            </>
        )
    }

    // game
    return (
        <>
            <GameShell height={gameHeight}>
                <FallingObjectsGame
                    analysisDone={progress >= 100}
                    onRequestFinish={() => setViewMode(null)}
                    onRequestReturnToPicker={() => setViewMode("choose")}
                />
            </GameShell>
            <ProgressBlock progress={progress} progressText={progressText}/>
        </>
    )
}


export function PhotoAnalysisForm({initialPhotos = [], onSuccess, onReset}: PhotoAnalysisFormProps) {

    const [selectedFiles, setSelectedFiles] = useState<UploadedPhoto[]>([])

    const [loading, setLoading] = useState(false)

    const [progress, setProgress] = useState(0)

    const [progressText, setProgressText] = useState("")

    const [results, setResults] = useState<ItemWithImage[]>([])

    const [analysisResults, setAnalysisResults] = useState<PhotoAnalysisResult[]>([])

    const [error, setError] = useState<string | null>(null)

    const [hasAnalyzed, setHasAnalyzed] = useState(false)

    const [needsReanalysis, setNeedsReanalysis] = useState(false)

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const [showRegenerationModal, setShowRegenerationModal] = useState(false)
    const [isFirstTimeRegeneration, setIsFirstTimeRegeneration] = useState(true)
    const [viewMode, setViewMode] = useState<ViewMode>(null)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const GAME_AREA_HEIGHT = 300
    // Allow up to two minutes for the AI analysis with a safety buffer
    const MAX_ANALYSIS_DURATION_MS = 2 * 60 * 1000
    const ANALYSIS_TIMEOUT_BUFFER_MS = 30_000
    // Requests may take close to two minutes, add a buffer so we don't abort right before completion
    const ANALYSIS_REQUEST_TIMEOUT_MS = MAX_ANALYSIS_DURATION_MS + ANALYSIS_TIMEOUT_BUFFER_MS

    // Quotes shown above the progress bar while analysis runs
    const quotes = [
        {text: "Мода проходит, стиль остаётся", author: "Коко Шанель"},
        {text: "Мода проходит, стиль вечен", author: "Ив Сен-Лоран"},
        {text: "Элегантность — это не быть замеченным, а быть запомненным", author: "Джорджио Армани"},
        {
            text: "То, что вы носите, — это то, как вы представляете себя миру… Мода — мгновенный язык",
            author: "Миучча Прада"
        },
        {
            text: "Не гонитесь за трендами. Не позволяйте моде владеть вами, решайте сами, кто вы и что хотите выразить своим обликом",
            author: "Джанни Версаче"
        },
        {text: "Счастье — секрет любой красоты. Нет красоты привлекательной без счастья", author: "Кристиан Диор"},
        {
            text: "Стиль — очень личное. Он не связан с модой. Мода быстро проходит. Стиль — навсегда",
            author: "Ральф Лорен"
        },
        {text: "Хорошо одеваться — это форма хороших манер", author: "Том Форд"},
        {text: "Стиль — это способ сказать, кто вы, не произнося ни слова", author: "Рейчел Зои"},
    ]
    const [shuffledQuotes, setShuffledQuotes] = useState(() => shuffleArray(quotes))
    const [quoteIndex, setQuoteIndex] = useState(0)
    // Interval refs for rotating quotes and smooth progress updates
    const quoteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)


    const pickQuotes = () => {
        if (isTransitioning) return
        setIsTransitioning(true)
        setViewMode("quotes")
        setTimeout(() => setIsTransitioning(false), 200)
    }

    const pickGame = () => {
        if (isTransitioning) return
        setIsTransitioning(true)
        setViewMode("game")
        setTimeout(() => setIsTransitioning(false), 200)
    }

    useEffect(() => {
        if (loading && viewMode === null) {
            setViewMode("choose")
        }
    }, [loading, viewMode])

    useEffect(() => {
        if (initialPhotos && initialPhotos.length > 0 && !hasAnalyzed) {
            const limitedPhotos = initialPhotos.slice(0, 2)
            setSelectedFiles(limitedPhotos)
            handleAnalyze(limitedPhotos)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPhotos])

    // Rotate quotes every 10 seconds while loading, in random order
    useEffect(() => {
        if (loading) {
            const newOrder = shuffleArray(quotes)
            setShuffledQuotes(newOrder)
            setQuoteIndex(0)
            quoteTimerRef.current = setInterval(() => {
                setQuoteIndex((prev) => (prev + 1) % newOrder.length)
            }, 10000)
        } else {
            if (quoteTimerRef.current) {
                clearInterval(quoteTimerRef.current)
                quoteTimerRef.current = null
            }
            setQuoteIndex(0)
        }
        return () => {
            if (quoteTimerRef.current) {
                clearInterval(quoteTimerRef.current)
                quoteTimerRef.current = null
            }
        }
    }, [loading])

    // Clean up progress timer on component unmount
    useEffect(() => {
        return () => {
            if (progressTimerRef.current) {
                clearInterval(progressTimerRef.current)
                progressTimerRef.current = null
            }
        }
    }, [])

    // Handler for selecting files from the hidden input
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || [])
        if (files.length === 0) return
        // Limit to 2 files total
        const remainingSlots = 2 - selectedFiles.length
        const filesToAdd = files.slice(0, remainingSlots)
        if (filesToAdd.length === 0) {
            setError("Максимум 2 фото для анализа")
            return
        }
        const newPhotos: UploadedPhoto[] = filesToAdd.map((file) => ({
            file,
            preview: URL.createObjectURL(file),
            id: Math.random().toString(36).substr(2, 9),
        }))
        setSelectedFiles((prev) => [...prev, ...newPhotos])
        if (results.length > 0) {
            setNeedsReanalysis(true)
        }
        setError(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    // Remove an uploaded photo
    const removePhoto = (id: string) => {
        setSelectedFiles((prev) => {
            const toRemove = prev.find((p) => p.id === id)
            if (toRemove) {
                URL.revokeObjectURL(toRemove.preview)
            }
            const remaining = prev.filter((p) => p.id !== id)
            if (remaining.length === 0) {
                setResults([])
                setAnalysisResults([])
                setHasAnalyzed(false)
                setNeedsReanalysis(false)
                setError(null)
                setLoading(false)
                setProgress(0)
                setProgressText("")
            } else if (results.length > 0) {
                setNeedsReanalysis(true)
            }
            return remaining
        })
    }

    // Download an image from a URL and re-upload it to our storage
    const downloadAndUploadImage = async (imageUrl: string): Promise<string> => {
        try {
            const response = await fetch(imageUrl)
            if (!response.ok) {
                throw new Error("Failed to download image")
            }
            const blob = await response.blob()
            const file = new File([blob], "image.jpg", {type: blob.type})
            const formData = new FormData()
            formData.append("file", file)
            const uploadResult = await api.post("/api/upload-image", formData, {
                headers: {} // Убираем Content-Type для FormData
            })
            if (!uploadResult) {
                throw new Error("Failed to upload image")
            }
            const {url} = uploadResult
            return url
        } catch (error) {
            console.error("Error downloading and uploading image:", error)
            throw error
        }
    }

    // Load images for each item returned by the AI
    const loadBasicItemImages = async (items: ResponseItem[]): Promise<ItemWithImage[]> => {
        const jobs = items.map(async (item) => {
            let finalImageUrl = item.image_url || item.img_url
            try {
                if (item.img_url && !item.image_url) {
                    finalImageUrl = await downloadAndUploadImage(item.img_url)
                } else if (item.basic_item_id && !finalImageUrl) {
                    const basicItem = await api.get(`/api/basic-items/${item.basic_item_id}`)
                    finalImageUrl = basicItem.image_url
                }
            } catch (e) {
                console.error("Error loading image for item:", item.item_name, e)
            }
            return {...item, finalImageUrl}
        })
        const settled = await Promise.allSettled(jobs)
        return settled.map((s, i) =>
            s.status === "fulfilled" ? s.value : {...items[i], finalImageUrl: items[i].image_url || items[i].img_url},
        )
    }

    // Retrieve the current user's auth token from Supabase
    const getAuthToken = async () => {
        const supabase = createClient()
        const {
            data: {session},
        } = await supabase.auth.getSession()
        return session?.access_token
    }

    // Send a single photo to the AI for analysis
    const analyzePhoto = async (file: File): Promise<PhotoAnalysisResult> => {
        const formData = new FormData()
        formData.append("image", file)
        const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"
        const controller = new AbortController()
        // Allow requests to run for a little longer than two minutes before aborting
        const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_REQUEST_TIMEOUT_MS)
        try {
            const authToken = await getAuthToken()
            const response = await fetch(`${aiApiUrl}/ai-photo-parse`, {
                method: "POST",
                body: formData,
                signal: controller.signal,
                headers: {
                    Accept: "application/json",
                    ...(authToken && {Authorization: `Bearer ${authToken}`}),
                },
            })
            clearTimeout(timeoutId)
            if (!response.ok) {
                const errorText = await response.text()
                console.error("AI API Error Response:", errorText)
                return {
                    success: false,
                    items: [],
                    error: `Ошибка анализа: ${response.status} ${response.statusText}`,
                    fileName: file.name,
                }
            }
            const data = await response.json()
            // Handle rejection format
            if (Array.isArray(data) && data.length > 0 && data[0].acceptable === false) {
                const rejected = data[0] as RejectedPhoto
                return {
                    success: false,
                    items: [],
                    rejectionReason: rejected.reason,
                    fileName: file.name,
                }
            }
            // Handle items format
            if (Array.isArray(data) && data.length > 0 && data[0].item_name) {
                const itemsWithImages = await loadBasicItemImages(data as ResponseItem[])
                return {
                    success: true,
                    items: itemsWithImages,
                    fileName: file.name,
                }
            }
            // Unknown format
            return {
                success: false,
                items: [],
                error: "Не удалось найти вещи на изображении",
                fileName: file.name,
            }
        } catch (error: any) {
            clearTimeout(timeoutId)
            if (error.name === "AbortError") {
                return {
                    success: false,
                    items: [],
                    error: "Превышено время ожидания анализа изображения",
                    fileName: file.name,
                }
            }
            console.error("AI Analysis Error:", error)
            return {
                success: false,
                items: [],
                error: `Ошибка анализа: ${error.message}`,
                fileName: file.name,
            }
        }
    }

    // Main handler that analyzes all selected photos
    const handleAnalyze = async (photosToAnalyze?: UploadedPhoto[]) => {
        const photos = photosToAnalyze || selectedFiles
        if (photos.length === 0) return
        setLoading(true)
        setError(null)
        setHasAnalyzed(true)
        setNeedsReanalysis(false)
        setResults([])
        setAnalysisResults([])
        setProgress(10)
        setProgressText(`Анализируем ${photos.length} фото `)
        try {
            const total = photos.length
            // Track completed photos
            let done = 0
            // Smooth progress timer: stretch to match the longer processing window
            const duration = total === 1 ? MAX_ANALYSIS_DURATION_MS : ANALYSIS_REQUEST_TIMEOUT_MS
            const startTime = Date.now()
            if (progressTimerRef.current) {
                clearInterval(progressTimerRef.current)
                progressTimerRef.current = null
            }
            progressTimerRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime
                const fraction = Math.min(elapsed / duration, 1)
                const eased = 1 - Math.pow(1 - fraction, 2)
                const target = 10 + eased * 75
                setProgress((prev) => (target > prev ? target : prev))
                if (elapsed >= duration && progressTimerRef.current) {
                    clearInterval(progressTimerRef.current)
                    progressTimerRef.current = null
                }
            }, 200)
            // Analyze all photos in parallel
            const tasks = photos.map(({file}) =>
                analyzePhoto(file).finally(() => {
                    done += 1
                    // Ensure progress never decreases and caps at 85 using easing
                    setProgress((prev) => {
                        const completed = done / total
                        const easedCompleted = 1 - Math.pow(1 - completed, 2)
                        const tentative = 10 + easedCompleted * 75
                        const clamped = Math.min(tentative, 85)
                        return clamped > prev ? clamped : prev
                    })
                    setProgressText(`Готово ${done} из ${total}`)
                }),
            )
            const settled = await Promise.allSettled(tasks)
            const analysisResults: PhotoAnalysisResult[] = settled.map((s, idx) =>
                s.status === "fulfilled"
                    ? (s.value as PhotoAnalysisResult)
                    : {
                        success: false,
                        items: [],
                        error: "Ошибка анализа",
                        fileName: photos[idx].file.name,
                    },
            )
            // Stop timer and finish progress
            if (progressTimerRef.current) {
                clearInterval(progressTimerRef.current)
                progressTimerRef.current = null
            }
            setProgress(90)
            setProgressText("Собираем результаты...")
            const allSuccessfulItems = analysisResults.flatMap((r) => (r.success ? r.items : []))
            const failedAnalyses = analysisResults.filter((r) => !r.success)
            setResults(allSuccessfulItems)
            setAnalysisResults(analysisResults)
            if (allSuccessfulItems.length > 0) {
                try {
                    onSuccess?.({items: allSuccessfulItems, photos, analysisResults})
                } catch {
                    /* noop */
                }
            }
            if (allSuccessfulItems.length === 0 && failedAnalyses.length > 0) {
                setError("Не удалось проанализировать ни одно изображение")
            }
            setProgress(100)
            setProgressText("Готово!")
            setTimeout(() => {
                setLoading(false)
                setProgress(0)
                setProgressText("")
            }, 800)
        } catch (err) {
            console.error("Analysis error:", err)
            setError("Произошла ошибка при анализе фото")
            setLoading(false)
            if (progressTimerRef.current) {
                clearInterval(progressTimerRef.current)
                progressTimerRef.current = null
            }
            setProgress(0)
            setProgressText("")
        }
    }

    // Save a single item to the user's wardrobe
    const handleSaveItem = async (item: ItemWithImage, index: number) => {
        try {
            setResults((prev) => prev.map((r, i) => (i === index ? {...r, isAdding: true} : r)))
            const itemData = {
                item_name: item.item_name,
                material: item.material,
                color: item.color,
                style: item.style,
                has_print: item.has_print === "yes" ? "есть" : "нет",
                shade: item.shade,
                has_details: item.has_details,
                image_url: item.finalImageUrl,
                basic_item_id: item.basic_item_id,
            }
            await api.post("/api/wardrobe-user-items", {itemData})
            setResults((prev) => prev.map((r, i) => (i === index ? {...r, isAdding: false, isAdded: true} : r)))
        } catch (error) {
            console.error("Error saving item:", error)
            setResults((prev) => prev.map((r, i) => (i === index ? {...r, isAdding: false} : r)))
        }
    }

    // Clear all state and start over
    const handleClear = () => {
        selectedFiles.forEach((photo) => {
            URL.revokeObjectURL(photo.preview)
        })
        setSelectedFiles([])
        setResults([])
        setAnalysisResults([])
        setError(null)
        setHasAnalyzed(false)
        setLoading(false)
        setNeedsReanalysis(false)
        setProgress(0)
        setProgressText("")
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
        onReset?.()
    }

    // Regenerate an image through the AI service
    const handleRegenerate = async (file: File) => {
        const formData = new FormData()
        formData.append("image", file)
        const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "https://modemorph.up.railway.app/webhook"
        const authToken = await getAuthToken()
        const response = await fetch(`${aiApiUrl}/regenerate`, {
            method: "POST",
            body: formData,
            headers: {
                Accept: "application/json",
                ...(authToken && {Authorization: `Bearer ${authToken}`}),
            },
        })
        if (!response.ok) {
            throw new Error("Regeneration failed")
        }
        const blob = await response.blob()
        const imageUrl = URL.createObjectURL(blob)
        return {
            imageUrl,
            item_name: "Улучшенная вещь",
            description: "Описание после улучшения",
            material: "Материал",
            color: "Цвет",
            style: "Стиль",
        }
    }

    const openRegenerationModal = () => {
        setShowRegenerationModal(true)
        const hasUsed = localStorage.getItem("hasUsedRegeneration")
        setIsFirstTimeRegeneration(!hasUsed)
    }
    const closeRegenerationModal = () => {
        setShowRegenerationModal(false)
        localStorage.setItem("hasUsedRegeneration", "true")
    }


    return (
        <div className="space-y-6">
            {/* Header with clear button */}
            {(hasAnalyzed || selectedFiles.length > 0) && !loading && (
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">
                        {selectedFiles.length > 0 ? "Анализ фото" : "Результаты анализа"}
                    </h2>
                    <Button variant="default" size="sm" onClick={handleClear}>Очистить</Button>
                </div>
            )}
            {/* Photos section */}
            {selectedFiles.length > 0 && !loading && (
                <div className="space-y-4">
                    <p className="font-medium">Загруженные фото ({selectedFiles.length})</p>
                    <div className="grid grid-cols-2 gap-4">
                        {selectedFiles.map((photo) => (
                            <div key={photo.id} className="relative border rounded-md">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={photo.preview}
                                    alt="Предпросмотр"
                                    className="w-full h-40 object-cover"
                                    onError={() => {
                                        console.error("Image load error")
                                        removePhoto(photo.id)
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => removePhoto(photo.id)}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                                >
                                    <X className="w-3 h-3"/>
                                </button>
                            </div>
                        ))}
                    </div>
                    {selectedFiles.length < 2 && (
                        <Button
                            type="button"
                            variant="default"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Plus className="w-4 h-4 mr-2"/> Добавить еще
                        </Button>
                    )}
                    {(!hasAnalyzed || needsReanalysis) && selectedFiles.length > 0 && (
                        <Button type="button" onClick={() => handleAnalyze()} disabled={loading} className="w-full"
                                size="sm">
                            {loading ? "Анализируем..." : `Найти вещи на ${selectedFiles.length} ${selectedFiles.length === 1 ? "фото" : "фото"}`}
                        </Button>
                    )}
                    {error && (
                        <div className="text-red-600 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4"/> {error}
                        </div>
                    )}
                </div>
            )}
            {/* Upload section */}
            {selectedFiles.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center space-y-4 p-8 border rounded-md">
                    <Upload className="w-8 h-8 text-gray-500"/>
                    <p className="font-medium">Загрузить фото одежды</p>
                    <p className="text-sm text-gray-500">Максимум 2 фото для анализа</p>
                    <Button type="button" variant="default" onClick={() => fileInputRef.current?.click()}>
                        <Plus className="w-4 h-4 mr-2"/> Нажмите для выбора фото
                    </Button>
                    <p className="text-xs text-gray-400">HEIC, JPEG, JPG, WebP, PNG</p>
                </div>
            )}
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                multiple
                onChange={handleFileSelect}
            />
            {/* Loading section */}
            {loading && (
                <LoadingExperience
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    gameHeight={GAME_AREA_HEIGHT}
                    quotes={shuffledQuotes}
                    quoteIndex={quoteIndex}
                    progress={progress}
                    progressText={progressText}
                />
            )}
            {/* Error and rejection messages after analysis */}
            {!loading && hasAnalyzed && analysisResults.some((r) => !r.success) && (
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Проблемы с анализом</h3>
                    {analysisResults.map((result, index) => {
                        if (result.success) return null
                        return (
                            <div key={index} className="border rounded-md p-4">
                                <p className="font-medium">Фото #{index + 1}: {result.fileName}</p>
                                <p className="text-sm text-red-600">{result.rejectionReason || result.error}</p>
                                {result.rejectionReason &&
                                    <p className="text-sm text-gray-500">Попробуйте загрузить другое изображение</p>}
                            </div>
                        )
                    })}
                </div>
            )}
            {/* Results section */}
            {!loading && results.length > 0 && (
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Найденные вещи ({results.length})</h3>
                    {results.map((item, index) => (
                        <Card key={index} className="overflow-hidden">
                            <CardContent className="flex flex-col sm:flex-row gap-4 p-4">
                                {/* Image */}
                                {item.finalImageUrl ? (
                                    <Image src={item.finalImageUrl} alt={item.item_name} width={100} height={100}
                                           className="rounded-md object-cover"/>
                                ) : (
                                    <div
                                        className="w-24 h-24 bg-gray-100 rounded-md flex items-center justify-center text-3xl">👕</div>
                                )}
                                {/* Info */}
                                <div className="flex-1 space-y-2">
                                    <p className="font-semibold">{item.item_name}</p>
                                    {item.basic_item_id && <Badge>Базовая</Badge>}
                                    <p className="text-sm">{item.material}</p>
                                    {item.shade && <p className="text-sm text-gray-500">{item.shade}</p>}
                                </div>
                                {/* Actions */}
                                <div className="flex flex-col gap-2 items-stretch">
                                    <Button
                                        onClick={() => handleSaveItem(item, index)}
                                        disabled={item.isAdding || item.isAdded}
                                        variant={item.isAdded ? "secondary" : "default"}
                                        size="sm"
                                        className="w-full"
                                    >
                                        {item.isAdding ? "Добавляем..." : item.isAdded ? "Добавлено" : "Добавить"}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
            {/* Regeneration modal */}
            {showRegenerationModal && (
                <PhotoRegenerationModal
                    isOpen={showRegenerationModal}
                    isFirstTime={isFirstTimeRegeneration}
                    onClose={closeRegenerationModal}
                />
            )}
        </div>
    )
}
