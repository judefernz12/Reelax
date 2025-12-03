'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'

export default function ChatBox({ roomId, userId, onClose }) {
  const supabase = createClient()
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [typingUsers, setTypingUsers] = useState([])
  const [myUsername, setMyUsername] = useState('')
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  useEffect(() => {
    fetchMessages()
    fetchMyUsername()

    // Subscribe to new messages
    const channel = supabase
      .channel(`room_${roomId}_chat`)
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        setMessages((prev) => [...prev, payload])
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== userId) {
          setTypingUsers((prev) => {
            const filtered = prev.filter((u) => u.userId !== payload.userId)
            if (payload.isTyping) {
              return [...filtered, payload]
            }
            return filtered
          })

          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId))
          }, 3000)
        }
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [roomId, userId, supabase])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMessages = async () => {
    // In production, you'd store messages in database
    // For now, messages only exist during the session
    setMessages([])
  }

  const fetchMyUsername = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single()

    setMyUsername(data?.username || 'Unknown')
  }

  const sendMessage = async (e) => {
    e.preventDefault()

    if (!newMessage.trim()) return

    const message = {
      id: Date.now(),
      userId,
      username: myUsername,
      text: newMessage,
      timestamp: new Date().toISOString(),
    }

    await supabase.channel(`room_${roomId}_chat`).send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    })

    setMessages((prev) => [...prev, message])
    setNewMessage('')
  }

  const handleTyping = () => {
    supabase.channel(`room_${roomId}_chat`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, username: myUsername, isTyping: true },
    })

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      supabase.channel(`room_${roomId}_chat`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId, username: myUsername, isTyping: false },
      })
    }, 2000)
  }

  return (
    <div className="bg-gray-800 rounded-lg shadow-2xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold">Chat</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-gray-400 py-8">
            No messages yet. Start the conversation!
          </p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-sm text-blue-400">
                  {msg.username}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(msg.timestamp), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-gray-200 mt-1">{msg.text}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-2 text-sm text-gray-400 italic">
          {typingUsers.map((u) => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value)
              handleTyping()
            }}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 font-semibold"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}