import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PayPage } from './pages/PayPage'
import { DashboardPage } from './pages/DashboardPage'
import { ExamPage } from './pages/ExamPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster richColors theme="system" />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute blockIfOnboarded>
                <OnboardingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pay"
            element={
              <ProtectedRoute requireLevel blockIfActive>
                <PayPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app"
            element={
              <ProtectedRoute requireLevel requireActive>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/exam"
            element={
              <ProtectedRoute requireLevel requireActive>
                <ExamPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
