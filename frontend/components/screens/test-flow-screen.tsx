"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useApp, translations, type TaskId, type TaskResult, API_URL } from "@/lib/app-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Waveform } from "@/components/waveform"
import { Mic, MicOff, Play, RotateCcw, SkipForward, CheckCircle, Loader2 } from "lucide-react"

type TestStep = "instructions" | "recording" | "analyzing" | "results"

interface TaskConfig {
  id: TaskId
  titleKey: keyof ReturnType<typeof getTranslations>
  visualCue: string
  instruction: string
  demoAvailable: boolean
  minDuration: number
  maxDuration: number
  /** Backend route to call for prediction */
  backendRoute: string
  /** Backend route to fetch dynamic prompt text (if any) */
  textGenRoute?: string
  /** Extra form fields needed by the backend */
  extraFields?: string[]
}

function getTranslations(language: string) {
  return translations[language as keyof typeof translations]
}

const taskConfigs: Record<TaskId, TaskConfig> = {
  "sustained-vowel": {
    id: "sustained-vowel",
    titleKey: "sustainedVowel",
    visualCue: "A",
    instruction: "Hold this sound as long and steady as you can",
    demoAvailable: true,
    minDuration: 3,
    maxDuration: 15,
    backendRoute: "/acoustic_vowel",
    extraFields: ["sex"],
  },
  "reading-passage": {
    id: "reading-passage",
    titleKey: "readingPassage",
    visualCue: "Loading passage...",
    instruction: "Read the passage aloud at your normal pace",
    demoAvailable: true,
    minDuration: 5,
    maxDuration: 30,
    backendRoute: "/readText",
    textGenRoute: "/text_generation",
  },
  "syllable-repetition": {
    id: "syllable-repetition",
    titleKey: "syllableRepetition",
    visualCue: "PA-TA-KA",
    instruction: "Repeat these syllables as quickly and clearly as you can",
    demoAvailable: true,
    minDuration: 5,
    maxDuration: 20,
    backendRoute: "/ddk",
  },
  "natural-speech": {
    id: "natural-speech",
    titleKey: "naturalSpeech",
    visualCue: "Loading prompt...",
    instruction: "Read the following passage aloud at your natural pace",
    demoAvailable: false,
    minDuration: 10,
    maxDuration: 45,
    backendRoute: "/natural_speech",
    textGenRoute: "/natural_speech_para",
    extraFields: ["original_text"],
  },
  "spontaneous-dialogue": {
    id: "spontaneous-dialogue",
    titleKey: "spontaneousDialogue",
    visualCue: "Loading dialogue...",
    instruction: "Read Speaker 1's lines aloud in a natural conversational tone",
    demoAvailable: false,
    minDuration: 10,
    maxDuration: 45,
    backendRoute: "/spontaneousDialogue",
    textGenRoute: "/spon_dia",
  },
}

interface MetricDisplayProps {
  label: string
  value: string | number
  unit?: string
}

function MetricDisplay({ label, value, unit = "" }: MetricDisplayProps) {
  return (
    <div className="rounded-lg bg-muted p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-lg font-bold text-primary">
          {typeof value === "number" ? value.toFixed(2) : value}{unit}
        </span>
      </div>
    </div>
  )
}

