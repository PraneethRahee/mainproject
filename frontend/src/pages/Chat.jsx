import { useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest, getAccessToken, refreshAccessToken } from '../lib/session.js'
import { config } from '../config/env.js'
import { connectSocket, joinChannel, joinGroup } from '../lib/socket.js'
import { useApp } from '../context/AppContext.jsx'
import {
  initE2E,
  encryptDmMessage,
  decryptDmMessage,
  ensureGroupSenderKey,
  encryptGroupMessage,
  decryptGroupMessage,
} from '../e2e/e2eService.js'
import { idbSet, idbGet } from '../e2e/idb.js'
import StoryTray from '../components/StoryTray.jsx'
import { VoiceNotePlayer, VoiceNotePlayerFromFile } from '../chat/VoiceNotePlayer.jsx'
import { MessageAttachments } from '../chat/attachments/MessageAttachments.jsx'
import { ChatInfoPanel } from '../chat/info/ChatInfoPanel.jsx'
import { MessageThread } from '../chat/thread/MessageThread.jsx'
import { ChatComposer } from '../chat/composer/ChatComposer.jsx'
import { ChatToast } from '../chat/modals/ChatToast.jsx'
import { MessageSearchModal } from '../chat/modals/MessageSearchModal.jsx'
import { ForwardMessagesModal } from '../chat/modals/ForwardMessagesModal.jsx'
import { ChatLockOverlay } from '../chat/modals/ChatLockOverlay.jsx'
import {
  MemberProfileModal,
  RemoveMemberConfirmModal,
  AbuseBlockModal,
  AbuseReportModal,
} from '../chat/modals/MemberActionModals.jsx'
import { ChatRail } from '../chat/layout/ChatRail.jsx'
import { ChatSidebar } from '../chat/layout/ChatSidebar.jsx'
import { ChatMainHeader } from '../chat/layout/ChatMainHeader.jsx'
import { ChatPinnedBar } from '../chat/layout/ChatPinnedBar.jsx'
import { ChatMultiSelectBar } from '../chat/layout/ChatMultiSelectBar.jsx'
import { ChatThreadPanel } from '../chat/layout/ChatThreadPanel.jsx'
import FriendsPanel from '../components/FriendsPanel.jsx'
import { E2EKeyBackupModal, useE2EBackupModal } from '../components/E2EKeyBackupModal.jsx'

function initialsFromString(value) {
  const s = String(value ?? '').trim()
  if (!s) return '?'
  const compact = s.replace(/\s+/g, '')
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase()
  return s.slice(0, 2).toUpperCase()
}

// Voice note + attachments rendering extracted to ../chat/*

