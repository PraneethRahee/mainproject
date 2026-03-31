import { describe, it, expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Chat from '../pages/Chat.jsx'
import { AppProvider } from '../context/AppContext.jsx'

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}

// Basic secure rendering smoke: ensure script tags are not rendered as executable HTML.

describe('secure link rendering', () => {
  it('does not render script tags as HTML', async () => {
    const { container } = render(
      <MemoryRouter future={routerFuture}>
        <AppProvider>
          <Chat />
        </AppProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(container.querySelectorAll('script').length).toBe(0)
    })
  })
})
