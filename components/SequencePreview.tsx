"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { clipMediaUrl } from "@/components/ClipVideoPreview"
import {
	clipTimelineEnd,
	resolveNextProgramChange,
	resolvePlaybackAtTime,
	roundTimelineSeconds,
	timelineTimeFromVideo,
	type ProjectEdit,
	type SequencePlaybackFrame,
	type TimelineClip,
} from "@/lib/edit-core"

const SCRUB_SEEK_DRIFT_SECONDS = 0.05
const PLAYHEAD_UI_INTERVAL_MS = 50
const TRIM_END_PADDING_SECONDS = 0.04
const PRELOAD_LEAD_SECONDS = 2

type SlotIndex = 0 | 1

function otherSlot(slot: SlotIndex): SlotIndex {
	return slot === 0 ? 1 : 0
}

export function SequencePreview({
	projectId,
	edit,
	playheadSeconds,
	isPlaying,
	volume = 0,
	onPlayheadChange,
	onReachEnd,
}: {
	projectId: string
	edit: ProjectEdit
	playheadSeconds: number
	isPlaying: boolean
	volume?: number
	onPlayheadChange?: (seconds: number) => void
	onReachEnd?: () => void
}) {
	const slot0Ref = useRef<HTMLVideoElement>(null)
	const slot1Ref = useRef<HTMLVideoElement>(null)
	const slotClipIdRef = useRef<[string | null, string | null]>([null, null])
	const activeSlotRef = useRef<SlotIndex>(0)
	const activeClipRef = useRef<TimelineClip | null>(null)
	const editRef = useRef(edit)
	const isPlayingRef = useRef(isPlaying)
	const onPlayheadChangeRef = useRef(onPlayheadChange)
	const onReachEndRef = useRef(onReachEnd)
	const lastUiPushRef = useRef(0)
	const playbackRafRef = useRef(0)
	const prepareTokenRef = useRef(0)
	const playheadRef = useRef(playheadSeconds)
	const inGapRef = useRef(false)
	const gapClockRef = useRef({ lastWall: 0, timelineAt: 0 })

	const [displaySlot, setDisplaySlot] = useState<SlotIndex>(0)
	const [showGap, setShowGap] = useState(false)

	editRef.current = edit
	isPlayingRef.current = isPlaying
	onPlayheadChangeRef.current = onPlayheadChange
	onReachEndRef.current = onReachEnd
	activeSlotRef.current = displaySlot
	playheadRef.current = playheadSeconds

	const frame = resolvePlaybackAtTime(edit, playheadSeconds)

	const slotVideo = useCallback((slot: SlotIndex) => {
		return slot === 0 ? slot0Ref.current : slot1Ref.current
	}, [])

	const applyVolume = useCallback(
		(video: HTMLVideoElement) => {
			const level = Math.min(1, Math.max(0, volume))
			video.volume = level
			video.muted = level === 0
		},
		[volume]
	)

	const pushPlayhead = useCallback((timelineTime: number) => {
		const now = performance.now()
		if (now - lastUiPushRef.current < PLAYHEAD_UI_INTERVAL_MS) return
		lastUiPushRef.current = now
		onPlayheadChangeRef.current?.(roundTimelineSeconds(timelineTime))
	}, [])

	const seekVideo = useCallback((video: HTMLVideoElement, targetTime: number) => {
		return new Promise<void>((resolve) => {
			if (
				!Number.isFinite(targetTime) ||
				Math.abs(video.currentTime - targetTime) <= SCRUB_SEEK_DRIFT_SECONDS
			) {
				resolve()
				return
			}

			const onSeeked = () => {
				video.removeEventListener("seeked", onSeeked)
				resolve()
			}

			video.addEventListener("seeked", onSeeked)
			video.currentTime = targetTime
		})
	}, [])

	const waitForData = useCallback((video: HTMLVideoElement) => {
		return new Promise<void>((resolve) => {
			if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
				resolve()
				return
			}
			video.addEventListener("loadeddata", () => resolve(), { once: true })
		})
	}, [])

	const prepareSlot = useCallback(
		async (
			slot: SlotIndex,
			playback: SequencePlaybackFrame
		): Promise<boolean> => {
			const video = slotVideo(slot)
			if (!video) return false

			const token = ++prepareTokenRef.current
			const url = clipMediaUrl(projectId, playback.clip.clipFile)
			const sameClip = slotClipIdRef.current[slot] === playback.clip.id

			if (!sameClip || !video.src) {
				slotClipIdRef.current[slot] = playback.clip.id
				video.src = url
				video.load()
				await waitForData(video)
			}

			if (token !== prepareTokenRef.current) return false

			await seekVideo(video, playback.mediaTimeInFile)
			applyVolume(video)

			if (!isPlayingRef.current) {
				video.pause()
			}

			return true
		},
		[applyVolume, projectId, seekVideo, slotVideo, waitForData]
	)

	const activateSlot = useCallback(
		(slot: SlotIndex, autoplay: boolean, clip: TimelineClip) => {
			activeSlotRef.current = slot
			setDisplaySlot(slot)
			activeClipRef.current = clip
			inGapRef.current = false
			setShowGap(false)

			const active = slotVideo(slot)
			const inactive = slotVideo(otherSlot(slot))
			inactive?.pause()

			if (active) {
				applyVolume(active)
				if (autoplay) {
					void active.play().catch(() => {})
				} else {
					active.pause()
				}
			}
		},
		[applyVolume, slotVideo]
	)

	const enterGap = useCallback(
		(timelineTime: number) => {
			inGapRef.current = true
			setShowGap(true)
			activeClipRef.current = null
			gapClockRef.current = {
				lastWall: performance.now(),
				timelineAt: timelineTime,
			}
			slot0Ref.current?.pause()
			slot1Ref.current?.pause()
		},
		[]
	)

	const switchToFrame = useCallback(
		async (playback: SequencePlaybackFrame): Promise<boolean> => {
			const targetSlot = otherSlot(activeSlotRef.current)
			const ready = await prepareSlot(targetSlot, playback)
			if (ready) {
				activateSlot(targetSlot, isPlayingRef.current, playback.clip)
			}
			return ready
		},
		[activateSlot, prepareSlot]
	)

	const maybePreloadNext = useCallback(
		(timelineTime: number) => {
			const change = resolveNextProgramChange(editRef.current, timelineTime)
			if (!change?.frame) return

			const lead = change.at - timelineTime
			if (lead > 0 && lead <= PRELOAD_LEAD_SECONDS) {
				void prepareSlot(otherSlot(activeSlotRef.current), change.frame)
			}
		},
		[prepareSlot]
	)

	useEffect(() => {
		for (const slot of [0, 1] as const) {
			const video = slotVideo(slot)
			if (video) applyVolume(video)
		}
	}, [applyVolume, slotVideo])

	// Paused / scrubbing.
	useEffect(() => {
		if (isPlaying) return

		if (!frame) {
			setShowGap(true)
			activeClipRef.current = null
			inGapRef.current = false
			slot0Ref.current?.pause()
			slot1Ref.current?.pause()
			return
		}

		setShowGap(false)
		void prepareSlot(activeSlotRef.current, frame)
	}, [frame?.clip.id, frame?.mediaTimeInFile, isPlaying, prepareSlot, frame])

	// Playing: video or gap clock drives the timeline.
	useEffect(() => {
		if (!isPlaying) {
			cancelAnimationFrame(playbackRafRef.current)
			return
		}

		let cancelled = false

		const scheduleTick = () => {
			playbackRafRef.current = requestAnimationFrame(tick)
		}

		const tick = () => {
			if (cancelled || !isPlayingRef.current) return

			const duration = editRef.current.duration

			if (inGapRef.current) {
				const now = performance.now()
				const delta = (now - gapClockRef.current.lastWall) / 1000
				gapClockRef.current.lastWall = now
				const timelineTime = roundTimelineSeconds(
					gapClockRef.current.timelineAt + delta
				)

				if (timelineTime >= duration) {
					onReachEndRef.current?.()
					return
				}

				pushPlayhead(timelineTime)
				maybePreloadNext(timelineTime)

				const expected = resolvePlaybackAtTime(
					editRef.current,
					timelineTime
				)
				if (expected) {
					void switchToFrame(expected).then(() => {
						if (!cancelled && isPlayingRef.current) scheduleTick()
					})
					return
				}

				scheduleTick()
				return
			}

			const slot = activeSlotRef.current
			const video = slotVideo(slot)
			const clip = activeClipRef.current

			if (!video || !clip) {
				scheduleTick()
				return
			}

			const timelineTime = timelineTimeFromVideo(clip, video.currentTime)
			const expected = resolvePlaybackAtTime(
				editRef.current,
				timelineTime
			)

			maybePreloadNext(timelineTime)

			if (!expected) {
				enterGap(timelineTime)
				scheduleTick()
				return
			}

			if (expected.clip.id !== clip.id) {
				void switchToFrame(expected).then(() => {
					if (!cancelled && isPlayingRef.current) scheduleTick()
				})
				return
			}

			const trimEnd = clip.sourceOut - TRIM_END_PADDING_SECONDS
			if (video.currentTime >= trimEnd || video.ended) {
				const after = resolvePlaybackAtTime(
					editRef.current,
					clipTimelineEnd(clip) + 0.001
				)
				if (!after) {
					enterGap(clipTimelineEnd(clip))
				} else if (after.clip.id !== clip.id) {
					void switchToFrame(after).then(() => {
						if (!cancelled && isPlayingRef.current) scheduleTick()
					})
					return
				}
				scheduleTick()
				return
			}

			pushPlayhead(timelineTime)
			scheduleTick()
		}

		const startFrame = resolvePlaybackAtTime(
			editRef.current,
			playheadRef.current
		)

		if (!startFrame) {
			enterGap(playheadRef.current)
			scheduleTick()
		} else {
			void prepareSlot(activeSlotRef.current, startFrame).then((ready) => {
				if (!ready || cancelled || !isPlayingRef.current) return
				activeClipRef.current = startFrame.clip
				inGapRef.current = false
				setShowGap(false)
				const video = slotVideo(activeSlotRef.current)
				if (video) {
					applyVolume(video)
					void video.play().catch(() => {})
				}
				scheduleTick()
			})
		}

		return () => {
			cancelled = true
			cancelAnimationFrame(playbackRafRef.current)
		}
	}, [
		applyVolume,
		enterGap,
		isPlaying,
		maybePreloadNext,
		prepareSlot,
		pushPlayhead,
		slotVideo,
		switchToFrame,
	])

	const videoClass = (slot: SlotIndex) =>
		`absolute inset-0 h-full w-full object-contain transition-opacity duration-75 ${
			displaySlot === slot && !showGap ? "z-10 opacity-100" : "z-0 opacity-0"
		}`

	return (
		<div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-black">
			<div className="relative min-h-0 flex-1">
				<video
					ref={slot0Ref}
					className={videoClass(0)}
					muted={volume <= 0}
					playsInline
					preload="auto"
				/>
				<video
					ref={slot1Ref}
					className={videoClass(1)}
					muted={volume <= 0}
					playsInline
					preload="auto"
				/>
				{showGap && (
					<div className="absolute inset-0 z-20 bg-black" aria-hidden />
				)}
				{!isPlaying && !frame && (
					<p className="absolute inset-0 z-30 flex items-center justify-center px-4 text-center text-sm text-zinc-500">
						No clip at playhead on any video track — add clips or scrub
						to a clip.
					</p>
				)}
			</div>
			<p className="absolute bottom-0 left-0 right-0 truncate border-t border-zinc-800/80 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-400">
				{frame?.clip.clipFile ?? (showGap ? "Gap" : "—")}
			</p>
		</div>
	)
}
