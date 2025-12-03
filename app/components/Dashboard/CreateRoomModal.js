'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateRoomModal({ userId, onClose }) {
  const router = useRouter()
  const supabase = createClient()
  const [roomName, setRoomName] = useState('')
  const [friends, setFriends] = useState([])
  const [selectedFriends, setSelectedFriends] = useState([])
  const [permissions, setPermissions] = useState({
    playback_control: 'everyone',
    load_movies: 'everyone',
    invite_users: 'host_only',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchFriends = async () => {
      console.log('=== CreateRoomModal: Starting to fetch friends ===')
      console.log('Current userId:', userId)

      // Get accepted friendships where current user is either user1_id OR user2_id
      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('id, user1_id, user2_id, status')
        .eq('status', 'accepted')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)

      if (error) {
        console.error('❌ Error fetching friendships:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        return
      }

      console.log('✅ Raw friendships data:', friendships)
      console.log('Number of friendships found:', friendships?.length || 0)

      // Get unique friend IDs (the other user in each friendship)
      const friendIds = friendships?.map((friendship) => {
        const friendId = friendship.user1_id === userId
          ? friendship.user2_id
          : friendship.user1_id
        console.log(`Friendship ${friendship.id}: user1=${friendship.user1_id}, user2=${friendship.user2_id}, friend=${friendId}`)
        return friendId
      }) || []

      console.log('📋 Extracted Friend IDs:', friendIds)

      if (friendIds.length === 0) {
        console.log('⚠️ No friend IDs found, setting empty friends list')
        setFriends([])
        return
      }

      // Fetch profiles for all friends
      console.log('🔍 Fetching profiles for friend IDs:', friendIds)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', friendIds)

      if (profilesError) {
        console.error('❌ Error fetching friend profiles:', profilesError)
        console.error('Error details:', JSON.stringify(profilesError, null, 2))
        return
      }

      console.log('✅ Fetched friend profiles:', profiles)
      console.log('Number of profiles fetched:', profiles?.length || 0)
      setFriends(profiles || [])
      console.log('=== CreateRoomModal: Finished fetching friends ===')
    }

    if (userId) {
      fetchFriends()
    } else {
      console.log('⚠️ No userId provided to CreateRoomModal')
    }

    // Subscribe to real-time updates for friendships
    const channel = supabase
      .channel('friendships-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
        },
        (payload) => {
          console.log('🔔 Friendship changed, refetching friends:', payload)
          fetchFriends()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  const toggleFriendSelection = (friendId) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    )
  }

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      alert('Please enter a room name')
      return
    }

    setLoading(true)

    try {
      // Create room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert([
          {
            name: roomName,
            host_id: userId,
            ...permissions,
          },
        ])
        .select()
        .single()

      if (roomError) throw roomError

      // Add host as member
      await supabase.from('room_members').insert([
        {
          room_id: room.id,
          user_id: userId,
          role: 'host',
          status: 'joined',
          is_connected: true,
        },
      ])

      // Add invited friends as members (if any selected)
      if (selectedFriends.length > 0) {
        const memberInserts = selectedFriends.map((friendId) => ({
          room_id: room.id,
          user_id: friendId,
          role: 'member',
          status: 'invited',
        }))

        await supabase.from('room_members').insert(memberInserts)
      }

      // Close modal and redirect to room
      onClose()
      router.push(`/room/${room.id}`)
    } catch (error) {
      console.error('Error creating room:', error)
      alert('Failed to create room. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
          Create New Room
        </h2>

        {/* Room Name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Room Name
          </label>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Enter room name"
          />
        </div>

        {/* Invite Friends */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Invite Friends (Optional)
          </label>
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 max-h-48 overflow-y-auto">
            {friends.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                No friends to invite. Add friends first!
              </p>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => (
                  <label
                    key={friend.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFriends.includes(friend.id)}
                      onChange={() => toggleFriendSelection(friend.id)}
                      className="w-4 h-4"
                    />
                    <img
                      src={friend.avatar_url || '/default-avatar.png'}
                      alt={friend.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <span className="text-gray-900 dark:text-white">
                      {friend.username}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {selectedFriends.length > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {selectedFriends.length} friend{selectedFriends.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* Permissions */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Room Permissions
          </label>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Playback Control
              </label>
              <select
                value={permissions.playback_control}
                onChange={(e) =>
                  setPermissions({ ...permissions, playback_control: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="host_only">Host Only</option>
                <option value="everyone">Everyone</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Load Movies
              </label>
              <select
                value={permissions.load_movies}
                onChange={(e) =>
                  setPermissions({ ...permissions, load_movies: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="host_only">Host Only</option>
                <option value="everyone">Everyone</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Invite Users
              </label>
              <select
                value={permissions.invite_users}
                onChange={(e) =>
                  setPermissions({ ...permissions, invite_users: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="host_only">Host Only</option>
                <option value="everyone">Everyone</option>
              </select>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateRoom}
            disabled={loading || !roomName.trim()}
            className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  )
}