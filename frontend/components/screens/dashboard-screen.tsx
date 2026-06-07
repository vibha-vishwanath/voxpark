"use client"

import { useEffect } from "react"
import { useApp, translations, type TaskId, type TaskStatus, API_URL, type BackendResults } from "@/lib/app-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Volume2, BookOpen, Zap, MessageSquare, MessagesSquare, CheckCircle, Circle, LogOut } from "lucide-react"

interface TaskCardProps {
  id: TaskId
  title: string
  description: string
  icon: React.ReactNode
  status: TaskStatus
  isOptional?: boolean
  onStart: () => void
  animationDelay: number
}

function TaskCard({ id, title, description, icon, status, isOptional, onStart, animationDelay }: TaskCardProps) {
  const { state } = useApp()
  const t = translations[state.language]

  return (
    <Card
      className={`dashboard-card dashboard-card-animate cursor-pointer border transition-all ${
        status === "completed"
          ? "border-[#385D8D]/30 bg-[#385D8D]/5"
          : status === "in-progress"
          ? "border-[#85B0C1] bg-[#85B0C1]/10"
          : "border-border bg-card"
      }`}
      style={{ animationDelay: `${animationDelay}ms` }}
      onClick={onStart}
    >
      <CardHeader className="flex flex-row items-center gap-4 pb-2">
        <div className="icon-badge flex h-12 w-12 items-center justify-center rounded-full">
          <div className="text-white">
            {icon}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg text-foreground">{title}</CardTitle>
            {isOptional && (
              <span className="optional-badge rounded-full px-2.5 py-0.5 text-xs font-medium">
                {t.optional}
              </span>
            )}
          </div>
          <CardDescription className="text-muted-foreground">{description}</CardDescription>
        </div>
        <div className="flex flex-col gap-1">
          {status === "completed" ? (
            <div className="progress-dot-active h-2.5 w-2.5 rounded-full" />
          ) : (
            <div className="progress-dot-inactive h-2.5 w-2.5 rounded-full" />
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2">
          {status === "completed" ? (
            <>
              <CheckCircle className="h-5 w-5 text-[#385D8D]" />
              <span className="text-sm font-medium text-[#385D8D]">{t.completed}</span>
            </>
          ) : (
            <>
              <Circle className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t.notStarted}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function DashboardScreen() {
  const { state, setScreen, logout, restoreResults } = useApp()
  const t = translations[state.language]

  // Fetch existing test results from backend on mount to restore completion status
  useEffect(() => {
    if (!state.userId) return
    const controller = new AbortController()

    fetch(`${API_URL}/get_results?user_id=${encodeURIComponent(state.userId)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch results")
        return res.json()
      })
      .then((data) => {
        if (data.results) {
          restoreResults(data.results as BackendResults)
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          // Silently fail — user can still take tests manually
        }
      })

    return () => controller.abort()
  }, [state.userId])

  const tasks: {
    id: TaskId
    titleKey: keyof typeof t
    descKey: keyof typeof t
    icon: React.ReactNode
    isOptional?: boolean
  }[] = [
    {
      id: "sustained-vowel",
      titleKey: "sustainedVowel",
      descKey: "sustainedVowelDesc",
      icon: <Volume2 className="h-6 w-6" />,
    },
    {
      id: "reading-passage",
      titleKey: "readingPassage",
      descKey: "readingPassageDesc",
      icon: <BookOpen className="h-6 w-6" />,
    },
    {
      id: "syllable-repetition",
      titleKey: "syllableRepetition",
      descKey: "syllableRepetitionDesc",
      icon: <Zap className="h-6 w-6" />,
    },
    {
      id: "natural-speech",
      titleKey: "naturalSpeech",
      descKey: "naturalSpeechDesc",
      icon: <MessageSquare className="h-6 w-6" />,
      isOptional: true,
    },
    {
      id: "spontaneous-dialogue",
      titleKey: "spontaneousDialogue",
      descKey: "spontaneousDialogueDesc",
      icon: <MessagesSquare className="h-6 w-6" />,
      isOptional: true,
    },
  ]

  const completedCount = Object.values(state.taskStatuses).filter((s) => s === "completed").length
  const requiredTasks = tasks.filter((t) => !t.isOptional)
  const allRequiredDone = requiredTasks.every((task) => state.taskStatuses[task.id] === "completed")

  const handleStartTask = (taskId: TaskId) => {
    setScreen(`task-${taskId}`)
  }

  const handleViewSummary = () => {
    setScreen("summary")
  }

  return (
    <div className="dashboard-bg flex min-h-screen flex-col">
      <Header step={2} totalSteps={4} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-lg">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t.dashboard}</h1>
              <p className="text-sm text-muted-foreground">
                {completedCount} of {tasks.length} tasks completed
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-5 w-5" />
              <span className="sr-only">Logout</span>
            </Button>
          </div>

          <div className="space-y-4">
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                id={task.id}
                title={String(t[task.titleKey])}
                description={String(t[task.descKey])}
                icon={task.icon}
                status={state.taskStatuses[task.id]}
                isOptional={task.isOptional}
                onStart={() => handleStartTask(task.id)}
                animationDelay={index * 120}
              />
            ))}
          </div>

          {allRequiredDone && (
            <div className="mt-6 dashboard-card-animate" style={{ animationDelay: `${tasks.length * 120}ms` }}>
              <Button
                onClick={handleViewSummary}
                className="h-14 w-full text-lg font-semibold bg-[#385D8D] text-white hover:bg-[#385D8D]/90"
              >
                View Summary Results
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
