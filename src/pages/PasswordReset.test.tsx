import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'
import { AuthProvider } from '../contexts/AuthContext'
import { LoginPage } from './LoginPage'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { ResetPasswordPage } from './ResetPasswordPage'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

const mockRecoveryUser = { id: 'recovery-user-id', email: 'student@example.com' } as User
const mockRecoverySession = {
  user: mockRecoveryUser,
  access_token: 'fake-recovery-token',
} as unknown as Session

describe('Password Reset Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as unknown as ReturnType<typeof supabase.auth.onAuthStateChange>)

    vi.mocked(supabase.auth.signOut).mockResolvedValue({
      error: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('login page includes a "Forgot password?" link to /forgot-password', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    const link = screen.getByRole('link', { name: /forgot password\?/i })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/forgot-password')
  })

  it('forgot page calls the API with the right redirectTo', async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null,
    })

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    )

    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput, { target: { value: 'nurse@example.com' } })

    const submitBtn = screen.getByRole('button', { name: /send reset instructions/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'nurse@example.com',
        { redirectTo: `${window.location.origin}/reset-password` }
      )
    })
  })

  it('same message on error and success paths for unknown emails', async () => {
    // 1. Success path
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
      data: {},
      error: null,
    })

    const { unmount } = render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    )

    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput, { target: { value: 'valid@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset instructions/i }))

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeDefined()
    })

    const expectedMessage = screen.getByText(
      /if an account exists for this email, you will receive password reset instructions shortly/i
    ).textContent

    unmount()

    // 2. Error path for unknown email
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
      data: null,
      error: { name: 'AuthApiError', message: 'User not found', status: 400 } as unknown as import('@supabase/supabase-js').AuthError,
    })

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    )

    const emailInput2 = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput2, { target: { value: 'unknown@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset instructions/i }))

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeDefined()
    })

    const errorMessage = screen.getByText(
      /if an account exists for this email, you will receive password reset instructions shortly/i
    ).textContent

    // Both messages must be identical to avoid user enumeration
    expect(errorMessage).toBe(expectedMessage)
  })

  it('cooldown disables resend', async () => {
    vi.useFakeTimers()

    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null,
    })

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <ForgotPasswordPage />
      </MemoryRouter>
    )

    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput, { target: { value: 'cooldown@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset instructions/i }))

    await act(async () => {
      await Promise.resolve()
    })

    // Button should now be disabled and show 60s countdown
    const submitBtn = screen.getByRole('button')
    expect(submitBtn.hasAttribute('disabled')).toBe(true)
    expect(submitBtn.textContent).toContain('Resend in 60s')

    // Advance 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    expect(submitBtn.hasAttribute('disabled')).toBe(true)
    expect(submitBtn.textContent).toContain('Resend in 30s')

    // Advance remaining 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    expect(submitBtn.hasAttribute('disabled')).toBe(false)
    expect(submitBtn.textContent).toContain('Resend reset instructions')
  })

  it('reset page shows invalid-link state without a recovery session', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/this link is invalid or has expired/i)).toBeDefined()
    })

    const requestNewLink = screen.getByRole('link', { name: /request a new one/i })
    expect(requestNewLink).toBeDefined()
    expect(requestNewLink.getAttribute('href')).toBe('/forgot-password')
  })

  it('mismatched passwords blocked', async () => {
    // Simulate PASSWORD_RECOVERY event
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('PASSWORD_RECOVERY', mockRecoverySession)
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      } as unknown as ReturnType<typeof supabase.auth.onAuthStateChange>
    })

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Set new password')).toBeDefined()
    })

    const passwordInput = screen.getByLabelText(/^new password/i)
    const confirmInput = screen.getByLabelText(/confirm new password/i)

    fireEvent.change(passwordInput, { target: { value: 'ValidPassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'DifferentPassword456' } })

    const updateBtn = screen.getByRole('button', { name: /update password/i })
    fireEvent.click(updateBtn)

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeDefined()
    })

    expect(supabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('success signs out and redirects to /login', async () => {
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('PASSWORD_RECOVERY', mockRecoverySession)
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      } as unknown as ReturnType<typeof supabase.auth.onAuthStateChange>
    })

    vi.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: mockRecoveryUser },
      error: null,
    })

    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<div>Login Page Target</div>} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Set new password')).toBeDefined()
    })

    const passwordInput = screen.getByLabelText(/^new password/i)
    const confirmInput = screen.getByLabelText(/confirm new password/i)

    fireEvent.change(passwordInput, { target: { value: 'BrandNewPassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'BrandNewPassword123' } })

    const updateBtn = screen.getByRole('button', { name: /update password/i })
    fireEvent.click(updateBtn)

    await waitFor(() => {
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'BrandNewPassword123',
      })
      expect(supabase.auth.signOut).toHaveBeenCalled()
      expect(screen.getByText('Login Page Target')).toBeDefined()
    })
  })
})
