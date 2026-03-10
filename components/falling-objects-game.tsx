"use client"

import { useState, useEffect, useRef, useCallback } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FallingObject {
  id: number
  x: number
  y: number
  emoji: string
  points: number
  isBad: boolean
  isPowerUp: boolean
  powerUpType?: "slow" | "magnet" | "shield"
  size: number // 1 = normal, 0.8 = small, 1.3 = large
}

interface CollectedEffect {
  id: number
  x: number
  y: number
  text: string
  color: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GOOD_ITEMS = [
  { emoji: "👕", points: 10 },
  { emoji: "👖", points: 15 },
  { emoji: "👗", points: 20 },
  { emoji: "🧥", points: 25 },
  { emoji: "👠", points: 30 },
  { emoji: "💍", points: 50 },
  { emoji: "👑", points: 100 },
]

const BAD_ITEMS = [
  { emoji: "🧦", points: -15 },
  { emoji: "💀", points: -30 },
  { emoji: "🗑️", points: -20 },
]

const POWER_UPS = [
  { emoji: "⏳", type: "slow" as const },
  { emoji: "🧲", type: "magnet" as const },
  { emoji: "🛡️", type: "shield" as const },
]

const GAME_HEIGHT = 300
const MAX_LIVES = 5
const BASE_FALL_SPEED = 1.2
const MAX_FALL_SPEED = 4.5
const SPEED_INCREMENT = 0.15
const SPEED_DECAY_ON_MISS = 0.4
const SPAWN_BASE_INTERVAL = 1800
const SPAWN_MIN_INTERVAL = 700
const TARGET_FPS = 60
const FRAME_TIME = 1000 / TARGET_FPS
const COMBO_TIMEOUT = 3000
const SLOW_DURATION = 5000
const MAGNET_DURATION = 4000
const SHIELD_DURATION = 6000

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

  // Power-up active states
  const [slowActive, setSlowActive] = useState(false)
  const [magnetActive, setMagnetActive] = useState(false)
  const [shieldActive, setShieldActive] = useState(false)

  // HP shake effect
  const [hpShake, setHpShake] = useState(false)

  const gameAreaRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>()
  const lastSpawnRef = useRef<number>(0)
  const objectIdRef = useRef<number>(0)
  const lastUpdateRef = useRef<number>(0)
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
        emoji: pu.emoji,
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
        emoji: bad.emoji,
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
        emoji: item.emoji,
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

  const addEffect = useCallback((x: number, y: number, text: string, color: string) => {
    const id = objectIdRef.current++
    setEffects((prev) => [...prev, { id, x, y, text, color }])
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
  // Game loop
  // ---------------------------------------------------------------------------

  const gameLoop = useCallback((timestamp: number) => {
    if (!gameStarted || gameOver) return

    if (timestamp - lastUpdateRef.current < FRAME_TIME) {
      animationRef.current = requestAnimationFrame(gameLoop)
      return
    }
    lastUpdateRef.current = timestamp

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
          newX += diff * 0.03
        }
        return { ...obj, y: obj.y + currentSpeed, x: newX }
      })

      const remaining: FallingObject[] = []
      let scoreChange = 0
      let missedCount = 0
      let lostLives = 0
      const newEffects: { x: number; y: number; text: string; color: string }[] = []
      let caught = false
      let caughtBad = false

      updated.forEach((obj) => {
        if (checkCollision(obj)) {
          if (obj.isPowerUp && obj.powerUpType) {
            activatePowerUp(obj.powerUpType)
            newEffects.push({ x: basketXRef.current, y: 78, text: "⚡", color: "#8b5cf6" })
          } else if (obj.isBad) {
            if (shieldActiveRef.current) {
              newEffects.push({ x: basketXRef.current, y: 78, text: "🛡️", color: "#3b82f6" })
            } else {
              scoreChange += obj.points
              caughtBad = true
              lostLives++
              newEffects.push({ x: basketXRef.current, y: 78, text: `${obj.points} 💔`, color: "#ef4444" })
            }
          } else {
            const comboMultiplier = Math.min(1 + comboRef.current * 0.25, 4)
            const pts = Math.round(obj.points * comboMultiplier)
            scoreChange += pts
            caught = true
            const comboText = comboRef.current >= 2 ? ` x${comboMultiplier.toFixed(1)}` : ""
            newEffects.push({ x: basketXRef.current, y: 78, text: `+${pts}${comboText}`, color: "#8b5cf6" })
          }
        } else if (obj.y > 105) {
          if (!obj.isBad && !obj.isPowerUp) {
            missedCount++
          }
        } else {
          remaining.push(obj)
        }
      })

      if (caught) {
        addCombo()
        setFallSpeed((prev) => Math.min(MAX_FALL_SPEED, prev + SPEED_INCREMENT))
      }

      if (caughtBad) {
        resetCombo()
        setFallSpeed((prev) => Math.max(BASE_FALL_SPEED, prev - SPEED_INCREMENT * 3))
        triggerHpShake()
      }

      if (scoreChange !== 0) {
        setScore((prev) => Math.max(0, prev + scoreChange))
      }

      for (const e of newEffects) {
        addEffect(e.x, e.y, e.text, e.color)
      }

      // Lose lives from bad catches AND misses
      const totalLost = lostLives + missedCount

      if (missedCount > 0) {
        setFallSpeed((prev) => {
          const gained = prev - BASE_FALL_SPEED
          return BASE_FALL_SPEED + gained * SPEED_DECAY_ON_MISS
        })
        resetCombo()
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
  }, [gameStarted, gameOver, spawnObject, checkCollision, getSpawnInterval, addCombo, resetCombo, activatePowerUp, addEffect, triggerHpShake])

