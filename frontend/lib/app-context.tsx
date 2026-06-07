"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

export type Language = "en" | "hi" | "es" | "fr"

export type TaskStatus = "not-started" | "in-progress" | "completed"

export type TaskId = "sustained-vowel" | "reading-passage" | "syllable-repetition" | "natural-speech" | "spontaneous-dialogue"

export interface TaskResult {
  taskId: TaskId
  metrics: Record<string, number>
  timestamp: Date
}

export interface UserInfo {
  name: string
  age: string
  sex: string
  language: Language
  allowResearchData: boolean
}

export interface AppState {
  currentScreen: string
  isLoggedIn: boolean
  userId: string | null
  userInfo: UserInfo | null
  taskStatuses: Record<TaskId, TaskStatus>
  taskResults: TaskResult[]
  language: Language
}

export interface BackendResults {
  acoustic_vowel: string | null
  telemonitoring_classification: string | null
  telemonitoring_regression: string | null
  readText: string | null
  spontaneousDialogue: string | null
  ddk: string | null
  naturalSpeech: string | null
}

interface AppContextType {
  state: AppState
  setScreen: (screen: string) => void
  login: (userId: string, profile?: { name?: string | null; age?: string | null; gender?: string | null }) => void
  logout: () => void
  setUserInfo: (info: UserInfo) => void
  setTaskStatus: (taskId: TaskId, status: TaskStatus) => void
  addTaskResult: (result: TaskResult) => void
  setLanguage: (lang: Language) => void
  restoreResults: (results: BackendResults) => void
}