async function convertBlobToWav(blob: Blob): Promise<Blob> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  const channels: Float32Array[] = [];
  for (let i = 0; i < numOfChan; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  let offset = 0;
  while (offset < audioBuffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

interface TestFlowScreenProps {
  taskId: TaskId
}

export function TestFlowScreen({ taskId }: TestFlowScreenProps) {
  const { state, setScreen, setTaskStatus, addTaskResult } = useApp()
  const t = translations[state.language]
  const config = taskConfigs[taskId]

  const [step, setStep] = useState<TestStep>("instructions")
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [metrics, setMetrics] = useState<Record<string, string | number>>({})
  const [dynamicText, setDynamicText] = useState<string>(config.visualCue)
  const [analysisError, setAnalysisError] = useState("")
  const [isLoadingText, setIsLoadingText] = useState(false)

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // Always-current ref to state so memoized callbacks don't capture stale closures
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  // Parsed dialogue turns for spontaneous-dialogue tasks
  const [dialogueTurns, setDialogueTurns] = useState<{ speaker: string; line: string }[]>([])

  // Fetch dynamic text from backend on mount (for reading-passage, natural-speech, spontaneous-dialogue)
  useEffect(() => {
    if (!config.textGenRoute) return
    setIsLoadingText(true)
    const controller = new AbortController()

    fetch(`${API_URL}${config.textGenRoute}`, { signal: controller.signal })
      .then((res) => res.text())
      .then((text) => {
        // For spontaneous-dialogue, the backend returns a JSON object with speaker keys
        if (taskId === "spontaneous-dialogue") {
          try {
            const parsed = JSON.parse(text) as Record<string, string>
            const turns = Object.entries(parsed).map(([speaker, line]) => ({ speaker, line }))
            setDialogueTurns(turns)
            // Set plain text version for sending to backend
            setDynamicText(turns.map(t => `${t.speaker}: ${t.line}`).join("\n"))
          } catch {
            setDynamicText(text)
          }
        } else {
          setDynamicText(text)
        }
        setIsLoadingText(false)
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setDynamicText(config.visualCue)
          setIsLoadingText(false)
        }
      })

    return () => controller.abort()
  }, [config.textGenRoute, config.visualCue])

  const handleBack = useCallback(() => {
    // Clean up recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    setScreen("dashboard")
  }, [setScreen])

  const startRecording = async () => {
    setAnalysisError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(250) // Collect data every 250ms

      setStep("recording")
      setIsRecording(true)
      setRecordingTime(0)
      setTaskStatus(taskId, "in-progress")
    } catch {
      setAnalysisError("Could not access microphone. Please grant permission and try again.")
    }
  }

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    setIsRecording(false)
    setStep("analyzing")

    // Wait a short moment for final data chunks
    setTimeout(async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
      try {
        const wavBlob = await convertBlobToWav(audioBlob)
        // Use ref to always read the latest state, not the stale closure
        await sendToBackendWithState(wavBlob, stateRef.current)
      } catch (err) {
        console.error("WAV conversion error:", err)
        setAnalysisError("Failed to process audio on the frontend.")
        setStep("instructions")
      }
    }, 500)
  }, [])

  // Separated so stopRecording can pass the always-fresh stateRef.current
  const sendToBackendWithState = async (audioBlob: Blob, currentState: typeof state) => {
    try {
      const formData = new FormData()
      formData.append("audio", audioBlob, "recording.wav")
      if (currentState.userId) formData.append("user_id", currentState.userId)

      // Add extra fields based on task config
      if (config.extraFields?.includes("sex") && currentState.userInfo) {
        formData.append("sex", currentState.userInfo.sex || "0")
      }
      if (config.extraFields?.includes("original_text")) {
        formData.append("original_text", dynamicText)
      }

      // For sustained-vowel, we run multiple models
      if (taskId === "sustained-vowel") {
        await runSustainedVowelModels(audioBlob, currentState)
        return
      }

      const res = await fetch(`${API_URL}${config.backendRoute}`, {
        method: "POST",
        body: formData,
      })

      if (taskId === "natural-speech") {
        const text = await res.text()
        setMetrics({ analysis: text })
      } else {
        const data = await res.json()
        if (taskId === "syllable-repetition") {
          setMetrics({
            verdict: data.verdict,
            score: data.score,
            ddk_rate: data.features?.ddk_rate ?? 0,
            jitter: data.features?.jitter ?? 0,
            shimmer: data.features?.shimmer ?? 0,
            hnr: data.features?.hnr ?? 0,
          })
        } else {
          const pred = data.prediction
          setMetrics({
            prediction: Array.isArray(pred) ? pred[0] : pred,
            result: Array.isArray(pred) && pred[0] === 1 ? "Abnormality detected" : "No significant abnormality",
          })
        }
      }
      setStep("results")
    } catch (err) {
      console.error("sendToBackend error:", err)
      setAnalysisError("Analysis failed. Please check that the backend server is running and try again.")
      setStep("instructions")
    }
  }

  const sendToBackend = async (audioBlob: Blob) => {
    await sendToBackendWithState(audioBlob, state)
  }

  const runSustainedVowelModels = async (audioBlob: Blob, currentState: typeof state) => {
    try {
      // Run acoustic_vowel
      const formAV = new FormData()
      formAV.append("audio", audioBlob, "recording.wav")
      formAV.append("sex", currentState.userInfo?.sex || "0")
      if (currentState.userId) formAV.append("user_id", currentState.userId)
      const resAV = await fetch(`${API_URL}/acoustic_vowel`, { method: "POST", body: formAV })
      const dataAV = await resAV.json()

      // Run telemonitoring_classification
      const formTC = new FormData()
      formTC.append("audio", audioBlob, "recording.wav")
      if (currentState.userId) formTC.append("user_id", currentState.userId)
      const resTC = await fetch(`${API_URL}/telemonitoring_classification`, { method: "POST", body: formTC })
      const dataTC = await resTC.json()

      // Run telemonitoring_regression
      const formTR = new FormData()
      formTR.append("audio", audioBlob, "recording.wav")
      formTR.append("age", currentState.userInfo?.age || "50")
      formTR.append("sex", currentState.userInfo?.sex || "0")
      if (currentState.userId) formTR.append("user_id", currentState.userId)
      const resTR = await fetch(`${API_URL}/telemonitoring_regression`, { method: "POST", body: formTR })
      const dataTR = await resTR.json()

      setMetrics({
        "Acoustic Vowel": Array.isArray(dataAV.prediction) && dataAV.prediction[0] === 1 ? "Abnormality detected" : "Normal",
        "Classification": Array.isArray(dataTC.prediction) && dataTC.prediction[0] === 1 ? "Parkinsonian pattern detected" : "No pattern detected",
        "Motor UPDRS": Array.isArray(dataTR.prediction) ? (dataTR.prediction[0]?.toFixed?.(2) ?? dataTR.prediction[0]) : dataTR.prediction,
      })
      setStep("results")
    } catch (err) {
      console.error("Sustained vowel error:", err)
      setAnalysisError("Analysis failed. Please check the backend server and try again.")
      setStep("instructions")
    }
  }

  const handleRetry = () => {
    setStep("instructions")
    setRecordingTime(0)
    setMetrics({})
    setAnalysisError("")
  }

  const handleSkip = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    setScreen("dashboard")
  }

  const handleContinue = () => {
    const result: TaskResult = {
      taskId,
      metrics: Object.fromEntries(
        Object.entries(metrics).map(([k, v]) => [k, typeof v === "number" ? v : 0])
      ),
      timestamp: new Date(),
    }
    addTaskResult(result)
    setTaskStatus(taskId, "completed")
    setScreen("dashboard")
  }

  useEffect(() => {
    if (!isRecording) return

    const interval = setInterval(() => {
      setRecordingTime((prev) => {
        if (prev >= config.maxDuration) {
          stopRecording()
          return prev
        }
        return prev + 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isRecording, config.maxDuration, stopRecording])

  const displayCue = config.textGenRoute ? dynamicText : config.visualCue

  // Renders dialogue turns for spontaneous-dialogue, plain text for everything else
  const renderCueContent = (maxH = "max-h-72") => {
    if (taskId === "spontaneous-dialogue" && dialogueTurns.length > 0) {
      return (
        <div className={`w-full ${maxH} overflow-y-auto space-y-3 pr-1`}>
          {dialogueTurns.map((turn, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm leading-relaxed ${
                turn.speaker === "speaker1"
                  ? "bg-primary/20 text-foreground ml-0 mr-8"
                  : "bg-muted text-muted-foreground ml-8 mr-0"
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-wide block mb-1 opacity-60">
                {turn.speaker === "speaker1" ? "You (Speaker 1)" : "Speaker 2"}
              </span>
              {turn.line}
            </div>
          ))}
        </div>
      )
    }
    if (displayCue.length <= 10) {
      return <span className="text-6xl font-bold text-primary">{displayCue}</span>
    }
    return <p className={`text-center text-base leading-relaxed text-foreground ${maxH} overflow-y-auto`}>{displayCue}</p>
  }

  const renderInstructions = () => (
    <Card className="border-border bg-card shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-foreground">
          {String(t[config.titleKey as keyof typeof t])}
        </CardTitle>
        <CardDescription className="text-muted-foreground">{config.instruction}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {analysisError && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {analysisError}
          </div>
        )}

        <div className="flex items-center justify-center rounded-xl bg-primary/10 p-5">
          {isLoadingText ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Generating prompt...</span>
            </div>
          ) : renderCueContent("max-h-72")}
        </div>

        <div className="flex flex-col gap-3">
          {config.demoAvailable && (
            <Button variant="outline" className="h-12 gap-2 border-border">
              <Play className="h-5 w-5" />
              {t.watchDemo}
            </Button>
          )}
          <Button
            onClick={startRecording}
            disabled={isLoadingText}
            className="h-14 gap-2 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Mic className="h-6 w-6" />
            {t.startRecording}
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const renderRecording = () => (
    <Card className="border-border bg-card shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-foreground">
          {String(t[config.titleKey as keyof typeof t])}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-center rounded-xl bg-primary/10 p-8">
          {displayCue.length <= 10 ? (
            <span className="text-6xl font-bold text-primary">{displayCue}</span>
          ) : (
            <p className="text-center text-base leading-relaxed text-foreground max-h-60 overflow-y-auto">{displayCue}</p>
          )}
        </div>

        <Waveform isRecording={isRecording} className="h-12" />

        <div className="text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <div className="h-3 w-3 animate-pulse rounded-full bg-destructive" />
            <span className="text-lg font-medium text-destructive">REC</span>
          </div>
          <span className="text-4xl font-bold text-foreground">{recordingTime}s</span>
          <p className="mt-2 text-sm text-muted-foreground">
            Speak clearly into the microphone
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={stopRecording}
            disabled={recordingTime < config.minDuration}
            className="h-14 gap-2 text-lg font-semibold bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <MicOff className="h-6 w-6" />
            {t.stopRecording}
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleSkip} className="flex-1 h-12 border-border">
              <SkipForward className="mr-2 h-5 w-5" />
              {t.skip}
            </Button>
            <Button variant="outline" onClick={handleRetry} className="flex-1 h-12 border-border">
              <RotateCcw className="mr-2 h-5 w-5" />
              {t.retry}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const renderAnalyzing = () => (
    <Card className="border-border bg-card shadow-lg">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="mb-6 h-16 w-16 animate-spin rounded-full border-4 border-muted border-t-accent" />
        <p className="text-xl font-medium text-foreground">{t.analyzing}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This may take a moment...
        </p>
      </CardContent>
    </Card>
  )

  const renderResults = () => {
    return (
      <Card className="border-border bg-card shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
            <CheckCircle className="h-8 w-8 text-accent-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">{t.results}</CardTitle>
          <CardDescription className="text-muted-foreground">
            {String(t[config.titleKey as keyof typeof t])}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(metrics).map(([key, value]) => (
            <MetricDisplay
              key={key}
              label={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              value={value}
            />
          ))}

          <div className="flex flex-col gap-3 pt-4">
            <Button
              onClick={handleContinue}
              className="h-14 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t.continue}
            </Button>
            <Button variant="outline" onClick={handleRetry} className="h-12 gap-2 border-border">
              <RotateCcw className="h-5 w-5" />
              {t.retry}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        showBack
        onBack={handleBack}
        step={step === "instructions" ? 0 : step === "recording" ? 1 : 2}
        totalSteps={3}
      />
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          {step === "instructions" && renderInstructions()}
          {step === "recording" && renderRecording()}
          {step === "analyzing" && renderAnalyzing()}
          {step === "results" && renderResults()}
        </div>
      </main>
    </div>
  )
}
