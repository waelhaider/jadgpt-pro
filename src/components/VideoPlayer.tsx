import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, ExternalLink, Loader2, Video, Volume2, VolumeX, Maximize } from 'lucide-react';
import { getAccessToken, googleSignIn } from '../lib/auth';
import { extractFileIdFromUrl } from '../lib/drive';

interface VideoPlayerProps {
  key?: React.Key;
  src: string;
  name: string;
  size?: string;
  isDarkMode?: boolean;
}

export default function VideoPlayer({ src, name, size, isDarkMode = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedPercent, setLoadedPercent] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [hasError, setHasError] = useState(false);
  const [isTokenExpired, setIsTokenExpired] = useState(false);
  const [isActivated, setIsActivated] = useState(false); // Whether user clicked play to load/activate inline video
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const volumeTimeoutRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<any>(null);

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return '0:00';
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const startVolumeSliderTimeout = () => {
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }
    volumeTimeoutRef.current = setTimeout(() => {
      setShowVolumeSlider(false);
    }, 2000);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      const nextMuted = val === 0;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowVolumeSlider(false);
      }
    };
    if (showVolumeSlider) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showVolumeSlider]);

  // Clean up Object URL and timers on unmount
  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
      if (volumeTimeoutRef.current) {
        clearTimeout(volumeTimeoutRef.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [videoUrl]);

  // Pause when another audio/video starts
  useEffect(() => {
    const handleGlobalPlay = (e: Event) => {
      const activeVideo = (e as CustomEvent).detail?.videoRef;
      if (activeVideo && activeVideo !== videoRef.current) {
        videoRef.current?.pause();
        setIsPlaying(false);
      }
    };

    window.addEventListener('audio_playing', handleGlobalPlay);
    return () => {
      window.removeEventListener('audio_playing', handleGlobalPlay);
    };
  }, []);

  const getDirectDownloadUrl = () => {
    // If it's already a blob or data URL, return it
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;

    const fileId = extractFileIdFromUrl(src);
    const activeToken = getAccessToken();
    const isNetlify = window.location.hostname.includes('netlify');
    const isStaticHost = 
      !isNetlify && (
        window.location.hostname.includes('github') || 
        window.location.hostname.includes('vercel') ||
        (window.location.hostname.includes('localhost') === false && !window.location.hostname.includes('run.app'))
      );

    const backendBaseUrl = isStaticHost ? 'https://ais-pre-73b5ktfwj7jc3r2bxn3pj5-351201511869.europe-west3.run.app' : '';
    let proxyUrl = `${backendBaseUrl}/api/download?url=${encodeURIComponent(src)}&name=${encodeURIComponent(name)}`;
    if (activeToken && activeToken !== 'local-dummy-token') {
      proxyUrl += `&access_token=${encodeURIComponent(activeToken)}`;
    }
    return proxyUrl;
  };

  const loadAndPlayVideo = async () => {
    if (isActivated) {
      togglePlay();
      return;
    }

    setIsActivated(true);
    
    // Local base64/blob can be played directly
    if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('file:')) {
      setVideoUrl(src);
      setIsPlaying(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play()
            .then(() => {
              window.dispatchEvent(new CustomEvent('audio_playing', { detail: { videoRef: videoRef.current } }));
            })
            .catch(err => console.error('Play failed:', err));
        }
      }, 50);
      return;
    }

    const isDriveUrl = src.includes('drive.google.com') || src.includes('googleusercontent.com') || extractFileIdFromUrl(src) !== null;

    if (!isDriveUrl) {
      setVideoUrl(src);
      setIsPlaying(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play()
            .then(() => {
              window.dispatchEvent(new CustomEvent('audio_playing', { detail: { videoRef: videoRef.current } }));
            })
            .catch(err => console.error('Play failed:', err));
        }
      }, 50);
      return;
    }

    // Google Drive URL -> stream directly using range-requests
    setIsLoading(true);
    setLoadedPercent(null);
    setHasError(false);

    try {
      const activeToken = getAccessToken();
      const isNetlify = window.location.hostname.includes('netlify');
      const isStaticHost = 
        !isNetlify && (
          window.location.hostname.includes('github') || 
          window.location.hostname.includes('vercel') ||
          (window.location.hostname.includes('localhost') === false && !window.location.hostname.includes('run.app'))
        );

      const backendBaseUrl = isStaticHost ? 'https://ais-pre-73b5ktfwj7jc3r2bxn3pj5-351201511869.europe-west3.run.app' : '';
      let proxyUrl = `${backendBaseUrl}/api/download?url=${encodeURIComponent(src)}&name=${encodeURIComponent(name)}`;
      if (activeToken && activeToken !== 'local-dummy-token') {
        proxyUrl += `&access_token=${encodeURIComponent(activeToken)}`;
      }

      console.log('[VideoPlayer] Pre-flight 1-byte check via proxy:', proxyUrl);
      const response = await fetch(proxyUrl, { headers: { 'Range': 'bytes=0-0' } });
      if (!response.ok) {
        if (response.status === 401) {
          setIsTokenExpired(true);
        }
        throw new Error(`Video pre-flight failed with status ${response.status}`);
      }

      setVideoUrl(proxyUrl);
      setIsLoading(false);
      setLoadedPercent(null);
      setIsPlaying(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play()
            .then(() => {
              window.dispatchEvent(new CustomEvent('audio_playing', { detail: { videoRef: videoRef.current } }));
            })
            .catch(err => {
              console.error('Video play error:', err);
              setIsPlaying(false);
            });
        }
      }, 50);

    } catch (err) {
      console.error('[VideoPlayer] Error streaming video:', err);
      setHasError(true);
      setIsLoading(false);
      setLoadedPercent(null);
      setIsActivated(false);
    }
  };

  const handleRenewToken = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsLoading(true);
      const res = await googleSignIn();
      if (res?.accessToken) {
        setIsTokenExpired(false);
        setHasError(false);
        setIsActivated(false);
        setTimeout(() => {
          loadAndPlayVideo();
        }, 100);
      }
    } catch (err) {
      console.error('[VideoPlayer] Failed to renew Google Drive token:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play()
          .then(() => {
            setIsPlaying(true);
            window.dispatchEvent(new CustomEvent('audio_playing', { detail: { videoRef: videoRef.current } }));
          })
          .catch(err => {
            console.error('Play failed:', err);
            setIsPlaying(false);
          });
      }
    }
  };

  const handleExternalPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Native mobile app action / download / system launch
    window.location.href = getDirectDownloadUrl();
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
      if (!nextMuted && volume === 0) {
        setVolume(0.5);
        videoRef.current.volume = 0.5;
      }
    }
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if ((videoRef.current as any).webkitEnterFullscreen) {
        // iOS Safari full screen fallback
        (videoRef.current as any).webkitEnterFullscreen();
      }
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`p-3 rounded-2xl border flex flex-col gap-2 shadow-sm transition-all relative overflow-hidden ${
        isDarkMode 
          ? 'bg-[#151c27] border-[#2C374E] text-[#e4edf7]' 
          : 'bg-[#fffaf5] border-[#f0ebe3] text-[#4A4A35]'
      }`}
      dir="rtl"
    >
      {/* Video Viewport Container */}
      <div 
        onMouseMove={resetControlsTimeout}
        onTouchStart={resetControlsTimeout}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        className="relative aspect-video w-full rounded-xl bg-black overflow-hidden border border-black/10 flex items-center justify-center group/video animate-all"
      >
        {isActivated && videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              playsInline
              onClick={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
              className="w-full h-full object-contain cursor-pointer"
              onError={() => setHasError(true)}
            />
            
            {/* Custom controls overlay */}
            <div 
              className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-3 flex flex-col gap-1.5 transition-all duration-300 z-10 ${
                showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Progress Slider (Seek bar) */}
              <div className="w-full flex flex-row items-center gap-2" dir="ltr">
                <span className="text-[12px] font-mono font-bold text-gray-300 select-none shrink-0">
                  {formatTime(currentTime)}
                </span>
                <div className="relative group flex-1 flex items-center">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCurrentTime(val);
                      if (videoRef.current) {
                        videoRef.current.currentTime = val;
                      }
                    }}
                    className="w-full h-1 rounded-lg appearance-none cursor-pointer focus:outline-none transition-all accent-[#16af75] bg-gray-600"
                    style={{
                      background: `linear-gradient(to right, ${
                        isDarkMode ? '#16af75' : '#c26700'
                      } ${(currentTime / (duration || 1)) * 100}%, #4b5563 ${(currentTime / (duration || 1)) * 100}%)`
                    }}
                  />
                </div>
                <span className="text-[12px] font-mono font-bold text-gray-300 select-none shrink-0">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Control Buttons (Play/Pause, Speaker volume popover, Fullscreen) */}
              <div className="flex flex-row items-center justify-between w-full mt-0.5">
                {/* Right: Speaker/Volume popover & Fullscreen */}
                <div className="flex items-center gap-2">
                  <div className="relative flex items-center">
                    {/* Volume Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (volumeTimeoutRef.current) {
                          clearTimeout(volumeTimeoutRef.current);
                        }
                        setShowVolumeSlider(!showVolumeSlider);
                      }}
                      className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white active:scale-95 cursor-pointer shrink-0"
                      title="مستوى الصوت"
                    >
                      {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>

                    {/* Premium Volume Slider Popover */}
                    {showVolumeSlider && (
                      <div
                        className="absolute bottom-full right-0 mb-2 p-2 rounded-xl shadow-xl border border-zinc-800 bg-zinc-950 text-white flex items-center gap-2 z-[99] animate-in fade-in slide-in-from-bottom-2 duration-150"
                      >
                        {/* Clickable Icon inside Popover to quickly Mute/Unmute */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMute();
                            startVolumeSliderTimeout();
                          }}
                          className="p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-gray-300 shrink-0"
                        >
                          {isMuted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </button>

                        {/* Slider input */}
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          onMouseUp={startVolumeSliderTimeout}
                          onTouchEnd={startVolumeSliderTimeout}
                          className="w-20 h-1 rounded-lg appearance-none cursor-pointer focus:outline-none bg-zinc-700 accent-white"
                          style={{
                            background: `linear-gradient(to right, ${
                              isDarkMode ? '#16af75' : '#c26700'
                            } ${(isMuted ? 0 : volume) * 100}%, #4b5563 ${(isMuted ? 0 : volume) * 100}%)`
                          }}
                          dir="ltr"
                        />

                        {/* Percentage */}
                        <span className="text-[12px] font-mono font-bold text-gray-300 select-none min-w-[24px] text-center">
                          {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Fullscreen Button */}
                  <button
                    onClick={handleFullscreen}
                    className="p-1 rounded-lg hover:bg-white/10 transition-colors text-white active:scale-95 cursor-pointer"
                    title="ملء الشاشة"
                  >
                    <Maximize size={15} />
                  </button>
                </div>

                {/* Left/Center: Play/Pause Button */}
                <button
                  onClick={togglePlay}
                  className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 shadow-md transition-all active:scale-90 hover:scale-105 cursor-pointer text-white ${
                    isDarkMode 
                      ? 'bg-[#16af75] hover:bg-[#129462]' 
                      : 'bg-[#c26700] hover:bg-[#a65600]'
                  }`}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause size={12} fill="currentColor" />
                  ) : (
                    <Play size={12} className="translate-x-[-0.5px]" fill="currentColor" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Thumbnail/Poster View with Centered Play Button */
          <div 
            onClick={loadAndPlayVideo}
            className="absolute inset-0 w-full h-full cursor-pointer group flex flex-col items-center justify-center bg-zinc-900 transition-colors hover:bg-zinc-950/90"
          >
            {/* Visual background placeholder */}
            <div className="absolute inset-0 opacity-20 flex items-center justify-center select-none pointer-events-none">
              <Video size={100} className="text-white" />
            </div>

            {/* Pulsing Play Button */}
            <div className={`h-14 w-14 rounded-full flex items-center justify-center text-white shrink-0 shadow-2xl transition-transform duration-300 group-hover:scale-110 active:scale-95 ${
              isDarkMode ? 'bg-[#16af75]' : 'bg-[#c26700]'
            }`}>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center">
                  <Loader2 size={24} className="animate-spin" />
                  {loadedPercent !== null && (
                    <span className="text-[9px] font-mono font-black mt-0.5">{loadedPercent}%</span>
                  )}
                </div>
              ) : (
                <Play size={24} fill="currentColor" className="translate-x-[-1px]" />
              )}
            </div>

            {/* Poster Info Overlay */}
            <div className="absolute bottom-3 left-3 right-3 text-right bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 rounded-lg flex flex-col gap-0.5">
              <p className="text-[11px] font-black text-white truncate drop-shadow">
                {name}
              </p>
              {size && (
                <span className="text-[9px] font-mono text-gray-300 font-bold drop-shadow">
                  {size}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Control Actions (Open in system player / Download) */}
      <div className="flex items-center justify-between gap-2.5 mt-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`p-1 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-[#1d2737]' : 'bg-[#f5ece0]'}`}>
            <Video size={14} className={isDarkMode ? 'text-[#16af75]' : 'text-[#c26700]'} />
          </span>
          <p className="text-[10px] font-bold truncate text-gray-400" title={name}>
            فيديو: {name}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Native System Player button */}
          <button
            onClick={handleExternalPlay}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black transition-all shadow-xs active:scale-95 cursor-pointer ${
              isDarkMode 
                ? 'bg-[#1d2737] hover:bg-[#2C374E] text-[#16af75]' 
                : 'bg-white hover:bg-natural-bg/40 border border-natural-border/50 text-[#c26700]'
            }`}
            title="تشغيل في مشغل الجوال الخارجي"
          >
            <ExternalLink size={11} />
            <span>تشغيل خارجي</span>
          </button>
        </div>
      </div>

      {isTokenExpired ? (
        <div className={`flex flex-col items-center justify-center p-3 rounded-xl text-center gap-1.5 text-[10px] font-bold ${isDarkMode ? 'bg-amber-950/20 text-amber-300 border border-amber-900/30' : 'bg-amber-50 text-amber-700 border border-amber-100'} mt-1`}>
          <span>⚠️ انتهت صلاحية جلسة Google Drive. يرجى تجديد الصلاحية للتمكن من تشغيل الفيديو.</span>
          <button
            onClick={handleRenewToken}
            className={`px-3 py-1.5 rounded-lg font-black text-[9px] cursor-pointer transition-all active:scale-95 text-white shadow-md ${
              isDarkMode ? 'bg-[#16af75] hover:bg-[#129462]' : 'bg-[#c26700] hover:bg-[#a65600]'
            }`}
          >
            تجديد الصلاحية الآن
          </button>
        </div>
      ) : hasError ? (
        <span className="text-[9px] text-red-500 font-bold text-center bg-red-100 dark:bg-red-950/40 p-1.5 rounded-md mt-1">
          حدث خطأ أثناء تحميل أو تشغيل الفيديو. يمكنك النقر على "تشغيل خارجي" لتشغيله في الجوال مباشرة.
        </span>
      ) : null}
    </div>
  );
}
