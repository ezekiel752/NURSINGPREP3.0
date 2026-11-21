import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { ExamPage } from './ExamPage'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const mockRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>

const mockQuestions = [
  {
    id: 'q-1',
    topic: 'Pharmacology',
    question_text: 'What is the primary action of beta blockers?',
    option_a: 'Reduce heart rate and blood pressure',
    option_b: 'Increase blood glucose levels',
    option_c: 'Stimulate bronchial dilation',
    option_d: 'Promote fluid retention',
  },
  {
    id: 'q-2',
    topic: 'Anatomy',
    question_text: 'Where does gas exchange primarily take place in the lungs?',
    option_a: 'Bronchioles',
    option_b: 'Alveoli',
    option_c: 'Trachea',
    option_d: 'Pleural cavity',
  },
]

describe('ExamPage component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.useRealTimers()
  })

  it('renders start screen with "20 questions, 20 minutes" when no stored attempt exists', () => {
    render(
      <MemoryRouter>
        <ExamPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/20 questions/i)).toBeDefined()
    expect(screen.getByText(/20 minutes/i)).toBeDefined()
    const startBtn = screen.getByRole('button', { name: /start exam/i })
    expect(startBtn).toBeDefined()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('completes flow: start -> answer questions -> submit calls submit_exam with correct payload, renders results, clears sessionStorage', async () => {
    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'get_exam_questions') {
        return {
          data: {
            attempt_id: 'attempt-uuid-1234',
            questions: mockQuestions,
          },
          error: null,
        }
      }
      if (fnName === 'submit_exam') {
        return {
          data: {
            score: 1,
            total: 2,
            results: [
              {
                id: 'q-1',
                chosen: 'A',
                correct_answer: 'A',
                explanation: 'Beta blockers decrease myocardial contractility and heart rate.',
              },
              {
                id: 'q-2',
                chosen: 'C',
                correct_answer: 'B',
                explanation: 'Gas exchange occurs across the alveolar-capillary membrane.',
              },
            ],
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter>
        <ExamPage />
      </MemoryRouter>
    )

    // Click start exam
    fireEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('get_exam_questions', { p_count: 20 })
      expect(screen.getByText(/Question 1 of 2/i)).toBeDefined()
    })

    // Verify sessionStorage has attempt id
    expect(sessionStorage.getItem('nursingprep_exam_attempt_id')).toBe('attempt-uuid-1234')

    // Question 1: select Option A
    const optA = screen.getByRole('button', { name: /Option A:/i })
    fireEvent.click(optA)

    // Verify answers stored in sessionStorage
    const storedAnswers = JSON.parse(sessionStorage.getItem('nursingprep_exam_answers') || '{}')
    expect(storedAnswers['q-1']).toBe('A')

    // Navigate to Question 2
    fireEvent.click(screen.getByRole('button', { name: /Next question/i }))
    expect(screen.getByText(/Question 2 of 2/i)).toBeDefined()

    // Question 2: select Option C
    const optC = screen.getByRole('button', { name: /Option C:/i })
    fireEvent.click(optC)

    // Click Submit in header
    fireEvent.click(screen.getByRole('button', { name: /^Submit exam$/i }))

    // Confirmation modal should appear with "You answered 2 of 2. Submit?"
    expect(screen.getByText(/You answered 2 of 2\. Submit\?/i)).toBeDefined()

    // Confirm submission
    fireEvent.click(screen.getByRole('button', { name: /Confirm submit/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('submit_exam', {
        p_attempt_id: 'attempt-uuid-1234',
        p_answers: {
          'q-1': 'A',
          'q-2': 'C',
        },
      })
    })

    // Verify Results screen renders
    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeDefined()
      expect(screen.getByText(/Detailed Solutions/i)).toBeDefined()
      expect(screen.getByText(/^Correct$/)).toBeDefined()
      expect(screen.getByText(/^Incorrect$/)).toBeDefined()
      expect(screen.getByText(/Beta blockers decrease myocardial/i)).toBeDefined()
    })

    // Verify sessionStorage was cleared on submit
    expect(sessionStorage.getItem('nursingprep_exam_attempt_id')).toBeNull()
    expect(sessionStorage.getItem('nursingprep_exam_answers')).toBeNull()
  })

  it('resumes unsubmitted attempt from sessionStorage on mount, deriving timer from seconds_remaining', async () => {
    sessionStorage.setItem('nursingprep_exam_attempt_id', 'existing-attempt-888')
    sessionStorage.setItem('nursingprep_exam_answers', JSON.stringify({ 'q-1': 'B' }))

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'resume_exam') {
        return {
          data: {
            attempt_id: 'existing-attempt-888',
            questions: mockQuestions,
            seconds_remaining: 850, // 14:10
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter>
        <ExamPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('resume_exam', { p_attempt_id: 'existing-attempt-888' })
      expect(screen.getByText(/Question 1 of 2/i)).toBeDefined()
      // Timer derived from seconds_remaining (850s = 14:10)
      expect(screen.getByText('14:10')).toBeDefined()
      // Option B was restored as selected
      expect(screen.getByText(/Selected/i)).toBeDefined()
    })
  })

  it('timer reaches 0 and auto-submits once without confirm dialog', async () => {
    vi.useFakeTimers()

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'get_exam_questions') {
        return {
          data: {
            attempt_id: 'attempt-timer-test',
            questions: mockQuestions,
          },
          error: null,
        }
      }
      if (fnName === 'submit_exam') {
        return {
          data: {
            score: 1,
            total: 2,
            results: [
              {
                id: 'q-1',
                chosen: 'A',
                correct_answer: 'A',
                explanation: 'Explanation 1',
              },
              {
                id: 'q-2',
                chosen: null,
                correct_answer: 'B',
                explanation: 'Explanation 2',
              },
            ],
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })

    render(
      <MemoryRouter>
        <ExamPage />
      </MemoryRouter>
    )

    // Start exam
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /start exam/i }))
    })

    expect(screen.getByText(/Question 1 of 2/i)).toBeDefined()

    // Answer question 1
    fireEvent.click(screen.getByRole('button', { name: /Option A:/i }))

    // Advance 20 minutes (1200 seconds)
    await act(async () => {
      vi.advanceTimersByTime(1201 * 1000)
    })

    // Check submit_exam was called once
    expect(supabase.rpc).toHaveBeenCalledWith('submit_exam', {
      p_attempt_id: 'attempt-timer-test',
      p_answers: { 'q-1': 'A' },
    })

    expect(mockRpc.mock.calls.filter((c: unknown[]) => c[0] === 'submit_exam').length).toBe(1)
  })

  it('handles get_exam_questions error with sonner toast and stays on start screen', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database connection failed' },
    })

    render(
      <MemoryRouter>
        <ExamPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Database connection failed')
      expect(screen.getByRole('button', { name: /start exam/i })).toBeDefined()
    })
  })
})
