'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function MembersDropdown({ roomId, userId, isHost, members, room }) {
  const supabase = createClient()
  const [isOpen, setIsOpen] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [friends, setFriends] = useState([])
  const canInvite = isHost || room.invite_users === 'everyone'

  useEffect(() => {
    // Always fetch friends to check who is already a friend
    fetchFriends()
  }, [members])

  const fetchFriends = async () => {
    const { data } = await supabase
      .from('friendships')
      .select('*, profiles!friendships_user1_id_fkey(*), profiles_user2:profiles!friendships_user2_id_fkey(*)')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .eq('status', 'accepted')

    const friendsList = data?.map((f) => {
      const friend = f.user1_id === userId ? f.profiles_user2 : f.profiles
      return friend
    }) || []

    // Filter out already invited friends
    const memberIds = members.map((m) => m.user_id)
    const availableFriends = friendsList.filter((f) => !memberIds.includes(f.id))

    setFriends(availableFriends)
  }

  const inviteFriend = async (friendId) => {
    const { error } = await supabase
      .from('room_members')
      .insert([
        {
          room_id: roomId,
          user_id: friendId,
          status: 'invited',
        },
      ])

    if (!error) {
      alert('Friend invited!')
      setShowInvite(false)
      fetchFriends()
    }
  }

  const kickMember = async (memberId, memberUserId) => {
    if (!isHost) return

    if (confirm('Are you sure you want to kick this member?')) {
      // Delete the member entirely so they can't rejoin
      await supabase
        .from('room_members')
        .delete()
        .eq('id', memberId)

      // The kicked user will be notified through realtime subscription
      // They'll see the room_members table update and get redirected
    }
  }

  const transferHost = async (newHostId) => {
    if (!isHost) return

    if (confirm('Are you sure you want to transfer host privileges to this member?')) {
      const { error } = await supabase
        .from('rooms')
        .update({ host_id: newHostId })
        .eq('id', roomId)

      if (error) {
        alert('Failed to transfer host')
        console.error('Error transferring host:', error)
      }
      // The room update will be detected by real-time subscription
      // Host privileges will update automatically for everyone
    }
  }

  const sendFriendRequest = async (targetUserId) => {
    const [user1, user2] = userId < targetUserId ? [userId, targetUserId] : [targetUserId, userId]

    await supabase
      .from('friendships')
      .insert([
        {
          user1_id: user1,
          user2_id: user2,
          requester_id: userId,
          status: 'pending',
        },
      ])

    alert('Friend request sent!')
  }

  // Check if user is already a friend
  const isFriend = (memberId) => {
    return friends.some((f) => f.id === memberId)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
      >
        👥 Members ({members.length})
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-40 max-h-96 overflow-y-auto">
            {canInvite && (
              <button
                onClick={() => {
                  setShowInvite(true)
                  setIsOpen(false)
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-700 border-b border-gray-700 text-blue-400 font-semibold"
              >
                + Add Person
              </button>
            )}

            <div className="p-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 hover:bg-gray-700 rounded"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={member.profiles.avatar_url || '/default-avatar.png'}
                      alt={member.profiles.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <span className="text-sm">{member.profiles.username}</span>
                    {member.user_id === room.host_id && (
                      <span className="text-xs bg-yellow-600 px-2 py-0.5 rounded">
                        Host
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isHost && member.user_id !== userId && (
                      <>
                        <button
                          onClick={() => transferHost(member.user_id)}
                          className="text-xs text-green-400 hover:text-green-300"
                        >
                          Make Host
                        </button>
                        <button
                          onClick={() => kickMember(member.id, member.user_id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Kick
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Invite Friends Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Invite Friends</h3>

            {friends.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                No friends available to invite
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between p-3 hover:bg-gray-700 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={friend.avatar_url || '/default-avatar.png'}
                        alt={friend.username}
                        className="w-8 h-8 rounded-full"
                      />
                      <span>{friend.username}</span>
                    </div>
                    <button
                      onClick={() => inviteFriend(friend.id)}
                      className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
                    >
                      Invite
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowInvite(false)}
              className="w-full mt-4 bg-gray-700 px-4 py-2 rounded hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}