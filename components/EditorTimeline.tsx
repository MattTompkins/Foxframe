"use client"

import { useCallback, useMemo, useRef } from "react"
import {
	clipTimelineDuration,
	type EditTrack,
	type ProjectEdit,
	type TimelineClip,
} from "@/lib/edit-core"

const TRACK_LABEL_WIDTH = 112
const RULER_HEIGHT = 28
const TRACK_ROW_HEIGHT = 52
const MIN_TIMELINE_SECONDS = 12
const DEFAULT_PX_PER_SEC = 64

function basename(file: string) {
	const slash = file.lastIndexOf("/")
	return slash >= 0 ? file.slice(slash + 1) : file
}

function formatRulerLabel(seconds: number) {
	if (seconds < 60) return `${seconds}s`
	const m = Math.floor(seconds / 60)
	const s = seconds % 60
	return s > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${m}:00`
}

function trackClipColor(track: EditTrack, index: number) {
	if (track.type === "audio") {
		return index % 2 === 0 ? "bg-sky-600/90 border-sky-400" : "bg-sky-700/90 border-sky-500"
	}
	return index % 2 === 0
		? "bg-orange-600/90 border-orange-400"
		: "bg-amber-600/90 border-amber-400"
}

function timeFromPointer(
	clientX: number,
	scrollLeft: number,
	rectLeft: number,
	pxPerSec: number
) {
	const x = clientX - rectLeft + scrollLeft
	return Math.max(0, x / pxPerSec)
}

export function EditorTimeline({
	edit,
	playheadSeconds,
	onPlayheadChange,
	pxPerSec = DEFAULT_PX_PER_SEC,
	saving = false,
}: {
	edit: ProjectEdit
	playheadSeconds: number
	onPlayheadChange: (seconds: number) => void
	pxPerSec?: number
	saving?: boolean
}) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)

	const timelineSeconds = Math.max(
		edit.duration,
		MIN_TIMELINE_SECONDS,
		playheadSeconds + 2
	)
	const timelineWidth = timelineSeconds * pxPerSec
	const playheadLeft = playheadSeconds * pxPerSec

	const clipsByTrack = useMemo(() => {
		const map = new Map<string, TimelineClip[]>()
		for (const track of edit.tracks) {
			map.set(track.id, [])
		}
		for (const clip of edit.clips) {
			const list = map.get(clip.trackId)
			if (list) {
				list.push(clip)
			} else {
				map.set(clip.trackId, [clip])
			}
		}
		return map
	}, [edit.clips, edit.tracks])

	const rulerTicks = useMemo(() => {
		const ticks: number[] = []
		const step = timelineSeconds > 60 ? 5 : 1
		for (let t = 0; t <= timelineSeconds; t += step) {
			ticks.push(t)
		}
		return ticks
	}, [timelineSeconds])

	const seekFromEvent = useCallback(
		(clientX: number) => {
			const scrollEl = scrollRef.current
			const contentEl = contentRef.current
			if (!scrollEl || !contentEl) return

			const rect = contentEl.getBoundingClientRect()
			const time = timeFromPointer(
				clientX,
				scrollEl.scrollLeft,
				rect.left,
				pxPerSec
			)
			onPlayheadChange(Math.min(time, timelineSeconds))
		},
		[onPlayheadChange, pxPerSec, timelineSeconds]
	)

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center justify-between border-b border-zinc-700/80 px-2 py-1">
				<p className="text-xs text-zinc-500">
					{edit.clips.length} clip{edit.clips.length === 1 ? "" : "s"} ·{" "}
					{formatRulerLabel(Math.round(edit.duration))} total
					{saving ? " · Saving…" : ""}
				</p>
				<p className="text-xs tabular-nums text-zinc-400">
					Playhead {formatRulerLabel(Math.round(playheadSeconds * 10) / 10)}
				</p>
			</div>

			<div className="flex min-h-0 flex-1">
				<div
					className="shrink-0 border-r border-zinc-700 bg-zinc-900/90"
					style={{ width: TRACK_LABEL_WIDTH }}
				>
					<div
						className="border-b border-zinc-700/80"
						style={{ height: RULER_HEIGHT }}
					/>
					{edit.tracks.map((track) => (
						<div
							key={track.id}
							className="flex items-center border-b border-zinc-800 px-2 text-xs font-medium text-zinc-300"
							style={{ height: TRACK_ROW_HEIGHT }}
						>
							<span className="truncate" title={track.label}>
								{track.label}
							</span>
						</div>
					))}
				</div>

				<div
					ref={scrollRef}
					className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
				>
					<div
						ref={contentRef}
						className="relative"
						style={{ width: timelineWidth, minWidth: "100%" }}
					>
						<div
							role="slider"
							aria-label="Timeline position"
							aria-valuemin={0}
							aria-valuemax={timelineSeconds}
							aria-valuenow={playheadSeconds}
							className="relative cursor-crosshair border-b border-zinc-700/80 bg-zinc-950/50"
							style={{ height: RULER_HEIGHT }}
							onPointerDown={(event) => {
								seekFromEvent(event.clientX)
								event.currentTarget.setPointerCapture(event.pointerId)
							}}
							onPointerMove={(event) => {
								if (event.buttons !== 1) return
								seekFromEvent(event.clientX)
							}}
						>
							{rulerTicks.map((tick) => (
								<div
									key={tick}
									className="absolute top-0 flex h-full flex-col justify-end"
									style={{ left: tick * pxPerSec }}
								>
									<span className="-translate-x-1/2 pb-0.5 pl-0 text-[10px] tabular-nums text-zinc-500">
										{formatRulerLabel(tick)}
									</span>
									<div className="h-2 w-px bg-zinc-600" />
								</div>
							))}
						</div>

						{edit.tracks.map((track) => {
							const trackClips = clipsByTrack.get(track.id) ?? []

							return (
								<div
									key={track.id}
									role="presentation"
									className="relative cursor-crosshair border-b border-zinc-800 bg-zinc-900/40"
									style={{ height: TRACK_ROW_HEIGHT }}
									onPointerDown={(event) => {
										seekFromEvent(event.clientX)
										event.currentTarget.setPointerCapture(
											event.pointerId
										)
									}}
									onPointerMove={(event) => {
										if (event.buttons !== 1) return
										seekFromEvent(event.clientX)
									}}
								>
									{trackClips.map((clip, index) => {
										const width =
											clipTimelineDuration(clip) * pxPerSec
										const left = clip.startOnTimeline * pxPerSec

										return (
											<div
												key={clip.id}
												className={`absolute top-1 bottom-1 flex min-w-[2px] items-center overflow-hidden rounded border px-1 text-[10px] font-medium text-white shadow-sm ${trackClipColor(track, index)}`}
												style={{
													left,
													width: Math.max(width, 4),
													zIndex: 10 + index,
												}}
												title={`${basename(clip.clipFile)} · ${formatRulerLabel(Math.round(clip.startOnTimeline))}`}
											>
												<span className="truncate">
													{basename(clip.clipFile)}
												</span>
											</div>
										)
									})}
								</div>
							)
						})}

						<div
							className="pointer-events-none absolute top-0 bottom-0 z-50 w-0.5 bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]"
							style={{ left: playheadLeft }}
							aria-hidden
						>
							<div className="absolute -left-1.5 top-0 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-orange-400" />
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
