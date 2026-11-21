import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

export interface ExamQuestion {
  id: string
  topic: string | null
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
}

export interface ExamResultItem {
  id: string
  chosen: string | null
  correct_answer: string
  explanation: string
}

export interface ExamSubmissionResponse {
  score: number
  total: number
  results: ExamResultItem[]
}

type ExamPhase = 'start' | 'in_progress' | 'results'

const TOTAL_TIME_SECONDS = 20 * 60 // 20 minutes
const STORAGE_ATTEMPT_ID_KEY = 'nursingprep_exam_attempt_id'
const STORAGE_ANSWERS_KEY = 'nursingprep_exam_answers'

function getStoredAttemptId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_ATTEMPT_ID_KEY)
  } catch {
    return null
  }
}

function setStoredAttemptId(attemptId: string): void {
  try {
    sessionStorage.setItem(STORAGE_ATTEMPT_ID_KEY, attemptId)
  } catch {
    // Ignore storage errors
  }
}

function getStoredAnswers(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_ANSWERS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setStoredAnswers(answers: Record<string, string>): void {
  try {
    sessionStorage.setItem(STORAGE_ANSWERS_KEY, JSON.stringify(answers))
  } catch {
    // Ignore storage errors
  }
}

function clearStoredExam(): void {
  try {
    sessionStorage.removeItem(STORAGE_ATTEMPT_ID_KEY)
    sessionStorage.removeItem(STORAGE_ANSWERS_KEY)
  } catch {
    // Ignore storage errors
  }
}

export function ExamPage() {
  const navigate = useNavigate()

  // Exam phase
  const [phase, setPhase] = useState<ExamPhase>('start')
  const [isLoading, setIsLoading] = useState(() => Boolean(getStoredAttemptId()))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Exam state
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME_SECONDS)
  const [resultsData, setResultsData] = useState<ExamSubmissionResponse | null>(null)

  // Guard against double submit
  const hasSubmittedRef = useRef(false)

  // Submit exam callback
  const submitExam = useCallback(async (currentAnswers: Record<string, string>, targetAttemptId?: string) => {
    if (hasSubmittedRef.current) return
    hasSubmittedRef.current = true
    setIsSubmitting(true)
    setShowConfirmModal(false)

    const effectiveAttemptId = targetAttemptId || attemptId

    try {
      const { data, error } = await supabase.rpc('submit_exam', {
        p_attempt_id: effectiveAttemptId,
        p_answers: currentAnswers,
      })

      if (error || !data) {
        toast.error(error?.message || 'Failed to submit exam. Please try again.')
        hasSubmittedRef.current = false // Allow retry on failure
        setIsSubmitting(false)
        return
      }

      clearStoredExam()
      setResultsData(data as ExamSubmissionResponse)
      setPhase('results')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred during submission.'
      toast.error(msg)
      hasSubmittedRef.current = false
    } finally {
      setIsSubmitting(false)
    }
  }, [attemptId])

  const submitExamRef = useRef(submitExam)
  useEffect(() => {
    submitExamRef.current = submitExam
  }, [submitExam])

  // Resume unsubmitted attempt from sessionStorage on mount
  useEffect(() => {
    let isCurrent = true
    let isFinished = false
    const savedAttemptId = getStoredAttemptId()

    if (!savedAttemptId) {
      return
    }

    const fallbackToStart = (errorMsg: string) => {
      clearStoredExam()
      setAttemptId(null)
      setQuestions([])
      setAnswers({})
      setIsLoading(false)
      setPhase('start')
      toast.error(errorMsg)
    }

    // 10-second timeout fallback to prevent hanging
    const timeoutTimer = setTimeout(() => {
      if (!isCurrent || isFinished) return
      isFinished = true
      fallbackToStart('Resume request timed out. Please start a new attempt.')
    }, 10000)

    const resumeAttempt = async () => {
      try {
        const { data, error } = await supabase.rpc('resume_exam', { p_attempt_id: savedAttemptId })
        if (!isCurrent || isFinished) return
        isFinished = true
        clearTimeout(timeoutTimer)

        if (error || !data) {
          fallbackToStart(error?.message || 'Failed to resume exam. Please start a new attempt.')
          return
        }

        const returnedQuestions: ExamQuestion[] = data.questions || []
        const secondsRemaining: number = typeof data.seconds_remaining === 'number' ? data.seconds_remaining : 0
        const restoredAnswers = getStoredAnswers()

        if (returnedQuestions.length === 0) {
          fallbackToStart('No questions found for this exam attempt.')
          return
        }

        setAttemptId(savedAttemptId)
        setQuestions(returnedQuestions)
        setAnswers(restoredAnswers)
        setTimeLeft(secondsRemaining)
        setCurrentIndex(0)
        setPhase('in_progress')
        setIsLoading(false)

        if (secondsRemaining <= 0 && !hasSubmittedRef.current) {
          void submitExamRef.current(restoredAnswers, savedAttemptId)
        }
      } catch (err: unknown) {
        if (!isCurrent || isFinished) return
        isFinished = true
        clearTimeout(timeoutTimer)
        const msg = err instanceof Error ? err.message : 'Failed to resume exam.'
        fallbackToStart(msg)
      }
    }

    void resumeAttempt()

    return () => {
      isCurrent = false
      clearTimeout(timeoutTimer)
    }
  }, [])

  // Start exam
  const handleStartExam = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_exam_questions', { p_count: 20 })
      if (error || !data) {
        toast.error(error?.message || 'Failed to load exam questions. Please try again.')
        setIsLoading(false)
        return
      }

      const returnedQuestions: ExamQuestion[] = data.questions || []
      const returnedAttemptId: string = data.attempt_id

      if (!returnedAttemptId || returnedQuestions.length === 0) {
        toast.error('No exam questions available at this time.')
        setIsLoading(false)
        return
      }

      setStoredAttemptId(returnedAttemptId)
      setStoredAnswers({})

      setAttemptId(returnedAttemptId)
      setQuestions(returnedQuestions)
      setCurrentIndex(0)
      setAnswers({})
      setTimeLeft(TOTAL_TIME_SECONDS)
      hasSubmittedRef.current = false
      setPhase('in_progress')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Timer countdown and auto-submit
  useEffect(() => {
    if (phase !== 'in_progress') return

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          // Timer reached 0: auto-submit once
          if (!hasSubmittedRef.current) {
            submitExam(answers)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [phase, answers, submitExam])

  const handleSelectOption = (questionId: string, optionKey: string) => {
    setAnswers((prev) => {
      const updated = { ...prev, [questionId]: optionKey }
      setStoredAnswers(updated)
      return updated
    })
  }

  // Keyboard navigation
  useEffect(() => {
    if (phase !== 'in_progress') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      const currentQ = questions[currentIndex]
      if (!currentQ) return

      if (e.key === '1' || e.key.toLowerCase() === 'a') {
        handleSelectOption(currentQ.id, 'A')
      } else if (e.key === '2' || e.key.toLowerCase() === 'b') {
        handleSelectOption(currentQ.id, 'B')
      } else if (e.key === '3' || e.key.toLowerCase() === 'c') {
        handleSelectOption(currentQ.id, 'C')
      } else if (e.key === '4' || e.key.toLowerCase() === 'd') {
        handleSelectOption(currentQ.id, 'D')
      } else if (e.key === 'ArrowRight' && currentIndex < questions.length - 1) {
        setCurrentIndex((i) => i + 1)
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex((i) => i - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, currentIndex, questions])

  const formatTimer = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const answeredCount = Object.keys(answers).length
  const currentQuestion = questions[currentIndex]

  // Reset to retake
  const handleRetake = () => {
    clearStoredExam()
    setAttemptId(null)
    setQuestions([])
    setCurrentIndex(0)
    setAnswers({})
    setTimeLeft(TOTAL_TIME_SECONDS)
    setResultsData(null)
    hasSubmittedRef.current = false
    setPhase('start')
  }

  // -------------------------------------------------------------
  // PHASE 1: START SCREEN
  // -------------------------------------------------------------
  if (phase === 'start') {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-lg border border-border bg-surface p-8 rounded-2xl space-y-6">
          <div className="space-y-2">
            <span className="text-xs uppercase font-extrabold tracking-widest text-accent">
              Computer-Based Test
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Nursing Examination
            </h1>
            <p className="text-sm text-muted">
              Prepare yourself before beginning. Once started, your timed exam session will begin immediately.
            </p>
          </div>

          <div className="border border-border bg-bg p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-muted">Total Questions:</span>
              <span className="font-bold text-text">20 questions</span>
            </div>
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-muted">Allocated Time:</span>
              <span className="font-bold text-text">20 minutes</span>
            </div>
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-muted">Format:</span>
              <span className="font-bold text-text">Multiple Choice (A-D)</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={handleStartExam}
              disabled={isLoading}
              aria-label="Start exam"
              className="w-full bg-primary text-on-primary py-3.5 text-sm font-semibold rounded-xl hover:opacity-95 disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {isLoading ? 'Preparing exam...' : 'Start exam'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/app')}
              disabled={isLoading}
              aria-label="Back to dashboard"
              className="w-full border border-border hover:border-accent bg-surface text-text py-2.5 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------
  // PHASE 3: RESULTS SCREEN
  // -------------------------------------------------------------
  if (phase === 'results' && resultsData) {
    const score = resultsData.score
    const total = resultsData.total
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0
    const circumference = 2 * Math.PI * 34
    const strokeDashoffset = circumference - (percentage / 100) * circumference

    return (
      <div className="min-h-screen bg-bg text-text pb-16">
        <header className="border-b border-border bg-surface sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
            <span className="font-extrabold text-lg tracking-tight">Exam Results</span>
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="border border-border hover:border-accent bg-surface text-text px-3.5 py-1.5 text-sm font-semibold rounded-lg motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Dashboard
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          {/* Summary Card with Score & Ring */}
          <div className="border border-border bg-surface p-6 sm:p-8 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-xs uppercase font-extrabold tracking-widest text-accent">
                Performance Overview
              </span>
              <div className="text-4xl font-extrabold tracking-tight">
                {score} / {total}
              </div>
              <p className="text-sm text-muted">
                {percentage >= 70
                  ? 'Excellent work! You achieved passing mastery.'
                  : 'Review the questions and explanations below to strengthen your weak areas.'}
              </p>
            </div>

            {/* Score Ring */}
            <div className="relative w-24 h-24 flex items-center justify-center shrink-0" aria-label={`Score percentage: ${percentage}%`}>
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  className="stroke-border fill-none"
                  strokeWidth="7"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  className="stroke-primary fill-none transition-all duration-700 ease-out"
                  strokeWidth="7"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute font-extrabold text-base tracking-tight">{percentage}%</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRetake}
              aria-label="Retake exam"
              className="bg-primary text-on-primary px-5 py-2.5 text-sm font-semibold rounded-xl hover:opacity-95 motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Retake exam
            </button>
            <button
              type="button"
              onClick={() => navigate('/app')}
              aria-label="Back to dashboard"
              className="border border-border hover:border-accent bg-surface text-text px-5 py-2.5 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Back to dashboard
            </button>
          </div>

          {/* Detailed Question Review */}
          <div className="space-y-4 pt-4">
            <h2 className="text-xl font-bold tracking-tight">Detailed Solutions</h2>
            <div className="space-y-4">
              {resultsData.results.map((item, idx) => {
                const questionObj = questions.find((q) => q.id === item.id)
                const isCorrect = item.chosen && item.chosen.toUpperCase() === item.correct_answer.toUpperCase()

                return (
                  <div
                    key={item.id}
                    className="border border-border bg-surface p-5 sm:p-6 rounded-2xl space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted">
                        Question {idx + 1}
                      </span>
                      {isCorrect ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-border bg-bg text-text">
                          <svg className="w-3.5 h-3.5 text-text" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-border bg-surface text-muted">
                          <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          Incorrect
                        </span>
                      )}
                    </div>

                    <p className="font-semibold text-base sm:text-lg">
                      {questionObj ? questionObj.question_text : `Question ID: ${item.id}`}
                    </p>

                    {/* Answers block */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="p-3 rounded-xl border border-border bg-bg">
                        <span className="text-xs font-bold text-muted uppercase block mb-1">Your Choice</span>
                        <span className="font-semibold text-text">
                          {item.chosen ? `Option ${item.chosen.toUpperCase()}` : '(No answer selected)'}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl border border-border bg-bg">
                        <span className="text-xs font-bold text-muted uppercase block mb-1">Correct Answer</span>
                        <span className="font-semibold text-text">
                          Option {item.correct_answer.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Explanation */}
                    {item.explanation && (
                      <div className="p-4 rounded-xl border border-border/80 bg-bg/50 space-y-1">
                        <span className="text-xs font-bold text-muted uppercase tracking-wider block">
                          Explanation
                        </span>
                        <p className="text-sm text-text leading-relaxed">
                          {item.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </main>
      </div>
    )
  }

  // -------------------------------------------------------------
  // PHASE 2: IN PROGRESS (EXAM SCREEN)
  // -------------------------------------------------------------
  if (!currentQuestion) {
    return null
  }

  const options: Array<{ key: 'A' | 'B' | 'C' | 'D'; text: string }> = [
    { key: 'A', text: currentQuestion.option_a },
    { key: 'B', text: currentQuestion.option_b },
    { key: 'C', text: currentQuestion.option_c },
    { key: 'D', text: currentQuestion.option_d },
  ]

  const selectedAnswer = answers[currentQuestion.id]

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {/* Top Header */}
      <header className="border-b border-border bg-surface sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm sm:text-base tracking-tight">NursingPrep CBT</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Timer (mm:ss) */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-mono font-bold ${
                timeLeft <= 60 ? 'text-accent border-accent animate-pulse' : 'text-text bg-bg'
              }`}
              aria-label="Time remaining"
            >
              <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatTimer(timeLeft)}</span>
            </div>

            {/* Submit button in header */}
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={isSubmitting}
              aria-label="Submit exam"
              className="bg-primary text-on-primary px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-lg hover:opacity-95 disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </header>

      {/* Main question area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col space-y-6">
        {/* Question Counter & Topic */}
        <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted">
            Question {currentIndex + 1} of {questions.length}
          </span>
          {currentQuestion.topic && (
            <span className="text-xs font-extrabold uppercase tracking-widest text-accent bg-accent/10 px-2.5 py-1 rounded-full">
              {currentQuestion.topic}
            </span>
          )}
        </div>

        {/* Question Text with smooth transition */}
        <motion.div
          key={currentQuestion.id}
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
          className="space-y-6 flex-1 flex flex-col justify-between"
        >
          <div>
            <h2 className="text-lg sm:text-2xl font-bold leading-relaxed text-text">
              {currentQuestion.question_text}
            </h2>
          </div>

          {/* Four Option Buttons (A-D) */}
          <div className="flex flex-col space-y-3 pt-2">
            {options.map((opt) => {
              const isSelected = selectedAnswer === opt.key

              return (
                <motion.button
                  key={opt.key}
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleSelectOption(currentQuestion.id, opt.key)}
                  aria-label={`Option ${opt.key}: ${opt.text}`}
                  className={`w-full text-left p-4 rounded-xl border flex items-center justify-between gap-4 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary text-text'
                      : 'border-border bg-surface text-text hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected
                          ? 'bg-primary text-on-primary'
                          : 'bg-bg text-muted border border-border'
                      }`}
                    >
                      {opt.key}
                    </span>
                    <span className="text-sm sm:text-base font-medium leading-snug">{opt.text}</span>
                  </div>

                  {/* Small wine accent indicator on selected option only */}
                  {isSelected && (
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-accent bg-accent/15 px-2 py-0.5 rounded-full shrink-0">
                      Selected
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* Navigation & Question Navigator */}
        <div className="pt-4 border-t border-border space-y-4">
          {/* Prev/Next buttons */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              aria-label="Previous question"
              className="border border-border hover:border-accent bg-surface text-text px-4 py-2 text-sm font-semibold rounded-xl disabled:opacity-30 disabled:pointer-events-none motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Previous
            </button>

            <span className="text-xs text-muted font-medium">
              Answered {answeredCount} of {questions.length}
            </span>

            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIndex === questions.length - 1}
              aria-label="Next question"
              className="border border-border hover:border-accent bg-surface text-text px-4 py-2 text-sm font-semibold rounded-xl disabled:opacity-30 disabled:pointer-events-none motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Next
            </button>
          </div>

          {/* Navigator numbers (1-20): answered = filled, current = outlined */}
          <div
            className="flex items-center gap-2 overflow-x-auto py-2 sm:flex-wrap sm:overflow-visible"
            role="navigation"
            aria-label="Question selector"
          >
            {questions.map((q, idx) => {
              const isCurrent = idx === currentIndex
              const isAnswered = Boolean(answers[q.id])

              let btnStyle = 'bg-surface border-border text-muted hover:border-border/80'
              if (isAnswered) {
                btnStyle = 'bg-primary text-on-primary border-primary'
              }

              if (isCurrent) {
                btnStyle += ' ring-2 ring-primary ring-offset-2 ring-offset-bg font-extrabold'
              }

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Go to question ${idx + 1}${isAnswered ? ', answered' : ''}${isCurrent ? ', current' : ''}`}
                  className={`w-9 h-9 min-w-9 rounded-lg border text-xs font-semibold flex items-center justify-center motion-safe:transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${btnStyle}`}
                >
                  {idx + 1}
                </button>
              )
            })}
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm bg-surface border border-border p-6 rounded-2xl shadow-xl space-y-5">
            <div className="space-y-1">
              <h3 id="confirm-modal-title" className="text-xl font-bold tracking-tight">
                Submit Exam?
              </h3>
              <p className="text-sm text-muted">
                You answered {answeredCount} of {questions.length}. Submit?
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                aria-label="Cancel submission"
                className="flex-1 border border-border hover:border-accent bg-surface text-text py-2.5 text-sm font-semibold rounded-xl motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitExam(answers)}
                disabled={isSubmitting}
                aria-label="Confirm submit"
                className="flex-1 bg-primary text-on-primary py-2.5 text-sm font-semibold rounded-xl hover:opacity-95 disabled:opacity-50 motion-safe:transition-transform motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