function Chat() {
  const { user } = useApp()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [friendsPanelOpen, setFriendsPanelOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef(null)
  const storyFocusId = (() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('focus') !== 'story') return null
      const id = params.get('storyId')
      const clean = id ? String(id).trim() : ''
      return clean ? clean : null
    } catch {
      return null
    }
  })()

  const callFocusId = (() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('focus') !== 'call') return null
      const id = params.get('callId')
      const clean = id ? String(id).trim() : ''
      return clean ? clean : null
    } catch {
      return null
    }
  })()

  const messageFocus = (() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('focus') !== 'message') return null
      const conversationId = params.get('conversationId')
      const messageId = params.get('messageId')
      const conv = conversationId ? String(conversationId).trim() : ''
      const mid = messageId ? String(messageId).trim() : ''
      return conv && mid ? { conversationId: conv, messageId: mid } : null
    } catch {
      return null
    }
  })()

  const removeMessageFocusQuery = () => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('focus') !== 'message') return
      params.delete('focus')
      params.delete('conversationId')
      params.delete('messageId')
      const qs = params.toString()
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}`,
      )
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!accountMenuOpen) return
    const handlePointerDown = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [accountMenuOpen])
  const [channels, setChannels] = useState([])
  const [dmInfoByChannelId, setDmInfoByChannelId] = useState({})
  const [groupMembersById, setGroupMembersById] = useState({})
  const [activeChannel, setActiveChannel] = useState(null)
  const [search, setSearch] = useState('')
  const [filteredChannels, setFilteredChannels] = useState([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [channelsError, setChannelsError] = useState('')

  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [nextCursor, setNextCursor] = useState(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [replyJumpHighlightId, setReplyJumpHighlightId] = useState(null)
  const isLoadingMoreRef = useRef(false)
  const nextCursorRef = useRef(null)
  const replyJumpTokenRef = useRef(0)
  const replyJumpHighlightTimerRef = useRef(null)
  const messageFocusHandledRef = useRef(false)
  const lastEnterSendAtRef = useRef(0)

  const [composerText, setComposerText] = useState('')
  const [composerError, setComposerError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const sendInFlightRef = useRef(false)
  const [composerGroupMetadata, setComposerGroupMetadata] = useState(null)
  const [composerMemberInfo, setComposerMemberInfo] = useState(null)
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false)
  const [voiceRecordingElapsedSec, setVoiceRecordingElapsedSec] = useState(0)
  const MAX_VOICE_NOTE_SECONDS = 60

  const [attachments, setAttachments] = useState([])
  const [attachmentError, setAttachmentError] = useState('')
  const [messageStatus, setMessageStatus] = useState({})
  const [replyToDraft, setReplyToDraft] = useState(null)
  const [reactionPickerFor, setReactionPickerFor] = useState(null)
  const [messageMenuFor, setMessageMenuFor] = useState(null)
  const [showStarredOnly, setShowStarredOnly] = useState(false)

  // Task 3: Multi-select + Forward flow
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedMessageIds, setSelectedMessageIds] = useState([])
  const [forwardModalOpen, setForwardModalOpen] = useState(false)
  const [forwardTargetQuery, setForwardTargetQuery] = useState('')
  const [forwardTargetChannelId, setForwardTargetChannelId] = useState(null)
  const [forwarding, setForwarding] = useState(false)
  const [forwardError, setForwardError] = useState('')

  // For realtime status updates (delivered/read) based on message visibility.
  const deliveredEmittedRef = useRef(new Set())
  const readEmittedRef = useRef(new Set())

  // Close reaction picker on outside click.
  useEffect(() => {
    if (!reactionPickerFor) return
    const onDown = (e) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-reaction-picker-wrap]')) return
      setReactionPickerFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [reactionPickerFor])

  useEffect(() => {
    if (!messageMenuFor) return
    const onDown = (e) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-message-menu-wrap]')) return
      setMessageMenuFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [messageMenuFor])

  const threadRef = useRef(null)
  const fileInputRef = useRef(null)
  const attachmentsRef = useRef([])
  const mediaRecorderRef = useRef(null)
  const recordingStreamRef = useRef(null)
  const voiceChunksRef = useRef([])
  const voiceMimeTypeRef = useRef('')
  const voiceRecordingWantedRef = useRef(false)
  const voiceRecordingStartMsRef = useRef(0)
  const voiceRecordingIntervalRef = useRef(null)
  const voiceMaxStopTriggeredRef = useRef(false)
  const voiceMaxErrorTimeoutRef = useRef(null)
  const voiceRecordingDiscardRef = useRef(false)
  const [typingUsers, setTypingUsers] = useState({})
  const [presence, setPresence] = useState({})
  const typingTimeoutRef = useRef(null)
  const [chatInfoOpen, setChatInfoOpen] = useState(false)
  const [chatInfoLoading, setChatInfoLoading] = useState(false)
  const [chatInfoError, setChatInfoError] = useState('')
  const [chatInfo, setChatInfo] = useState(null)
  const [chatInfoTab, setChatInfoTab] = useState('overview')
  const [chatInfoMemberQuery, setChatInfoMemberQuery] = useState('')
  const [selectedMemberInfo, setSelectedMemberInfo] = useState(null)
  const [adminActionLoadingFor, setAdminActionLoadingFor] = useState('')
  const [adminActionError, setAdminActionError] = useState('')
  const [removeConfirmMember, setRemoveConfirmMember] = useState(null)
  const [groupSettingsSaving, setGroupSettingsSaving] = useState(false)
  const [blockedUserIds, setBlockedUserIds] = useState([])
  const [abuseModalBlockState, setAbuseModalBlockState] = useState(null) // { targetUserId, mode: 'block'|'unblock', label }
  const [abuseModalReportState, setAbuseModalReportState] = useState(null) // { targetUserId, reason, details }
  const [abuseActionLoadingFor, setAbuseActionLoadingFor] = useState(null)

  const [chatLockLoading, setChatLockLoading] = useState(false)
  const [chatLocked, setChatLocked] = useState(false)
  const [chatLockLoaded, setChatLockLoaded] = useState(false)
  const [chatLockUnlockToken, setChatLockUnlockToken] = useState(null)
  const [chatLockUnlockExpiresAt, setChatLockUnlockExpiresAt] = useState(null)
  const [chatLockPinDraft, setChatLockPinDraft] = useState('')
  const [chatLockSettingsPinDraft, setChatLockSettingsPinDraft] = useState('')
  const [chatLockActionLoading, setChatLockActionLoading] = useState(false)
  const [chatLockError, setChatLockError] = useState('')

  const [e2eVerificationLoading, setE2eVerificationLoading] = useState(false)
  const [e2eVerificationError, setE2eVerificationError] = useState('')
  const [e2eVerificationState, setE2eVerificationState] = useState(null)

  const chatLockUnlockTokenValid = useMemo(() => {
    if (!chatLockUnlockToken || !chatLockUnlockExpiresAt) return false
    const t = new Date(chatLockUnlockExpiresAt).getTime()
    if (Number.isNaN(t)) return false
    return t > Date.now()
  }, [chatLockUnlockToken, chatLockUnlockExpiresAt])

  const chatUnlocked = chatLockLoaded && (!chatLocked || chatLockUnlockTokenValid)

  const apiRequestWithChatLock = (path, options = {}) => {
    const headers = options.headers ? { ...options.headers } : {}
    if (chatLockUnlockTokenValid && chatLockUnlockToken) {
      headers['x-chat-lock-token'] = chatLockUnlockToken
    }
    return apiRequest(path, { ...options, headers })
  }
  const [groupInviteLoading, setGroupInviteLoading] = useState(false)
  const [groupInviteError, setGroupInviteError] = useState('')
  const [groupInvite, setGroupInvite] = useState(null) // { token, expiresAt, invitePath }
  const [groupInviteQrDataUrl, setGroupInviteQrDataUrl] = useState('')

  const decryptOrderComparator = (a, b) => {
    const ta = new Date(a?.createdAt || 0).getTime()
    const tb = new Date(b?.createdAt || 0).getTime()
    if (ta !== tb) return ta - tb

    // If server timestamps tie, prioritize system messages (sender-key distribution)
    // before regular encrypted group payloads.
    const aSystemRank = a?.type === 'system' ? 0 : 1
    const bSystemRank = b?.type === 'system' ? 0 : 1
    if (aSystemRank !== bSystemRank) return aSystemRank - bSystemRank

    return String(a?.id || '').localeCompare(String(b?.id || ''))
  }
  const isMembershipSystemMessage = (message) => {
    if (!message || message.type !== 'system') return false
    if (message.ciphertext || message.ciphertextType) return false
    const content = String(message.content || '').trim()
    if (!content) return false
    return /\b(joined|left)\b$/i.test(content)
  }
  const formatMembershipSystemToast = (message) => {
    const content = String(message?.content || '').trim()
    const joinedMatch = content.match(/^(.*)\s+joined$/i)
    if (joinedMatch) {
      const name = String(joinedMatch[1] || '').trim() || 'Someone'
      return `Member joined: ${name}`
    }
    const leftMatch = content.match(/^(.*)\s+left$/i)
    if (leftMatch) {
      const name = String(leftMatch[1] || '').trim() || 'Someone'
      return `Member left: ${name}`
    }
    return 'Group membership updated'
  }
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(false)
  const [joinRequestsError, setJoinRequestsError] = useState('')
  const [joinRequests, setJoinRequests] = useState([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [auditLogsError, setAuditLogsError] = useState('')
  const [auditLogs, setAuditLogs] = useState([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [mediaSectionLoading, setMediaSectionLoading] = useState({
    images: false,
    videos: false,
    documents: false,
    links: false,
    audio: false,
  })
  const [isE2EChat, setIsE2EChat] = useState(false)
  const [mediaSections, setMediaSections] = useState({
    images: [],
    videos: [],
    documents: [],
    links: [],
    audio: [],
  })
  const [mediaCursors, setMediaCursors] = useState({
    images: null,
    videos: null,
    documents: null,
    links: null,
    audio: null,
  })
  const [toastQueue, setToastQueue] = useState([])
  const [activeToast, setActiveToast] = useState(null)
  const [messageSearchOpen, setMessageSearchOpen] = useState(false)
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [messageSearchLoading, setMessageSearchLoading] = useState(false)
  const [messageSearchResults, setMessageSearchResults] = useState([])
  const [messageSearchError, setMessageSearchError] = useState('')
  const [memberNameById, setMemberNameById] = useState({})
  const enqueueToast = (type, text) => {
    setToastQueue((q) => [...q, { id: `${Date.now()}-${Math.random()}`, type, text }])
  }


  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setChannelsLoading(true)
        setChannelsError('')
        const [chRes, dmRes] = await Promise.all([
          apiRequest('/channels'),
          apiRequest('/conversations?limit=100'),
        ])

        const chData = await chRes.json().catch(() => ({}))
        const dmData = await dmRes.json().catch(() => ({}))

        const dmMap = {}
        if (dmRes.ok && Array.isArray(dmData.conversations)) {
          for (const c of dmData.conversations) {
            if (!c || !c.channelId) continue
            dmMap[String(c.channelId)] = {
              otherUserId: c.otherUserId || null,
              conversationId: c.id || null,
            }
          }
        }

        if (!cancelled && chRes.ok && Array.isArray(chData.channels)) {
          setDmInfoByChannelId(dmMap)
          setChannels(chData.channels)
          if (!activeChannel && chData.channels.length > 0) {
            setActiveChannel(chData.channels[0])
          }
        } else if (!cancelled && !chRes.ok) {
          setChannelsError(chData.error || 'Failed to load channels')
        }
      } catch {
        if (!cancelled) {
          setChannels([])
          setChannelsError('Failed to load channels')
        }
      } finally {
        if (!cancelled) setChannelsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [e2eReady, setE2eReady] = useState(false)

  // Initialize E2E keys once user is available.
  useEffect(() => {
    if (!user || !user.id) return
    let cancelled = false
    ;(async () => {
      try {
        await initE2E()
        if (!cancelled) setE2eReady(true)
      } catch {
        // Backward compatible: plaintext still works if E2E init fails.
        if (cancelled) return
        setE2eReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Connect socket and join the active room only after auth:resume (handled in socket.js)
  useEffect(() => {
    connectSocket()
    if (activeChannel?._id && chatUnlocked) {
      if (activeChannel.type === 'group') {
        joinGroup(activeChannel._id)
      } else {
        joinChannel(activeChannel._id)
      }
    }
  }, [activeChannel?._id, activeChannel?.type, chatUnlocked])

  // Socket connection and event handlers
  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return

    const normalizeIncoming = (p) => {
      if (!p) return null
      const channelId = p.channelId || p.channel || p.conversationId
      const senderId = p.senderId || p.sender
      const receiverId = p.receiverId || null
      const createdAt = p.timestamp || p.createdAt || new Date().toISOString()
      return {
        id: p.id,
        channel: channelId,
        sender: senderId,
        receiverId,
        content: p.content ?? null,
        ciphertext: p.ciphertext ?? null,
        ciphertextType: p.ciphertextType ?? (p.encryption && p.encryption.mode !== 'none' ? p.encryption.mode : null),
        expiresAt: p.expiresAt ?? null,
        attachments: p.attachments || [],
        attachmentDetails: p.attachmentDetails || [],
        createdAt,
        editedAt: p.editedAt || null,
        type: p.type || 'text',
        reactions: p.reactions || [],
        replyTo: p.replyTo || null,
        deleted: Boolean(p.deleted),
        status: p.status || 'sent',
        isPinned: Boolean(p.isPinned),
        isStarred: Boolean(p.isStarred),
      }
    }

    const handleMessageNew = (payload) => {
      const normalized = normalizeIncoming(payload)
      if (!normalized || !normalized.channel || !activeChannel) return
      if (String(normalized.channel) !== String(activeChannel._id)) return
      if (!chatUnlocked) return
      if (activeChannel.type === 'group' && isMembershipSystemMessage(normalized)) {
        enqueueToast('success', formatMembershipSystemToast(normalized))
        return
      }

      setMessages((current) => {
        const exists = current.some((m) => m.id === normalized.id)
        if (exists) return current

        // If this is our own message, prefer merging into an optimistic temp message
        // instead of appending a duplicate (socket may arrive before POST resolves).
        if (user && String(normalized.sender) === String(user.id)) {
          const tempIdx = current.findIndex((m) => {
            if (!m?.id || !String(m.id).startsWith('temp-')) return false
            if (m.type !== normalized.type) return false
            const sameCipher = (m.ciphertext || null) === (normalized.ciphertext || null)
            const sameContent = (m.content || null) === (normalized.content || null)
            return sameCipher || sameContent
          })
          if (tempIdx !== -1) {
            const next = [...current]
            const optimisticContent = next[tempIdx].content
            next[tempIdx] = {
              ...next[tempIdx],
              ...normalized,
              // Preserve the optimistic plaintext — the socket-delivered E2E message
              // has content=null since the server stores only the ciphertext.
              content: normalized.content || optimisticContent,
            }
            return next
          }
        }

        return [...current, normalized]
      })

      // Decrypt if needed, then patch content in-place.
      if (normalized.ciphertextType && normalized.ciphertext) {
        ;(async () => {
          try {
            let plaintext = null
            if (activeChannel.type === 'dm') {
              const isOwnMessage = user && String(normalized.sender) === String(user.id)

              // Sender can never decrypt their own Signal-encrypted DM messages — the
              // ciphertext is encrypted with the *receiver's* public key only.
              // The realtime socket delivers the message back to the sender, but the
              // content is already correct from the optimistic merge above.
              // We cache the plaintext in IDB so history loads can show it too.
              if (isOwnMessage) {
                const existingContent = await idbGet(`sentMsg_${normalized.id}`)
                  .catch(() => null)
                if (!existingContent) {
                  // Content should already be the real text in the optimistic message;
                  // try to read it from current state and persist it.
                  setMessages((current) => {
                    const found = current.find((m) => m.id === normalized.id)
                    if (found?.content && found.content !== 'Unable to decrypt message') {
                      idbSet(`sentMsg_${normalized.id}`, found.content).catch(() => {})
                    }
                    return current
                  })
                }
                // Do NOT attempt to decrypt — it will always fail for own DM messages.
                return
              }

              const peerUserId = String(normalized.sender)
              if (!peerUserId) throw new Error('Missing peer user id for DM decryption')
              const cachedContent = await idbGet(`decryptedMsg_${normalized.id}`).catch(() => null)
              if (cachedContent) {
                plaintext = cachedContent
              } else {
                plaintext = await decryptDmMessage(peerUserId, normalized.ciphertext)
                if (plaintext !== null && plaintext !== 'Unable to decrypt message') {
                  idbSet(`decryptedMsg_${normalized.id}`, plaintext).catch(() => {})
                }
              }
            } else if (activeChannel.type === 'group') {
              plaintext = await decryptGroupMessage(
                String(activeChannel._id),
                String(normalized.sender),
                normalized.ciphertext,
                String(user?.id || ''),
              )
              if (plaintext === null) {
                // sender-key distribution message; remove it from thread
                setMessages((current) => current.filter((m) => m.id !== normalized.id))
                return
              }
            }

            if (plaintext !== null) {
              setMessages((current) =>
                current.map((m) => (m.id === normalized.id ? { ...m, content: plaintext } : m)),
              )
            }
          } catch (err) {
            if (activeChannel.type === 'group') {
              for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                  await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
                  const retryPlaintext = await decryptGroupMessage(
                    String(activeChannel._id),
                    String(normalized.sender),
                    normalized.ciphertext,
                    String(user?.id || ''),
                  )
                  if (retryPlaintext === null) {
                    setMessages((current) => current.filter((m) => m.id !== normalized.id))
                    return
                  }
                  setMessages((current) =>
                    current.map((m) => (m.id === normalized.id ? { ...m, content: retryPlaintext } : m)),
                  )
                  return
                } catch (retryErr) {
                  if (import.meta.env.DEV) {
                    console.warn('[E2E] group.realtime.retry_decrypt_failed', {
                      attempt: attempt + 1,
                      messageId: normalized.id,
                      channelId: activeChannel?._id,
                      senderId: normalized.sender,
                      type: normalized.type,
                      ciphertextType: normalized.ciphertextType,
                      error: retryErr?.message || String(retryErr),
                    })
                  }
                  // continue retry loop
                }
              }
            }
            if (import.meta.env.DEV) {
              console.warn('[E2E] message.realtime.decrypt_failed', {
                messageId: normalized.id,
                channelId: activeChannel?._id,
                channelType: activeChannel?.type,
                senderId: normalized.sender,
                type: normalized.type,
                ciphertextType: normalized.ciphertextType,
                error: err?.message || String(err),
              })
            }
            setMessages((current) =>
              current.map((m) =>
                m.id === normalized.id ? { ...m, content: m.content || 'Unable to decrypt message' } : m,
              ),
            )
          }
        })()
      }

      // Ensure we show at least "Sent" immediately for own messages (DM + group).
      if (user && String(normalized.sender) === String(user.id)) {
        setMessageStatus((current) => {
          if (current[normalized.id]) return current

          // Group payloads include status; channel payloads don't.
          const s = normalized.status || 'sent'
          return {
            ...current,
            [normalized.id]: {
              delivered: activeChannel.type === 'group' ? s === 'delivered' || s === 'read' : false,
              read: activeChannel.type === 'group' ? s === 'read' : false,
            },
          }
        })
      }
    }

    const handleTypingUpdate = (payload) => {
      if (!payload || !payload.channelId || !payload.userId || !activeChannel) return
      if (String(payload.channelId) !== String(activeChannel._id)) return
      setTypingUsers((current) => {
        const next = { ...current }
        if (payload.typing) {
          next[payload.userId] = true
        } else {
          delete next[payload.userId]
        }
        return next
      })
    }

    const handlePresenceUpdate = (payload) => {
      if (!payload || !payload.userId) return
      setPresence((current) => ({
        ...current,
        [payload.userId]: {
          status: payload.status || 'online',
          updatedAt: payload.updatedAt || new Date().toISOString(),
        },
      }))
    }

    const handleAttachmentStatus = (payload) => {
      if (!payload || !payload.id || !payload.status) return
      setAttachments((current) =>
        current.map((att) =>
          att.fileId === payload.id
            ? {
                ...att,
                securityStatus: payload.status,
              }
            : att,
        ),
      )
    }

    const handleMessageDelivered = (payload) => {
      if (!payload || !payload.messageId) return
      if (!activeChannel || !user) return

      const messageId = payload.messageId
      const msg = messages.find((m) => m.id === messageId)
      if (!msg) return
      if (String(msg.channel) !== String(activeChannel._id)) return
      if (String(msg.sender) !== String(user.id)) return

      setMessageStatus((current) => {
        const prev = current[messageId] || { delivered: false, read: false }
        return {
          ...current,
          [messageId]: {
            delivered: true,
            read: prev.read,
          },
        }
      })
    }

    const handleMessageRead = (payload) => {
      if (!payload || !payload.messageId) return
      if (!activeChannel || !user) return

      const messageId = payload.messageId
      const msg = messages.find((m) => m.id === messageId)
      if (!msg) return
      if (String(msg.channel) !== String(activeChannel._id)) return
      if (String(msg.sender) !== String(user.id)) return

      setMessageStatus((current) => {
        const prev = current[messageId] || { delivered: false, read: false }
        return {
          ...current,
          [messageId]: {
            delivered: true,
            read: true,
          },
        }
      })
    }

    const handleChannelUpdated = () => {
      // Refresh channels list when channel metadata changes
      ;(async () => {
        try {
          const res = await apiRequest('/channels')
          const data = await res.json().catch(() => ({}))
          if (res.ok && Array.isArray(data.channels)) {
            setChannels(data.channels)
          }
        } catch {
          // ignore
        }
      })()
    }

    socket.on('message:new', handleMessageNew)
    socket.on('typing:update', handleTypingUpdate)
    socket.on('presence:update', handlePresenceUpdate)
    socket.on('attachment:status', handleAttachmentStatus)
    socket.on('channel:updated', handleChannelUpdated)
    socket.on('message:delivered', handleMessageDelivered)
    socket.on('message:read', handleMessageRead)
    socket.on('group:message:new', handleMessageNew)
    socket.on('group:message:delivered', handleMessageDelivered)
    socket.on('group:message:read', handleMessageRead)
    socket.on('group:message:reactions', (payload) => {
      if (!payload || !payload.messageId) return
      if (!activeChannel || activeChannel.type !== 'group') return
      if (payload.groupId && String(payload.groupId) !== String(activeChannel._id)) return
      const nextReactions = Array.isArray(payload.reactions) ? payload.reactions : []
      setMessages((current) => current.map((m) => (m.id === payload.messageId ? { ...m, reactions: nextReactions } : m)))
    })
    socket.on('group:message:edited', (payload) => {
      if (!payload || !payload.messageId) return
      if (!activeChannel || activeChannel.type !== 'group') return
      if (payload.groupId && String(payload.groupId) !== String(activeChannel._id)) return
      setMessages((current) =>
        current.map((m) =>
          m.id === payload.messageId
            ? {
                ...m,
                content: payload.content ?? m.content,
                editedAt: payload.editedAt ?? m.editedAt ?? null,
              }
            : m,
        ),
      )
    })

    return () => {
      socket.off('message:new', handleMessageNew)
      socket.off('typing:update', handleTypingUpdate)
      socket.off('presence:update', handlePresenceUpdate)
      socket.off('attachment:status', handleAttachmentStatus)
      socket.off('channel:updated', handleChannelUpdated)
      socket.off('message:delivered', handleMessageDelivered)
      socket.off('message:read', handleMessageRead)
      socket.off('group:message:new', handleMessageNew)
      socket.off('group:message:delivered', handleMessageDelivered)
      socket.off('group:message:read', handleMessageRead)
      socket.off('group:message:reactions')
      socket.off('group:message:edited')
    }
  }, [activeChannel, messages, user, chatLocked, chatUnlocked])

  useEffect(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      setFilteredChannels(channels)
      return
    }
    setFilteredChannels(
      channels.filter((c) => c.name.toLowerCase().includes(q)),
    )
  }, [channels, search])

  const handleSelectChannel = (channel) => {
    setActiveChannel(channel)
    setMessages([])
    setNextCursor(null)
    setMessagesError('')
    setComposerText('')
    setComposerError('')
    setMessageStatus({})
    setReplyToDraft(null)
    setMessageMenuFor(null)
    setShowStarredOnly(false)
    setMultiSelectMode(false)
    setSelectedMessageIds([])
    setForwardModalOpen(false)
    setForwardTargetQuery('')
    setForwardTargetChannelId(null)
    setForwardError('')
    setSidebarOpen(false)
    setChatInfoOpen(false)
    setChatInfoError('')
    setChatInfo(null)
    setChatInfoTab('overview')
    setChatInfoMemberQuery('')
    setSelectedMemberInfo(null)
    setAdminActionError('')
    setRemoveConfirmMember(null)
    setGroupSettingsSaving(false)
    setGroupInviteLoading(false)
    setGroupInviteError('')
    setGroupInvite(null)
    setGroupInviteQrDataUrl('')
    setJoinRequestsLoading(false)
    setJoinRequestsError('')
    setJoinRequests([])
    setAuditLogsLoading(false)
    setAuditLogsError('')
    setAuditLogs([])
    setMessageSearchOpen(false)
    setMessageSearchQuery('')
    setMessageSearchResults([])
    setMessageSearchError('')
  }

  const getChannelLabel = (channel) =>
    channel.type === 'dm' ? channel.name : `# ${channel.name}`

  const activeTitle = activeChannel ? getChannelLabel(activeChannel) : '# Select a channel'
  const activeDraftKey = activeChannel?._id ? `gchat:draft:${activeChannel._id}` : ''

  useEffect(() => {
    if (!activeChannel?._id) {
      setComposerText('')
      return
    }
    try {
      const stored = localStorage.getItem(`gchat:draft:${activeChannel._id}`) || ''
      setComposerText(stored)
    } catch {
      setComposerText('')
    }
  }, [activeChannel?._id])

  useEffect(() => {
    if (!activeDraftKey) return
    try {
      if (composerText) {
        localStorage.setItem(activeDraftKey, composerText)
      } else {
        localStorage.removeItem(activeDraftKey)
      }
    } catch {
      // ignore local storage errors
    }
  }, [activeDraftKey, composerText])

  useEffect(() => {
    if (!activeChannel?._id) {
      setMemberNameById({})
      setComposerGroupMetadata(null)
      setComposerMemberInfo(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiRequest(`/channels/${activeChannel._id}/info`)
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok) return
        const next = {}
        const members = Array.isArray(data.members) ? data.members : []
        for (const m of members) {
          if (!m || !m.id) continue
          next[String(m.id)] = m.displayName || m.email || String(m.id)
        }
        if (!cancelled) setMemberNameById(next)
        if (!cancelled) {
          setComposerGroupMetadata(data.channel?.metadata || null)
          const selfId = user?.id ? String(user.id) : null
          const selfMember =
            selfId && Array.isArray(data.members)
              ? data.members.find((m) => m && String(m.id) === selfId) || null
              : null
          setComposerMemberInfo(selfMember)
        }
      } catch {
        if (!cancelled) setMemberNameById({})
        if (!cancelled) {
          setComposerGroupMetadata(null)
          setComposerMemberInfo(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeChannel?._id, user?.id])

  useEffect(() => {
    if (!chatInfoOpen || !activeChannel?._id) return

    let cancelled = false
    ;(async () => {
      try {
        setChatInfoLoading(true)
        setChatInfoError('')
        const res = await apiRequest(`/channels/${activeChannel._id}/info`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return

        if (!res.ok) {
          setChatInfo(null)
          setChatInfoError(data.error || 'Failed to load chat info')
          return
        }

        setChatInfo({
          channel: data.channel || null,
          memberCount: Number(data.memberCount) || 0,
          members: Array.isArray(data.members) ? data.members : [],
          admins: Array.isArray(data.admins) ? data.admins : [],
        })
        setChatInfoMemberQuery('')
        setAdminActionError('')
      } catch {
        if (!cancelled) {
          setChatInfo(null)
          setChatInfoError('Failed to load chat info')
        }
      } finally {
        if (!cancelled) setChatInfoLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chatInfoOpen, activeChannel?._id])

  useEffect(() => {
    if (!activeChannel) {
      setMessages([])
      setNextCursor(null)
      setMessagesError('')
      return
    }

    if (!chatUnlocked) {
      setMessages([])
      setNextCursor(null)
      setMessagesError('')
      setMessagesLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setMessagesLoading(true)
        setMessagesError('')
        const res = await apiRequestWithChatLock(`/messages/${activeChannel._id}?limit=30`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && Array.isArray(data.messages)) {
          const normalized = data.messages.map((m) => ({
            id: m.id,
            channel: m.channelId || m.conversationId,
            sender: m.senderId || m.sender,
            receiverId: m.receiverId || null,
            content: m.content ?? null,
            ciphertext: m.ciphertext ?? null,
            ciphertextType: m.ciphertextType ?? (m.encryption && m.encryption.mode !== 'none' ? m.encryption.mode : null),
            attachments: m.attachments || [],
            attachmentDetails: m.attachmentDetails || [],
            createdAt: m.timestamp || m.createdAt,
            editedAt: m.editedAt || null,
            type: m.type || 'text',
            expiresAt: m.expiresAt ?? null,
            reactions: m.reactions || [],
            replyTo: m.replyTo || null,
            deleted: Boolean(m.deleted),
            status: m.status || 'sent',
            isPinned: Boolean(m.isPinned),
            isStarred: Boolean(m.isStarred),
          }))

          // Decrypt in chronological order so session bootstrap/ratchet-dependent
          // ciphertexts (DM + group sender-key distribution) are processed first.
          const decryptQueue = [...normalized].sort(decryptOrderComparator)
          const decrypted = []
          for (const msg of decryptQueue) {
            if (msg.ciphertextType && msg.ciphertext && user && user.id) {
              try {
                if (activeChannel.type === 'dm') {
                  const isOwnMessage = user && String(msg.sender) === String(user.id)
                  if (isOwnMessage) {
                    // Sender's own messages are encrypted with the receiver's key —
                    // they cannot be decrypted locally. Use the IDB plaintext cache.
                    const cached = await idbGet(`sentMsg_${msg.id}`).catch(() => null)
                    if (cached) {
                      msg.content = cached
                    } else {
                      msg.content = msg.content || '[Message sent by you]'
                    }
                  } else {
                    const peerUserId = String(msg.sender)
                    const cachedContent = await idbGet(`decryptedMsg_${msg.id}`).catch(() => null)
                    if (cachedContent) {
                      msg.content = cachedContent
                    } else {
                      msg.content = await decryptDmMessage(peerUserId, msg.ciphertext)
                      if (msg.content && msg.content !== 'Unable to decrypt message') {
                        idbSet(`decryptedMsg_${msg.id}`, msg.content).catch(() => {})
                      }
                    }
                  }
                } else if (activeChannel.type === 'group') {
                  const pt = await decryptGroupMessage(String(activeChannel._id), String(msg.sender), msg.ciphertext, String(user.id))
                  if (pt === null) continue
                  msg.content = pt
                }
              } catch (err) {
                if (import.meta.env.DEV && activeChannel.type === 'group') {
                  console.warn('[E2E] message.history.decrypt_failed', {
                    phase: 'initial_load',
                    messageId: msg.id,
                    channelId: activeChannel?._id,
                    senderId: msg.sender,
                    type: msg.type,
                    ciphertextType: msg.ciphertextType,
                    error: err?.message || String(err),
                  })
                }
                msg.content = msg.content || 'Unable to decrypt message'
              }
            }
            decrypted.push(msg)
          }

          const visible = decrypted.filter((m) => !isMembershipSystemMessage(m))
          const sorted = [...visible].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          )
          setMessages(sorted)
          setNextCursor(data.nextCursor || null)

          if (activeChannel.type === 'group') {
            const nextStatus = {}
            for (const m of visible) {
              const s = m.status || 'sent'
              nextStatus[m.id] = {
                delivered: s === 'delivered' || s === 'read',
                read: s === 'read',
              }
            }
            setMessageStatus(nextStatus)
          } else if (activeChannel.type === 'dm') {
            // For DM, REST doesn't include delivered/read breakdown; show at least "Sent" for own messages.
            const nextStatus = {}
            for (const m of normalized) {
              if (user && String(m.sender) === String(user.id)) {
                nextStatus[m.id] = { delivered: false, read: false }
              }
            }
            setMessageStatus(nextStatus)
          }
        } else {
          setMessages([])
          setNextCursor(null)
          setMessagesError(data.error || 'Failed to load messages')
        }
      } catch {
        if (!cancelled) {
          setMessages([])
          setNextCursor(null)
          setMessagesError('Failed to load messages')
        }
      } finally {
        if (!cancelled) setMessagesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeChannel?._id, chatLocked, chatUnlocked])

  // Emit delivered/read as messages become visible.
  useEffect(() => {
    if (!activeChannel) return
    const socket = connectSocket()
    if (!socket) return
    const root = threadRef.current
    if (!root) return

    deliveredEmittedRef.current = new Set()
    readEmittedRef.current = new Set()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target
          const messageId = el.getAttribute('data-message-id')
          if (!messageId) continue
          if (String(messageId).startsWith('temp-')) continue

          if (entry.intersectionRatio >= 0.1) {
            if (!deliveredEmittedRef.current.has(messageId)) {
              deliveredEmittedRef.current.add(messageId)
              if (activeChannel.type === 'group') {
                socket.emit('group:message:delivered', { messageId })
              } else {
                socket.emit('message:delivered', { messageId, channelId: activeChannel._id })
              }
            }
          }

          if (entry.intersectionRatio >= 0.9) {
            if (!readEmittedRef.current.has(messageId)) {
              readEmittedRef.current.add(messageId)
              if (activeChannel.type === 'group') {
                socket.emit('group:message:read', { messageId })
              } else {
                socket.emit('message:read', { messageId, channelId: activeChannel._id })
              }
            }
          }
        }
      },
      {
        root,
        threshold: [0.1, 0.9],
      },
    )

    const elements = root.querySelectorAll('[data-message-id]')
    elements.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [activeChannel?._id, activeChannel?.type, messages])

  const handleLoadMore = async () => {
    if (!activeChannel || !nextCursorRef.current || isLoadingMoreRef.current) return false
    if (!threadRef.current) return
    if (!chatUnlocked) return false

    const container = threadRef.current
    const prevScrollHeight = container.scrollHeight

    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const res = await apiRequestWithChatLock(
        `/messages/${activeChannel._id}?limit=30&cursor=${encodeURIComponent(nextCursorRef.current)}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.messages) || data.messages.length === 0) {
        nextCursorRef.current = null
        setNextCursor(null)
        return false
      }
      const normalized = data.messages.map((m) => ({
        id: m.id,
        channel: m.channelId || m.conversationId,
        sender: m.senderId || m.sender,
        receiverId: m.receiverId || null,
        content: m.content ?? null,
        ciphertext: m.ciphertext ?? null,
        ciphertextType: m.ciphertextType ?? (m.encryption && m.encryption.mode !== 'none' ? m.encryption.mode : null),
        attachments: m.attachments || [],
        attachmentDetails: m.attachmentDetails || [],
        createdAt: m.timestamp || m.createdAt,
        editedAt: m.editedAt || null,
        type: m.type || 'text',
        expiresAt: m.expiresAt ?? null,
        reactions: m.reactions || [],
        replyTo: m.replyTo || null,
        deleted: Boolean(m.deleted),
        status: m.status || 'sent',
        isPinned: Boolean(m.isPinned),
        isStarred: Boolean(m.isStarred),
      }))

      const decryptQueue = [...normalized].sort(decryptOrderComparator)
      const decrypted = []
      for (const msg of decryptQueue) {
        if (msg.ciphertextType && msg.ciphertext && user && user.id) {
          try {
            if (activeChannel.type === 'dm') {
              const isOwnMessage = user && String(msg.sender) === String(user.id)
              if (isOwnMessage) {
                const cached = await idbGet(`sentMsg_${msg.id}`).catch(() => null)
                if (cached) {
                  msg.content = cached
                } else {
                  msg.content = msg.content || '[Message sent by you]'
                }
              } else {
                const peerUserId = String(msg.sender)
                const cachedContent = await idbGet(`decryptedMsg_${msg.id}`).catch(() => null)
                if (cachedContent) {
                  msg.content = cachedContent
                } else {
                  msg.content = await decryptDmMessage(peerUserId, msg.ciphertext)
                  if (msg.content && msg.content !== 'Unable to decrypt message') {
                    idbSet(`decryptedMsg_${msg.id}`, msg.content).catch(() => {})
                  }
                }
              }
            } else if (activeChannel.type === 'group') {
              const pt = await decryptGroupMessage(String(activeChannel._id), String(msg.sender), msg.ciphertext, String(user.id))
              if (pt === null) continue
              msg.content = pt
            }
          } catch (err) {
            if (import.meta.env.DEV && activeChannel.type === 'group') {
              console.warn('[E2E] message.history.decrypt_failed', {
                phase: 'load_more',
                messageId: msg.id,
                channelId: activeChannel?._id,
                senderId: msg.sender,
                type: msg.type,
                ciphertextType: msg.ciphertextType,
                error: err?.message || String(err),
              })
            }
            msg.content = msg.content || 'Unable to decrypt message'
          }
        }
        decrypted.push(msg)
      }

      const visibleOlder = decrypted.filter((m) => !isMembershipSystemMessage(m))
      const older = [...visibleOlder].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      setMessages((current) => [...older, ...current])
      nextCursorRef.current = data.nextCursor || null
      setNextCursor(nextCursorRef.current)

      if (activeChannel.type === 'group') {
        setMessageStatus((current) => {
          const next = { ...current }
          for (const m of older) {
            const s = m.status || 'sent'
            next[m.id] = {
              delivered: s === 'delivered' || s === 'read',
              read: s === 'read',
            }
          }
          return next
        })
      } else if (activeChannel.type === 'dm') {
        setMessageStatus((current) => {
          const next = { ...current }
          for (const m of older) {
            if (user && String(m.sender) === String(user.id)) {
              next[m.id] = { delivered: false, read: false }
            }
          }
          return next
        })
      }

      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight
        container.scrollTop = newScrollHeight - prevScrollHeight
      })
      return true
    } catch {
      // ignore, keep nextCursor as-is
      return false
    } finally {
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }

  const handleThreadScroll = (event) => {
    const container = event.currentTarget
    if (container.scrollTop < 40 && nextCursorRef.current && !isLoadingMoreRef.current) {
      handleLoadMore()
    }
  }

  useEffect(() => {
    nextCursorRef.current = nextCursor
  }, [nextCursor])

  useEffect(() => {
    // Clear highlight when switching chats to avoid leaking state across conversations.
    if (replyJumpHighlightTimerRef.current) {
      clearTimeout(replyJumpHighlightTimerRef.current)
      replyJumpHighlightTimerRef.current = null
    }
    setReplyJumpHighlightId(null)
  }, [activeChannel?._id])

  const getMessageElement = (messageId) => {
    const container = threadRef.current
    if (!container) return null
    const raw = String(messageId)
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(raw) : raw
    try {
      return container.querySelector(`[data-message-id="${esc}"]`)
    } catch {
      return container.querySelector(`[data-message-id="${raw}"]`)
    }
  }

  const highlightMessage = (messageId) => {
    if (!messageId) return
    const idStr = String(messageId)
    setReplyJumpHighlightId(idStr)
    if (replyJumpHighlightTimerRef.current) clearTimeout(replyJumpHighlightTimerRef.current)
    replyJumpHighlightTimerRef.current = setTimeout(() => {
      setReplyJumpHighlightId(null)
      replyJumpHighlightTimerRef.current = null
    }, 1600)
  }

  async function jumpToReplyOriginal(originalMessageId) {
    if (!activeChannel || !originalMessageId) return
    const targetId = String(originalMessageId)
    const token = ++replyJumpTokenRef.current

    const prevShowStarredOnly = showStarredOnly
    if (prevShowStarredOnly) {
      setShowStarredOnly(false)
      // Wait for render so the quoted message becomes part of `displayedMessages`.
      await new Promise((r) => requestAnimationFrame(() => r()))
    }

    const tryScrollAndHighlight = () => {
      if (replyJumpTokenRef.current !== token) return false
      const el = getMessageElement(targetId)
      if (!el) return false
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      highlightMessage(targetId)
      return true
    }

    if (tryScrollAndHighlight()) {
      if (prevShowStarredOnly) {
        setTimeout(() => {
          if (replyJumpTokenRef.current === token) setShowStarredOnly(true)
        }, 2000)
      }
      return
    }

    // Lazy-load older pages until the original is present (or history is exhausted).
    const maxPages = 25
    let pagesLoaded = 0
    while (pagesLoaded < maxPages && replyJumpTokenRef.current === token && nextCursorRef.current) {
      const loaded = await handleLoadMore()
      if (!loaded) break
      pagesLoaded += 1
      await new Promise((r) => requestAnimationFrame(() => r()))
      if (tryScrollAndHighlight()) break
    }

    if (replyJumpTokenRef.current !== token) return

    if (!getMessageElement(targetId)) {
      enqueueToast('error', 'Could not find the original message in this chat history')
    }

    if (prevShowStarredOnly) {
      setTimeout(() => {
        if (replyJumpTokenRef.current === token) setShowStarredOnly(true)
      }, 2500)
    }
  }

  // Phase 5: mobile-ready deep-link for message notifications.
  // When opened with `?focus=message&conversationId=...&messageId=...`, we:
  // 1) select the correct conversation
  // 2) lazy-load until the message is present
  // 3) scroll + highlight it
  useEffect(() => {
    if (!messageFocus) return
    messageFocusHandledRef.current = false
  }, [messageFocus, activeChannel?._id])

  useEffect(() => {
    if (!messageFocus) return
    if (channelsLoading) return
    if (!Array.isArray(channels) || channels.length === 0) return
    const targetConversationId = String(messageFocus.conversationId)
    const activeId = activeChannel && (activeChannel._id || activeChannel.id) ? String(activeChannel._id || activeChannel.id) : null
    if (activeId && activeId === targetConversationId) return

    const getId = (ch) => (ch && (ch._id || ch.id) ? String(ch._id || ch.id) : null)
    const targetChannel = channels.find((c) => getId(c) === targetConversationId)
    if (targetChannel) {
      handleSelectChannel(targetChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageFocus, channelsLoading, channels])

  useEffect(() => {
    if (!messageFocus) return
    if (!activeChannel) return
    if (messagesLoading) return

    const activeId = activeChannel && (activeChannel._id || activeChannel.id) ? String(activeChannel._id || activeChannel.id) : null
    if (!activeId || activeId !== String(messageFocus.conversationId)) return
    if (messageFocusHandledRef.current) return

    messageFocusHandledRef.current = true

    const id = messageFocus.messageId
    if (id) {
      requestAnimationFrame(() => {
        void jumpToReplyOriginal(id)
      })
      removeMessageFocusQuery()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageFocus, activeChannel?._id, messagesLoading])

  // Presence ping
  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return

    const intervalId = setInterval(() => {
      socket.emit('presence:ping', { status: 'online' })
    }, 30000)

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  const blockedExtensions = [
    '.exe',
    '.dll',
    '.bat',
    '.cmd',
    '.ps1',
    '.sh',
    '.js',
    '.msi',
    '.apk',
  ]

  const uploadFileWithProgress = async (file, localId) => {
    const formData = new FormData()
    formData.append('file', file)

    const attemptUpload = (tokenToUse) =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const url = `${config.apiBaseUrl}/files/upload`
        xhr.open('POST', url)

        if (tokenToUse) {
          xhr.setRequestHeader('Authorization', `Bearer ${tokenToUse}`)
        }

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return
          const percent = Math.round((event.loaded / event.total) * 100)
          setAttachments((current) =>
            current.map((att) => (att.localId === localId ? { ...att, progress: percent } : att)),
          )
        }

        xhr.onreadystatechange = () => {
          if (xhr.readyState !== XMLHttpRequest.DONE) return

          if (xhr.status >= 200 && xhr.status < 300) {
            let data = {}
            try {
              data = JSON.parse(xhr.responseText || '{}')
            } catch {
              // ignore parse error, handled below
            }

            if (!data.id) {
              reject({ status: xhr.status, errorMessage: 'Upload succeeded but no file ID returned' })
              return
            }

            setAttachments((current) =>
              current.map((att) =>
                att.localId === localId
                  ? {
                      ...att,
                      status: 'uploaded',
                      fileId: data.id,
                      progress: 100,
                      securityStatus: 'uploaded',
                    }
                  : att,
              ),
            )
            resolve(data.id)
            return
          }

          let errorMessage = 'Failed to upload file'
          try {
            const data = JSON.parse(xhr.responseText || '{}')
            if (data && data.error) errorMessage = data.error
          } catch {
            // ignore, use default message
          }
          reject({ status: xhr.status, errorMessage })
        }

        xhr.onerror = () => {
          reject({ status: xhr.status, errorMessage: 'Network error during file upload' })
        }

        xhr.send(formData)
      })

    let retried = false

    while (true) {
      const token = getAccessToken()
      try {
        return await attemptUpload(token)
      } catch (err) {
        const status = err?.status
        const errorMessage = err?.errorMessage || 'Failed to upload file'

        if (status === 401 && !retried) {
          retried = true

          // Clear previous error, then retry with a refreshed token.
          setAttachments((current) =>
            current.map((att) =>
              att.localId === localId ? { ...att, status: 'uploading', errorMessage: '', progress: 0 } : att,
            ),
          )

          const newToken = await refreshAccessToken()
          if (!newToken) {
            throw new Error('Invalid or expired token')
          }
          continue
        }

        setAttachments((current) =>
          current.map((att) =>
            att.localId === localId ? { ...att, status: 'error', errorMessage, progress: 0 } : att,
          ),
        )

        throw new Error(errorMessage)
      }
    }
  }

  // Keep a ref in sync with state for polling
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  // Poll backend for attachment safety status (uploaded/quarantined → scanned_clean/scanned_blocked)
  useEffect(() => {
    const hasPending = () =>
      attachmentsRef.current.some((att) =>
        ['uploaded', 'quarantined'].includes(att.securityStatus),
      )

    if (!hasPending()) {
      return undefined
    }

    const poll = async () => {
      const current = attachmentsRef.current
      const pending = current.filter(
        (att) =>
          att.fileId &&
          ['uploaded', 'quarantined'].includes(att.securityStatus) &&
          att.status !== 'error',
      )

      if (pending.length === 0) {
        return
      }

      for (const att of pending) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const res = await apiRequest(`/files/${att.fileId}/status`)
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data || !data.status) {
            if (res.status === 404) {
              setAttachments((currentAttachments) =>
                currentAttachments.map((item) =>
                  item.localId === att.localId
                    ? {
                        ...item,
                        status: 'error',
                        securityStatus: 'scanned_blocked',
                        errorMessage: 'File no longer available',
                      }
                    : item,
                ),
              )
            }
            continue
          }

          const status = data.status
          if (!['uploaded', 'quarantined', 'scanned_clean', 'scanned_blocked'].includes(status)) {
            continue
          }

          setAttachments((currentAttachments) =>
            currentAttachments.map((item) =>
              item.localId === att.localId
                ? {
                    ...item,
                    securityStatus: status,
                  }
                : item,
            ),
          )
        } catch {
          // ignore transient failures
        }
      }
    }

    const intervalId = setInterval(poll, 2000)
    void poll()

    return () => {
      clearInterval(intervalId)
    }
  }, [attachments])

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current
    const stream = recordingStreamRef.current
    mediaRecorderRef.current = null
    voiceRecordingWantedRef.current = false
    setIsRecordingVoiceNote(false)
    setVoiceRecordingElapsedSec(0)
    voiceMaxStopTriggeredRef.current = false
    if (voiceMaxErrorTimeoutRef.current) {
      clearTimeout(voiceMaxErrorTimeoutRef.current)
      voiceMaxErrorTimeoutRef.current = null
    }
    if (voiceRecordingIntervalRef.current) {
      clearInterval(voiceRecordingIntervalRef.current)
      voiceRecordingIntervalRef.current = null
    }

    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
    } catch {
      // ignore
    }

    if (stream) {
      try {
        stream.getTracks().forEach((t) => t.stop())
      } catch {
        // ignore
      }
    }
    recordingStreamRef.current = null
  }

  const cancelVoiceRecording = () => {
    voiceRecordingDiscardRef.current = true
    setComposerError('')
    setAttachmentError('')
    stopVoiceRecording()
  }

  const startVoiceRecording = async () => {
    if (!activeChannel) return
    if (isSending) return
    if (isRecordingVoiceNote) return

    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      setComposerError('Voice notes are not supported in this browser')
      return
    }

    setComposerError('')
    setAttachmentError('')
    voiceRecordingWantedRef.current = true
    voiceRecordingDiscardRef.current = false
    voiceMaxStopTriggeredRef.current = false
    if (voiceMaxErrorTimeoutRef.current) {
      clearTimeout(voiceMaxErrorTimeoutRef.current)
      voiceMaxErrorTimeoutRef.current = null
    }
    voiceRecordingStartMsRef.current = Date.now()
    setVoiceRecordingElapsedSec(0)
    if (voiceRecordingIntervalRef.current) clearInterval(voiceRecordingIntervalRef.current)
    voiceRecordingIntervalRef.current = setInterval(() => {
      const ms = Date.now() - voiceRecordingStartMsRef.current
      const elapsed = ms / 1000
      setVoiceRecordingElapsedSec(elapsed)

      if (elapsed >= MAX_VOICE_NOTE_SECONDS && !voiceMaxStopTriggeredRef.current) {
        voiceMaxStopTriggeredRef.current = true
        setComposerError(`Voice note max duration is ${MAX_VOICE_NOTE_SECONDS}s`)
        voiceMaxErrorTimeoutRef.current = setTimeout(() => {
          setComposerError('')
        }, 2500)
        stopVoiceRecording()
      }
    }, 200)

    // If the user re-records, replace the previous *voice-note* draft(s).
    setAttachments((current) => {
      for (const a of current) {
        if (a.source !== 'voice') continue
        if (a.previewUrl && String(a.previewUrl).startsWith('blob:')) {
          try {
            URL.revokeObjectURL(a.previewUrl)
          } catch {
            // ignore
          }
        }
      }
      return current.filter((a) => a.source !== 'voice')
    })

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!voiceRecordingWantedRef.current) {
        try {
          stream.getTracks().forEach((t) => t.stop())
        } catch {
          // ignore
        }
        return
      }
      const chunks = []
      voiceChunksRef.current = chunks

      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
      const chosenMime =
        candidates.find((c) => (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c))) ||
        ''

      const recorder = chosenMime ? new MediaRecorder(stream, { mimeType: chosenMime }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recordingStreamRef.current = stream
      voiceMimeTypeRef.current = recorder.mimeType || chosenMime || 'audio/webm'

      recorder.ondataavailable = (e) => {
        if (!e?.data) return
        if (e.data.size <= 0) return
        voiceChunksRef.current.push(e.data)
      }

      recorder.onerror = () => {
        setComposerError('Failed to access microphone for voice note')
        setIsRecordingVoiceNote(false)
        setVoiceRecordingElapsedSec(0)
        if (voiceRecordingIntervalRef.current) {
          clearInterval(voiceRecordingIntervalRef.current)
          voiceRecordingIntervalRef.current = null
        }
      }

      recorder.onstop = async () => {
        // Ensure timer is cleared even if stop was triggered outside pointer-up.
        setVoiceRecordingElapsedSec(0)
        if (voiceRecordingIntervalRef.current) {
          clearInterval(voiceRecordingIntervalRef.current)
          voiceRecordingIntervalRef.current = null
        }

        // If the user explicitly cancelled, discard chunks and do not create/upload an attachment.
        if (voiceRecordingDiscardRef.current) {
          voiceRecordingDiscardRef.current = false
          voiceChunksRef.current = []
          return
        }

        const blobType = voiceMimeTypeRef.current || 'audio/webm'
        const blob = new Blob(voiceChunksRef.current || [], { type: blobType })
        const MIN_BYTES = 1024

        if (!blob || blob.size < MIN_BYTES) {
          setComposerError('Voice note is too short')
          voiceChunksRef.current = []
          return
        }

        const ext = String(blobType).toLowerCase().includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blobType })
        const localId = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const previewUrl = URL.createObjectURL(blob)

        setAttachments((current) => [
          ...current,
          {
            localId,
            fileName: file.name,
            size: file.size,
            mimeType: file.type || blobType,
            progress: 0,
            status: 'uploading',
            fileId: null,
            errorMessage: '',
            previewUrl,
            securityStatus: 'uploaded',
            source: 'voice',
          },
        ])

        try {
          await uploadFileWithProgress(file, localId)
        } catch (err) {
          setComposerError(err?.message || 'Failed to send voice note')
        } finally {
          voiceChunksRef.current = []
        }
      }

      recorder.start()
      setIsRecordingVoiceNote(true)
    } catch {
      setComposerError('Microphone permission denied')
    }
  }

  useEffect(() => {
    return () => {
      // Avoid leaving the microphone open when this component unmounts.
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
      } catch {
        // ignore
      }
      try {
        if (recordingStreamRef.current) recordingStreamRef.current.getTracks().forEach((t) => t.stop())
      } catch {
        // ignore
      }
    }
  }, [])

  const handleFileInputChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    if (!activeChannel) {
      setAttachmentError('Select a channel before attaching files')
      return
    }

    setAttachmentError('')

    for (const file of files) {
      const lowerName = (file.name || '').toLowerCase()
      const blocked = blockedExtensions.some((ext) => lowerName.endsWith(ext))
      if (blocked) {
        setAttachmentError(
          `Files with extension ${lowerName.slice(
            lowerName.lastIndexOf('.'),
          )} are not allowed for upload`,
        )
        continue
      }

      const localId = `att-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const previewUrl =
        file.type && (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))
          ? URL.createObjectURL(file)
          : null

      setAttachments((current) => [
        ...current,
        {
          localId,
          fileName: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          progress: 0,
          status: 'uploading',
          fileId: null,
          errorMessage: '',
          previewUrl,
          securityStatus: 'uploaded',
          source: 'file',
        },
      ])

      try {
        // eslint-disable-next-line no-await-in-loop
        await uploadFileWithProgress(file, localId)
      } catch (err) {
        console.error('Attachment upload error', err)
        setAttachmentError(err.message || 'Failed to upload attachment')
      }
    }

    event.target.value = ''
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const formatDisappearingRemaining = (expiresAt) => {
    if (!expiresAt) return ''
    const t = new Date(expiresAt).getTime()
    if (Number.isNaN(t)) return ''
    const sec = Math.max(0, Math.floor((t - Date.now()) / 1000))
    if (sec <= 0) return 'Disappearing…'
    if (sec < 60) return `Disappears in ${sec}s`
    const m = Math.floor(sec / 60)
    if (m < 60) return `Disappears in ${m}m`
    const h = Math.floor(m / 60)
    return `Disappears in ${h}h`
  }

  const isSafeUrl = (value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  const renderMessageContent = (content) => {
    const text = content || ''
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = []
    let lastIndex = 0
    let match

    // eslint-disable-next-line no-cond-assign
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
      }
      const candidate = match[0]
      if (isSafeUrl(candidate)) {
        parts.push({ type: 'link', value: candidate })
      } else {
        parts.push({ type: 'text', value: candidate })
      }
      lastIndex = urlRegex.lastIndex
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIndex) })
    }

    return parts.map((part, index) => {
      if (part.type === 'link') {
        return (
          <a
            key={`link-${index}-${part.value}`}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part.value}
          </a>
        )
      }
      return <span key={`text-${index}`}>{part.value}</span>
    })
  }

  const renderMessageAttachments = (message) => (
    <MessageAttachments message={message} apiRequest={apiRequest} />
  )

  const renderReplyPreview = (message) => {
    const r = message && message.replyTo
    if (!r || !r.id) return null
    const senderId = r.sender || r.senderId || ''
    const senderText =
      senderId && senderId.length > 22 ? `${senderId.slice(0, 20)}…` : senderId || 'Unknown'

    return (
      <div
        className="gchat-reply-preview"
        role="button"
        tabIndex={0}
        aria-label="Jump to quoted message"
        onClick={(e) => {
          e.stopPropagation()
          void jumpToReplyOriginal(r.id)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          e.stopPropagation()
          void jumpToReplyOriginal(r.id)
        }}
      >
        <div className="gchat-reply-preview-top">
          <span className="gchat-reply-preview-label">Replying to {senderText}</span>
        </div>
        <div className="gchat-reply-preview-content">
          {r.content ? r.content : '(quoted message)'}
        </div>
      </div>
    )
  }

  const renderMessageReactions = (message) => {
    const reactions = Array.isArray(message.reactions) ? message.reactions : []
    if (reactions.length === 0) return null

    return (
      <div className="gchat-reactions" aria-label="Reactions">
        {reactions
          .slice()
          .sort((a, b) => (b.userIds?.length || 0) - (a.userIds?.length || 0))
          .map((r) => {
            const count = r.userIds?.length || 0
            const mine =
              user &&
              Array.isArray(r.userIds) &&
              r.userIds.some((id) => String(id) === String(user.id))

            return (
              <button
                key={`${message.id}-react-${r.emoji}`}
                type="button"
                className={`gchat-reaction-chip${mine ? ' gchat-reaction-chip--mine' : ''}`}
                onClick={() => handleToggleGroupReaction(message.id, r.emoji)}
                title="Toggle reaction"
              >
                <span className="gchat-reaction-emoji">{r.emoji}</span>
                <span className="gchat-reaction-count">{count}</span>
              </button>
            )
          })}
      </div>
    )
  }

  const renderMessageStatus = (message) => {
    const status = messageStatus[message.id]
    if (!status) return null

    let label = 'Sent'
    if (status.read) {
      label = 'Read'
    } else if (status.delivered) {
      label = 'Delivered'
    }

    const className =
      label === 'Read'
        ? 'gchat-msg-status gchat-msg-status--read'
        : 'gchat-msg-status'

    return <span className={className}>{label}</span>
  }

  const senderDisplay = (m) => {
    if (user && String(m.sender) === String(user.id)) return 'You'
    const id = String(m.sender)
    if (memberNameById[id]) return memberNameById[id]
    return id.length > 22 ? `${id.slice(0, 20)}…` : id
  }

  const getChannelId = (ch) => (ch && (ch._id || ch.id)) || null

  const canForwardMessage = (m) => Boolean(m && !m.deleted && m.type !== 'system')

  const clearMultiSelect = () => {
    setMultiSelectMode(false)
    setSelectedMessageIds([])
    setForwardModalOpen(false)
    setForwardTargetQuery('')
    setForwardTargetChannelId(null)
    setForwardError('')
    setMessageMenuFor(null)
  }

  const toggleMessageSelected = (messageId) => {
    if (!messageId) return
    setSelectedMessageIds((current) => {
      const exists = current.includes(messageId)
      const next = exists ? current.filter((id) => id !== messageId) : [...current, messageId]
      if (next.length === 0) {
        setMultiSelectMode(false)
        setForwardModalOpen(false)
        setForwardTargetChannelId(null)
        setForwardError('')
      }
      return next
    })
  }

  const startForwardFromMessage = (message) => {
    if (!message?.id) return
    if (!canForwardMessage(message)) return
    setMultiSelectMode(true)
    setSelectedMessageIds([message.id])
    setForwardModalOpen(true)
    setForwardTargetChannelId(null)
    setForwardTargetQuery('')
    setForwardError('')
    setMessageMenuFor(null)
  }

  const handleConfirmForward = async () => {
    if (forwarding) return
    setForwardError('')
    if (!chatUnlocked) {
      setForwardError('Chat is locked')
      return
    }

    if (!forwardTargetChannelId) {
      setForwardError('Select a chat to forward to')
      return
    }

    const targetChannel = channels.find((c) => String(getChannelId(c)) === String(forwardTargetChannelId))
    if (!targetChannel) {
      setForwardError('Target chat not found')
      return
    }

    const selected = selectedMessageIds
      .map((id) => messages.find((m) => m.id === id))
      .filter(Boolean)
      .slice()
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())

    if (selected.length === 0) {
      setForwardError('Nothing selected to forward')
      return
    }

    const ALLOWED_MESSAGE_TYPES = ['text', 'image', 'video', 'file', 'system']
    const MAX_FORWARD_TEXT = 1500

    const buildForwardPlaintext = (msg) => {
      const senderLabel = senderDisplay(msg)
      const originalText = typeof msg.content === 'string' ? msg.content.trim() : ''
      const base = originalText ? `Forwarded from ${senderLabel}: ${originalText}` : `Forwarded from ${senderLabel}`
      if (base.length <= MAX_FORWARD_TEXT) return base
      return `${base.slice(0, MAX_FORWARD_TEXT)}…`
    }

    const targetId = String(getChannelId(targetChannel))
    setForwarding(true)
    try {
      let okCount = 0
      let failedCount = 0

      if (targetChannel.type === 'dm') {
        const dmInfo = dmInfoByChannelId[String(targetId)] || {}
        const otherUserId = dmInfo.otherUserId
        if (!otherUserId) throw new Error('DM recipient unknown (missing /conversations data)')

        for (const msg of selected) {
          try {
            const attachmentIds = Array.isArray(msg.attachments) ? msg.attachments.filter(Boolean) : []
            const msgType = ALLOWED_MESSAGE_TYPES.includes(msg.type)
              ? msg.type
              : attachmentIds.length > 0
                ? 'file'
                : 'text'
            const plaintext = buildForwardPlaintext(msg)

            const encrypted = await encryptDmMessage(String(otherUserId), plaintext)
            const body = {
              conversationId: targetId,
              receiverId: String(otherUserId),
              type: msgType,
              ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
              ...encrypted,
            }

            const res = await apiRequestWithChatLock('/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              failedCount += 1
              enqueueToast('error', data.error || 'Failed to forward a message')
            } else {
              okCount += 1
            }
          } catch {
            failedCount += 1
            enqueueToast('error', 'Failed to forward a message')
          }
        }
      } else if (targetChannel.type === 'group') {
        // Ensure group members are loaded for target encryption.
        let members = groupMembersById[String(targetId)]
        if (!Array.isArray(members) || members.length === 0) {
          const metaRes = await apiRequest(`/group/messages/${targetId}?limit=1`)
          const meta = await metaRes.json().catch(() => ({}))
          members = meta?.group?.members || []
          setGroupMembersById((cur) => ({ ...cur, [String(targetId)]: members }))
        }

        const senderKey = await ensureGroupSenderKey(targetId, members, String(user.id))

        // Send sender-key distribution message once (best-effort).
        let distributionSent = false
        if (
          !distributionSent &&
          senderKey?.distribution &&
          senderKey.distribution.keys &&
          Object.keys(senderKey.distribution.keys).length > 0
        ) {
          const distRes = await apiRequestWithChatLock('/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: targetId,
              type: 'system',
              ciphertextType: 'signal_senderkey_v1',
              ciphertext: JSON.stringify(senderKey.distribution),
            }),
          })
          if (!distRes.ok) {
            const distData = await distRes.json().catch(() => ({}))
            throw new Error(distData.error || 'Failed to distribute group sender key')
          }
          distributionSent = true
        }

        for (const msg of selected) {
          try {
            const attachmentIds = Array.isArray(msg.attachments) ? msg.attachments.filter(Boolean) : []
            const msgType = ALLOWED_MESSAGE_TYPES.includes(msg.type)
              ? msg.type
              : attachmentIds.length > 0
                ? 'file'
                : 'text'
            const plaintext = buildForwardPlaintext(msg)

            const encrypted = await encryptGroupMessage(targetId, plaintext, senderKey)
            const body = {
              conversationId: targetId,
              type: msgType,
              ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
              ...encrypted,
            }

            const res = await apiRequestWithChatLock('/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              failedCount += 1
              enqueueToast('error', data.error || 'Failed to forward a message')
            } else {
              okCount += 1
            }
          } catch {
            failedCount += 1
            enqueueToast('error', 'Failed to forward a message')
          }
        }
      } else {
        throw new Error('Unsupported target chat type for forwarding')
      }

      if (okCount > 0) enqueueToast('success', `Forwarded ${okCount} message(s)`)
      if (failedCount > 0) enqueueToast('error', `${failedCount} message(s) failed to forward`)
      clearMultiSelect()
    } catch (err) {
      setForwardError(err?.message || 'Failed to forward messages')
      enqueueToast('error', err?.message || 'Failed to forward messages')
    } finally {
      setForwarding(false)
    }
  }

  const typingUserIds = Object.keys(typingUsers || {}).filter((id) => String(id) !== String(user?.id))
  const typingLabel =
    typingUserIds.length === 0
      ? ''
      : `${typingUserIds
          .slice(0, 2)
          .map((id) => memberNameById[String(id)] || String(id).slice(0, 8))
          .join(', ')}${
          typingUserIds.length > 2
            ? ' and others are typing…'
            : typingUserIds.length > 1
              ? ' are typing…'
              : ' is typing…'
        }`

  const displayedMessages = showStarredOnly
    ? messages.filter((m) => m && m.isStarred)
    : messages
  const pinnedMessages = messages.filter((m) => m && m.isPinned)

  const updateMessageFlag = (messageId, patch) => {
    setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, ...patch } : m)))
  }

  const handleTogglePin = async (message) => {
    if (!message?.id || String(message.id).startsWith('temp-')) return
    const endpoint = message.isPinned ? 'unpin' : 'pin'
    try {
      const res = await apiRequest(`/messages/${message.id}/${endpoint}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        enqueueToast('error', data.error || 'Failed to update pin')
        return
      }
      updateMessageFlag(message.id, { isPinned: !message.isPinned })
    } catch {
      enqueueToast('error', 'Failed to update pin')
    } finally {
      setMessageMenuFor(null)
    }
  }

  const handleToggleStar = async (message) => {
    if (!message?.id || String(message.id).startsWith('temp-')) return
    const endpoint = message.isStarred ? 'unstar' : 'star'
    try {
      const res = await apiRequest(`/messages/${message.id}/${endpoint}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        enqueueToast('error', data.error || 'Failed to update star')
        return
      }
      updateMessageFlag(message.id, { isStarred: !message.isStarred })
    } catch {
      enqueueToast('error', 'Failed to update star')
    } finally {
      setMessageMenuFor(null)
    }
  }

  const handleDeleteForEveryone = async (message) => {
    if (!message?.id || String(message.id).startsWith('temp-')) return
    try {
      const res = await apiRequest(`/messages/${message.id}?mode=everyone`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        enqueueToast('error', data.error || 'Failed to delete message')
        return
      }
      updateMessageFlag(message.id, { deleted: true, type: 'system', content: 'This message was deleted' })
    } catch {
      enqueueToast('error', 'Failed to delete message')
    } finally {
      setMessageMenuFor(null)
    }
  }

  const handleSend = async () => {
    if (!activeChannel || isSending || sendInFlightRef.current) return
    sendInFlightRef.current = true
    if (!chatUnlocked) {
      setComposerError('Chat is locked')
      sendInFlightRef.current = false
      return
    }
    if (
      activeChannel.type === 'group' &&
      composerGroupMetadata?.whoCanSend === 'adminsOnly' &&
      !composerMemberInfo?.isAdmin
    ) {
      setComposerError('Posting is restricted to group admins.')
      sendInFlightRef.current = false
      return
    }

    const text = composerText.trim()

    const MAX_LENGTH = 4000
    if (text.length > MAX_LENGTH) {
      setComposerError(`Message exceeds maximum length of ${MAX_LENGTH} characters`)
      sendInFlightRef.current = false
      return
    }

    setComposerError('')

    const cleanIds = attachments
      .filter((att) => att.securityStatus === 'scanned_clean' && att.fileId)
      .map((att) => att.fileId)

    // Prevent "message sent without attachments" UX.
    // Attachments must be `scanned_clean` before the backend will include them in the message.
    const selectedAttachmentIds = attachments.filter((att) => att.fileId).map((att) => att.fileId)
    if (selectedAttachmentIds.length > 0 && cleanIds.length === 0) {
      const blocked = attachments.filter((att) => att.securityStatus === 'scanned_blocked' && att.fileId)
      if (blocked.length > 0) {
        setComposerError('One or more attachments are blocked by the security scan')
        sendInFlightRef.current = false
        return
      }

      const pending = attachments.filter(
        (att) => ['uploaded', 'quarantined'].includes(att.securityStatus) && att.fileId,
      )
      if (pending.length > 0) {
        setComposerError('Attachment is still being scanned. Please wait a moment and try again.')
        sendInFlightRef.current = false
        return
      }

      setComposerError('Attachment is not ready yet. Please try again.')
      sendInFlightRef.current = false
      return
    }

    // Allow "attachment-only" sends (e.g., voice notes), but do not send an empty message.
    if (!text && cleanIds.length === 0) {
      setComposerError('Message cannot be empty')
      sendInFlightRef.current = false
      return
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setMessageStatus((current) => ({
      ...current,
      [tempId]: {
        delivered: false,
        read: false,
      },
    }))
    const optimistic = {
      id: tempId,
      channel: activeChannel._id,
      sender: 'you',
      content: text,
      attachments: cleanIds,
      attachmentDetails: [],
      createdAt: new Date().toISOString(),
      isPinned: false,
      isStarred: false,
    }

    setMessages((current) => [...current, optimistic])
    setComposerText('')
    setIsSending(true)

    try {
      let body = {
        conversationId: activeChannel._id,
        type: cleanIds.length > 0 ? 'file' : 'text',
        ...(replyToDraft ? { replyTo: replyToDraft.id } : {}),
        ...(cleanIds.length > 0 ? { attachmentIds: cleanIds } : {}),
      }

      if (activeChannel.type === 'dm') {
        const dmInfo = dmInfoByChannelId[String(activeChannel._id)] || {}
        const otherUserId = dmInfo.otherUserId
        if (!otherUserId) {
          throw new Error('DM recipient unknown (missing /conversations data)')
        }
        const encrypted = await encryptDmMessage(otherUserId, text)
        body = {
          ...body,
          receiverId: otherUserId,
          ...encrypted,
        }
      } else {
        // Group E2E: ensure sender key and encrypt using it.
        let members = groupMembersById[String(activeChannel._id)]
        if (!Array.isArray(members) || members.length === 0) {
          // Lazy-load members from group messages endpoint (it includes group metadata).
          const metaRes = await apiRequest(`/group/messages/${activeChannel._id}?limit=1`)
          const meta = await metaRes.json().catch(() => ({}))
          members = meta?.group?.members || []
          setGroupMembersById((cur) => ({ ...cur, [String(activeChannel._id)]: members }))
        }

        const senderKey = await ensureGroupSenderKey(activeChannel._id, members, user.id)
        // If we have distribution entries, send a distribution message once (best-effort).
        if (senderKey?.distribution && senderKey.distribution.keys && Object.keys(senderKey.distribution.keys).length > 0) {
          const distRes = await apiRequestWithChatLock('/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: activeChannel._id,
              type: 'system',
              ciphertextType: 'signal_senderkey_v1',
              ciphertext: JSON.stringify(senderKey.distribution),
            }),
          })
          if (!distRes.ok) {
            const distData = await distRes.json().catch(() => ({}))
            throw new Error(distData.error || 'Failed to distribute group sender key')
          }
        }

        const encrypted = await encryptGroupMessage(activeChannel._id, text, senderKey)
        body = {
          ...body,
          ...encrypted,
        }
      }

      const res = await apiRequestWithChatLock('/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setMessages((current) => current.filter((m) => m.id !== tempId))
        setComposerError(data.error || 'Failed to send message')
        setMessageStatus((current) => {
          const next = { ...current }
          delete next[tempId]
          return next
        })
        return
      }

      if (activeChannel.type === 'dm') {
        const finalId = data.id || data._id
        if (finalId) await idbSet(`sentMsg_${finalId}`, text).catch(() => {})
      }

      setMessages((current) => {
        // If the realtime socket already delivered this message (same id),
        // drop the optimistic temp message but patch the socket-delivered message
        // with the known plaintext — its content will be null for E2E DMs since
        // the sender cannot decrypt their own ciphertext.
        const alreadyIdx = current.findIndex((m) => m.id === data.id)
        if (alreadyIdx !== -1) {
          const next = current.filter((m) => m.id !== tempId)
          if (activeChannel.type === 'dm' && data.ciphertextType) {
            return next.map((m) =>
              m.id === data.id
                ? { ...m, content: m.content || text }
                : m,
            )
          }
          return next
        }

        return current.map((m) =>
          m.id === tempId
            ? {
                id: data.id,
                channel: data.channelId || data.conversationId || activeChannel._id,
                sender: data.senderId || data.sender,
                content: data.content ?? text,
                ciphertext: data.ciphertext || null,
                ciphertextType: data.ciphertextType || null,
                attachments: data.attachments || [],
                attachmentDetails: data.attachmentDetails || [],
                createdAt: data.timestamp || data.createdAt,
                editedAt: data.editedAt || null,
                type: data.type || m.type,
                reactions: data.reactions || [],
                replyTo: data.replyTo || null,
                deleted: Boolean(data.deleted),
                isPinned: Boolean(data.isPinned),
                isStarred: Boolean(data.isStarred),
              }
            : m,
        )
      })

      setMessageStatus((current) => {
        const prev = current[tempId] || { delivered: false, read: false }
        const next = { ...current }
        delete next[tempId]
        return {
          ...next,
          [data.id]: prev,
        }
      })

      // Clear attachments after a successful send
      setAttachments([])
      setReplyToDraft(null)
      if (activeDraftKey) {
        try {
          localStorage.removeItem(activeDraftKey)
        } catch {
          // ignore local storage errors
        }
      }
    } catch {
      setMessages((current) => current.filter((m) => m.id !== tempId))
      setComposerError('Failed to send message')
    } finally {
      setIsSending(false)
      sendInFlightRef.current = false
    }
  }

  const handleToggleGroupReaction = async (messageId, emoji) => {
    if (!activeChannel || activeChannel.type !== 'group') return
    if (!messageId || !emoji) return
    if (String(messageId).startsWith('temp-')) return

    try {
      await apiRequest(`/group/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emoji, action: 'toggle' }),
      })
    } catch {
      // ignore (UI will reconcile via socket event)
    }
  }

  const handleComposerKeyDown = (event) => {
    const composing = Boolean(event?.nativeEvent?.isComposing) || event?.keyCode === 229
    if (event.key === 'Enter' && !event.shiftKey && !event.repeat) {
      if (composing) return
      event.preventDefault()
      const now = Date.now()
      if (now - lastEnterSendAtRef.current < 350) return
      lastEnterSendAtRef.current = now
      handleSend()
      const socket = connectSocket()
      if (socket && activeChannel) {
        socket.emit('typing:stop', { channelId: activeChannel._id })
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }
    } else {
      const socket = connectSocket()
      if (!socket || !activeChannel) return

      socket.emit('typing:start', { channelId: activeChannel._id })

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      typingTimeoutRef.current = setTimeout(() => {
        const s = connectSocket()
        if (s && activeChannel) {
          s.emit('typing:stop', { channelId: activeChannel._id })
        }
      }, 3000)
    }
  }

  const userInitials = user
    ? initialsFromString(user.email || user.name || user.id)
    : '?'

  const headerInitials = activeChannel
    ? initialsFromString(activeChannel.name)
    : '?'
  const infoMembers = Array.isArray(chatInfo?.members) ? chatInfo.members : []
  const infoAdmins = Array.isArray(chatInfo?.admins) ? chatInfo.admins : []
  const creatorUser = chatInfo?.channel?.createdByUser || null
  const currentMemberInfo = infoMembers.find((m) => String(m.id) === String(user?.id)) || null
  const whoCanAddMembers = chatInfo?.channel?.metadata?.whoCanAddMembers || 'adminsOnly'
  const canManageAdmins =
    activeChannel?.type === 'group' &&
    Boolean(currentMemberInfo) &&
    (whoCanAddMembers === 'everyone' || Boolean(currentMemberInfo?.isAdmin))
  const dmOtherMember = (() => {
    if (activeChannel?.type !== 'dm') return null
    const fromInfo = infoMembers.find((m) => String(m.id) !== String(user?.id)) || infoMembers[0]
    if (fromInfo) return fromInfo
    const dmInfo = dmInfoByChannelId[String(activeChannel._id)]
    if (dmInfo && dmInfo.otherUserId) {
      return {
        id: dmInfo.otherUserId,
        displayName: activeChannel.name,
      }
    }
    return null
  })()
  const dmPresence = dmOtherMember ? presence[String(dmOtherMember.id)] : null
  const dmPresenceText =
    dmPresence && dmPresence.status && dmPresence.status !== 'offline'
      ? 'Online'
      : dmPresence?.updatedAt
        ? `Last seen ${new Date(dmPresence.updatedAt).toLocaleString()}`
        : 'Offline'
  const normalizedMemberQuery = chatInfoMemberQuery.trim().toLowerCase()
  const filteredInfoMembers = normalizedMemberQuery
    ? infoMembers.filter((m) => {
        const name = String(m.displayName || '').toLowerCase()
        const email = String(m.email || '').toLowerCase()
        return name.includes(normalizedMemberQuery) || email.includes(normalizedMemberQuery)
      })
    : infoMembers

  const refreshChatInfo = async () => {
    if (!activeChannel?._id) return
    setChatInfoLoading(true)
    setChatInfoError('')
    try {
      const res = await apiRequest(`/channels/${activeChannel._id}/info`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setChatInfoError(data.error || 'Failed to load chat info')
        return
      }
      setChatInfo({
        channel: data.channel || null,
        memberCount: Number(data.memberCount) || 0,
        members: Array.isArray(data.members) ? data.members : [],
        admins: Array.isArray(data.admins) ? data.admins : [],
      })

      // Keep composer policy enforcement in sync after group setting changes.
      setComposerGroupMetadata(data.channel?.metadata || null)
      const members = Array.isArray(data.members) ? data.members : []
      const selfId = user?.id ? String(user.id) : null
      const selfMember =
        selfId ? members.find((m) => m && String(m.id) === selfId) || null : null
      setComposerMemberInfo(selfMember)
    } catch {
      setChatInfoError('Failed to load chat info')
    } finally {
      setChatInfoLoading(false)
    }
  }

  const refreshAbuseBlocks = async () => {
    try {
      const res = await apiRequest('/abuse/blocks')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load blocks')
      const ids = Array.isArray(data.blocks) ? data.blocks.map((b) => String(b.userId)) : []
      setBlockedUserIds(ids)
    } catch {
      setBlockedUserIds([])
    }
  }

  useEffect(() => {
    if (!chatInfoOpen || !activeChannel?._id) return
    void refreshAbuseBlocks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatInfoOpen, activeChannel?._id])

  // Chat lock status (PIN-based) gating for message REST endpoints.
  useEffect(() => {
    if (!activeChannel?._id) {
      setChatLockLoading(false)
      setChatLocked(false)
      setChatLockLoaded(false)
      setChatLockUnlockToken(null)
      setChatLockUnlockExpiresAt(null)
      setChatLockPinDraft('')
      setChatLockSettingsPinDraft('')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setChatLockLoading(true)
        setChatLockLoaded(false)
        const res = await apiRequest(`/chat-lock/${activeChannel._id}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return

        if (!res.ok) {
          // Fail-open (privacy should be handled server-side; UI shouldn't trap the user).
          setChatLocked(false)
          setChatLockUnlockToken(null)
          setChatLockUnlockExpiresAt(null)
          return
        }

        setChatLocked(Boolean(data.locked))
        setChatLockUnlockToken(null)
        setChatLockUnlockExpiresAt(null)
      } catch {
        if (cancelled) return
        setChatLocked(false)
        setChatLockUnlockToken(null)
        setChatLockUnlockExpiresAt(null)
      } finally {
        if (!cancelled) {
          setChatLockLoading(false)
          setChatLockLoaded(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeChannel?._id])

  // Expire unlock token in UI when backend token lifetime elapses.
  useEffect(() => {
    if (!chatLockUnlockExpiresAt) return
    const ms = new Date(chatLockUnlockExpiresAt).getTime() - Date.now()
    if (!Number.isFinite(ms) || ms <= 0) {
      setChatLockUnlockToken(null)
      setChatLockUnlockExpiresAt(null)
      return
    }

    const t = setTimeout(() => {
      setChatLockUnlockToken(null)
      setChatLockUnlockExpiresAt(null)
    }, ms + 100)

    return () => clearTimeout(t)
  }, [chatLockUnlockExpiresAt])

  const handleChatUnlock = async () => {
    if (!activeChannel?._id) return
    const pin = String(chatLockPinDraft || '').trim()
    if (!/^\d{4,8}$/.test(pin)) {
      setChatLockError('PIN must be 4-8 digits')
      return
    }
    setChatLockError('')
    setChatLockActionLoading(true)
    try {
      const res = await apiRequest(`/chat-lock/${activeChannel._id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to unlock')

      setChatLockUnlockToken(data.unlockToken || null)
      setChatLockUnlockExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null)
      setChatLockPinDraft('')
      enqueueToast('success', 'Chat unlocked')
    } catch (err) {
      setChatLockError(err?.message || 'Failed to unlock chat')
    } finally {
      setChatLockActionLoading(false)
    }
  }

  const handleChatEnableLock = async () => {
    if (!activeChannel?._id) return
    const pin = String(chatLockSettingsPinDraft || '').trim()
    if (!/^\d{4,8}$/.test(pin)) {
      setChatLockError('PIN must be 4-8 digits')
      enqueueToast('error', 'PIN must be 4-8 digits')
      return
    }
    setChatLockError('')
    setChatLockActionLoading(true)
    try {
      const res = await apiRequest(`/chat-lock/${activeChannel._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to enable chat lock')

      setChatLocked(true)
      setChatLockUnlockToken(null)
      setChatLockUnlockExpiresAt(null)
      setChatLockSettingsPinDraft('')
      enqueueToast('success', 'Chat lock enabled')
    } catch (err) {
      setChatLockError(err?.message || 'Failed to enable chat lock')
      enqueueToast('error', err?.message || 'Failed to enable chat lock')
    } finally {
      setChatLockActionLoading(false)
    }
  }

  const handleChatClearLock = async () => {
    if (!activeChannel?._id) return
    setChatLockError('')
    setChatLockActionLoading(true)
    try {
      const res = await apiRequest(`/chat-lock/${activeChannel._id}/clear`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to disable chat lock')

      setChatLocked(false)
      setChatLockUnlockToken(null)
      setChatLockUnlockExpiresAt(null)
      enqueueToast('success', 'Chat lock disabled')
    } catch (err) {
      setChatLockError(err?.message || 'Failed to disable chat lock')
      enqueueToast('error', err?.message || 'Failed to disable chat lock')
    } finally {
      setChatLockActionLoading(false)
    }
  }

  const handleSubmitBlock = async (targetUserId) => {
    const tid = String(targetUserId)
    if (!tid || tid === String(user?.id)) return
    setAbuseActionLoadingFor(tid)
    try {
      const res = await apiRequest(`/abuse/blocks/${tid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'other' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to block user')
      enqueueToast('success', 'User blocked')
      setAbuseModalBlockState(null)
      await refreshAbuseBlocks()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to block user')
    } finally {
      setAbuseActionLoadingFor(null)
    }
  }

  const handleSubmitUnblock = async (targetUserId) => {
    const tid = String(targetUserId)
    if (!tid || tid === String(user?.id)) return
    setAbuseActionLoadingFor(tid)
    try {
      const res = await apiRequest(`/abuse/blocks/${tid}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to unblock user')
      enqueueToast('success', 'User unblocked')
      setAbuseModalBlockState(null)
      await refreshAbuseBlocks()
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to unblock user')
    } finally {
      setAbuseActionLoadingFor(null)
    }
  }

  const handleSubmitReport = async ({ targetUserId, reason, details }) => {
    const tid = String(targetUserId)
    if (!tid || tid === String(user?.id)) return
    setAbuseActionLoadingFor(tid)
    try {
      const res = await apiRequest('/abuse/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: tid,
          reason: String(reason || 'other'),
          conversationId: activeChannel?._id ? String(activeChannel._id) : null,
          messageId: null,
          details: details && String(details).trim() ? { details: String(details).trim() } : {},
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to submit report')
      enqueueToast('success', 'Report submitted')
      setAbuseModalReportState(null)
    } catch (err) {
      enqueueToast('error', err?.message || 'Failed to submit report')
    } finally {
      setAbuseActionLoadingFor(null)
    }
  }

  // E2E safety-code verification UX (DM only).
  useEffect(() => {
    if (!chatInfoOpen) {
      setE2eVerificationState(null)
      setE2eVerificationError('')
      setE2eVerificationLoading(false)
      return
    }

    if (activeChannel?.type !== 'dm' || !dmOtherMember?.id) {
      setE2eVerificationState(null)
      setE2eVerificationError('')
      setE2eVerificationLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setE2eVerificationLoading(true)
      setE2eVerificationError('')
      try {
        const otherUserId = String(dmOtherMember.id)
        const res = await apiRequest(`/e2e/verification/${otherUserId}?deviceId=web%3A1`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setE2eVerificationState(null)
          setE2eVerificationError(data.error || 'Failed to load verification state')
          return
        }
        setE2eVerificationState({
          safetyCodeMe: data.safetyCodeMe || '',
          safetyCodeOther: data.safetyCodeOther || '',
          verified: Boolean(data.verified),
          verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : null,
        })
      } catch (err) {
        if (cancelled) return
        setE2eVerificationState(null)
        setE2eVerificationError('Failed to load verification state')
      } finally {
        if (!cancelled) setE2eVerificationLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chatInfoOpen, activeChannel?.type, dmOtherMember?.id])

  const handleMarkE2eVerified = async () => {
    if (!dmOtherMember?.id || !e2eVerificationState?.safetyCodeOther) return
    setE2eVerificationError('')
    setE2eVerificationLoading(true)
    try {
      const otherUserId = String(dmOtherMember.id)
      const res = await apiRequest(`/e2e/verification/${otherUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: e2eVerificationState.safetyCodeOther, deviceId: 'web:1' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to verify')

      enqueueToast('success', 'Safety code verified')
      // Refetch via effect by clearing + waiting next render.
      setE2eVerificationState((cur) =>
        cur
          ? {
              ...cur,
              verified: true,
              verifiedAt: new Date(),
            }
          : cur,
      )
    } catch (err) {
      setE2eVerificationError(err?.message || 'Failed to verify safety code')
    } finally {
      setE2eVerificationLoading(false)
    }
  }

  // Media "Links" are extracted server-side from `content`.
  // In E2E chats, `content` is typically null and links would be empty/misleading.
  useEffect(() => {
    if (!activeChannel?._id) return
    let detected = false
    for (const m of messages || []) {
      if (m?.ciphertextType) {
        detected = true
        break
      }
    }
    setIsE2EChat(detected)
  }, [activeChannel?._id, messages])

  const loadMediaSection = async (sectionKey, { append } = { append: false }) => {
    if (!activeChannel?._id) return
    if (!chatUnlocked) return
    setMediaError('')
    if (append) {
      setMediaSectionLoading((cur) => ({ ...cur, [sectionKey]: true }))
    } else {
      setMediaLoading(true)
    }

    try {
      const cursorValue = append ? mediaCursors[sectionKey] : null
      const q = cursorValue ? `&cursor=${encodeURIComponent(cursorValue)}` : ''
      const res = await apiRequestWithChatLock(
        `/messages/${activeChannel._id}/media?section=${encodeURIComponent(sectionKey)}&limit=20${q}`,
      )
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setMediaError(data.error || 'Failed to load media')
        return
      }

      const nextCursor = data.nextCursor ?? null
      setMediaCursors((cur) => ({ ...cur, [sectionKey]: nextCursor }))
      setMediaSections((cur) => ({
        ...cur,
        [sectionKey]: append ? [...cur[sectionKey], ...(Array.isArray(data.items) ? data.items : [])] : (Array.isArray(data.items) ? data.items : []),
      }))
    } catch {
      setMediaError('Failed to load media')
    } finally {
      if (append) {
        setMediaSectionLoading((cur) => ({ ...cur, [sectionKey]: false }))
      } else {
        setMediaLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!chatInfoOpen || !activeChannel?._id) return
    if (chatInfoTab !== 'media') return
    if (!chatUnlocked) return

    let cancelled = false
    ;(async () => {
      // Reset on each conversation open for predictable pagination.
      setMediaError('')
      setMediaLoading(true)
      setMediaSectionLoading({ images: false, videos: false, documents: false, links: false, audio: false })
      setMediaSections({ images: [], videos: [], documents: [], links: [], audio: [] })
      setMediaCursors({ images: null, videos: null, documents: null, links: null, audio: null })

      try {
        const sections = ['images', 'videos', 'documents', ...(isE2EChat ? [] : ['links']), 'audio']
        for (const s of sections) {
          if (cancelled) return
          const cursorValue = null
          const q = cursorValue ? `&cursor=${encodeURIComponent(cursorValue)}` : ''
          const res = await apiRequestWithChatLock(
            `/messages/${activeChannel._id}/media?section=${encodeURIComponent(s)}&limit=20${q}`,
          )
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            setMediaError(data.error || 'Failed to load media')
            break
          }
          if (cancelled) return
          setMediaCursors((cur) => ({ ...cur, [s]: data.nextCursor ?? null }))
          setMediaSections((cur) => ({
            ...cur,
            [s]: Array.isArray(data.items) ? data.items : [],
          }))
        }
      } finally {
        if (!cancelled) setMediaLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chatInfoOpen, chatInfoTab, activeChannel?._id, isE2EChat])

  const renderMediaThumb = (item) => {
    const kind = item.kind
    if (kind === 'image' && item.url) {
      return (
        <img
          src={item.url}
          alt={item.fileName || 'image'}
          className="gchat-media-thumb"
          style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10, background: '#111' }}
        />
      )
    }
    if (kind === 'video' && item.url) {
      return (
        <video
          src={item.url}
          className="gchat-media-thumb"
          muted
          style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 10, background: '#111' }}
        />
      )
    }
    if (kind === 'document') {
      return (
        <div
          className="gchat-media-doc"
          style={{
            padding: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            minHeight: 60,
          }}
        >
          {item.fileName || 'Document'}
        </div>
      )
    }
    if (kind === 'link') {
      return (
        <div
          className="gchat-media-link"
          style={{
            padding: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            minHeight: 60,
            wordBreak: 'break-word',
          }}
        >
          {item.url ? String(item.url).slice(0, 60) : 'Link'}
        </div>
      )
    }
    if (kind === 'audio') {
      if (item.url) {
        return <VoiceNotePlayer url={item.url} fileName={item.fileName} />
      }
      if (item.fileId) {
        return (
          <VoiceNotePlayerFromFile
            fileId={item.fileId}
            fileName={item.fileName}
            apiRequest={apiRequest}
          />
        )
      }
      return (
        <div
          className="gchat-media-doc"
          style={{
            padding: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            minHeight: 60,
          }}
        >
          {item.fileName || 'Audio'}
        </div>
      )
    }
    return <div className="gchat-media-doc">Media</div>
  }

  const handlePromoteDemoteAdmin = async (member) => {
    if (!activeChannel?._id || !member?.id) return
    setAdminActionError('')
    setAdminActionLoadingFor(String(member.id))
    try {
      const method = member.isAdmin ? 'DELETE' : 'POST'
      const path = member.isAdmin
        ? `/group/${activeChannel._id}/admins/${member.id}`
        : `/group/${activeChannel._id}/admins`
      const body = member.isAdmin ? undefined : JSON.stringify({ adminId: member.id })
      const res = await apiRequest(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAdminActionError(data.error || 'Failed to update admin status')
        enqueueToast('error', data.error || 'Failed to update admin status')
        return
      }
      await refreshChatInfo()
      enqueueToast(
        'success',
        member.isAdmin
          ? `${member.displayName || member.email} demoted from admin`
          : `${member.displayName || member.email} promoted to admin`,
      )
    } catch {
      setAdminActionError('Failed to update admin status')
      enqueueToast('error', 'Failed to update admin status')
    } finally {
      setAdminActionLoadingFor('')
    }
  }

  const handleRemoveMember = async (member) => {
    if (!activeChannel?._id || !member?.id) return
    setAdminActionError('')
    setAdminActionLoadingFor(String(member.id))
    try {
      const res = await apiRequest(`/group/${activeChannel._id}/members/${member.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAdminActionError(data.error || 'Failed to remove member')
        enqueueToast('error', data.error || 'Failed to remove member')
        return
      }
      setRemoveConfirmMember(null)
      await refreshChatInfo()
      enqueueToast('success', `${member.displayName || member.email} removed from group`)
    } catch {
      setAdminActionError('Failed to remove member')
      enqueueToast('error', 'Failed to remove member')
    } finally {
      setAdminActionLoadingFor('')
    }
  }

  useEffect(() => {
    if (activeToast || toastQueue.length === 0) return
    const [next, ...rest] = toastQueue
    setActiveToast(next)
    setToastQueue(rest)
  }, [toastQueue, activeToast])

  useEffect(() => {
    if (!activeToast) return
    const id = setTimeout(() => setActiveToast(null), 2600)
    return () => clearTimeout(id)
  }, [activeToast])

  useEffect(() => {
    if (!messageSearchOpen || !activeChannel?._id) return
    if (!chatUnlocked) return
    const q = messageSearchQuery.trim()
    if (!q) {
      setMessageSearchResults([])
      setMessageSearchError('')
      return
    }

    let cancelled = false
    const id = setTimeout(async () => {
      try {
        setMessageSearchLoading(true)
        setMessageSearchError('')
        const res = await apiRequestWithChatLock(
          `/messages/${activeChannel._id}/search?q=${encodeURIComponent(q)}&limit=25`,
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setMessageSearchResults([])
          setMessageSearchError(data.error || 'Search failed')
          return
        }
        setMessageSearchResults(Array.isArray(data.messages) ? data.messages : [])
      } catch {
        if (!cancelled) {
          setMessageSearchResults([])
          setMessageSearchError('Search failed')
        }
      } finally {
        if (!cancelled) setMessageSearchLoading(false)
      }
    }, 260)

    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [messageSearchOpen, messageSearchQuery, activeChannel?._id])

  const [manualBackupOpen, setManualBackupOpen] = useState(false)

  return (
    <div className="gchat-app">
      <ChatRail
        accountMenuRef={accountMenuRef}
        userInitials={userInitials}
        accountMenuOpen={accountMenuOpen}
        setAccountMenuOpen={setAccountMenuOpen}
        friendsPanelOpen={friendsPanelOpen}
        setFriendsPanelOpen={setFriendsPanelOpen}
        onBackupKeys={() => setManualBackupOpen(true)}
      />

      <ChatSidebar
        sidebarOpen={sidebarOpen}
        search={search}
        setSearch={setSearch}
        channelsLoading={channelsLoading}
        filteredChannels={filteredChannels}
        channelsError={channelsError}
        activeChannel={activeChannel}
        handleSelectChannel={handleSelectChannel}
        getChannelLabel={getChannelLabel}
        initialsFromString={initialsFromString}
        showFriends={friendsPanelOpen}
        setShowFriends={setFriendsPanelOpen}
      />

      <section className="gchat-main">
        <ChatMainHeader
          activeChannel={activeChannel}
          activeTitle={activeTitle}
          headerInitials={headerInitials}
          typingLabel={typingLabel}
          setSidebarOpen={setSidebarOpen}
          setChatInfoOpen={setChatInfoOpen}
          showStarredOnly={showStarredOnly}
          setShowStarredOnly={setShowStarredOnly}
          setMessageSearchOpen={setMessageSearchOpen}
          apiRequest={apiRequest}
          enqueueToast={enqueueToast}
          user={user}
          dmOtherMember={dmOtherMember}
          callFocusId={callFocusId}
        />
        {config.featureStoriesEnabled && (
          <StoryTray
            apiRequest={apiRequest}
            enqueueToast={enqueueToast}
            user={user}
            initialStoryId={storyFocusId}
          />
        )}
        {!messagesLoading && activeChannel && pinnedMessages.length > 0 && (
          <ChatPinnedBar previewText={String(pinnedMessages[0].content || '').slice(0, 120)} />
        )}

        {multiSelectMode && (
          <ChatMultiSelectBar
            selectedCount={selectedMessageIds.length}
            forwarding={forwarding}
            onForward={() => setForwardModalOpen(true)}
            onCancel={clearMultiSelect}
          />
        )}

        <ChatThreadPanel
          threadRef={threadRef}
          onScroll={handleThreadScroll}
          messagesLoading={messagesLoading}
          activeChannel={activeChannel}
          messagesError={messagesError}
          displayedMessages={displayedMessages}
          showStarredOnly={showStarredOnly}
          isLoadingMore={isLoadingMore}
        >
          <MessageThread
            displayedMessages={displayedMessages}
            formatDate={formatDate}
            formatTime={formatTime}
            formatDisappearingRemaining={formatDisappearingRemaining}
            user={user}
            userInitials={userInitials}
            initialsFromString={initialsFromString}
            replyJumpHighlightId={replyJumpHighlightId}
            multiSelectMode={multiSelectMode}
            selectedMessageIds={selectedMessageIds}
            toggleMessageSelected={toggleMessageSelected}
            canForwardMessage={canForwardMessage}
            activeChannel={activeChannel}
            senderDisplay={senderDisplay}
            renderMessageStatus={renderMessageStatus}
            messageMenuFor={messageMenuFor}
            setMessageMenuFor={setMessageMenuFor}
            startForwardFromMessage={startForwardFromMessage}
            handleTogglePin={handleTogglePin}
            handleToggleStar={handleToggleStar}
            handleDeleteForEveryone={handleDeleteForEveryone}
            renderReplyPreview={renderReplyPreview}
            renderMessageContent={renderMessageContent}
            renderMessageAttachments={renderMessageAttachments}
            renderMessageReactions={renderMessageReactions}
            reactionPickerFor={reactionPickerFor}
            setReactionPickerFor={setReactionPickerFor}
            handleToggleGroupReaction={handleToggleGroupReaction}
            setReplyToDraft={setReplyToDraft}
          />
        </ChatThreadPanel>

        <ChatComposer
          activeChannel={activeChannel}
          chatUnlocked={chatUnlocked}
          isSending={isSending}
          isRecordingVoiceNote={isRecordingVoiceNote}
          voiceRecordingElapsedSec={voiceRecordingElapsedSec}
          startVoiceRecording={startVoiceRecording}
          stopVoiceRecording={stopVoiceRecording}
          cancelVoiceRecording={cancelVoiceRecording}
          fileInputRef={fileInputRef}
          handleFileInputChange={handleFileInputChange}
          attachments={attachments}
          replyToDraft={replyToDraft}
          setReplyToDraft={setReplyToDraft}
          composerText={composerText}
          setComposerText={setComposerText}
          handleComposerKeyDown={handleComposerKeyDown}
          composerError={composerError}
          composerGroupMetadata={composerGroupMetadata}
          composerMemberInfo={composerMemberInfo}
          attachmentError={attachmentError}
          handleSend={handleSend}
        />
      </section>
      {activeChannel && chatLocked && !chatUnlocked && (
        <ChatLockOverlay
          chatLockPinDraft={chatLockPinDraft}
          setChatLockPinDraft={setChatLockPinDraft}
          chatLockActionLoading={chatLockActionLoading}
          chatLockError={chatLockError}
          setChatLockError={setChatLockError}
          onUnlock={handleChatUnlock}
        />
      )}
      <ChatInfoPanel
        open={chatInfoOpen}
        onClose={() => setChatInfoOpen(false)}
        activeChannel={activeChannel}
        chatInfoLoading={chatInfoLoading}
        chatInfoError={chatInfoError}
        chatInfo={chatInfo}
        dmOtherMember={dmOtherMember}
        creatorUser={creatorUser}
        initialsFromString={initialsFromString}
        chatInfoTab={chatInfoTab}
        setChatInfoTab={setChatInfoTab}
        mediaError={mediaError}
        isE2EChat={isE2EChat}
        mediaSections={mediaSections}
        mediaCursors={mediaCursors}
        mediaLoading={mediaLoading}
        mediaSectionLoading={mediaSectionLoading}
        loadMediaSection={loadMediaSection}
        renderMediaThumb={renderMediaThumb}
        user={user}
        groupInviteLoading={groupInviteLoading}
        groupInviteError={groupInviteError}
        groupInvite={groupInvite}
        groupInviteQrDataUrl={groupInviteQrDataUrl}
        joinRequestsLoading={joinRequestsLoading}
        joinRequestsError={joinRequestsError}
        joinRequests={joinRequests}
        auditLogsLoading={auditLogsLoading}
        auditLogsError={auditLogsError}
        auditLogs={auditLogs}
        composerGroupMetadata={composerGroupMetadata}
        canManageAdmins={canManageAdmins}
        setGroupInviteLoading={setGroupInviteLoading}
        setGroupInviteError={setGroupInviteError}
        setGroupInvite={setGroupInvite}
        setGroupInviteQrDataUrl={setGroupInviteQrDataUrl}
        setJoinRequestsLoading={setJoinRequestsLoading}
        setJoinRequestsError={setJoinRequestsError}
        setJoinRequests={setJoinRequests}
        setAuditLogsLoading={setAuditLogsLoading}
        setAuditLogsError={setAuditLogsError}
        setAuditLogs={setAuditLogs}
        groupSettingsSaving={groupSettingsSaving}
        setGroupSettingsSaving={setGroupSettingsSaving}
        refreshChatInfo={refreshChatInfo}
        apiRequest={apiRequest}
        enqueueToast={enqueueToast}
        chatLockLoading={chatLockLoading}
        chatLocked={chatLocked}
        chatUnlocked={chatUnlocked}
        chatLockSettingsPinDraft={chatLockSettingsPinDraft}
        setChatLockSettingsPinDraft={setChatLockSettingsPinDraft}
        chatLockActionLoading={chatLockActionLoading}
        handleChatEnableLock={handleChatEnableLock}
        handleChatClearLock={handleChatClearLock}
        chatLockError={chatLockError}
        dmPresenceText={dmPresenceText}
        blockedUserIds={blockedUserIds}
        abuseActionLoadingFor={abuseActionLoadingFor}
        setAbuseModalBlockState={setAbuseModalBlockState}
        setAbuseModalReportState={setAbuseModalReportState}
        e2eVerificationLoading={e2eVerificationLoading}
        e2eVerificationError={e2eVerificationError}
        e2eVerificationState={e2eVerificationState}
        handleMarkE2eVerified={handleMarkE2eVerified}
        infoAdmins={infoAdmins}
        chatInfoMemberQuery={chatInfoMemberQuery}
        setChatInfoMemberQuery={setChatInfoMemberQuery}
        filteredInfoMembers={filteredInfoMembers}
        setSelectedMemberInfo={setSelectedMemberInfo}
        handlePromoteDemoteAdmin={handlePromoteDemoteAdmin}
        adminActionLoadingFor={adminActionLoadingFor}
        setRemoveConfirmMember={setRemoveConfirmMember}
        adminActionError={adminActionError}
      />
      {friendsPanelOpen && (
        <FriendsPanel
          open={friendsPanelOpen}
          onClose={() => setFriendsPanelOpen(false)}
          onSelectFriend={handleSelectChannel}
          enqueueToast={enqueueToast}
        />
      )}
      <E2EModalContainer user={user} e2eReady={e2eReady} manualBackupOpen={manualBackupOpen} onManualClose={() => setManualBackupOpen(false)} />
      {selectedMemberInfo && (
        <MemberProfileModal
          selectedMemberInfo={selectedMemberInfo}
          onClose={() => setSelectedMemberInfo(null)}
          initialsFromString={initialsFromString}
          user={user}
          blockedUserIds={blockedUserIds}
          abuseActionLoadingFor={abuseActionLoadingFor}
          setAbuseModalBlockState={setAbuseModalBlockState}
          setAbuseModalReportState={setAbuseModalReportState}
        />
      )}
      {removeConfirmMember && (
        <RemoveMemberConfirmModal
          removeConfirmMember={removeConfirmMember}
          onClose={() => setRemoveConfirmMember(null)}
          onConfirmRemove={handleRemoveMember}
          adminActionLoadingFor={adminActionLoadingFor}
        />
      )}

      {abuseModalBlockState && (
        <AbuseBlockModal
          abuseModalBlockState={abuseModalBlockState}
          onClose={() => setAbuseModalBlockState(null)}
          abuseActionLoadingFor={abuseActionLoadingFor}
          onConfirmUnblock={handleSubmitUnblock}
          onConfirmBlock={handleSubmitBlock}
        />
      )}

      {abuseModalReportState && (
        <AbuseReportModal
          abuseModalReportState={abuseModalReportState}
          setAbuseModalReportState={setAbuseModalReportState}
          onClose={() => setAbuseModalReportState(null)}
          abuseActionLoadingFor={abuseActionLoadingFor}
          onSubmitReport={handleSubmitReport}
        />
      )}

      <ChatToast activeToast={activeToast} onDismiss={() => setActiveToast(null)} />
      {messageSearchOpen && activeChannel && (
        <MessageSearchModal
          onClose={() => setMessageSearchOpen(false)}
          messageSearchQuery={messageSearchQuery}
          setMessageSearchQuery={setMessageSearchQuery}
          messageSearchLoading={messageSearchLoading}
          messageSearchError={messageSearchError}
          messageSearchResults={messageSearchResults}
          enqueueToast={enqueueToast}
        />
      )}

      {forwardModalOpen && (
        <ForwardMessagesModal
          selectedCount={selectedMessageIds.length}
          channels={channels}
          getChannelLabel={getChannelLabel}
          getChannelId={getChannelId}
          forwardError={forwardError}
          forwardTargetQuery={forwardTargetQuery}
          setForwardTargetQuery={setForwardTargetQuery}
          forwardTargetChannelId={forwardTargetChannelId}
          setForwardTargetChannelId={setForwardTargetChannelId}
          forwarding={forwarding}
          onClose={() => setForwardModalOpen(false)}
          onCancel={clearMultiSelect}
          onConfirmForward={handleConfirmForward}
        />
      )}
    </div>
  )
}

function E2EModalContainer({ user, e2eReady, manualBackupOpen, onManualClose }) {
  const { modalMode, dismissModal } = useE2EBackupModal(user, e2eReady)

  // Manual backup takes priority over auto-detected mode.
  const activeMode = manualBackupOpen ? 'backup' : modalMode
  const handleDone = manualBackupOpen ? onManualClose : dismissModal
  const handleSkip = manualBackupOpen ? onManualClose : dismissModal

  if (!activeMode) return null
  return (
    <E2EKeyBackupModal
      mode={activeMode}
      onDone={handleDone}
      onSkip={handleSkip}
    />
  )
}

export default Chat