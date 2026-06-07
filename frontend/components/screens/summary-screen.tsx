"use client"

import { useState, useEffect } from "react"
import { useApp, translations, API_URL } from "@/lib/app-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { AlertTriangle, CheckCircle, Info, Loader2, RotateCcw } from "lucide-react"

export function SummaryScreen() {
  const { state, setScreen, logout } = useApp()
  const t = translations[state.language]

  const [report, setReport] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  // Fetch the final report from the backend
  useEffect(() => {
    if (!state.userId) {
      setIsLoading(false)
      setError("No user session found. Please log in again.")
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setError("")

    fetch(`${API_URL}/final_report?user_id=${encodeURIComponent(state.userId)}`, {
      method: "GET",
      headers: { 
        "user-id": state.userId,
        "user_id": state.userId 
      },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch report")
        return res.text()
      })
      .then((text) => {
        setReport(text)
        setIsLoading(false)
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError("Could not generate the report. Please ensure the backend is running.")
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [state.userId])

  const handleBack = () => {
    setScreen("dashboard")
  }

  const handleStartOver = () => {
    logout()
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header showBack onBack={handleBack} step={4} totalSteps={4} />
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-lg space-y-6">
          {/* Main Report Card */}
          <Card className="border-border bg-card shadow-lg overflow-hidden">
            <div className="bg-primary/10 p-6 text-center">
              <CardTitle className="text-2xl font-bold text-foreground">{t.summary}</CardTitle>
              <div className="mt-3">
                <Badge className="text-sm px-4 py-1 bg-primary text-primary-foreground">
                  AI-Generated Report
                </Badge>
              </div>
            </div>
            <CardContent className="p-6">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <p className="text-lg font-medium text-foreground">Generating your report...</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Analyzing all test results with AI...
                  </p>
                </div>
              ) : error ? (
                <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              ) : (
                <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
                  {report}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Disclaimer */}
          <Card className="border-chart-1/30 bg-chart-1/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-chart-1 mt-0.5" />
              <p className="text-sm text-foreground">{t.disclaimer}</p>
            </CardContent>
          </Card>

          {/* Model Transparency Card */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-accent" />
                <CardTitle className="text-lg text-foreground">{t.modelTransparency}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="measured" className="border-border">
                  <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
                    {t.whatWasMeasured}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Jitter - voice frequency variations</li>
                      <li>Shimmer - voice amplitude variations</li>
                      <li>MFCC patterns - spectral characteristics</li>
                      <li>Speech rate and pause patterns</li>
                      <li>Articulation clarity metrics</li>
                      <li>DDK rate and rhythm consistency</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="limitations" className="border-border">
                  <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
                    {t.dataLimitations}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Trained primarily on English speech data</li>
                      <li>Performance may vary across languages and accents</li>
                      <li>Limited training data from certain age groups</li>
                      <li>Model accuracy varies with recording quality</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="bias" className="border-border">
                  <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
                    {t.biasNote}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Background noise can significantly affect results</li>
                      <li>Different microphones produce varying results</li>
                      <li>Time of day may influence voice characteristics</li>
                      <li>Emotional state can impact speech patterns</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Completed Tasks Summary */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-foreground">Completed Tests</CardTitle>
              <CardDescription className="text-muted-foreground">
                {state.taskResults.length} of 5 tests completed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {state.taskResults.map((result, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-lg bg-muted p-3"
                  >
                    <CheckCircle className="h-5 w-5 text-accent" />
                    <span className="text-sm font-medium text-foreground capitalize">
                      {result.taskId.replace(/-/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleStartOver}
              className="h-14 gap-2 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RotateCcw className="h-5 w-5" />
              Start New Screening
            </Button>
            <Button
              variant="outline"
              onClick={handleBack}
              className="h-12 border-border"
            >
              {t.back} to Dashboard
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
