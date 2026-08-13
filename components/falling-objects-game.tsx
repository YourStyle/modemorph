"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Shirt,
  Footprints,
  Glasses,
  Watch,
  Backpack,
  Gem,
  Crown,
  Trash2,
  Skull,
  Ban,
  Hourglass,
  Magnet,
  Shield,
  ShoppingBag,
  Gauge,
  X,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FallingObject {
  id: number
  x: number // 0-100, percent of play area width
  y: number // 0-100, percent of play area height
  icon: LucideIcon
  points: number
  isBad: boolean
  isPowerUp: boolean
  powerUpType?: "slow" | "magnet" | "shield"
  size: number // 1 = normal, 0.8 = small, 1.3 = large
}

type EffectKind = "score" | "damage" | "power" | "shield"

interface CollectedEffect {
  id: number
  x: number
  y: number
  text: string
  kind: EffectKind
}

// ---------------------------------------------------------------------------
// Config — every falling object is a lucide icon, same monoline stroke as
// the rest of the interface. No emoji anywhere: system emoji fonts render
// differently per device, carry their own uncontrolled colors, and read as
// a different product than the rest of the app.
// ---------------------------------------------------------------------------

const GOOD_ITEMS: { icon: LucideIcon; points: number }[] = [
  { icon: Shirt, points: 10 },
  { icon: Footprints, points: 15 },
  { icon: Glasses, points: 20 },
  { icon: Watch, points: 25 },
  { icon: Backpack, points: 30 },
  { icon: Gem, points: 50 },
  { icon: Crown, points: 100 },
]

const BAD_ITEMS: { icon: LucideIcon; points: number }[] = [
  { icon: Ban, points: -15 },
  { icon: Skull, points: -30 },
  { icon: Trash2, points: -20 },
]

const POWER_UPS: { icon: LucideIcon; type: "slow" | "magnet" | "shield" }[] = [
  { icon: Hourglass, type: "slow" },
  { icon: Magnet, type: "magnet" },
  { icon: Shield, type: "shield" },
]

const CALM_TIPS = [
  "Подбираем вещи под ваш стиль",
  "Проверяем цвета и материалы",
  "Собираем всё в гардероб",
  "Совсем немного осталось",
]

const MAX_LIVES = 5
const BASE_FALL_SPEED = 1.2 // % of height per reference frame (16.7ms)
const MAX_FALL_SPEED = 4.5
const SPEED_INCREMENT = 0.15
const SPEED_DECAY_ON_MISS = 0.4
const SPAWN_BASE_INTERVAL = 1800
const SPAWN_MIN_INTERVAL = 700
const FRAME_TIME = 1000 / 60 // reference tick used to normalize delta time
const MAX_DELTA_FACTOR = 4 // clamp so a backgrounded tab can't cause a jump
const COMBO_TIMEOUT = 3000
const SLOW_DURATION = 5000
const MAGNET_DURATION = 4000
const SHIELD_DURATION = 6000

// Play surface treatment shared by every state (idle / calm / playing) so
// the box never reads as an empty placeholder: hairline border + a soft
// inset vignette (box-shadow, not a background gradient) toward the edges.
const PLAY_SURFACE =
  "rounded-lg border border-line bg-canvas-sunk shadow-[inset_0_0_36px_hsl(var(--ink)/0.07)]"

// ---------------------------------------------------------------------------
// Haptics — Telegram WebApp only, always guarded, never blocks the game
// ---------------------------------------------------------------------------

function triggerHaptic(kind: "light" | "medium" | "warning") {
  if (typeof window === "undefined") return
  try {
    const hf = (window as any)?.Telegram?.WebApp?.HapticFeedback
    if (!hf) return
    if (kind === "warning") hf.notificationOccurred?.("warning")
    else hf.impactOccurred?.(kind)
  } catch {
    // haptics are a nice-to-have, never let them break the loop
  }
}

