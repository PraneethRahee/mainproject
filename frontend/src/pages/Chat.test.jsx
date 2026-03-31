import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Chat from './Chat.jsx'
import { AppProvider } from '../context/AppContext.jsx'

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}

// Smoke test: chat shell renders (Google-style layout includes “Chats” title).

describe('Chat page', () => {
  it('renders chat layout shell', async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <AppProvider>
          <Chat />
        </AppProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/^Chats$/i)).toBeInTheDocument()
    })
  })
})
