import { useEffect, useRef } from "react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import "video.js/dist/video-js.css";

type CloudflareVideoPlayerProps = {
  src: string;
  poster?: string;
  live?: boolean;
};

export function CloudflareVideoPlayer({ src, poster, live = false }: CloudflareVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    if (!playerRef.current) {
      playerRef.current = videojs(videoRef.current, {
        autoplay: false,
        controls: true,
        fluid: true,
        liveui: live,
        preload: live ? "none" : "auto",
        responsive: true,
        poster,
        sources: [{ src, type: "application/x-mpegURL" }],
      });
      return;
    }

    playerRef.current.poster(poster || "");
    playerRef.current.src({ src, type: "application/x-mpegURL" });
  }, [live, poster, src]);

  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
      }
      playerRef.current = null;
    };
  }, []);

  return (
    <div data-vjs-player className="h-full w-full bg-black">
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered vjs-theme-cheshire h-full w-full"
        playsInline
      />
    </div>
  );
}
