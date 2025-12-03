'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function VideoPlayer({ roomId, userId, room, isHost }) {
  const supabase = createClient()
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncLockRef = useRef(false)

  const canControl = isHost || room.playback_control === 'everyone'
  const canLoadVideo = isHost || room.load_movies === 'everyone'

  useEffect(() => {
    // Initialize Video.js
    if (typeof window !== 'undefined' && videoRef.current) {
      import('video.js').then((videojs) => {
        import('videojs-contrib-hls')

        const player = videojs.default(videoRef.current, {
          controls: true,
          fluid: true,
          preload: 'auto',
        })

        playerRef.current = player

        // Listen to player events
        player.on('play', handlePlay)
        player.on('pause', handlePause)
        player.on('seeked', handleSeeked)

        return () => {
          if (playerRef.current) {
            playerRef.current.dispose()
          }
        }
      })
    }
  }, [])

  // Subscribe to room changes
  useEffect(() => {
    const channel = supabase
      .channel(`room_${roomId}_sync`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        async (payload) => {
          if (syncLockRef.current) return // Prevent feedback loop

          const { current_video_url, current_timestamp, is_playing } = payload.new

          // Handle video URL change
          if (current_video_url && current_video_url !== room.current_video_url) {
            await loadVideo(current_video_url, current_timestamp, false)
          }

          // Handle playback state change
          if (playerRef.current) {
            syncLockRef.current = true

            if (is_playing) {
              playerRef.current.currentTime(current_timestamp)
              playerRef.current.play()
            } else {
              playerRef.current.currentTime(current_timestamp)
              playerRef.current.pause()
            }

            setTimeout(() => {
              syncLockRef.current = false
            }, 500)
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [roomId, room, supabase])

  const loadVideo = async (url, startTime = 0, updateDB = true) => {
    if (!playerRef.current) return

    setIsLoading(true)

    try {
      // Pause for everyone if new video is loaded
      if (updateDB) {
        await supabase
          .from('rooms')
          .update({
            current_video_url: url,
            current_timestamp: 0,
            is_playing: false,
          })
          .eq('id', roomId)
      }

      // Detect video type and load accordingly
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        // YouTube handling would require iframe API
        alert('YouTube support coming soon! Use direct video URLs for now.')
      } else if (url.includes('.m3u8')) {
        // HLS stream
        playerRef.current.src({
          src: url,
          type: 'application/x-mpegURL',
        })
      } else {
        // Direct video file
        playerRef.current.src({
          src: url,
          type: 'video/mp4',
        })
      }

      playerRef.current.load()

      if (startTime > 0) {
        playerRef.current.one('loadedmetadata', () => {
          playerRef.current.currentTime(startTime)
        })
      }

      setIsLoading(false)
    } catch (error) {
      console.error('Error loading video:', error)
      alert('Failed to load video')
      setIsLoading(false)
    }
  }

  const handleLoadVideo = async () => {
    if (!canLoadVideo) return

    if (!videoUrl.trim()) {
      alert('Please enter a video URL')
      return
    }

    await loadVideo(videoUrl, 0, true)
    setVideoUrl('')
  }

  const handlePlay = async () => {
    if (!canControl || syncLockRef.current) return

    syncLockRef.current = true
    await supabase
      .from('rooms')
      .update({
        is_playing: true,
        current_timestamp: playerRef.current.currentTime(),
      })
      .eq('id', roomId)

    setTimeout(() => {
      syncLockRef.current = false
    }, 500)
  }

  const handlePause = async () => {
    if (!canControl || syncLockRef.current) return

    syncLockRef.current = true
    await supabase
      .from('rooms')
      .update({
        is_playing: false,
        current_timestamp: playerRef.current.currentTime(),
      })
      .eq('id', roomId)

    setTimeout(() => {
      syncLockRef.current = false
    }, 500)
  }

  const handleSeeked = async () => {
    if (!canControl || syncLockRef.current) return

    syncLockRef.current = true
    const currentTime = playerRef.current.currentTime()

    await supabase
      .from('rooms')
      .update({
        is_playing: false,
        current_timestamp: currentTime,
      })
      .eq('id', roomId)

    setTimeout(() => {
      syncLockRef.current = false
    }, 500)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Video Container */}
      <div className="flex-1 bg-black rounded-lg overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-white text-xl">Loading video...</div>
          </div>
        )}
        {isSyncing && (
          <div className="absolute top-4 left-4 bg-blue-600 px-4 py-2 rounded-lg">
            Syncing...
          </div>
        )}
        <video
          ref={videoRef}
          className="video-js vjs-default-skin w-full h-full"
        />
      </div>

      {/* Video URL Input */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="Enter video URL (mp4, m3u8, etc.)"
          className={`flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded ${
            !canLoadVideo ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={!canLoadVideo}
        />
        <button
          onClick={handleLoadVideo}
          disabled={!canLoadVideo}
          className={`px-6 py-2 rounded font-semibold transition-colors ${
            canLoadVideo
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          Load
        </button>
      </div>

      {!canControl && (
        <p className="mt-2 text-sm text-gray-400">
          Only the host can control playback
        </p>
      )}
    </div>
  )
}