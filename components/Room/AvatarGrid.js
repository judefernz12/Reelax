'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AvatarGrid({ roomId, userId, members }) {
  const supabase = createClient()
  const [myStream, setMyStream] = useState(null)
  const [videoEnabled, setVideoEnabled] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [selectedCamera, setSelectedCamera] = useState('')
  const [selectedMic, setSelectedMic] = useState('')
  const [devices, setDevices] = useState({ cameras: [], mics: [] })
  const [showSettings, setShowSettings] = useState(false)
  const myVideoRef = useRef(null)

  // Get available devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices()
        const cameras = deviceList.filter((d) => d.kind === 'videoinput')
        const mics = deviceList.filter((d) => d.kind === 'audioinput')
        setDevices({ cameras, mics })

        if (cameras.length > 0) setSelectedCamera(cameras[0].deviceId)
        if (mics.length > 0) setSelectedMic(mics[0].deviceId)
      } catch (error) {
        console.error('Error getting devices:', error)
      }
    }

    getDevices()
  }, [])

  // Start/stop media stream
  const toggleVideo = async () => {
    try {
      if (!videoEnabled) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: selectedCamera },
          audio: { deviceId: selectedMic },
        })
        setMyStream(stream)
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream
        }
        setVideoEnabled(true)
        setAudioEnabled(true)
      } else {
        if (myStream) {
          myStream.getTracks().forEach((track) => track.stop())
        }
        setMyStream(null)
        setVideoEnabled(false)
        setAudioEnabled(false)
      }
    } catch (error) {
      console.error('Error accessing media devices:', error)
      alert('Could not access camera/microphone. Please check permissions.')
    }
  }

  const toggleAudio = () => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setAudioEnabled(audioTrack.enabled)
      }
    }
  }

  const changeDevice = async (type, deviceId) => {
    if (type === 'camera') {
      setSelectedCamera(deviceId)
    } else {
      setSelectedMic(deviceId)
    }

    // Restart stream with new device
    if (videoEnabled) {
      if (myStream) {
        myStream.getTracks().forEach((track) => track.stop())
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: type === 'camera' ? deviceId : selectedCamera },
        audio: { deviceId: type === 'mic' ? deviceId : selectedMic },
      })

      setMyStream(newStream)
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = newStream
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
              <video
                ref={myVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
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
              >
                📹
              </button>
              <button
                onClick={toggleAudio}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  audioEnabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                🎤
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
        {otherMembers.map((member) => (
          <MemberAvatar key={member.id} member={member} />
        ))}
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

function MemberAvatar({ member }) {
  const [volume, setVolume] = useState(100)
  const [showVolume, setShowVolume] = useState(false)

  return (
    <div
      className="relative group"
      onMouseEnter={() => setShowVolume(true)}
      onMouseLeave={() => setShowVolume(false)}
    >
      <div className="aspect-video bg-gray-700 rounded-lg overflow-hidden relative">
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={member.profiles.avatar_url || '/default-avatar.png'}
            alt={member.profiles.username}
            className="w-20 h-20 rounded-full"
          />
        </div>

        {/* Username overlay */}
        <div className="absolute top-2 left-2 bg-black bg-opacity-75 px-2 py-1 rounded text-sm opacity-0 group-hover:opacity-100 transition-opacity">
          {member.profiles.username}
        </div>

        {/* Volume Control */}
        {showVolume && (
          <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-black bg-opacity-75 px-3 py-2 rounded">
            <span className="text-sm">🔊</span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className="w-20"
            />
          </div>
        )}
      </div>
    </div>
  )
}