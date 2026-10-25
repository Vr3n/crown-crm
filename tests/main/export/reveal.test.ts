import { describe, expect, it, vi } from 'vitest'

const { showItemInFolder } = vi.hoisted(() => ({ showItemInFolder: vi.fn() }))

vi.mock('electron', () => ({ shell: { showItemInFolder } }))

import { revealSavedFile } from '../../../src/main/export/reveal'

describe('revealSavedFile', () => {
  it('asks the shell to select the saved file', () => {
    revealSavedFile('C:/Users/me/Documents/sales.xlsx')
    expect(showItemInFolder).toHaveBeenCalledWith('C:/Users/me/Documents/sales.xlsx')
  })

  it('swallows a shell failure so a saved file still counts as saved', () => {
    showItemInFolder.mockImplementationOnce(() => {
      throw new Error('no file manager')
    })
    expect(() => revealSavedFile('C:/gone/file.pdf')).not.toThrow()
  })
})
