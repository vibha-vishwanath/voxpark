"use client"

import { useState } from "react"
import { useApp, translations, API_URL } from "@/lib/app-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mic, Loader2 } from "lucide-react"

export function LoginScreen() {
  const { state, login } = useApp()
  const t = translations[state.language]
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter both email and password")
      return
    }
    setError("")
    setIsLoading(true)
    try {
      const res = await fetch(`${API_URL}/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        login(data.id, { name: data.name, age: data.age, gender: data.gender })
      } else {
        setError(data.msg || "Login failed")
      }
    } catch {
      setError("Could not connect to the server")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md border-border bg-card shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary">
              <Mic className="h-10 w-10 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">VoiceScreen</CardTitle>
            <CardDescription className="text-muted-foreground">
              Early Parkinsonism voice screening
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="h-12 text-lg bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                {t.password}
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.password}
                className="h-12 text-lg bg-input border-border"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={isLoading}
              className="h-12 w-full text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                t.login
              )}
            </Button>

          </CardContent>
        </Card>
        <p className="mt-6 max-w-md text-center text-sm text-muted-foreground">
          Quick screening accessible from home. Works across languages with transparency about limitations.
        </p>
      </main>
    </div>
  )
}
