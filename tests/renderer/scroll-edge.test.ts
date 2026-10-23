import { describe, expect, it } from 'vitest'
import { scrollEdge } from '@/lib/scroll-edge'

describe('sidebar scroll edge', () => {
  it('hides the control when the page fits', () => {
    expect(scrollEdge({ scrollTop: 0, scrollHeight: 600, clientHeight: 600 }).canScroll).toBe(
      false
    )
  })

  it('offers a scroll down control in the middle', () => {
    expect(scrollEdge({ scrollTop: 120, scrollHeight: 1600, clientHeight: 600 })).toEqual({
      canScroll: true,
      atBottom: false
    })
  })

  it('flips to back to top near the bottom', () => {
    expect(scrollEdge({ scrollTop: 1000, scrollHeight: 1600, clientHeight: 600 })).toEqual({
      canScroll: true,
      atBottom: true
    })
  })
})
