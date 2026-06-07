"use client"

import { useState } from "react"
import { useApp, translations, API_URL, type UserInfo } from "@/lib/app-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { User, Loader2 } from "lucide-react"

export function PersonalInfoScreen() {
  const { state, setUserInfo, setScreen } = useApp()
  const t = translations[state.language]
  const [name, setName] = useState("")
  const [age, setAge] = useState("")
  const [sex, setSex] = useState("")

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleContinue = async () => {
    if (!name || !age || !sex) {
      setError("Please fill out all fields")
      return
    }
    
    setError("")
    setIsLoading(true)

    try {
      const userInfo: UserInfo = {
        name,
        age,
        sex,
        language: state.language,
        allowResearchData: false,
      }

      if (state.userId) {
        const res = await fetch(`${API_URL}/update_profile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ user_id: state.userId, name, age, sex }),
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ msg: "Unknown server error" }))
          throw new Error(errData.msg || `Server error: ${res.status}`)
        }
      } else {
        throw new Error("Not logged in — please sign in again")
      }

      setUserInfo(userInfo)
      setScreen("dashboard")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save profile. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    setScreen("login")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header showBack onBack={handleBack} step={1} totalSteps={4} />
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md border-border bg-card shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <User className="h-10 w-10 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">{t.personalInfo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                {t.name}
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.name}
                className="h-12 text-lg bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="age" className="text-sm font-medium text-foreground">
                {t.age}
              </label>
              <Input
                id="age"
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder={t.age}
                className="h-12 text-lg bg-input border-border"
                min="1"
                max="120"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Sex
              </label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={sex === "0" ? "default" : "outline"}
                  className={`flex-1 h-12 text-base ${
                    sex === "0"
                      ? "bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                  onClick={() => setSex("0")}
                >
                  Male
                </Button>
                <Button
                  type="button"
                  variant={sex === "1" ? "default" : "outline"}
                  className={`flex-1 h-12 text-base ${
                    sex === "1"
                      ? "bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                  onClick={() => setSex("1")}
                >
                  Female
                </Button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button
              onClick={handleContinue}
              disabled={!name || !age || !sex || isLoading}
              className="h-12 w-full text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Saving...
                </>
              ) : (
                t.continue
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
