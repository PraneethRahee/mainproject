import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { iconChat, iconPeople } from './ChatLayoutIcons.jsx'

export function ChatRail({
  accountMenuRef,
  userInitials,
  accountMenuOpen,
  setAccountMenuOpen,
  friendsPanelOpen,
  setFriendsPanelOpen,
  onBackupKeys,
}) {
  const { user, logout } = useApp()
  const navigate = useNavigate()

  return (
    <aside className="gchat-rail" aria-label="Primary navigation">
      <button 
        type="button" 
        className={`gchat-rail-btn ${!friendsPanelOpen ? 'gchat-rail-btn--active' : ''}`}
        title="Chat"
        onClick={() => setFriendsPanelOpen(false)}
      >
        {iconChat}
      </button>
      <button 
        type="button" 
        className={`gchat-rail-btn ${friendsPanelOpen ? 'gchat-rail-btn--active' : ''}`}
        title="Friends" 
        onClick={() => setFriendsPanelOpen(true)}
      >
        {iconPeople}
      </button>
      <div className="gchat-rail-spacer" />
      <div className="gchat-rail-footer" ref={accountMenuRef}>
        <button
          type="button"
          className="gchat-rail-user"
          title={user?.email || user?.name || 'Account'}
          aria-expanded={accountMenuOpen}
          aria-haspopup="menu"
          onClick={() => setAccountMenuOpen((v) => !v)}
        >
          {userInitials}
        </button>
        {accountMenuOpen && (
          <div className="gchat-account-menu" role="menu">
            <div className="gchat-account-menu-header">
              <div className="gchat-account-menu-name">{user?.name || 'Signed in'}</div>
              {user?.email ? <div className="gchat-account-menu-email">{user.email}</div> : null}
            </div>
            <div className="gchat-account-menu-divider" role="separator" />
            {user?.role === 'admin' && (
              <NavLink
                className="gchat-account-menu-item"
                role="menuitem"
                to="/admin/audit-logs"
                onClick={() => setAccountMenuOpen(false)}
              >
                Audit logs
              </NavLink>
            )}
            <NavLink
              className="gchat-account-menu-item"
              role="menuitem"
              to="/settings/linked-devices"
              onClick={() => setAccountMenuOpen(false)}
            >
              Linked devices
            </NavLink>
            <button
              type="button"
              className="gchat-account-menu-item"
              role="menuitem"
              onClick={() => {
                setAccountMenuOpen(false)
                onBackupKeys?.()
              }}
            >
              🔐&nbsp; Backup E2E Keys
            </button>
            <div className="gchat-account-menu-divider" role="separator" />
            <button
              type="button"
              className="gchat-account-menu-item gchat-account-menu-item--danger"
              role="menuitem"
              onClick={() => {
                setAccountMenuOpen(false)
                logout()
                navigate('/login', { replace: true })
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

export default ChatRail
