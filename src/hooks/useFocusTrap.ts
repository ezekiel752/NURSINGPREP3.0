import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface UseFocusTrapOptions {
  active: boolean
  onClose?: () => void
  triggerElement?: HTMLElement | null
  triggerRef?: React.RefObject<HTMLElement | null>
  initialFocusRef?: React.RefObject<HTMLElement | null>
}

/**
 * Reusable focus trap hook with no external dependencies.
 * Traps Tab and Shift+Tab within the container, moves focus in on open,
 * returns focus to trigger on close, handles Escape key, and marks
 * background siblings under document.body as inert.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>({
  active,
  onClose,
  triggerElement,
  triggerRef,
  initialFocusRef,
}: UseFocusTrapOptions) {
  const containerRef = useRef<T | null>(null)

  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    if (!container) return

    // Save triggering element to return focus to on close
    const triggerNode =
      triggerRef?.current || triggerElement || (document.activeElement as HTMLElement | null)

    // Mark background siblings under document.body as inert while trap is active
    const elementsToInert: HTMLElement[] = []
    const bodyChildren = Array.from(document.body.children)

    for (const child of bodyChildren) {
      if (
        child instanceof HTMLElement &&
        !child.contains(container) &&
        !child.hasAttribute('inert')
      ) {
        child.setAttribute('inert', '')
        elementsToInert.push(child)
      }
    }

    // Move focus inside the trap container
    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
      } else {
        const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        if (focusables.length > 0) {
          focusables[0].focus()
        } else {
          container.focus()
        }
      }
    }, 20)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose?.()
        return
      }

      if (e.key !== 'Tab') return

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)

      if (focusables.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const current = document.activeElement

      if (e.shiftKey) {
        // Shift + Tab: if on first element (or outside container), wrap to last
        if (current === first || !container.contains(current)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab: if on last element (or outside container), wrap to first
        if (current === last || !container.contains(current)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)

      // Restore background accessibility
      for (const el of elementsToInert) {
        el.removeAttribute('inert')
      }

      // Return focus to trigger element
      if (triggerNode && typeof triggerNode.focus === 'function') {
        triggerNode.focus()
      }
    }
  }, [active, onClose, triggerElement, triggerRef, initialFocusRef])

  return containerRef
}
