'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function VideoPlayer({ roomId, userId, room, isHost }) {
  const supabase = createClient()
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const containerRef = useRef(null)
  const [videoUrl, setVideoUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const syncLockRef = useRef(false)
  const joinSyncTimerRef = useRef(null)
  const wasPlayingBeforeSeekRef = useRef(false)

  const isYouTubeUrl = (url) => {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.replace('www.', '')
      return (
        host === 'youtube.com' ||
        host === 'm.youtube.com' ||
        host === 'youtu.be'
      )
    } catch {
      return false
    }
  }

  const extractYouTubeId = (url) => {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname.replace('www.', '')

      if (host === 'youtu.be') {
        return parsed.pathname.slice(1)
      }

      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const vParam = parsed.searchParams.get('v')
        if (vParam) return vParam

        const parts = parsed.pathname.split('/')
        const embedIndex = parts.indexOf('embed')
        if (embedIndex !== -1 && parts[embedIndex + 1]) {
          return parts[embedIndex + 1]
        }
      }
    } catch (e) {
      // Fallback to basic regex if URL parsing fails
      const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)
      if (match && match[1]) return match[1]
    }

    return null
  }

  const canControl = true // Everyone can control playback
  const canLoadVideo = isHost || room.load_movies === 'everyone'

  // Event handlers as refs to avoid recreating on every render
  const handlePlay = useCallback(async () => {
    if (!canControl || syncLockRef.current || !playerRef.current) return

    // Clear any pending join sync timer when user manually plays
    if (joinSyncTimerRef.current) {
      clearTimeout(joinSyncTimerRef.current)
      joinSyncTimerRef.current = null
    }

    syncLockRef.current = true
    const currentTime = playerRef.current.currentTime()

    // Validate currentTime is a valid number
    const timestamp = isNaN(currentTime) ? 0 : currentTime

    const { error } = await supabase
      .from('rooms')
      .update({
        is_playing: true,
        video_timestamp: timestamp,
      })
      .eq('id', roomId)

    if (error) {
      console.error('Error updating play state:', error)
    }

    setTimeout(() => {
      syncLockRef.current = false
    }, 500)
  }, [canControl, roomId, supabase])

  const handlePause = useCallback(async () => {
    if (!canControl || syncLockRef.current || !playerRef.current) return

    syncLockRef.current = true
    const currentTime = playerRef.current.currentTime()

    // Validate currentTime is a valid number
    const timestamp = isNaN(currentTime) ? 0 : currentTime

    const { error } = await supabase
      .from('rooms')
      .update({
        is_playing: false,
        video_timestamp: timestamp,
      })
      .eq('id', roomId)

    if (error) {
      console.error('Error updating pause state:', error)
    }

    setTimeout(() => {
      syncLockRef.current = false
    }, 500)
  }, [canControl, roomId, supabase])

  const handleSeeking = useCallback(() => {
    // Track if video was playing before seek started
    if (playerRef.current) {
      wasPlayingBeforeSeekRef.current = !playerRef.current.paused()
    }
  }, [])

  const handleSeeked = useCallback(async () => {
    if (!canControl || !playerRef.current) return

    syncLockRef.current = true
    const currentTime = playerRef.current.currentTime()

    // Validate currentTime is a valid number
    const timestamp = isNaN(currentTime) ? 0 : currentTime

    const { error } = await supabase
      .from('rooms')
      .update({
        video_timestamp: timestamp,
        is_playing: wasPlayingBeforeSeekRef.current,
      })
      .eq('id', roomId)

    if (error) {
      console.error('Error updating seek state:', error)
    }

    // If the video was playing before seek, resume playback for everyone
    if (wasPlayingBeforeSeekRef.current) {
      playerRef.current.play()
    }

    setTimeout(() => {
      syncLockRef.current = false
    }, 500)
  }, [canControl, roomId, supabase])

  useEffect(() => {
    // Initialize Video.js
    if (typeof window !== 'undefined' && videoRef.current && !playerRef.current) {
      Promise.all([import('video.js'), import('videojs-youtube')]).then(
        ([videojs]) => {
          // Double-check player doesn't exist (race condition protection)
          if (playerRef.current) return

          const player = videojs.default(videoRef.current, {
            controls: true,
            fluid: true,
            preload: 'auto',
            techOrder: ['html5', 'youtube'],
          })

          playerRef.current = player

          // Listen to player events
          player.on('play', handlePlay)
          player.on('pause', handlePause)
          player.on('seeking', handleSeeking)
          player.on('seeked', handleSeeked)

          // Auto-load current video if one exists in the room
          if (room.current_video_url) {
            loadVideo(room.current_video_url, room.video_timestamp, false).then(
              () => {
                // Set initial play state after video loads
                if (room.is_playing) {
                  player.one('loadedmetadata', () => {
                    player.currentTime(room.video_timestamp)
                    player.play()
                  })
                }
              }
            )
          }
        }
      )
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  useEffect(() => {
    const roomSyncChannel = supabase
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

          const { current_video_url, video_timestamp, is_playing } = payload.new

          // Handle video URL change
          if (current_video_url && current_video_url !== room.current_video_url) {
            await loadVideo(current_video_url, video_timestamp, false)
          }

          // Handle playback state change
          if (playerRef.current) {
            syncLockRef.current = true

            const currentTime = playerRef.current.currentTime()
            const timeDiff = Math.abs(currentTime - video_timestamp)

            // Only sync if time difference is significant (more than 1 second)
            // This prevents unnecessary seeking due to network latency
            if (timeDiff > 1.0) {
              playerRef.current.currentTime(video_timestamp)
            }

            // Sync play/pause state
            const currentlyPlaying = !playerRef.current.paused()
            if (is_playing && !currentlyPlaying) {
              playerRef.current.play()
            } else if (!is_playing && currentlyPlaying) {
              playerRef.current.pause()
            }

            setTimeout(() => {
              syncLockRef.current = false
            }, 500)
          }
        }
      )
      .subscribe()

    // Subscribe to member joins to sync new joiners
    const memberJoinChannel = supabase
      .channel(`room_${roomId}_member_joins`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          if (payload.new.user_id === userId && payload.new.needs_sync) {
            // New member or returning member that needs syncing
            if (playerRef.current) {
              syncLockRef.current = true

              const currentTime = playerRef.current.currentTime()
              const timestamp = isNaN(currentTime) ? 0 : currentTime

              // Pause and sync timestamp for the new joiner
              playerRef.current.pause()
              playerRef.current.currentTime(room.video_timestamp || timestamp)

              // Update the member record to mark sync as done
              await supabase
                .from('room_members')
                .update({
                  needs_sync: false,
                })
                .eq('id', payload.new.id)

              // After a short delay, resume playback if the room is playing
              if (room.is_playing) {
                joinSyncTimerRef.current = setTimeout(async () => {
                  if (playerRef.current) {
                    playerRef.current.play()
                  }

                  // Update room state to ensure consistency
                  const { error } = await supabase
                    .from('rooms')
                    .update({
                      is_playing: false,
                      video_timestamp: timestamp,
                    })
                    .eq('id', roomId)

                  joinSyncTimerRef.current = null
                }, 5000)
              }
            }
          }
        }
      )
      .subscribe()

    return () => {
      roomSyncChannel.unsubscribe()
      memberJoinChannel.unsubscribe()

      // Clear join sync timer on cleanup
      if (joinSyncTimerRef.current) {
        clearTimeout(joinSyncTimerRef.current)
        joinSyncTimerRef.current = null
      }
    }
  }, [roomId, room, supabase, userId, canControl])

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
            video_timestamp: 0,
            is_playing: false,
          })
          .eq('id', roomId)
      }

      // Detect video type and load accordingly
      if (isYouTubeUrl(url)) {
        const videoId = extractYouTubeId(url)
        if (!videoId) {
          alert('Could not extract a valid YouTube video ID from this URL.')
          setIsLoading(false)
          return
        }

        playerRef.current.src({
          src: `https://www.youtube.com/watch?v=${videoId}`,
          type: 'video/youtube',
        })
      } else if (url.includes('.m3u8')) {
        // HLS stream
        playerRef.current.src({
          src: url,
          type: 'application/x-mpegURL',
        })
      } else {
        // Direct video file (assume MP4 or browser-supported format)
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

  return (
    <div className="h-full flex flex-col p-4">
      {/* Video Container */}
      <div className="bg-black relative flex items-center justify-center p-4 mb-8 z-20">
        <div data-vjs-player className="w-full z-20">
          <video ref={videoRef} className="video-js vjs-default-skin" />
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 z-10">
            <div className="text-white text-xl">Loading video...</div>
          </div>
        )}
      </div>

      {/* Video URL Input */}
      <div className="flex gap-2 flex-shrink-0 mt-4">
        <input
          type="text"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="Enter video URL (mp4, m3u8, YouTube, etc.)"
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
    </div>
  )
}
