import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Blocky checkbox (matches the 0-radius shell): a square outline that fills
 * with the primary accent when checked, with a zoom-in micro-animation on the
 * check mark. Built on Radix so keyboard + a11y semantics come for free.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 border border-muted-foreground/30 bg-transparent text-primary-foreground shadow-xs transition-colors outline-none cursor-pointer disabled:pointer-events-none disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/30 data-[state=indeterminate]:text-primary',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current data-[state=checked]:animate-in data-[state=checked]:zoom-in-50 data-[state=checked]:duration-100 data-[state=indeterminate]:animate-in data-[state=indeterminate]:zoom-in-50 data-[state=indeterminate]:duration-100"
      >
        <Check className="size-3" strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
