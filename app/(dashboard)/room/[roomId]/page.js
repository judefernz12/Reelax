'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, use, useCallback } from 'react'
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

      // Update member status to joined and connected
      // This allows users who previously left to rejoin
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

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('room_members')
      .select('*, profiles(*)')
      .eq('room_id', roomId)
      .eq('status', 'joined')
      .eq('is_connected', true)

    setMembers(data || [])
  }, [roomId, supabase])

  // Subscribe to member changes
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`room_members_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchMembers()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchMembers()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_members',
        },
        () => {
          // No filter on DELETE because Supabase doesn't include old row data
          // Just refresh the members list for this room
          fetchMembers()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [roomId, supabase, fetchMembers, user])

  // Subscribe to kicks - detect when current user's membership is deleted
  useEffect(() => {
    if (!user) return

    const kickChannel = supabase
      .channel(`kick_detection_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_members',
        },
        async (payload) => {
          // On any DELETE, check if current user still has membership
          const { data: membership, error } = await supabase
            .from('room_members')
            .select('*')
            .eq('room_id', roomId)
            .eq('user_id', user.id)
            .maybeSingle()

          // If no membership found AND room still exists, user was kicked
          // Check if room still exists to avoid false positive when room is deleted
          if (!membership && !error) {
            const { data: roomExists } = await supabase
              .from('rooms')
              .select('id')
              .eq('id', roomId)
              .maybeSingle()

            if (roomExists) {
              alert('You were kicked out of the room')
              router.push('/dashboard')
            }
          }
        }
      )
      .subscribe()

    return () => {
      kickChannel.unsubscribe()
    }
  }, [user, roomId, router, supabase])

  // Subscribe to room updates - detect host changes and permission updates
  useEffect(() => {
    if (!room) return

    const roomChannel = supabase
      .channel(`room_updates_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        async () => {
          // Fetch fresh room data with host profile
          const { data: updatedRoom } = await supabase
            .from('rooms')
            .select('*, profiles!rooms_host_id_fkey(*)')
            .eq('id', roomId)
            .single()

          if (updatedRoom) {
            setRoom(updatedRoom)
          }
        }
      )
      .subscribe()

    return () => {
      roomChannel.unsubscribe()
    }
  }, [room, roomId, supabase])

  const handleLeaveRoom = async () => {
    // Check if user is the host
    if (room.host_id === user.id) {
      // Check if there are other joined members to transfer hosting to
      const { count } = await supabase
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('status', 'joined')
        .neq('user_id', user.id)

      if (count > 0) {
        alert('You are the host. Please transfer hosting to another member before leaving.')
        return
      }
      // If host is the only one, they can leave and the room will be deleted
    }

    if (confirm('Are you sure you want to leave this room?')) {
      await supabase
        .from('room_members')
        .update({ status: 'left', is_connected: false })
        .eq('room_id', roomId)
        .eq('user_id', user.id)

      // Check if there are any other joined members (not invited, not left)
      const { count } = await supabase
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('status', 'joined')
        .neq('user_id', user.id)

      // If no one else is joined (only invited or left members remain), delete the room
      if (count === 0) {
        await supabase.from('rooms').delete().eq('id', roomId)
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