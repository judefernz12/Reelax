'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import AgoraRTC from 'agora-rtc-sdk-ng'

export default function AvatarGrid({ roomId, userId, members }) {
  const supabase = createClient()
  const [videoEnabled, setVideoEnabled] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [selectedCamera, setSelectedCamera] = useState('')
  const [selectedMic, setSelectedMic] = useState('')
  const [devices, setDevices] = useState({ cameras: [], mics: [] })
  const [showSettings, setShowSettings] = useState(false)
  const [remoteUsers, setRemoteUsers] = useState([])
  const [isJoined, setIsJoined] = useState(false)

  const clientRef = useRef(null)
  const localVideoTrackRef = useRef(null)
  const localAudioTrackRef = useRef(null)
  const localVideoContainerRef = useRef(null)

  // Initialize Agora client
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Initialize AgoraRTC client
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
    clientRef.current = client

    // Event listeners
    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType)

      if (mediaType === 'video') {
        setRemoteUsers((prev) => {
          const existing = prev.find((u) => u.uid === user.uid)
          if (existing) {
            return prev.map((u) => u.uid === user.uid ? { ...u, videoTrack: user.videoTrack } : u)
          }
          return [...prev, { uid: user.uid, videoTrack: user.videoTrack, audioTrack: user.audioTrack }]
        })
      }

      if (mediaType === 'audio') {
        user.audioTrack?.play()
        setRemoteUsers((prev) => {
          const existing = prev.find((u) => u.uid === user.uid)
          if (existing) {
            return prev.map((u) => u.uid === user.uid ? { ...u, audioTrack: user.audioTrack } : u)
          }
          return [...prev, { uid: user.uid, videoTrack: user.videoTrack, audioTrack: user.audioTrack }]
        })
      }
    })

    client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'video') {
        setRemoteUsers((prev) =>
          prev.map((u) => u.uid === user.uid ? { ...u, videoTrack: null } : u)
        )
      }
      if (mediaType === 'audio') {
        setRemoteUsers((prev) =>
          prev.map((u) => u.uid === user.uid ? { ...u, audioTrack: null } : u)
        )
      }
    })

    client.on('user-left', (user) => {
      setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid))
    })

    // Join the channel
    joinChannel()

    return () => {
      leaveChannel()
    }
  }, [roomId, userId])

  // Get available devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const cameras = await AgoraRTC.getCameras()
        const mics = await AgoraRTC.getMicrophones()
        setDevices({ cameras, mics })

        if (cameras.length > 0) setSelectedCamera(cameras[0].deviceId)
        if (mics.length > 0) setSelectedMic(mics[0].deviceId)
      } catch (error) {
        console.error('Error getting devices:', error)
      }
    }

    getDevices()
  }, [])

  const joinChannel = async () => {
    if (!clientRef.current) return

    try {
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID
      if (!appId) {
        console.error('Agora App ID not found. Please add NEXT_PUBLIC_AGORA_APP_ID to .env.local')
        return
      }

      // Join the channel (using roomId as channel name and userId as UID)
      await clientRef.current.join(appId, roomId, null, userId)
      setIsJoined(true)
    } catch (error) {
      console.error('Error joining Agora channel:', error)
    }
  }

  const leaveChannel = async () => {
    if (!clientRef.current) return

    try {
      // Stop and close local tracks
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop()
        localVideoTrackRef.current.close()
        localVideoTrackRef.current = null
      }
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop()
        localAudioTrackRef.current.close()
        localAudioTrackRef.current = null
      }

      // Leave the channel
      await clientRef.current.leave()
      setIsJoined(false)
      setVideoEnabled(false)
      setAudioEnabled(false)
      setRemoteUsers([])
    } catch (error) {
      console.error('Error leaving Agora channel:', error)
    }
  }

  const toggleVideo = async () => {
    try {
      if (!videoEnabled) {
        // Create video track
        const videoTrack = await AgoraRTC.createCameraVideoTrack({
          cameraId: selectedCamera,
        })
        localVideoTrackRef.current = videoTrack

        // Publish video track
        if (clientRef.current && isJoined) {
          await clientRef.current.publish([videoTrack])
        }

        // Play local video
        if (localVideoContainerRef.current) {
          videoTrack.play(localVideoContainerRef.current)
        }
        setVideoEnabled(true)
      } else {
        // Unpublish and stop video
        if (clientRef.current && localVideoTrackRef.current) {
          await clientRef.current.unpublish([localVideoTrackRef.current])
          localVideoTrackRef.current.stop()
          localVideoTrackRef.current.close()
          localVideoTrackRef.current = null
        }
        setVideoEnabled(false)
      }
    } catch (error) {
      console.error('Error toggling video:', error)
      alert('Could not access camera. Please check permissions.')
    }
  }

  const toggleAudio = async () => {
    try {
      if (!audioEnabled) {
        // Create audio track
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          microphoneId: selectedMic,
        })
        localAudioTrackRef.current = audioTrack

        // Publish audio track
        if (clientRef.current && isJoined) {
          await clientRef.current.publish([audioTrack])
        }

        setAudioEnabled(true)
      } else {
        // Unpublish and stop audio
        if (clientRef.current && localAudioTrackRef.current) {
          await clientRef.current.unpublish([localAudioTrackRef.current])
          localAudioTrackRef.current.stop()
          localAudioTrackRef.current.close()
          localAudioTrackRef.current = null
        }
        setAudioEnabled(false)
      }
    } catch (error) {
      console.error('Error toggling audio:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const changeDevice = async (type, deviceId) => {
    if (type === 'camera') {
      setSelectedCamera(deviceId)
      if (localVideoTrackRef.current) {
        await localVideoTrackRef.current.setDevice(deviceId)
      }
    } else {
      setSelectedMic(deviceId)
      if (localAudioTrackRef.current) {
        await localAudioTrackRef.current.setDevice(deviceId)
      }
    }
  }

  // Get my profile
  const myMember = members.find((m) => m.user_id === userId)
  const otherMembers = members.filter((m) => m.user_id !== userId)

  return (
    <div className="h-full overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4">Participants ({members.length})</h3>

      <div className="space-y-4">
        {/* My Avatar */}
        <div className="relative group">
          <div className="aspect-video bg-gray-700 rounded-lg overflow-hidden relative">
            {videoEnabled ? (
              <div
                ref={localVideoContainerRef}
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <img
                  src={myMember?.profiles?.avatar_url || '/default-avatar.png'}
                  alt="You"
                  className="w-20 h-20 rounded-full"
                />
              </div>
            )}

            {/* Username overlay on hover */}
            <div className="absolute top-2 left-2 bg-black bg-opacity-75 px-2 py-1 rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity">
              {myMember?.profiles?.username} (You)
            </div>

            {/* Controls - Bottom Right */}
            <div className="absolute bottom-2 right-2 flex gap-2">
              <button
                onClick={toggleVideo}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  videoEnabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
                title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {videoEnabled ? '📹' : '📹'}
              </button>
              <button
                onClick={toggleAudio}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  audioEnabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
                title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {audioEnabled ? '🎤' : '🔇'}
              </button>
            </div>

            {/* Settings - Top Right */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="absolute top-2 right-2 w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Other Members */}
        {otherMembers.map((member) => {
          // Find the remote user by matching member user_id with Agora UID
          const remoteUser = remoteUsers.find((u) => u.uid === member.user_id)
          return (
            <MemberAvatar
              key={member.id}
              member={member}
              remoteUser={remoteUser}
            />
          )
        })}
      </div>

      {/* Device Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Media Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2">Camera</label>
                <select
                  value={selectedCamera}
                  onChange={(e) => changeDevice('camera', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600"
                >
                  {devices.cameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera ${cam.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">Microphone</label>
                <select
                  value={selectedMic}
                  onChange={(e) => changeDevice('mic', e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600"
                >
                  {devices.mics.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Microphone ${mic.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full mt-6 bg-blue-600 px-4 py-2 rounded hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MemberAvatar({ member, remoteUser }) {
  const [volume, setVolume] = useState(100)
  const [showVolume, setShowVolume] = useState(false)
  const videoContainerRef = useRef(null)

  // Play remote video when available
  useEffect(() => {
    if (remoteUser?.videoTrack && videoContainerRef.current) {
      remoteUser.videoTrack.play(videoContainerRef.current)
    }

    return () => {
      if (remoteUser?.videoTrack) {
        remoteUser.videoTrack.stop()
      }
    }
  }, [remoteUser?.videoTrack])

  // Adjust remote audio volume
  useEffect(() => {
    if (remoteUser?.audioTrack) {
      remoteUser.audioTrack.setVolume(volume)
    }
  }, [volume, remoteUser?.audioTrack])

  const hasVideo = remoteUser?.videoTrack
  const hasAudio = remoteUser?.audioTrack

  return (
    <div
      className="relative group"
      onMouseEnter={() => setShowVolume(true)}
      onMouseLeave={() => setShowVolume(false)}
    >
      <div className="aspect-video bg-gray-700 rounded-lg overflow-hidden relative">
        {hasVideo ? (
          <div
            ref={videoContainerRef}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={member.profiles.avatar_url || '/default-avatar.png'}
              alt={member.profiles.username}
              className="w-20 h-20 rounded-full"
            />
          </div>
        )}

        {/* Username overlay */}
        <div className="absolute top-2 left-2 bg-black bg-opacity-75 px-2 py-1 rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity">
          {member.profiles.username}
        </div>

        {/* Audio indicator */}
        {hasAudio && (
          <div className="absolute top-2 right-2 bg-green-600 w-3 h-3 rounded-full"></div>
        )}

        {/* Volume Control */}
        {showVolume && (
          <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-black bg-opacity-75 px-3 py-2 rounded">
            <span className="text-sm">🔊</span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20"
            />
          </div>
        )}
      </div>
    </div>
  )
}
