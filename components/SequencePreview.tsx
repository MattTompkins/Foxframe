"use client"

import { useCallback, useEffect, useRef } from "react"
import { clipMediaUrl } from "@/components/ClipVideoPreview"
import { resolvePlaybackAtTime, type ProjectEdit } from "@/lib/edit-core"

const SEEK_DRIFT_SECONDS = 0.08

export function SequencePreview({
	projectId,
	edit,
	playheadSeconds,
	isPlaying,
}: {
	projectId: string
	edit: ProjectEdit
	playheadSeconds: number
	isPlaying: boolean
}) {
	const videoRef = useRef<HTMLVideoElement>(null)
	const loadedClipIdRef = useRef<string | null>(null)
	const frame = resolvePlaybackAtTime(edit, playheadSeconds)

	const syncVideoToPlayhead = useCallback(
		(playback: NonNullable<typeof frame>) => {
			const video = videoRef.current
			if (!video) return

			const needsSourceChange =
				loadedClipIdRef.current !== playback.clip.id

			const seekToMediaTime = () => {
				if (
					Number.isFinite(playback.mediaTimeInFile) &&
					Math.abs(video.currentTime - playback.mediaTimeInFile) >
						SEEK_DRIFT_SECONDS
				) {
					video.currentTime = playback.mediaTimeInFile
				}
				if (isPlaying) {
					void video.play().catch(() => {})
				} else {
					video.pause()
				}
			}

			if (needsSourceChange) {
				loadedClipIdRef.current = playback.clip.id
				video.src = clipMediaUrl(projectId, playback.clip.clipFile)
				video.load()
				video.addEventListener("loadedmetadata", seekToMediaTime, {
					once: true,
				})
			} else {
				seekToMediaTime()
			}
		},
		[isPlaying, projectId]
	)

	useEffect(() => {
		if (!frame) {
			videoRef.current?.pause()
			loadedClipIdRef.current = null
			return
		}

		syncVideoToPlayhead(frame)
	}, [frame, playheadSeconds, syncVideoToPlayhead])

	if (!frame) {
		return (
			<div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-black px-4">
				<p className="text-center text-sm text-zinc-500">
					No clip at playhead on any video track — add clips or scrub to
					a clip.
				</p>
			</div>
		)
	}

	return (
		<div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-black">
			<video
				ref={videoRef}
				className="h-full w-full object-contain"
				muted
				playsInline
				preload="auto"
			/>
			<p className="absolute bottom-0 left-0 right-0 truncate border-t border-zinc-800/80 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-400">
				{frame.clip.clipFile}
			</p>
		</div>
	)
}
