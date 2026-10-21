import type { ReactNode } from 'react'

/**
 * Animated gradient border wrapper matching the membership sale form's visual
 * style (cyan → sky → cyan with 3s infinite cycle). The gradient sits as a
 * 1.5px border via padding; the inner container holds the real content.
 *
 * Injects the `@keyframes` rule once per mount — safe for multiple instances
 * because the browser deduplicates identical `@keyframes` names.
 */
export function GradientBorder({
  colors = 'from-cyan-400 via-sky-500 to-cyan-600',
  className = '',
  children
}: {
  colors?: string
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="relative">
      <style>{`@keyframes gradientBorder{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>
      <div
        className={`rounded-xl bg-gradient-to-r ${colors} p-[1.5px] shadow-sm bg-[length:200%_200%] ${className}`}
        style={{ animation: 'gradientBorder 3s ease infinite' }}
      >
        {children}
      </div>
    </div>
  )
}
