"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface FallingObject {
  id: number
  x: number
  y: number
  type: string
  emoji: string
  points: number
}

interface CollectedObject {
  id: number
  x: number
  y: number
  emoji: string
  points: number
}

const OBJECT_TYPES = [
  { emoji: "👕", points: 10 },
  { emoji: "👖", points: 15 },
  { emoji: "👗", points: 20 },
  { emoji: "🧥", points: 25 },
  { emoji: "👠", points: 30 },
  { emoji: "💍", points: 50 },
  { emoji: "👑", points: 100 },
]

type GameProps = {
  analysisDone?: boolean 
  onRequestFinish?: () => void
  onRequestReturnToPicker?: () => void   
}

export default function FallingObjectsGame({
  analysisDone = false,
  onRequestFinish,
  onRequestReturnToPicker,
}: GameProps) {
  const [score, setScore] = useState(0)
  const [gameStarted, setGameStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [showFinishOverlay, setShowFinishOverlay] = useState(false) // ← новый стейт
  const [basketX, setBasketX] = useState(50)
  const [fallingObjects, setFallingObjects] = useState<FallingObject[]>([])
  const [collectedObjects, setCollectedObjects] = useState<CollectedObject[]>([])
  const [missedObjects, setMissedObjects] = useState(0)

  const gameAreaRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>()
  const lastSpawnRef = useRef<number>(0)
  const objectIdRef = useRef<number>(0)
  const lastUpdateRef = useRef<number>(0)
  const basketXRef = useRef<number>(50)

  const BASKET_WIDTH = 80
  const GAME_HEIGHT = 300
  const FALL_SPEED = 1.5
  const SPAWN_INTERVAL = 2000
  const MAX_MISSED = 3
  const TARGET_FPS = 60
  const FRAME_TIME = 1000 / TARGET_FPS

  useEffect(() => {
    if (analysisDone && gameStarted && !gameOver) setShowFinishOverlay(true)
  }, [analysisDone, gameStarted, gameOver])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!gameAreaRef.current || !gameStarted || gameOver) return

      const rect = gameAreaRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const clampedX = Math.max(5, Math.min(95, x))

      basketXRef.current = clampedX
      setBasketX(clampedX)
    },
    [gameStarted, gameOver],
  )

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!gameAreaRef.current || !gameStarted || gameOver) return

      e.preventDefault()
      const rect = gameAreaRef.current.getBoundingClientRect()
      const touch = e.touches[0]
      const x = ((touch.clientX - rect.left) / rect.width) * 100
      const clampedX = Math.max(5, Math.min(95, x))

      basketXRef.current = clampedX
      setBasketX(clampedX)
    },
    [gameStarted, gameOver],
  )

  const spawnObject = useCallback(() => {
    const objectType = OBJECT_TYPES[Math.floor(Math.random() * OBJECT_TYPES.length)]
    const newObject: FallingObject = {
      id: objectIdRef.current++,
      x: Math.random() * 80 + 10,
      y: -5,
      type: objectType.emoji,
      emoji: objectType.emoji,
      points: objectType.points,
    }

    setFallingObjects((prev) => [...prev, newObject])
  }, [])

  const checkCollision = useCallback((object: FallingObject) => {
    const objectCenterX = object.x
    const basketCenterX = basketXRef.current
    const basketHalfWidth = 10

    return Math.abs(objectCenterX - basketCenterX) < basketHalfWidth && object.y > 80 && object.y < 95
  }, [])

  const gameLoop = useCallback((timestamp: number) => {
  if (!gameStarted || gameOver) return;

  if (timestamp - lastUpdateRef.current < FRAME_TIME) {
    animationRef.current = requestAnimationFrame(gameLoop);
    return;
  }
  lastUpdateRef.current = timestamp;

  if (timestamp - lastSpawnRef.current > SPAWN_INTERVAL) {
    spawnObject();
    lastSpawnRef.current = timestamp;
  }

  setFallingObjects((prev) => {
    if (prev.length === 0) return prev;

    const updated = prev.map((obj) => ({ ...obj, y: obj.y + FALL_SPEED }));
    const remaining: FallingObject[] = [];
    let scoreIncrease = 0;
    let missedCount = 0;
    const newCollected: CollectedObject[] = [];

    updated.forEach((obj) => {
      if (checkCollision(obj)) {
        scoreIncrease += obj.points;
        newCollected.push({
          id: obj.id,
          x: basketXRef.current, // ← ключевая замена
          y: 80,
          emoji: obj.emoji,
          points: obj.points,
        });
      } else if (obj.y > 105) {
        missedCount++;
      } else {
        remaining.push(obj);
      }
    });

    if (scoreIncrease > 0) {
      setScore((prev) => prev + scoreIncrease);
      setCollectedObjects((prev) => [...prev, ...newCollected]);
      // оставить таймер можно, он не вызывает перерисовку <style>
      setTimeout(() => {
        setCollectedObjects((prev) =>
          prev.filter((collected) => !newCollected.some((nc) => nc.id === collected.id)),
        );
      }, 800);
    }

    if (missedCount > 0) {
      setMissedObjects((prev) => {
        const newMissed = prev + missedCount;
        if (newMissed >= MAX_MISSED) setGameOver(true);
        return newMissed;
      });
    }

    return remaining;
  });

  animationRef.current = requestAnimationFrame(gameLoop);
}, [gameStarted, gameOver, spawnObject, checkCollision]); 

  const startGame = () => {
    setScore(0)
    setGameStarted(true)
    setGameOver(false)
    setFallingObjects([])
    setCollectedObjects([])
    setMissedObjects(0)
    setBasketX(50)
    basketXRef.current = 50
    lastSpawnRef.current = 0
    lastUpdateRef.current = 0
    objectIdRef.current = 0
  }

  const resetGame = () => {
    setGameStarted(false)
    setGameOver(false)
    setFallingObjects([])
    setCollectedObjects([])
  }

  useEffect(() => {
    if (gameStarted && !gameOver) {
      animationRef.current = requestAnimationFrame(gameLoop)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [gameStarted, gameOver, gameLoop])

  useEffect(() => {
    const gameArea = gameAreaRef.current
    if (!gameArea || !gameStarted || gameOver) return

    gameArea.addEventListener("mousemove", handleMouseMove)
    gameArea.addEventListener("touchmove", handleTouchMove, { passive: false })

    return () => {
      gameArea.removeEventListener("mousemove", handleMouseMove)
      gameArea.removeEventListener("touchmove", handleTouchMove)
    }
  }, [gameStarted, gameOver, handleMouseMove, handleTouchMove])

  return (
    <div className="w-full">
      {!gameStarted ? (
        <div
          className="rounded-xl border border-purple-200/50 bg-gradient-to-b from-purple-100/50 to-pink-100/50 flex items-center justify-center text-center p-6"
          style={{ height: `${GAME_HEIGHT}px`, touchAction: "manipulation" }}
        >
          <div className="space-y-4 w-full max-w-md mx-auto">
            <p className="text-slate-600 leading-relaxed">
              Собирайте модную одежду в корзину! Управляйте мышкой или касанием.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                onPointerUp={startGame}
                className="w-full px-6 py-3 bg-purple-700 hover:bg-purple-800 text-white font-medium rounded-lg shadow-lg transition-colors duration-200 border-0"
              >
                Начать игру
              </button>

              {/* Возврат к выбору (но НЕ показ цитат здесь) */}
              <button
                onPointerUp={onRequestReturnToPicker}
                className="w-full px-6 py-3 bg-white hover:bg-slate-50 text-purple-700 font-medium rounded-lg shadow-lg transition-colors duration-200 border"
              >
                Назад к выбору
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={gameAreaRef}
          className="relative bg-gradient-to-b from-purple-100/50 to-pink-100/50 rounded-xl overflow-hidden cursor-none select-none border border-purple-200/50"
          style={{ height: `${GAME_HEIGHT}px`,touchAction: "none" }}
        >
          <div className="absolute top-3 left-3 right-3 flex justify-between items-center z-10">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1 shadow-sm">
              <span className="text-sm font-bold text-purple-600">{score}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1 shadow-sm flex items-center gap-1">
                {[...Array(3)].map((_, i) => (
                  <span key={i} className="text-sm">
                    {i < MAX_MISSED - missedObjects ? "❤️" : "🤍"}
                  </span>
                ))}
              </div>

              {/* Кнопка завершить/выйти в правом верхнем углу */}
              <button
                onPointerUp={onRequestReturnToPicker}
                title="Вернуться к выбору"
                className="bg-white/90 hover:bg-white text-purple-700 font-medium rounded-lg shadow-sm px-3 py-1 border transition-colors"
              >
                Назад
              </button>
              <button
                onPointerUp={onRequestFinish}
                title="Завершить игру и показать вещи"
                className="bg-purple-700 hover:bg-purple-800 text-white font-medium rounded-lg shadow-sm px-3 py-1 border-0 transition-colors"
              >
                Завершить
              </button>
            </div>
          </div>

          {fallingObjects.map((obj) => (
            <div
              key={obj.id}
              className="absolute text-2xl will-change-transform"
              style={{
                left: `${obj.x}%`,
                top: `${obj.y}%`,
                transform: "translate(-50%, -50%)",
                transition: "none",
              }}
            >
              {obj.emoji}
            </div>
          ))}

          {collectedObjects.map((obj) => (
            <div
              key={`collected-${obj.id}`}
              className="absolute text-sm font-bold text-purple-600 animate-fade-in-up"
              style={{
                  left: `${obj.x}%`,
                  top: `${obj.y}%`,
                  transform: "translate(-50%, -50%)",
              }}
            >
              +{obj.points}
            </div>
          ))}

          <div
            className="absolute bottom-3 text-3xl will-change-transform"
            style={{
              left: `${basketX}%`,
              transform: "translateX(-50%)",
            }}
          >
            🛍️
          </div>

          {gameOver && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white p-6 rounded-xl text-center space-y-4 shadow-2xl">
                <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Игра окончена!
                </h2>
                <p className="text-slate-600">
                  Финальный счёт: <span className="font-bold text-purple-600">{score}</span>
                </p>
                <button
                  onClick={resetGame}
                  className="w-full px-6 py-3 bg-purple-700 hover:bg-purple-800 text-white font-medium rounded-lg shadow-lg transition-colors duration-200 border-0"
                >
                  Играть снова
                </button>
              </div>
            </div>
          )}

          {showFinishOverlay && !gameOver && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20">
              <div className="bg-white p-6 rounded-xl text-center space-y-4 shadow-2xl max-w-xs">
                <h2 className="text-lg font-bold text-purple-700">
                  Анализ завершён
                </h2>
                <p className="text-slate-600">
                  Хотите закончить игру и посмотреть найденные вещи?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onPointerUp={() => { setShowFinishOverlay(false); onRequestFinish?.() }}
                    className="w-full px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-medium rounded-lg transition-colors"
                  >
                    Да
                  </button>
                  <button
                    onPointerUp={() => setShowFinishOverlay(false)}
                    className="w-full px-4 py-2 bg-white hover:bg-slate-50 text-purple-700 font-medium rounded-lg border transition-colors"
                  >
                    Продолжить
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
