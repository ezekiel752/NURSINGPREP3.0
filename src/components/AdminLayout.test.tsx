import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider } from '../contexts/AuthContext'
import { AdminRoute } from './AdminRoute'
import { AdminLayout } from './AdminLayout'
import { supabase } from '../lib/supabase'

// Mock matchMedia for jsdom
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

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

const mockRpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>
const mockAdminUser = { id: 'admin-user-id', email: 'admin@nursingprep.com' }

describe('AdminLayout Mobile Nav Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: mockAdminUser,
          access_token: 'fake-admin-token',
        } as unknown as Session,
      },
      error: null,
    })

    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as unknown as ReturnType<typeof supabase.auth.onAuthStateChange>)

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { level: 200, is_active: true },
        error: null,
      }),
    } as unknown as ReturnType<typeof supabase.from>)

    mockRpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'is_admin') return { data: true, error: null }
      return { data: null, error: null }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('menu button opens mobile navigation panel with correct aria attributes', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<div>Admin Home</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeDefined()
    })

    const menuBtn = screen.getByRole('button', { name: 'Open navigation menu' })
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false')
    expect(menuBtn.getAttribute('aria-controls')).toBe('admin-mobile-nav-panel')

    // Click to open
    fireEvent.click(menuBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeDefined()
    })

    expect(menuBtn.getAttribute('aria-expanded')).toBe('true')
  })

  it('selecting an item navigates and closes the mobile panel', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<div>Admin Home</div>} />
              <Route path="students" element={<div>Students Target Page</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeDefined()
    })

    const menuBtn = screen.getByRole('button', { name: 'Open navigation menu' })
    fireEvent.click(menuBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeDefined()
    })

    // In mobile nav panel, click Students link
    const mobilePanel = screen.getByRole('dialog', { name: 'Navigation menu' })
    const studentsLink = mobilePanel.querySelector('a[href="/admin/students"]')
    expect(studentsLink).toBeDefined()
    fireEvent.click(studentsLink!)

    // Panel closes and destination renders
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).toBeNull()
      expect(screen.getByText('Students Target Page')).toBeDefined()
    })
  })

  it('Escape key closes the mobile panel and returns focus to menu button', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<div>Admin Home</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeDefined()
    })

    const menuBtn = screen.getByRole('button', { name: 'Open navigation menu' })
    menuBtn.focus()
    fireEvent.click(menuBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeDefined()
    })

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).toBeNull()
    })

    // Focus returns to the menu button
    expect(document.activeElement).toBe(menuBtn)
  })

  it('sign out button and admin email are present in mobile panel and trigger signOut', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<div>Admin Home</div>} />
            </Route>
            <Route path="/login" element={<div>Login Page Target</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeDefined()
    })

    const menuBtn = screen.getByRole('button', { name: 'Open navigation menu' })
    fireEvent.click(menuBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeDefined()
    })

    const mobilePanel = screen.getByRole('dialog', { name: 'Navigation menu' })
    expect(mobilePanel.textContent).toContain('admin@nursingprep.com')

    const signOutBtn = mobilePanel.querySelector('button.admin-signout-btn, button:not([aria-label="Close menu"])')
    expect(signOutBtn).toBeDefined()
    expect(signOutBtn?.textContent).toBe('Sign out')

    fireEvent.click(signOutBtn!)

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled()
      expect(screen.getByText('Login Page Target')).toBeDefined()
    })
  })
})
