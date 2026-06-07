"use client"

import { AppProvider, useApp, type TaskId } from "@/lib/app-context"
import { LoginScreen } from "@/components/screens/login-screen"
import { PersonalInfoScreen } from "@/components/screens/personal-info-screen"
import { DashboardScreen } from "@/components/screens/dashboard-screen"
import { TestFlowScreen } from "@/components/screens/test-flow-screen"
import { SummaryScreen } from "@/components/screens/summary-screen"

function AppContent() {
  const { state } = useApp()

  // Route based on current screen
  if (state.currentScreen === "login") {
    return <LoginScreen />
  }

  if (state.currentScreen === "personal-info") {
    return <PersonalInfoScreen />
  }

  if (state.currentScreen === "dashboard") {
    return <DashboardScreen />
  }

  if (state.currentScreen === "summary") {
    return <SummaryScreen />
  }

  // Handle task screens
  if (state.currentScreen.startsWith("task-")) {
    const taskId = state.currentScreen.replace("task-", "") as TaskId
    return <TestFlowScreen taskId={taskId} />
  }

  // Default to login
  return <LoginScreen />
}

export default function Page() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
