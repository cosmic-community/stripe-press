'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

interface SubmitButtonProps {
  children: ReactNode
  /** Label shown while the parent form is submitting. */
  pendingLabel: ReactNode
  className?: string
  /** Disable independently of the pending state (e.g. payments not configured). */
  disabled?: boolean
}

/**
 * Submit button that reflects its parent form's submission state.
 * Must be rendered inside a <form> whose action is a server action or next/form.
 * While pending it is disabled (prevents double submits), shows a spinner and
 * the pending label, and announces the change to assistive tech.
 */
export default function SubmitButton({ children, pendingLabel, className = '', disabled = false }: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
      aria-busy={pending}
      data-pending={pending ? 'true' : undefined}
      className={`inline-flex items-center gap-2 data-[pending=true]:cursor-wait data-[pending=true]:opacity-70 ${className}`}
    >
      {pending && (
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
        />
      )}
      <span aria-live="polite">{pending ? pendingLabel : children}</span>
    </button>
  )
}
