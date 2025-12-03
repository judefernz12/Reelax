'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

export default function VideoPlayer({ roomId, userId, room, isHost }) {
  const supabase = createClient()
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const syncLockRef = useRef(false)

  const canControl = isHost || room.playback_control === 'everyone'
  const canLoadVideo = isHost || room.load_movies === 'everyone'
  const mountedRef = useRef(true)

  // Event handlers defined at component level
  const handlePlay = async () => {
    const canControlNow = isHost || room.playback_control === 'everyone'
    if (!canControlNow || syncLockRef.current || !playerRef.current) return

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
    const canControlNow = isHost || room.playback_control === 'everyone'
    if (!canControlNow || syncLockRef.current || !playerRef.current) return

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
    const canControlNow = isHost || room.playback_control === 'everyone'
    if (!canControlNow || syncLockRef.current || !playerRef.current) return

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

  // Initialize player only when needed (lazy loading)
  const initializePlayer = async () => {
    if (playerRef.current) {
      console.log('Player already initialized')
      return true
    }

    if (typeof window === 'undefined') {
      console.error('Window is undefined')
      return false
    }

    if (!videoRef.current) {
      console.error('Video element ref is null')
      return false
    }

    console.log('Video element found:', videoRef.current)
    console.log('Video element parent:', videoRef.current.parentElement)
    console.log('Initializing video player...')
    setIsLoading(true)

    try {
      console.log('Loading videojs-youtube plugin...')
      await import('videojs-youtube')
      console.log('videojs-youtube plugin loaded successfully')

      if (!mountedRef.current || !videoRef.current) {
        console.log('Component unmounted or video ref lost during import')
        setIsLoading(false)
        return false
      }

      console.log('Creating Video.js player instance...')
      const player = videojs(videoRef.current, {
        controls: true,
        fluid: true,
        preload: 'auto',
        techOrder: ['youtube', 'html5'],
        html5: {
          vhs: {
            overrideNative: true
          },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false
        }
      })

      console.log('Player instance created:', player)

      playerRef.current = player

      // Return a promise that resolves when player is ready
      return new Promise((resolve) => {
        // Add timeout in case ready callback never fires
        const timeout = setTimeout(() => {
          console.error('Player ready timeout - player took too long to initialize')
          setIsLoading(false)
          resolve(false)
        }, 10000) // 10 second timeout

        player.ready(() => {
          clearTimeout(timeout)

          if (!mountedRef.current) {
            console.log('Component unmounted during player.ready()')
            resolve(false)
            return
          }

          console.log('Video player is ready!')
          setIsLoading(false)

          player.on('play', handlePlay)
          player.on('pause', handlePause)
          player.on('seeked', handleSeeked)

          resolve(true)
        })
      })
    } catch (error) {
      console.error('Failed to initialize video player:', error)
      setIsLoading(false)
      return false
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (playerRef.current) {
        try {
          playerRef.current.dispose()
        } catch (e) {
          console.error('Error disposing player:', e)
        }
        playerRef.current = null
      }
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
    // Initialize player if not already initialized
    if (!playerRef.current) {
      console.log('Player not initialized, initializing now...')
      const success = await initializePlayer()

      if (!success) {
        console.error('Video player failed to initialize')
        alert('Failed to initialize video player. Please refresh the page and try again.')
        setIsLoading(false)
        return
      }
    }

    if (!playerRef.current) {
      console.error('Player is still null after initialization')
      alert('Failed to initialize video player. Please refresh the page and try again.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      console.log('Loading video:', url)

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

      // Check again after async operation
      if (!playerRef.current) {
        console.error('Video player was disposed during loading')
        setIsLoading(false)
        return
      }

      // Detect video type and load accordingly
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        // YouTube video
        console.log('Loading YouTube video')
        playerRef.current.src({
          src: url,
          type: 'video/youtube',
        })
      } else if (url.includes('.m3u8')) {
        // HLS stream
        console.log('Loading HLS stream')
        playerRef.current.src({
          src: url,
          type: 'application/x-mpegURL',
        })
      } else {
        // Direct video file
        console.log('Loading direct video file')
        playerRef.current.src({
          src: url,
          type: 'video/mp4',
        })
      }

      if (!playerRef.current) return

      playerRef.current.load()

      if (startTime > 0 && playerRef.current) {
        playerRef.current.one('loadedmetadata', () => {
          if (playerRef.current) {
            playerRef.current.currentTime(startTime)
          }
        })
      }

      console.log('Video loaded successfully')
      setIsLoading(false)
    } catch (error) {
      console.error('Error loading video:', error)
      alert('Failed to load video: ' + error.message)
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

  return (
    <div className="h-full flex flex-col">
      {/* Video Container */}
      <div className="flex-1 bg-black rounded-lg overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-white text-xl">Loading video...</div>
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
          placeholder="Enter video URL (YouTube, mp4, m3u8, etc.)"
          className={`flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded ${
            !canLoadVideo ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={!canLoadVideo}
        />
        <button
          onClick={handleLoadVideo}
          disabled={!canLoadVideo || isLoading}
          className={`px-6 py-2 rounded font-semibold transition-colors ${
            canLoadVideo && !isLoading
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isLoading ? 'Loading...' : 'Load'}
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