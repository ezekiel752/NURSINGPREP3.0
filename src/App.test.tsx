import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import App from './App'
import { SignupPage } from './pages/SignupPage'
import { PayPage } from './pages/PayPage'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { supabase } from './lib/supabase'

// Mock window.matchMedia for Sonner in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock('./lib/supabase', () => {
  const authMock = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  }

  const queryMock = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    update: vi.fn().mockReturnThis(),
  }

  return {
    supabase: {
      auth: authMock,
      from: vi.fn().mockReturnValue(queryMock),
    },
  }
})

describe('NursingPrep Application Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as unknown as ReturnType<typeof supabase.auth.onAuthStateChange>)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders landing page with h1 and Join Nursing Prep button (smoke test)', async () => {
    render(<App />)
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Your next level starts with practice.',
    })
    expect(heading).toBeDefined()
    expect(heading.textContent).toBe('Your next level starts with practice.')

    const joinButton = screen.getByRole('button', { name: 'Join Nursing Prep' })
    expect(joinButton).toBeDefined()
    expect(joinButton.textContent).toBe('Join Nursing Prep')
  })

  it('redirects to /login when signed out and accessing guarded routes', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Page Target</div>} />
            <Route
              path="/app"
              element={
                <ProtectedRoute requireLevel>
                  <div>Dashboard Target</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Login Page Target')).toBeDefined()
    })
  })

  it('redirects to /onboarding when signed in and level is null', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
    } as unknown as Session

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const fromMock = vi.mocked(supabase.from)
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { level: null }, error: null }),
      update: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof supabase.from>)

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding" element={<div>Onboarding Page Target</div>} />
            <Route
              path="/app"
              element={
                <ProtectedRoute requireLevel>
                  <div>Dashboard Target</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Onboarding Page Target')).toBeDefined()
    })
  })

  it('returning user with level set goes to /app, not onboarding', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
    } as unknown as Session

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const fromMock = vi.mocked(supabase.from)
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { level: 200, is_active: true }, error: null }),
      update: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof supabase.from>)

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding" element={<div>Onboarding Page Target</div>} />
            <Route path="/pay" element={<div>Pay Page Target</div>} />
            <Route
              path="/app"
              element={
                <ProtectedRoute requireLevel requireActive>
                  <div>Dashboard Target</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Dashboard Target')).toBeDefined()
    })
    expect(screen.queryByText('Onboarding Page Target')).toBeNull()
    expect(screen.queryByText('Pay Page Target')).toBeNull()
  })

  it('blocks onboarding and redirects to /app if level is already set', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
    } as unknown as Session

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const fromMock = vi.mocked(supabase.from)
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { level: 300, is_active: true }, error: null }),
      update: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof supabase.from>)

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute blockIfOnboarded>
                  <div>Onboarding Page Content</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/app"
              element={
                <ProtectedRoute requireLevel requireActive>
                  <div>Dashboard Target</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Dashboard Target')).toBeDefined()
    })
    expect(screen.queryByText('Onboarding Page Content')).toBeNull()
  })

  it('redirects to /pay when signed in with level set but is_active is false', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
    } as unknown as Session

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const fromMock = vi.mocked(supabase.from)
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { level: 200, is_active: false }, error: null }),
      update: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof supabase.from>)

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding" element={<div>Onboarding Page Target</div>} />
            <Route path="/pay" element={<div>Pay Page Target</div>} />
            <Route
              path="/app"
              element={
                <ProtectedRoute requireLevel requireActive>
                  <div>Dashboard Target</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Pay Page Target')).toBeDefined()
    })
    expect(screen.queryByText('Dashboard Target')).toBeNull()
  })

  it('allows active user to access /app and bounces /pay to /app', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
    } as unknown as Session

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const fromMock = vi.mocked(supabase.from)
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { level: 200, is_active: true }, error: null }),
      update: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof supabase.from>)

    render(
      <MemoryRouter initialEntries={['/pay']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/pay"
              element={
                <ProtectedRoute requireLevel blockIfActive>
                  <div>Pay Page Content</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/app"
              element={
                <ProtectedRoute requireLevel requireActive>
                  <div>Dashboard Target</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Dashboard Target')).toBeDefined()
    })
    expect(screen.queryByText('Pay Page Content')).toBeNull()
  })

  it('signup form validates minimum 8 character password before submission', async () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    )

    const nameInput = screen.getByLabelText(/full name/i)
    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitBtn = screen.getByRole('button', { name: /create account/i })

    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } })
    fireEvent.change(emailInput, { target: { value: 'jane@example.com' } })
    fireEvent.change(passwordInput, { target: { value: '12345' } })

    fireEvent.click(submitBtn)

    expect(supabase.auth.signUp).not.toHaveBeenCalled()
    expect(screen.getByText('Password must be at least 8 characters')).toBeDefined()
  })

  it('renders /pay page with Payment required, enabled Pay now button, and sign out', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
    } as unknown as Session

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const fromMock = vi.mocked(supabase.from)
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { level: 200, is_active: false }, error: null }),
      update: vi.fn().mockReturnThis(),
    } as unknown as ReturnType<typeof supabase.from>)

    render(
      <MemoryRouter>
        <AuthProvider>
          <PayPage />
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Payment required')).toBeDefined()
    })
    const payBtn = screen.getByRole('button', { name: /pay now/i })
    expect(payBtn).toBeDefined()
    expect(payBtn.hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
  })
})
