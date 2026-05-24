"use client"

import { createPlayer } from "@videojs/react"
import { VideoSkin, Video, videoFeatures } from "@videojs/react/video"
import "@videojs/react/video/skin.css"

const Player = createPlayer({ features: videoFeatures })

export type VideoPlayerProps = {
	source?: string
	previewImage?: string
	clipFileName?: string
	/** Browsers require muted for autoplay without a user gesture. */
	autoPlay?: boolean
	muted?: boolean
	loop?: boolean
	className?: string
	/** Fill parent height (editor canvas); default uses 16:9 box. */
	fill?: boolean
}

export function VideoPlayer({
	source,
	previewImage,
	clipFileName,
	autoPlay = false,
	muted,
	loop = false,
	className = "",
	fill = false,
}: VideoPlayerProps) {
	const playMuted = muted ?? (autoPlay ? true : false)

	const rootClass = fill
		? `flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden ${className}`
		: `flex w-full flex-col overflow-hidden ${className}`

	const stageClass = fill
		? "relative min-h-0 w-full flex-1 overflow-hidden bg-black [&_.video-js]:!absolute [&_.video-js]:!inset-0 [&_.video-js]:!h-full [&_.video-js]:!w-full [&_.vjs-tech]:!h-full [&_.vjs-tech]:!w-full [&_.vjs-tech]:!object-contain"
		: "relative aspect-video w-full overflow-hidden bg-black [&_.video-js]:!h-full [&_.video-js]:!w-full [&_.vjs-tech]:!object-contain"

	return (
		<div className={rootClass}>
			<div className={stageClass}>
				<Player.Provider>
					<VideoSkin poster={previewImage}>
						<Video
							src={source}
							playsInline
							autoPlay={autoPlay}
							muted={playMuted}
							loop={loop}
						/>
					</VideoSkin>
				</Player.Provider>
			</div>
			{clipFileName && (
				<p className="shrink-0 truncate border-t border-zinc-800 bg-zinc-900/90 px-2 py-1 text-xs text-zinc-400">
					{clipFileName}
				</p>
			)}
		</div>
	)
}