// Every screen in this file has exactly one signal spot, and it lives in
// ProgressBlock (photo-analysis-form.tsx) — the one honest, always-visible
// thread through every state. Everything in the game itself stays on
// ink/canvas, matching components/ui/button.tsx's own default (bg-ink
// text-signal-ink for "black buttons") rather than reaching for the accent.
function effectClassName(kind: EffectKind) {
  switch (kind) {
    case "damage":
      return "text-destructive"
    case "shield":
      return "text-ink-2"
    default:
      return "text-ink"
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type GameProps = {
  analysisDone?: boolean
  onRequestFinish?: () => void
}

export default function FallingObjectsGame({
  analysisDone = false,
  onRequestFinish,
}: GameProps) {
  const [score, setScore] = useState(0)
  const [gameStarted, setGameStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [showFinishOverlay, setShowFinishOverlay] = useState(false)
  const [basketX, setBasketX] = useState(50)
  const [fallingObjects, setFallingObjects] = useState<FallingObject[]>([])
  const [effects, setEffects] = useState<CollectedEffect[]>([])
  const [lives, setLives] = useState(MAX_LIVES)
  const [combo, setCombo] = useState(0)
  const [fallSpeed, setFallSpeed] = useState(BASE_FALL_SPEED)
  const [level, setLevel] = useState(1)
  const [popKey, setPopKey] = useState(0)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [reducedMotion, setReducedMotion] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)

  // Power-up active states
  const [slowActive, setSlowActive] = useState(false)
  const [magnetActive, setMagnetActive] = useState(false)
  const [shieldActive, setShieldActive] = useState(false)

  // HP shake effect
  const [hpShake, setHpShake] = useState(false)

  const gameAreaRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const lastSpawnRef = useRef<number>(0)
  const objectIdRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  const basketXRef = useRef<number>(50)
  const fallSpeedRef = useRef<number>(BASE_FALL_SPEED)
  const comboRef = useRef<number>(0)
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scoreRef = useRef<number>(0)
  const slowActiveRef = useRef(false)
  const magnetActiveRef = useRef(false)
  const shieldActiveRef = useRef(false)

  // Sync refs
  useEffect(() => { fallSpeedRef.current = fallSpeed }, [fallSpeed])
  useEffect(() => { comboRef.current = combo }, [combo])
  useEffect(() => { scoreRef.current = score }, [score])
  useEffect(() => { slowActiveRef.current = slowActive }, [slowActive])
  useEffect(() => { magnetActiveRef.current = magnetActive }, [magnetActive])
  useEffect(() => { shieldActiveRef.current = shieldActive }, [shieldActive])

  // Level up every 200 points
  useEffect(() => {
    const newLevel = Math.floor(score / 200) + 1
    if (newLevel !== level) setLevel(newLevel)
  }, [score, level])

  useEffect(() => {
    if (analysisDone && gameStarted && !gameOver) setShowFinishOverlay(true)
  }, [analysisDone, gameStarted, gameOver])

  // ---------------------------------------------------------------------------
  // Motion preference — offer a calm, static waiting screen instead of a game
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [])

  useEffect(() => {
    if (!reducedMotion) return
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % CALM_TIPS.length)
    }, 2400)
    return () => clearInterval(interval)
  }, [reducedMotion])

  // ---------------------------------------------------------------------------
  // Measure the play area so falling objects can be positioned with transforms
  // instead of animating top/left (keeps everything on the compositor).
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!gameStarted) return
    const el = gameAreaRef.current
    if (!el) return
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight })
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [gameStarted])

  // ---------------------------------------------------------------------------
  // Input handlers
  // ---------------------------------------------------------------------------

  const handleMove = useCallback((clientX: number) => {
    if (!gameAreaRef.current) return
    const rect = gameAreaRef.current.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const clampedX = Math.max(5, Math.min(95, x))
    basketXRef.current = clampedX
    setBasketX(clampedX)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!gameStarted || gameOver) return
    handleMove(e.clientX)
  }, [gameStarted, gameOver, handleMove])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!gameStarted || gameOver) return
    e.preventDefault()
    handleMove(e.touches[0].clientX)
  }, [gameStarted, gameOver, handleMove])

  // ---------------------------------------------------------------------------
  // Spawn logic
  // ---------------------------------------------------------------------------

  const getSpawnInterval = useCallback(() => {
    const speedFactor = (fallSpeedRef.current - BASE_FALL_SPEED) / (MAX_FALL_SPEED - BASE_FALL_SPEED)
    return Math.max(SPAWN_MIN_INTERVAL, SPAWN_BASE_INTERVAL - speedFactor * (SPAWN_BASE_INTERVAL - SPAWN_MIN_INTERVAL))
  }, [])

  const spawnObject = useCallback(() => {
    const rand = Math.random()
    let obj: FallingObject

    if (rand < 0.08 && scoreRef.current > 50) {
      const pu = POWER_UPS[Math.floor(Math.random() * POWER_UPS.length)]
      obj = {
        id: objectIdRef.current++,
        x: Math.random() * 80 + 10,
        y: -5,
        icon: pu.icon,
        points: 0,
        isBad: false,
        isPowerUp: true,
        powerUpType: pu.type,
        size: 1.2,
      }
    } else if (rand < 0.26 && scoreRef.current > 30) {
      const bad = BAD_ITEMS[Math.floor(Math.random() * BAD_ITEMS.length)]
      obj = {
        id: objectIdRef.current++,
        x: Math.random() * 80 + 10,
        y: -5,
        icon: bad.icon,
        points: bad.points,
        isBad: true,
        isPowerUp: false,
        size: 1,
      }
    } else {
      const weights = GOOD_ITEMS.map((_, i) => GOOD_ITEMS.length - i)
      const total = weights.reduce((a, b) => a + b, 0)
      let r = Math.random() * total
      let item = GOOD_ITEMS[0]
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i]
        if (r <= 0) { item = GOOD_ITEMS[i]; break }
      }
      obj = {
        id: objectIdRef.current++,
        x: Math.random() * 80 + 10,
        y: -5,
        icon: item.icon,
        points: item.points,
        isBad: false,
        isPowerUp: false,
        size: 1,
      }
    }

    setFallingObjects((prev) => [...prev, obj])
  }, [])

  // ---------------------------------------------------------------------------
  // Combo management
  // ---------------------------------------------------------------------------

  const addCombo = useCallback(() => {
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current)
    setCombo((prev) => prev + 1)
    comboTimerRef.current = setTimeout(() => {
      setCombo(0)
    }, COMBO_TIMEOUT)
  }, [])

  const resetCombo = useCallback(() => {
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current)
    setCombo(0)
  }, [])

  // ---------------------------------------------------------------------------
  // Power-ups
  // ---------------------------------------------------------------------------

  const activatePowerUp = useCallback((type: "slow" | "magnet" | "shield") => {
    if (type === "slow") {
      setSlowActive(true)
      setTimeout(() => setSlowActive(false), SLOW_DURATION)
    } else if (type === "magnet") {
      setMagnetActive(true)
      setTimeout(() => setMagnetActive(false), MAGNET_DURATION)
    } else if (type === "shield") {
      setShieldActive(true)
      setTimeout(() => setShieldActive(false), SHIELD_DURATION)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Add visual effect
  // ---------------------------------------------------------------------------

  const addEffect = useCallback((x: number, y: number, text: string, kind: EffectKind) => {
    const id = objectIdRef.current++
    setEffects((prev) => [...prev, { id, x, y, text, kind }])
    setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== id))
    }, 900)
  }, [])

  // ---------------------------------------------------------------------------
  // HP shake trigger
  // ---------------------------------------------------------------------------

  const triggerHpShake = useCallback(() => {
    setHpShake(true)
    setTimeout(() => setHpShake(false), 400)
  }, [])

  // ---------------------------------------------------------------------------
  // Collision
  // ---------------------------------------------------------------------------

  const checkCollision = useCallback((object: FallingObject) => {
    const basketHalfWidth = magnetActiveRef.current ? 16 : 10
    return Math.abs(object.x - basketXRef.current) < basketHalfWidth && object.y > 78 && object.y < 96
  }, [])

  // ---------------------------------------------------------------------------
  // Game loop — requestAnimationFrame driven by real elapsed time, not a
  // fixed per-frame step, so speed stays consistent on slower devices.
  // ---------------------------------------------------------------------------

  const gameLoop = useCallback((timestamp: number) => {
    if (!gameStarted || gameOver || reducedMotion) return

    if (!lastFrameRef.current) lastFrameRef.current = timestamp
    const dt = timestamp - lastFrameRef.current
    lastFrameRef.current = timestamp
    const deltaFactor = Math.min(MAX_DELTA_FACTOR, Math.max(0, dt / FRAME_TIME))

    if (timestamp - lastSpawnRef.current > getSpawnInterval()) {
      spawnObject()
      lastSpawnRef.current = timestamp
    }

    setFallingObjects((prev) => {
      if (prev.length === 0) return prev

      const currentSpeed = slowActiveRef.current ? fallSpeedRef.current * 0.4 : fallSpeedRef.current

      const updated = prev.map((obj) => {
        let newX = obj.x
        if (magnetActiveRef.current && !obj.isBad) {
          const diff = basketXRef.current - obj.x
          newX += diff * 0.03 * deltaFactor
        }
        return { ...obj, y: obj.y + currentSpeed * deltaFactor, x: newX }
      })

      const remaining: FallingObject[] = []
      let scoreChange = 0
      let missedCount = 0
      let lostLives = 0
      const newEffects: { x: number; y: number; text: string; kind: EffectKind }[] = []
      let caught = false
      let caughtBad = false
      let caughtPower = false

      updated.forEach((obj) => {
        if (checkCollision(obj)) {
          if (obj.isPowerUp && obj.powerUpType) {
            activatePowerUp(obj.powerUpType)
            caughtPower = true
            newEffects.push({ x: basketXRef.current, y: 78, text: "Бонус", kind: "power" })
          } else if (obj.isBad) {
            if (shieldActiveRef.current) {
              newEffects.push({ x: basketXRef.current, y: 78, text: "Блок", kind: "shield" })
            } else {
              scoreChange += obj.points
              caughtBad = true
              lostLives++
              newEffects.push({ x: basketXRef.current, y: 78, text: `${obj.points}`, kind: "damage" })
            }
          } else {
            const comboMultiplier = Math.min(1 + comboRef.current * 0.25, 4)
            const pts = Math.round(obj.points * comboMultiplier)
            scoreChange += pts
            caught = true
            const comboText = comboRef.current >= 2 ? ` ×${comboMultiplier.toFixed(1)}` : ""
            newEffects.push({ x: basketXRef.current, y: 78, text: `+${pts}${comboText}`, kind: "score" })
          }
        } else if (obj.y > 105) {
          if (!obj.isBad && !obj.isPowerUp) {
            missedCount++
          }
        } else {
          remaining.push(obj)
        }
      })

      if (caught || caughtPower) {
        setPopKey((k) => k + 1)
      }

      if (caught) {
        addCombo()
        setFallSpeed((prev) => Math.min(MAX_FALL_SPEED, prev + SPEED_INCREMENT))
        triggerHaptic("light")
      }

      if (caughtPower) {
        triggerHaptic("medium")
      }

      if (caughtBad) {
        resetCombo()
        setFallSpeed((prev) => Math.max(BASE_FALL_SPEED, prev - SPEED_INCREMENT * 3))
        triggerHpShake()
        triggerHaptic("warning")
      }

      if (scoreChange !== 0) {
        setScore((prev) => Math.max(0, prev + scoreChange))
      }

      for (const e of newEffects) {
        addEffect(e.x, e.y, e.text, e.kind)
      }

      // Lose lives from bad catches AND misses
      const totalLost = lostLives + missedCount

      if (missedCount > 0) {
        setFallSpeed((prev) => {
          const gained = prev - BASE_FALL_SPEED
          return BASE_FALL_SPEED + gained * SPEED_DECAY_ON_MISS
        })
        resetCombo()
        if (!caughtBad) triggerHaptic("warning")
      }

      if (totalLost > 0) {
        if (missedCount === 0) triggerHpShake() // only if not already triggered by caughtBad
        setLives((prev) => {
          const newLives = prev - totalLost
          if (newLives <= 0) setGameOver(true)
          return Math.max(0, newLives)
        })
      }

      return remaining
    })

    animationRef.current = requestAnimationFrame(gameLoop)
  }, [gameStarted, gameOver, reducedMotion, spawnObject, checkCollision, getSpawnInterval, addCombo, resetCombo, activatePowerUp, addEffect, triggerHpShake])

  // ---------------------------------------------------------------------------
  // Start / reset
  // ---------------------------------------------------------------------------

  const startGame = () => {
    triggerHaptic("light")
    setScore(0)
    setGameStarted(true)
    setGameOver(false)
    setFallingObjects([])
    setEffects([])
    setLives(MAX_LIVES)
    setCombo(0)
    setFallSpeed(BASE_FALL_SPEED)
    setLevel(1)
    setBasketX(50)
    setSlowActive(false)
    setMagnetActive(false)
    setShieldActive(false)
    setHpShake(false)
    basketXRef.current = 50
    lastSpawnRef.current = 0
    lastFrameRef.current = 0
    objectIdRef.current = 0
    scoreRef.current = 0
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (gameStarted && !gameOver && !reducedMotion) {
      lastFrameRef.current = 0
      animationRef.current = requestAnimationFrame(gameLoop)
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current) }
  }, [gameStarted, gameOver, reducedMotion, gameLoop])

  useEffect(() => {
    const el = gameAreaRef.current
    if (!el || !gameStarted || gameOver) return
    el.addEventListener("mousemove", handleMouseMove)
    el.addEventListener("touchmove", handleTouchMove, { passive: false })
    return () => {
      el.removeEventListener("mousemove", handleMouseMove)
      el.removeEventListener("touchmove", handleTouchMove)
    }
  }, [gameStarted, gameOver, handleMouseMove, handleTouchMove])

  useEffect(() => {
    return () => { if (comboTimerRef.current) clearTimeout(comboTimerRef.current) }
  }, [])

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const speedFraction = Math.min(1, Math.max(0, (fallSpeed - BASE_FALL_SPEED) / (MAX_FALL_SPEED - BASE_FALL_SPEED)))
  const px = (percent: number, axis: "w" | "h") => (percent / 100) * dims[axis]
  const BasketIcon = magnetActive ? Magnet : shieldActive ? Shield : ShoppingBag

  // ---------------------------------------------------------------------------
  // Render: reduced motion — calm, honest waiting instead of a fast game
  // ---------------------------------------------------------------------------

  if (reducedMotion) {
    return (
      <div className={cn("flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center", PLAY_SURFACE)}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface">
          <ShoppingBag size={28} strokeWidth={2} className="text-ink-2" />
        </div>
        <div className="space-y-1">
          <p className="text-body text-ink">Пока мы всё подбираем</p>
          <p key={tipIndex} className="text-caption text-ink-2 animate-fade-up">
            {CALM_TIPS[tipIndex]}
          </p>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: start screen
  // ---------------------------------------------------------------------------

  if (!gameStarted) {
    return (
      <div
        className={cn("flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center", PLAY_SURFACE)}
        style={{ touchAction: "manipulation" }}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface">
          <ShoppingBag size={28} strokeWidth={2} className="text-ink-2" />
        </div>
        <div className="space-y-1">
          <p className="text-body text-ink">Пока мы колдуем над образом</p>
          <p className="text-caption text-ink-2">Ловите вещи в сумку — счёт растёт, скорость тоже</p>
        </div>
        <div className="flex items-center gap-3 text-caption text-ink-3">
          <span className="inline-flex items-center gap-1"><Hourglass size={13} strokeWidth={2} /> замедление</span>
          <span className="inline-flex items-center gap-1"><Magnet size={13} strokeWidth={2} /> магнит</span>
          <span className="inline-flex items-center gap-1"><Shield size={13} strokeWidth={2} /> щит</span>
        </div>
        <button
          onClick={startGame}
          className="h-11 w-full max-w-[220px] rounded-full bg-ink text-body font-semibold text-signal-ink transition-transform duration-press active:scale-95"
        >
          Начать игру
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: game
  // ---------------------------------------------------------------------------

  return (
    <div
      ref={gameAreaRef}
      className={cn("relative h-full w-full select-none overflow-hidden cursor-none", PLAY_SURFACE)}
      style={{ touchAction: "none" }}
    >
      {/* HUD — single row */}
      <div className="absolute inset-x-2 top-2 z-10 flex items-start justify-between">
        {/* Score + combo underneath */}
        <div className="flex flex-col items-start gap-1">
          <div className="flex h-7 items-center rounded-full border border-line bg-surface/95 px-3">
            <span className="text-caption font-bold tabular-nums text-ink">{score}</span>
          </div>
          {combo >= 2 && (
            <div className="flex h-5 items-center rounded-full bg-ink px-2">
              <span className="text-micro text-signal-ink">×{combo}</span>
            </div>
          )}
        </div>

        {/* Center: difficulty pace — no numeric level label, the bar says it all */}
        <div className="flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface/95 px-2">
          <Gauge size={13} strokeWidth={2} className="text-ink-3" />
          <div className="h-1.5 w-8 overflow-hidden rounded-full bg-canvas-sunk">
            <div
              className="h-full w-full origin-left rounded-full bg-ink-2 transition-transform duration-300"
              style={{ transform: `scaleX(${Math.max(0.04, speedFraction)})` }}
            />
          </div>
        </div>

        {/* Right: powerups + lives + close */}
        <div className="flex items-center gap-1.5">
          {slowActive && <Hourglass size={14} strokeWidth={2} className="text-ink-2 animate-pulse" />}
          {magnetActive && <Magnet size={14} strokeWidth={2} className="text-ink-2 animate-pulse" />}
          {shieldActive && <Shield size={14} strokeWidth={2} className="text-ink-2 animate-pulse" />}

          <div className={cn("flex h-7 items-center gap-1 rounded-full border border-line bg-surface/95 px-2", hpShake && "animate-hp-shake")}>
            {[...Array(MAX_LIVES)].map((_, i) => (
              <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < lives ? "bg-ink" : "bg-canvas-sunk")} />
            ))}
          </div>

          <button
            onClick={onRequestFinish}
            aria-label="Закрыть игру"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface/95 text-ink-2 transition-transform duration-press active:scale-90"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      </div>

      {dims.w > 0 && (
        <>
          {/* Falling objects */}
          {fallingObjects.map((obj) => {
            const Icon = obj.icon
            return (
              <div
                key={obj.id}
                className={cn("absolute left-0 top-0 will-change-transform", obj.isBad && "game-wiggle")}
                style={{
                  transform: `translate3d(${px(obj.x, "w")}px, ${px(obj.y, "h")}px, 0) translate(-50%, -50%) scale(${obj.size})`,
                }}
              >
                <Icon size={24} strokeWidth={2} className={obj.isBad ? "text-destructive" : "text-ink"} />
              </div>
            )
          })}

          {/* Collected effects */}
          {effects.map((e) => (
            <div
              key={`fx-${e.id}`}
              className={cn("absolute left-0 top-0 pointer-events-none text-caption font-bold game-rise-fade", effectClassName(e.kind))}
              style={{ transform: `translate3d(${px(e.x, "w")}px, ${px(e.y, "h")}px, 0) translate(-50%, -50%)` }}
            >
              {e.text}
            </div>
          ))}

          {/* Basket */}
          <div
            className="absolute left-0 bottom-3 will-change-transform"
            style={{ transform: `translate3d(${px(basketX, "w")}px, 0, 0) translate(-50%, 0)` }}
          >
            <span key={popKey} className="inline-flex items-center justify-center animate-pop">
              <BasketIcon size={28} strokeWidth={2} className="text-ink" />
            </span>
          </div>
        </>
      )}

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/50">
          <div className="mx-4 w-full max-w-xs space-y-4 rounded-[18px] border border-line bg-surface p-6 text-center">
            <p className="text-caption uppercase tracking-wide text-ink-2">Игра окончена</p>
            <p className="text-display tabular-nums text-ink">{score}</p>
            <p className="text-caption text-ink-2">очков · уровень {level}</p>
            <button
              onClick={startGame}
              className="h-11 w-full rounded-full bg-ink text-body font-semibold text-signal-ink transition-transform duration-press active:scale-95"
            >
              Играть снова
            </button>
          </div>
        </div>
      )}

      {/* Analysis done overlay */}
      {showFinishOverlay && !gameOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/50">
          <div className="mx-4 w-full max-w-xs space-y-4 rounded-[18px] border border-line bg-surface p-6 text-center">
            <p className="text-h2 text-ink">Примерка готова</p>
            <p className="text-body text-ink-2">Хотите посмотреть результат?</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setShowFinishOverlay(false)}
                className="h-11 rounded-full bg-canvas-sunk text-body font-medium text-ink transition-transform duration-press active:scale-95"
              >
                Продолжить
              </button>
              <button
                onClick={() => { setShowFinishOverlay(false); onRequestFinish?.() }}
                className="h-11 rounded-full bg-ink text-body font-semibold text-signal-ink transition-transform duration-press active:scale-95"
              >
                Да
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local, transform-only keyframes — respects the global
          prefers-reduced-motion override in app/globals.css */}
      <style jsx>{`
        @keyframes wiggle {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
          25% { transform: translate(-50%, -50%) rotate(-8deg); }
          75% { transform: translate(-50%, -50%) rotate(8deg); }
        }
        .game-wiggle { animation: wiggle 0.5s ease-in-out infinite; }

        @keyframes riseFade {
          0% { opacity: 1; transform: translate(-50%, -50%); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 30px)); }
        }
        .game-rise-fade { animation: riseFade 0.9s var(--ease-out) forwards; }

        @keyframes hpShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
        .animate-hp-shake { animation: hpShake 0.4s ease-in-out; }
      `}</style>
    </div>
  )
}
