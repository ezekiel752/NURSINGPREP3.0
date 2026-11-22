import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { AdminLayout } from './components/AdminLayout'
import { AdminOverviewPage } from './pages/AdminOverviewPage'
import { AdminStudentsPage } from './pages/AdminStudentsPage'
import { AdminPlaceholderPage } from './pages/AdminPlaceholderPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PayPage } from './pages/PayPage'
import { PayReturnPage } from './pages/PayReturnPage'
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
            path="/pay/return"
            element={
              <ProtectedRoute requireLevel>
                <PayReturnPage />
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
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<AdminOverviewPage />} />
            <Route path="overview" element={<Navigate to="/admin" replace />} />
            <Route path="students" element={<AdminStudentsPage />} />
            <Route path="questions" element={<AdminPlaceholderPage title="Questions" />} />
            <Route path="payments" element={<AdminPlaceholderPage title="Payments" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
