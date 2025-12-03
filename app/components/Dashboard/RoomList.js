'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RoomList({ userId }) {
  const router = useRouter()
  const supabase = createClient()
  const [rooms, setRooms] = useState([])
  const [expandedRoom, setExpandedRoom] = useState(null)

  useEffect(() => {
    const fetchRooms = async () => {
      // Get all rooms where user is a member
      const { data: memberData } = await supabase
        .from('room_members')
        .select('room_id, status')
        .eq('user_id', userId)
        .in('status', ['invited', 'joined'])

      if (!memberData || memberData.length === 0) {
        setRooms([])
        return
      }

      const roomIds = memberData.map((m) => m.room_id)

      // Get room details
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('*, profiles!rooms_host_id_fkey(username, avatar_url)')
        .in('id', roomIds)

      // Get member counts for each room
      const roomsWithCounts = await Promise.all(
        roomsData.map(async (room) => {
          const { count: totalInvited } = await supabase
            .from('room_members')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', room.id)

          const { count: currentlyJoined } = await supabase
            .from('room_members')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', room.id)
            .eq('status', 'joined')
            .eq('is_connected', true)

          return {
            ...room,
            totalInvited,
            currentlyJoined,
          }
        })
      )

      setRooms(roomsWithCounts)
    }

    fetchRooms()

    // Subscribe to changes
    const channel = supabase
      .channel('room_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
        },
        () => {
          fetchRooms()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
        },
        () => {
          fetchRooms()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [userId, supabase])

  const fetchRoomMembers = async (roomId) => {
    const { data } = await supabase
      .from('room_members')
      .select('*, profiles(username, avatar_url, online_status)')
      .eq('room_id', roomId)

    return data || []
  }

  const handleRoomClick = async (roomId) => {
    if (expandedRoom === roomId) {
      setExpandedRoom(null)
    } else {
      setExpandedRoom(roomId)
    }
  }

  const joinRoom = (roomId) => {
    router.push(`/room/${roomId}`)
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        No rooms yet. Create your first room to get started!
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rooms.map((room) => (
        <div
          key={room.id}
          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {room.name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Host: {room.profiles.username}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Members: {room.currentlyJoined}/{room.totalInvited}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleRoomClick(room.id)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {expandedRoom === room.id ? 'Hide' : 'Details'}
              </button>
              <button
                onClick={() => joinRoom(room.id)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Join
              </button>
            </div>
          </div>

          {expandedRoom === room.id && (
            <RoomMembers roomId={room.id} />
          )}
        </div>
      ))}
    </div>
  )
}

function RoomMembers({ roomId }) {
  const supabase = createClient()
  const [members, setMembers] = useState([])

  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase
        .from('room_members')
        .select('*, profiles(username, avatar_url, online_status)')
        .eq('room_id', roomId)

      setMembers(data || [])
    }

    fetchMembers()
  }, [roomId, supabase])

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Room Members:
      </h4>
      <div className="space-y-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-2">
            <img
              src={member.profiles.avatar_url || '/default-avatar.png'}
              alt={member.profiles.username}
              className="w-6 h-6 rounded-full"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {member.profiles.username}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                member.status === 'joined'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
              }`}
            >
              {member.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}