  // ---------------------------------------------------------------------------
  // Start / reset
  // ---------------------------------------------------------------------------

  const startGame = () => {
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
    lastUpdateRef.current = 0
    objectIdRef.current = 0
    scoreRef.current = 0
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (gameStarted && !gameOver) {
      animationRef.current = requestAnimationFrame(gameLoop)
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current) }
  }, [gameStarted, gameOver, gameLoop])

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

  const speedPercent = Math.round(((fallSpeed - BASE_FALL_SPEED) / (MAX_FALL_SPEED - BASE_FALL_SPEED)) * 100)
  const speedColor = speedPercent < 30 ? "#22c55e" : speedPercent < 60 ? "#eab308" : "#ef4444"

  // ---------------------------------------------------------------------------
  // Render: start screen
  // ---------------------------------------------------------------------------

  if (!gameStarted) {
    return (
      <div
        className="rounded-xl border border-purple-200/80 bg-gradient-to-b from-purple-100/80 to-pink-100/50 flex items-center justify-center text-center p-6"
        style={{ height: `${GAME_HEIGHT}px`, touchAction: "manipulation" }}
      >
        <div className="space-y-4 w-full max-w-xs mx-auto">
          <p className="text-sm text-slate-600 leading-relaxed">
            Ловите модные вещи и избегайте мусора!
          </p>
          <div className="flex gap-3 justify-center text-xs text-slate-500">
            <span>⏳ замедление</span>
            <span>🧲 магнит</span>
            <span>🛡️ щит</span>
          </div>
          <button
            onClick={startGame}
            className="w-full px-6 py-3 text-white font-medium rounded-2xl shadow-lg transition-opacity hover:opacity-90 border-0"
            style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
          >
            Начать игру
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: game
  // ---------------------------------------------------------------------------

  return (
    <div
      ref={gameAreaRef}
      className="relative bg-gradient-to-b from-purple-200/80 to-pink-200/80 rounded-xl overflow-hidden cursor-none select-none border border-purple-200/50"
      style={{ height: `${GAME_HEIGHT}px`, touchAction: "none" }}
    >
      {/* HUD — single row */}
      <div className="absolute top-2 left-2 right-2 flex items-start justify-between z-10">
        {/* Score + combo underneath */}
        <div className="flex flex-col items-start gap-0.5">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 h-7 shadow-sm flex items-center">
            <span className="text-sm font-bold text-purple-600">{score}</span>
          </div>
          {combo >= 2 && (
            <div className="bg-purple-500/90 backdrop-blur-sm rounded-xl px-2 h-5 shadow-sm flex items-center">
              <span className="text-[10px] font-bold text-white">x{combo} streak</span>
            </div>
          )}
        </div>

        {/* Center: Level + Speed bar */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl px-2 h-7 shadow-sm flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-slate-500">Ур.{level}</span>
          <div className="w-8 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${speedPercent}%`, backgroundColor: speedColor }} />
          </div>
        </div>

        {/* Right: powerups + lives + X */}
        <div className="flex items-center gap-1.5">
          {/* Power-up indicators */}
          {slowActive && <span className="text-sm animate-pulse">⏳</span>}
          {magnetActive && <span className="text-sm animate-pulse">🧲</span>}
          {shieldActive && <span className="text-sm animate-pulse">🛡️</span>}

          {/* Lives */}
          <div className={`bg-white/90 backdrop-blur-sm rounded-xl px-2 h-7 shadow-sm flex items-center gap-0.5 ${hpShake ? "animate-hp-shake" : ""}`}>
            {[...Array(MAX_LIVES)].map((_, i) => (
              <span key={i} className="text-[10px]">{i < lives ? "❤️" : "🖤"}</span>
            ))}
          </div>

          {/* Close (X) */}
          <button
            onClick={onRequestFinish}
            className="w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center border-0 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Falling objects */}
      {fallingObjects.map((obj) => (
        <div
          key={obj.id}
          className={`absolute will-change-transform ${obj.isBad ? "game-wiggle" : ""}`}
          style={{
            left: `${obj.x}%`,
            top: `${obj.y}%`,
            transform: `translate(-50%, -50%) scale(${obj.size})`,
            transition: "none",
            fontSize: "1.5rem",
          }}
        >
          {obj.emoji}
        </div>
      ))}

      {/* Collected effects */}
      {effects.map((e) => (
        <div
          key={`fx-${e.id}`}
          className="absolute text-sm font-bold pointer-events-none game-fade-up"
          style={{ left: `${e.x}%`, top: `${e.y}%`, transform: "translate(-50%, -50%)", color: e.color }}
        >
          {e.text}
        </div>
      ))}

      {/* Basket */}
      <div
        className="absolute bottom-3 text-3xl will-change-transform"
        style={{ left: `${basketX}%`, transform: "translateX(-50%)" }}
      >
        {magnetActive ? "🧲" : shieldActive ? "🛡️" : "🛍️"}
      </div>

      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="bg-white p-6 rounded-2xl text-center space-y-4 shadow-2xl max-w-xs mx-4">
            <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Игра окончена!
            </h2>
            <p className="text-slate-600">
              Счёт: <span className="font-bold text-purple-600">{score}</span>
              <br />
              <span className="text-xs text-slate-400">Уровень {level}</span>
            </p>
            <button
              onClick={startGame}
              className="w-full px-6 py-3 text-white font-medium rounded-2xl shadow-lg transition-opacity hover:opacity-90 border-0"
              style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
            >
              Играть снова
            </button>
          </div>
        </div>
      )}

      {/* Analysis done overlay */}
      {showFinishOverlay && !gameOver && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="bg-white p-6 rounded-2xl text-center space-y-4 shadow-2xl max-w-xs mx-4">
            <h2 className="text-lg font-bold text-purple-700">Примерка готова!</h2>
            <p className="text-slate-600">Хотите посмотреть результат?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowFinishOverlay(false); onRequestFinish?.() }}
                className="w-full px-4 py-2 text-white font-medium rounded-2xl transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(to right, #EC9DE2, #89AEFF)" }}
              >
                Да
              </button>
              <button
                onClick={() => setShowFinishOverlay(false)}
                className="w-full px-4 py-2 bg-white hover:bg-slate-50 text-[#EC9DE2] font-medium rounded-2xl border border-[#EC9DE2] transition-colors"
              >
                Продолжить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style jsx>{`
        @keyframes wiggle {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
          25% { transform: translate(-50%, -50%) rotate(-8deg); }
          75% { transform: translate(-50%, -50%) rotate(8deg); }
        }
        .game-wiggle { animation: wiggle 0.5s ease-in-out infinite; }

        @keyframes fadeUp {
          0% { opacity: 1; transform: translate(-50%, -50%); }
          100% { opacity: 0; transform: translate(-50%, calc(-50% - 30px)); }
        }
        .game-fade-up { animation: fadeUp 0.9s ease-out forwards; }

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
