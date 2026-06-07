"use client"

import { useApp, translations, type Language } from "@/lib/app-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Globe, HelpCircle, ArrowLeft } from "lucide-react"

interface HeaderProps {
  showBack?: boolean
  onBack?: () => void
  step?: number
  totalSteps?: number
}

const languageNames: Record<Language, string> = {
  en: "English",
  hi: "हिंदी",
  es: "Español",
  fr: "Français",
}

export function Header({ showBack, onBack, step, totalSteps }: HeaderProps) {
  const { state, setLanguage } = useApp()
  const t = translations[state.language]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {showBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="text-foreground">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">{t.back}</span>
            </Button>
          )}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">VS</span>
            </div>
            <span className="text-lg font-semibold text-foreground">VoiceScreen</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {step !== undefined && totalSteps !== undefined && (
            <div className="mr-2 flex items-center gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i < step ? "bg-accent" : i === step ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-foreground">
                <Globe className="h-5 w-5" />
                <span className="sr-only">Change language</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(languageNames) as Language[]).map((lang) => (
                <DropdownMenuItem
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={state.language === lang ? "bg-muted" : ""}
                >
                  {languageNames[lang]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="text-foreground">
            <HelpCircle className="h-5 w-5" />
            <span className="sr-only">{t.help}</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
