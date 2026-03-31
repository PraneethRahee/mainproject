import { io } from 'socket.io-client'
import { config } from '../config/env.js'
import { getAccessToken } from './session.js'

let socket = null
let currentChannelId = null
let currentGroupId = null

export function getSocket() {
  return socket
}

function withAuth(callback) {
  if (!socket) return
  const token = getAccessToken()
  if (!token) return
  socket.emit('auth:resume', token, (res) => {
    if (!res || !res.ok) return
    callback()
  })
}

export function connectSocket() {
  if (socket) {
    return socket
  }

  const url = import.meta.env.VITE_SOCKET_URL || config.apiBaseUrl || window.location.origin

  socket = io(url, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    withCredentials: true,
  })

  socket.on('connect', () => {
    withAuth(() => {
      if (currentGroupId) {
        socket.emit('group:join', { groupId: currentGroupId })
        socket.emit('channel:join', { channelId: currentGroupId })
      } else if (currentChannelId) {
        socket.emit('channel:join', { channelId: currentChannelId })
      }
    })
  })

  socket.on('reconnect', () => {
    withAuth(() => {
      if (currentGroupId) {
        socket.emit('group:join', { groupId: currentGroupId })
        socket.emit('channel:join', { channelId: currentGroupId })
      } else if (currentChannelId) {
        socket.emit('channel:join', { channelId: currentChannelId })
      }
    })
  })

  return socket
}

export function joinChannel(channelId) {
  if (!socket) return

  const previousId = currentChannelId
  const previousGroup = currentGroupId
  currentChannelId = channelId || null
  currentGroupId = null

  const run = () => {
    if (previousGroup && previousGroup !== currentGroupId) {
      socket.emit('group:leave', { groupId: previousGroup })
    }
    if (previousId && previousId !== channelId) {
      socket.emit('channel:leave', { channelId: previousId })
    }
    if (channelId) {
      socket.emit('channel:join', { channelId })
    }
  }

  if (socket.connected) {
    withAuth(run)
  }
}

export function leaveCurrentChannel() {
  if (!socket || !currentChannelId) return
  const id = currentChannelId
  currentChannelId = null
  if (socket.connected) {
    withAuth(() => {
      socket.emit('channel:leave', { channelId: id })
    })
  }
}

export function joinGroup(groupId) {
  if (!socket) return

  const previousGroup = currentGroupId
  const previousChannel = currentChannelId
  currentGroupId = groupId || null
  currentChannelId = null

  const run = () => {
    if (previousChannel && previousChannel !== currentChannelId) {
      socket.emit('channel:leave', { channelId: previousChannel })
    }
    if (previousGroup && previousGroup !== groupId) {
      socket.emit('group:leave', { groupId: previousGroup })
    }
    if (groupId) {
      // Join channel room too, so existing typing/presence logic works.
      socket.emit('channel:join', { channelId: groupId })
      socket.emit('group:join', { groupId })
    }
  }

  if (socket.connected) {
    withAuth(run)
  }
}

export function leaveCurrentGroup() {
  if (!socket || !currentGroupId) return
  const id = currentGroupId
  currentGroupId = null
  if (socket.connected) {
    withAuth(() => {
      socket.emit('group:leave', { groupId: id })
      socket.emit('channel:leave', { channelId: id })
    })
  }
}
