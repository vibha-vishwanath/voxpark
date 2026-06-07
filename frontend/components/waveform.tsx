"use client"

import { useEffect, useState } from "react"

interface WaveformProps {
  isRecording: boolean
  className?: string
}

export function Waveform({ isRecording, className = "" }: WaveformProps) {
  const [bars, setBars] = useState<number[]>(Array(20).fill(0.2))

  useEffect(() => {
    if (!isRecording) {
      setBars(Array(20).fill(0.2))
      return
    }

    const interval = setInterval(() => {
      setBars((prev) =>
        prev.map(() => Math.random() * 0.8 + 0.2)
      )
    }, 100)

    return () => clearInterval(interval)
  }, [isRecording])

  return (
    <div className={`flex items-center justify-center gap-1 ${className}`}>
      {bars.map((height, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full bg-accent transition-all duration-100"
          style={{
            height: `${height * 48}px`,
            opacity: isRecording ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  )
}
