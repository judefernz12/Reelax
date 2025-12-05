'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

export default function FriendsList({ userId }) {
  const supabase = createClient()
  const [friends, setFriends] = useState([])
  const [friendRequests, setFriendRequests] = useState([])
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => {
    fetchFriends()
    fetchFriendRequests()
  }, [userId])

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

    setFriends(friendsList)
  }

  const fetchFriendRequests = async () => {
    // Get pending requests where I am the recipient (not the requester)
    const { data } = await supabase
      .from('friendships')
      .select('*, profiles!friendships_requester_id_fkey(*)')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .neq('requester_id', userId)
      .eq('status', 'pending')

    setFriendRequests(data || [])
  }

  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    // Search by username or email
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${query}%,email.ilike.%${query}%`)
      .neq('id', userId)
      .limit(5)

    // Filter out already friends and blocked users
    const filtered = data?.filter((user) => {
      return !friends.some((f) => f.id === user.id)
    }) || []

    setSearchResults(filtered)
  }

  const sendFriendRequest = async (targetUserId) => {
    // Ensure user1_id < user2_id for consistency
    const [user1, user2] = userId < targetUserId ? [userId, targetUserId] : [targetUserId, userId]

    const { error } = await supabase
      .from('friendships')
      .insert([
        {
          user1_id: user1,
          user2_id: user2,
          requester_id: userId,
          status: 'pending',
        },
      ])

    if (error) {
      alert('Failed to send friend request')
    } else {
      setSearchQuery('')
      setSearchResults([])
      setShowAddFriend(false)
    }
  }

  const acceptFriendRequest = async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId)

    if (!error) {
      fetchFriends()
      fetchFriendRequests()
    }
  }

  const declineFriendRequest = async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId)

    if (!error) {
      fetchFriendRequests()
    }
  }

  const removeFriend = async (friendId) => {
    if (!confirm('Are you sure you want to remove this friend?')) return

    const { error} = await supabase
      .from('friendships')
      .delete()
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .or(`user1_id.eq.${friendId},user2_id.eq.${friendId}`)

    if (!error) {
      fetchFriends()
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Friends
        </h2>
        <button
          onClick={() => setShowAddFriend(!showAddFriend)}
          className="text-blue-600 hover:text-blue-700 text-2xl"
        >
          +
        </button>
      </div>

      {/* Friend Requests */}
      {friendRequests.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Friend Requests
          </h3>
          <div className="space-y-2">
            {friendRequests.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <img
                    src={request.profiles.avatar_url || '/default-avatar.png'}
                    alt={request.profiles.username}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {request.profiles.username}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptFriendRequest(request.id)}
                    className="text-green-600 hover:text-green-700"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => declineFriendRequest(request.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    ✗
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Friend */}
      {showAddFriend && (
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              searchUsers(e.target.value)
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Search by username or email"
          />
          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={user.avatar_url || '/default-avatar.png'}
                      alt={user.username}
                      className="w-8 h-8 rounded-full"
                    />
                    <span className="text-sm text-gray-900 dark:text-white">
                      {user.username}
                    </span>
                  </div>
                  <button
                    onClick={() => sendFriendRequest(user.id)}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Friends List */}
      <div className="space-y-2">
        {friends.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            No friends yet. Add some friends to get started!
          </p>
        ) : (
          friends.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <img
                  src={friend.avatar_url || '/default-avatar.png'}
                  alt={friend.username}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-sm text-gray-900 dark:text-white">
                  {friend.username}
                </span>
                {friend.online_status && (
                  <span className="w-2 h-2 bg-green-500 rounded-full" />
                )}
              </div>
              <button
                onClick={() => removeFriend(friend.id)}
                className="text-red-600 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}