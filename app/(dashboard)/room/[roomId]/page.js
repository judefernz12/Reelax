'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import VideoPlayer from '@/components/Room/VideoPlayer'
import AvatarGrid from '@/components/Room/AvatarGrid'
import ChatBox from '@/components/Room/ChatBox'
import MembersDropdown from '@/components/Room/MembersDropdown'

export default function RoomPage({ params }) {
  const resolvedParams = use(params)
  const roomId = resolvedParams.roomId
  const router = useRouter()
  const supabase = createClient()

  const [user, setUser] = useState(null)
  const [room, setRoom] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showChat, setShowChat] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const initRoom = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      setUser(currentUser)

      if (!currentUser) {
        router.push('/login')
        return
      }

      // Check if user is a member
      const { data: membership } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', currentUser.id)
        .single()

      if (!membership) {
        alert('You are not a member of this room')
        router.push('/dashboard')
        return
      }

      // Check if user was kicked or blocked
      if (membership.status === 'left') {
        alert('You have been removed from this room')
        router.push('/dashboard')
        return
      }

      // Update member status to joined and connected
      await supabase
        .from('room_members')
        .update({
          status: 'joined',
          is_connected: true,
          joined_at: new Date().toISOString(),
        })
        .eq('id', membership.id)

      // Fetch room details
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*, profiles!rooms_host_id_fkey(*)')
        .eq('id', roomId)
        .single()

      setRoom(roomData)
      fetchMembers()
      setLoading(false)
    }

    initRoom()

    // Handle page unload/reload - treat as new joiner
    const handleBeforeUnload = () => {
      if (user) {
        supabase
          .from('room_members')
          .update({ is_connected: false, last_disconnected: new Date().toISOString() })
          .eq('room_id', roomId)
          .eq('user_id', user.id)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (user) {
        supabase
          .from('room_members')
          .update({ is_connected: false })
          .eq('room_id', roomId)
          .eq('user_id', user.id)
      }
    }
  }, [roomId, router, supabase])

  const fetchMembers = async () => {
    const { data } = await supabase
      .from('room_members')
      .select('*, profiles(*)')
      .eq('room_id', roomId)
      .eq('status', 'joined')
      .eq('is_connected', true)

    setMembers(data || [])
  }

  // Subscribe to member changes
  useEffect(() => {
    const channel = supabase
      .channel(`room_${roomId}_members`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchMembers()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [roomId, supabase])

  const handleLeaveRoom = async () => {
    if (confirm('Are you sure you want to leave this room?')) {
      await supabase
        .from('room_members')
        .update({ status: 'left', is_connected: false })
        .eq('room_id', roomId)
        .eq('user_id', user.id)

      // If host leaves, check if room should be destroyed
      if (room.host_id === user.id) {
        const { count } = await supabase
          .from('room_members')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .eq('is_connected', true)
          .neq('user_id', user.id)

        if (count === 0) {
          await supabase.from('rooms').delete().eq('id', roomId)
        }
      }

      router.push('/dashboard')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-xl text-white">Loading room...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Top Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">{room?.name}</h1>
          <div className="flex items-center gap-3">
            <MembersDropdown
              roomId={roomId}
              userId={user.id}
              isHost={room.host_id === user.id}
              members={members}
              room={room}
            />
            {room.host_id === user.id && (
              <button
                onClick={() => setShowSettings(true)}
                className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
              >
                ⚙️ Settings
              </button>
            )}
            <button
              onClick={handleLeaveRoom}
              className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition-colors"
            >
              Leave Room
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Side - Video Player */}
        <div className="flex-1 p-4">
          <VideoPlayer
            roomId={roomId}
            userId={user.id}
            room={room}
            isHost={room.host_id === user.id}
          />
        </div>

        {/* Right Side - Avatar Grid */}
        <div className="w-96 bg-gray-800 p-4">
          <AvatarGrid roomId={roomId} userId={user.id} members={members} />
        </div>
      </div>

      {/* Chat Button & Box */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center text-2xl z-40"
      >
        💬
      </button>

      {showChat && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] z-40">
          <ChatBox
            roomId={roomId}
            userId={user.id}
            onClose={() => setShowChat(false)}
          />
        </div>
      )}

      {/* Settings Modal (Host Only) */}
      {showSettings && (
        <PermissionsModal
          room={room}
          onClose={() => setShowSettings(false)}
          onUpdate={(newPermissions) => {
            setRoom({ ...room, ...newPermissions })
            setShowSettings(false)
          }}
        />
      )}
    </div>
  )
}

function PermissionsModal({ room, onClose, onUpdate }) {
  const supabase = createClient()
  const [permissions, setPermissions] = useState({
    playback_control: room.playback_control,
    load_movies: room.load_movies,
    invite_users: room.invite_users,
  })

  const handleSave = async () => {
    const { error } = await supabase
      .from('rooms')
      .update(permissions)
      .eq('id', room.id)

    if (!error) {
      onUpdate(permissions)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">Room Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2">Playback Control</label>
            <select
              value={permissions.playback_control}
              onChange={(e) =>
                setPermissions({ ...permissions, playback_control: e.target.value })
              }
              className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600"
            >
              <option value="host_only">Host Only</option>
              <option value="everyone">Everyone</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2">Load Movies</label>
            <select
              value={permissions.load_movies}
              onChange={(e) =>
                setPermissions({ ...permissions, load_movies: e.target.value })
              }
              className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600"
            >
              <option value="host_only">Host Only</option>
              <option value="everyone">Everyone</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-2">Invite Users</label>
            <select
              value={permissions.invite_users}
              onChange={(e) =>
                setPermissions({ ...permissions, invite_users: e.target.value })
              }
              className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600"
            >
              <option value="host_only">Host Only</option>
              <option value="everyone">Everyone</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 px-4 py-2 rounded hover:bg-blue-700"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 px-4 py-2 rounded hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}