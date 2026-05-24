"use client"

import { createPlayer } from "@videojs/react"
import { VideoSkin, Video, videoFeatures } from "@videojs/react/video"
import "@videojs/react/video/skin.css"

const Player = createPlayer({ features: videoFeatures })

export function VideoPlayer({
	source,
	previewImage,
	clipFileName,
}: {
	source?: string
	previewImage?: string
	clipFileName?: string
}) {
	return (
		<div>
			<Player.Provider>
				<VideoSkin poster={previewImage}>
					<Video src={source} playsInline />
				</VideoSkin>
			</Player.Provider>
			{clipFileName && (
				<span className="mx-3 mb-2 mt-1 block text-xs text-white">
					{clipFileName}
				</span>
			)}
		</div>
	)
}
