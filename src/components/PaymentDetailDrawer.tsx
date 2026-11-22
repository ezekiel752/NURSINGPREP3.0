import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { PaymentListItem } from '../pages/AdminPaymentsPage'
import { PaymentStatusBadge } from '../pages/AdminPaymentsPage'
import { formatAmount, formatPaidDate, formatDate } from '../lib/paymentFormatters'

interface PaymentDetailDrawerProps {
  payment: PaymentListItem | null
  isOpen: boolean
  onClose: () => void
  triggerElement?: HTMLElement | null
}

export function PaymentDetailDrawer({
  payment,
  isOpen,
  onClose,
  triggerElement,
}: PaymentDetailDrawerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Manage keyboard accessibility and focus trapping
  const drawerRef = useFocusTrap<HTMLDivElement>({
    active: isOpen,
    onClose,
    triggerElement,
    initialFocusRef: headingRef,
  })

  return createPortal(
    <AnimatePresence>
      {isOpen && payment && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-drawer-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative w-full max-w-md bg-surface border-l border-border h-full shadow-2xl flex flex-col z-10 overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <p className="text-[11px] uppercase font-extrabold tracking-wider text-accent">
                  Payment Record
                </p>
                <h2
                  id="payment-drawer-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-lg font-extrabold tracking-tight focus:outline-none"
                >
                  Payment Details
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close details"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-border/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Student Identification */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Student Information
                </h3>
                <div className="bg-bg border border-border rounded-xl p-4 space-y-2">
                  <div>
                    <span className="text-[11px] text-muted block font-medium">Name</span>
                    <span className="text-sm font-semibold text-text">
                      {payment.full_name || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted block font-medium">Email</span>
                    <span className="text-sm font-medium text-text break-all">
                      {payment.email || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transaction Information */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Transaction Data
                </h3>
                <div className="bg-bg border border-border rounded-xl p-4 space-y-3">
                  <div>
                    <span className="text-[11px] text-muted block font-medium">Reference</span>
                    <span className="text-xs font-mono font-medium text-text break-all select-all">
                      {payment.reference}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-[11px] text-muted block font-medium">Amount</span>
                      <span className="text-base font-extrabold text-text">
                        {formatAmount(payment.amount_minor, payment.currency)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted block font-medium">Currency</span>
                      <span className="text-sm font-semibold text-text uppercase">
                        {payment.currency || 'NGN'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] text-muted block font-medium mb-1">Status</span>
                    <PaymentStatusBadge status={payment.status} />
                  </div>
                </div>
              </div>

              {/* Timestamp Audit */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  Timestamps
                </h3>
                <div className="bg-bg border border-border rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-muted">Paid Date</span>
                    <span className="font-semibold text-text">
                      {formatPaidDate(payment.verified_at)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted">Created</span>
                    <span className="font-semibold text-text">
                      {formatDate(payment.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Read-only notice */}
              <div className="pt-2 text-[11px] text-muted text-center">
                Read-only audit record. Payment statuses are synchronized via verified provider webhooks.
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
