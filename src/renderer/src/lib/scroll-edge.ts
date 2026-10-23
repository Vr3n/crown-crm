export interface ScrollEdgeInput {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export interface ScrollEdge {
  canScroll: boolean
  atBottom: boolean
}

/** Pure state for the sidebar scroll control, so it can be unit tested. */
export function scrollEdge({ scrollTop, scrollHeight, clientHeight }: ScrollEdgeInput): ScrollEdge {
  return {
    canScroll: scrollHeight > clientHeight + 8,
    atBottom: scrollHeight - scrollTop - clientHeight < 24
  }
}