const initialState: AppState = {
  currentScreen: "login",
  isLoggedIn: false,
  userId: null,
  userInfo: null,
  taskStatuses: {
    "sustained-vowel": "not-started",
    "reading-passage": "not-started",
    "syllable-repetition": "not-started",
    "natural-speech": "not-started",
    "spontaneous-dialogue": "not-started",
  },
  taskResults: [],
  language: "en",
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState)

  const setScreen = (screen: string) => {
    setState((prev) => ({ ...prev, currentScreen: screen }))
  }

  const login = (userId: string, profile?: { name?: string | null; age?: string | null; gender?: string | null }) => {
    const hasProfile = !!(profile?.name && profile?.age && profile?.gender)
    const userInfo = hasProfile ? {
      name: profile!.name!,
      age: profile!.age!,
      sex: profile!.gender!,
      language: state.language,
      allowResearchData: false,
    } : null
    setState((prev) => ({
      ...prev,
      isLoggedIn: true,
      userId,
      userInfo,
      currentScreen: hasProfile ? "dashboard" : "personal-info",
    }))
  }

  const logout = () => {
    setState(initialState)
  }

  const setUserInfo = (info: UserInfo) => {
    setState((prev) => ({ ...prev, userInfo: info, currentScreen: "dashboard" }))
  }

  const setTaskStatus = (taskId: TaskId, status: TaskStatus) => {
    setState((prev) => ({
      ...prev,
      taskStatuses: { ...prev.taskStatuses, [taskId]: status },
    }))
  }

  const addTaskResult = (result: TaskResult) => {
    setState((prev) => ({
      ...prev,
      taskResults: [...prev.taskResults, result],
    }))
  }

  const setLanguage = (lang: Language) => {
    setState((prev) => ({ ...prev, language: lang }))
  }

  const restoreResults = (results: BackendResults) => {
    const newStatuses: Record<TaskId, TaskStatus> = {
      "sustained-vowel": "not-started",
      "reading-passage": "not-started",
      "syllable-repetition": "not-started",
      "natural-speech": "not-started",
      "spontaneous-dialogue": "not-started",
    }
    const newResults: TaskResult[] = []

    // Sustained vowel uses acoustic_vowel + telemonitoring_classification + telemonitoring_regression
    if (results.acoustic_vowel || results.telemonitoring_classification || results.telemonitoring_regression) {
      newStatuses["sustained-vowel"] = "completed"
      newResults.push({ taskId: "sustained-vowel", metrics: {}, timestamp: new Date() })
    }
    if (results.readText) {
      newStatuses["reading-passage"] = "completed"
      newResults.push({ taskId: "reading-passage", metrics: {}, timestamp: new Date() })
    }
    if (results.ddk) {
      newStatuses["syllable-repetition"] = "completed"
      newResults.push({ taskId: "syllable-repetition", metrics: {}, timestamp: new Date() })
    }
    if (results.naturalSpeech) {
      newStatuses["natural-speech"] = "completed"
      newResults.push({ taskId: "natural-speech", metrics: {}, timestamp: new Date() })
    }
    if (results.spontaneousDialogue) {
      newStatuses["spontaneous-dialogue"] = "completed"
      newResults.push({ taskId: "spontaneous-dialogue", metrics: {}, timestamp: new Date() })
    }

    setState((prev) => ({
      ...prev,
      taskStatuses: newStatuses,
      taskResults: newResults,
    }))
  }

  return (
    <AppContext.Provider
      value={{
        state,
        setScreen,
        login,
        logout,
        setUserInfo,
        setTaskStatus,
        addTaskResult,
        setLanguage,
        restoreResults,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error("useApp must be used within AppProvider")
  }
  return context
}

export const translations: Record<Language, Record<string, string>> = {
  en: {
    login: "Login",
    username: "Username",
    password: "Password",
    continueAsGuest: "Continue as Guest",
    personalInfo: "Personal Information",
    name: "Name",
    age: "Age",
    language: "Language",
    allowResearch: "Allow anonymous data for research",
    continue: "Continue",
    dashboard: "Voice Screening Tasks",
    sustainedVowel: "Sustained Vowel",
    sustainedVowelDesc: "Hold a vowel sound as long as you can",
    readingPassage: "Reading Passage",
    readingPassageDesc: "Read a short paragraph aloud",
    syllableRepetition: "Fast Syllable Repetition",
    syllableRepetitionDesc: "Repeat syllables quickly",
    naturalSpeech: "Natural Speech",
    naturalSpeechDesc: "Speak freely for 20-30 seconds",
    spontaneousDialogue: "Spontaneous Dialogue",
    spontaneousDialogueDesc: "Engage in a brief conversational exchange",
    optional: "Optional",
    notStarted: "Not Started",
    completed: "Completed",
    startRecording: "Start Recording",
    stopRecording: "Stop Recording",
    skip: "Skip",
    retry: "Retry",
    watchDemo: "Watch Demo",
    analyzing: "Analyzing your voice...",
    results: "Results",
    summary: "Your Voice Screening Summary",
    disclaimer: "This is not a diagnosis. Consult a doctor if concerned.",
    pitchStability: "Pitch Stability",
    amplitudeStability: "Amplitude Stability",
    duration: "Duration",
    wordsPerMinute: "Words per Minute",
    pauses: "Pauses",
    fluencyScore: "Fluency Score",
    accuracy: "Accuracy",
    responseTime: "Response Time",
    rhythmConsistency: "Rhythm Consistency",
    stability: "Stability",
    speed: "Speed",
    control: "Control",
    confidence: "Confidence Level",
    low: "Low",
    medium: "Medium",
    high: "High",
    modelTransparency: "Model Transparency",
    whatWasMeasured: "What was measured",
    dataLimitations: "Data limitations",
    biasNote: "Bias note",
    experimental: "Experimental",
    help: "Help",
    back: "Back",
  },
  hi: {
    login: "लॉगिन",
    username: "उपयोगकर्ता नाम",
    password: "पासवर्ड",
    continueAsGuest: "अतिथि के रूप में जारी रखें",
    personalInfo: "व्यक्तिगत जानकारी",
    name: "नाम",
    age: "आयु",
    language: "भाषा",
    allowResearch: "शोध के लिए गुमनाम डेटा की अनुमति दें",
    continue: "जारी रखें",
    dashboard: "वॉइस स्क्रीनिंग कार्य",
    sustainedVowel: "स्थिर स्वर",
    sustainedVowelDesc: "एक स्वर ध्वनि को यथासंभव लंबे समय तक पकड़ें",
    readingPassage: "पढ़ना अनुच्छेद",
    readingPassageDesc: "एक छोटा पैराग्राफ जोर से पढ़ें",
    syllableRepetition: "तेज़ अक्षर दोहराव",
    syllableRepetitionDesc: "अक्षरों को जल्दी से दोहराएं",
    naturalSpeech: "प्राकृतिक भाषण",
    naturalSpeechDesc: "20-30 सेकंड के लिए स्वतंत्र रूप से बोलें",
    spontaneousDialogue: "स्वचालित संवाद",
    spontaneousDialogueDesc: "एक संक्षिप्त संवाद में भाग लें",
    optional: "वैकल्पिक",
    notStarted: "शुरू नहीं हुआ",
    completed: "पूर्ण",
    startRecording: "रिकॉर्डिंग शुरू करें",
    stopRecording: "रिकॉर्डिंग बंद करें",
    skip: "छोड़ें",
    retry: "पुनः प्रयास करें",
    watchDemo: "डेमो देखें",
    analyzing: "आपकी आवाज का विश्लेषण...",
    results: "परिणाम",
    summary: "आपका वॉइस स्क्रीनिंग सारांश",
    disclaimer: "यह निदान नहीं है। चिंता होने पर डॉक्टर से परामर्श करें।",
    pitchStability: "पिच स्थिरता",
    amplitudeStability: "आयाम स्थिरता",
    duration: "अवधि",
    wordsPerMinute: "प्रति मिनट शब्द",
    pauses: "विराम",
    fluencyScore: "प्रवाह स्कोर",
    accuracy: "सटीकता",
    responseTime: "प्रतिक्रिया ���मय",
    rhythmConsistency: "लय संगतता",
    stability: "स्थिरता",
    speed: "गति",
    control: "नियंत्रण",
    confidence: "विश्वास स्तर",
    low: "कम",
    medium: "मध्यम",
    high: "उच्च",
    modelTransparency: "मॉडल पारदर्शिता",
    whatWasMeasured: "क्या मापा गया",
    dataLimitations: "डेटा सीमाएं",
    biasNote: "पूर्वाग्रह नोट",
    experimental: "प्रयोगात्मक",
    help: "मदद",
    back: "वापस",
  },
  es: {
    login: "Iniciar sesión",
    username: "Usuario",
    password: "Contraseña",
    continueAsGuest: "Continuar como invitado",
    personalInfo: "Información Personal",
    name: "Nombre",
    age: "Edad",
    language: "Idioma",
    allowResearch: "Permitir datos anónimos para investigación",
    continue: "Continuar",
    dashboard: "Tareas de Evaluación de Voz",
    sustainedVowel: "Vocal Sostenida",
    sustainedVowelDesc: "Mantén un sonido vocal el mayor tiempo posible",
    readingPassage: "Lectura de Pasaje",
    readingPassageDesc: "Lee un párrafo corto en voz alta",
    syllableRepetition: "Repetición Rápida de Sílabas",
    syllableRepetitionDesc: "Repite sílabas rápidamente",
    naturalSpeech: "Habla Natural",
    naturalSpeechDesc: "Habla libremente durante 20-30 segundos",
    spontaneousDialogue: "Diálogo Espontáneo",
    spontaneousDialogueDesc: "Participa en un breve intercambio conversacional",
    optional: "Opcional",
    notStarted: "No Iniciado",
    completed: "Completado",
    startRecording: "Iniciar Grabación",
    stopRecording: "Detener Grabación",
    skip: "Omitir",
    retry: "Reintentar",
    watchDemo: "Ver Demo",
    analyzing: "Analizando tu voz...",
    results: "Resultados",
    summary: "Resumen de Evaluación de Voz",
    disclaimer: "Esto no es un diagnóstico. Consulte a un médico si tiene dudas.",
    pitchStability: "Estabilidad de Tono",
    amplitudeStability: "Estabilidad de Amplitud",
    duration: "Duración",
    wordsPerMinute: "Palabras por Minuto",
    pauses: "Pausas",
    fluencyScore: "Puntuación de Fluidez",
    accuracy: "Precisión",
    responseTime: "Tiempo de Respuesta",
    rhythmConsistency: "Consistencia de Ritmo",
    stability: "Estabilidad",
    speed: "Velocidad",
    control: "Control",
    confidence: "Nivel de Confianza",
    low: "Bajo",
    medium: "Medio",
    high: "Alto",
    modelTransparency: "Transparencia del Modelo",
    whatWasMeasured: "Qué se midió",
    dataLimitations: "Limitaciones de datos",
    biasNote: "Nota de sesgo",
    experimental: "Experimental",
    help: "Ayuda",
    back: "Atrás",
  },
  fr: {
    login: "Connexion",
    username: "Nom d'utilisateur",
    password: "Mot de passe",
    continueAsGuest: "Continuer en tant qu'invité",
    personalInfo: "Informations Personnelles",
    name: "Nom",
    age: "Âge",
    language: "Langue",
    allowResearch: "Autoriser les données anonymes pour la recherche",
    continue: "Continuer",
    dashboard: "Tâches d'Évaluation Vocale",
    sustainedVowel: "Voyelle Soutenue",
    sustainedVowelDesc: "Maintenez un son de voyelle le plus longtemps possible",
    readingPassage: "Lecture de Passage",
    readingPassageDesc: "Lisez un court paragraphe à haute voix",
    syllableRepetition: "Répétition Rapide de Syllabes",
    syllableRepetitionDesc: "Répétez les syllabes rapidement",
    naturalSpeech: "Parole Naturelle",
    naturalSpeechDesc: "Parlez librement pendant 20-30 secondes",
    spontaneousDialogue: "Dialogue Spontané",
    spontaneousDialogueDesc: "Participez à un bref échange conversationnel",
    optional: "Optionnel",
    notStarted: "Non Commencé",
    completed: "Terminé",
    startRecording: "Démarrer l'Enregistrement",
    stopRecording: "Arrêter l'Enregistrement",
    skip: "Passer",
    retry: "Réessayer",
    watchDemo: "Voir la Démo",
    analyzing: "Analyse de votre voix...",
    results: "Résultats",
    summary: "Résumé de l'Évaluation Vocale",
    disclaimer: "Ceci n'est pas un diagnostic. Consultez un médecin en cas de doute.",
    pitchStability: "Stabilité de Hauteur",
    amplitudeStability: "Stabilité d'Amplitude",
    duration: "Durée",
    wordsPerMinute: "Mots par Minute",
    pauses: "Pauses",
    fluencyScore: "Score de Fluidité",
    accuracy: "Précision",
    responseTime: "Temps de Réponse",
    rhythmConsistency: "Cohérence du Rythme",
    stability: "Stabilité",
    speed: "Vitesse",
    control: "Contrôle",
    confidence: "Niveau de Confiance",
    low: "Faible",
    medium: "Moyen",
    high: "Élevé",
    modelTransparency: "Transparence du Modèle",
    whatWasMeasured: "Ce qui a été mesuré",
    dataLimitations: "Limitations des données",
    biasNote: "Note de biais",
    experimental: "Expérimental",
    help: "Aide",
    back: "Retour",
  },
}
