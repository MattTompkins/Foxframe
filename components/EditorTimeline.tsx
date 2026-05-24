"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Film, Mic, Pause, Play, Volume2, VolumeX } from "lucide-react"
import {
	CLIP_DRAG_MIME,
	addTrackToEdit,
	moveTimelineClip,
	snapToFrame,
} from "@/lib/edit-client"
import {
	clipTimelineDuration,
	type EditTrack,
	type EditTrackType,
	type ProjectEdit,
	type TimelineClip,
} from "@/lib/edit-core"

const TRACK_LABEL_WIDTH = 112
const RULER_HEIGHT = 28
const TRACK_ROW_HEIGHT = 52
const MIN_TIMELINE_SECONDS = 12
const DEFAULT_PX_PER_SEC = 64

type ClipDragState = {
	clipId: string
	pointerId: number
	grabOffsetSec: number
	originTrackId: string
	previewStart: number
	previewTrackId: string
}

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

function trackClipColor(track: EditTrack, index: number, isDragging: boolean) {
	const base =
		track.type === "audio"
			? index % 2 === 0
				? "bg-sky-600/90 border-sky-400"
				: "bg-sky-700/90 border-sky-500"
			: index % 2 === 0
				? "bg-orange-600/90 border-orange-400"
				: "bg-amber-600/90 border-amber-400"

	return isDragging
		? `${base} ring-2 ring-white shadow-lg opacity-95`
		: `${base} shadow-sm`
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

function resolveClipPlacement(
	clip: TimelineClip,
	drag: ClipDragState | null
): Pick<TimelineClip, "startOnTimeline" | "trackId"> {
	if (!drag || drag.clipId !== clip.id) {
		return {
			startOnTimeline: clip.startOnTimeline,
			trackId: clip.trackId,
		}
	}
	return {
		startOnTimeline: drag.previewStart,
		trackId: drag.previewTrackId,
	}
}

export function EditorTimeline({
	edit,
	playheadSeconds,
	onPlayheadChange,
	onEditChange,
	onAddClipFromAsset,
	isPlaying = false,
	onPlayToggle,
	volume = 0,
	onVolumeChange,
	pxPerSec = DEFAULT_PX_PER_SEC,
	saving = false,
}: {
	edit: ProjectEdit
	playheadSeconds: number
	onPlayheadChange: (seconds: number) => void
	onEditChange: (edit: ProjectEdit) => void
	onAddClipFromAsset?: (
		clipFile: string,
		trackId: string,
		startOnTimeline: number
	) => void
	isPlaying?: boolean
	onPlayToggle?: () => void
	/** 0–1 playback volume for the canvas preview. */
	volume?: number
	onVolumeChange?: (volume: number) => void
	pxPerSec?: number
	saving?: boolean
}) {
	const verticalScrollRef = useRef<HTMLDivElement>(null)
	const horizontalScrollRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const [clipDrag, setClipDrag] = useState<ClipDragState | null>(null)
	const clipDragRef = useRef<ClipDragState | null>(null)
	const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(
		null
	)

	clipDragRef.current = clipDrag

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
			const placement = resolveClipPlacement(clip, clipDrag)
			const placed = { ...clip, ...placement }
			const list = map.get(placement.trackId)
			if (list) {
				list.push(placed)
			} else {
				map.set(placement.trackId, [placed])
			}
		}
		return map
	}, [edit.clips, edit.tracks, clipDrag])

	const rulerTicks = useMemo(() => {
		const ticks: number[] = []
		const step = timelineSeconds > 60 ? 5 : 1
		for (let t = 0; t <= timelineSeconds; t += step) {
			ticks.push(t)
		}
		return ticks
	}, [timelineSeconds])

	const getTrackIdAtClientY = useCallback(
		(clientY: number) => {
			const contentEl = contentRef.current
			if (!contentEl) return null

			const rect = contentEl.getBoundingClientRect()
			const y = clientY - rect.top - RULER_HEIGHT
			if (y < 0) return null

			const index = Math.floor(y / TRACK_ROW_HEIGHT)
			if (index < 0 || index >= edit.tracks.length) return null
			return edit.tracks[index].id
		},
		[edit.tracks]
	)

	const timeAtClientX = useCallback(
		(clientX: number) => {
			const scrollEl = horizontalScrollRef.current
			const contentEl = contentRef.current
			if (!scrollEl || !contentEl) return 0

			const rect = contentEl.getBoundingClientRect()
			return timeFromPointer(
				clientX,
				scrollEl.scrollLeft,
				rect.left,
				pxPerSec
			)
		},
		[pxPerSec]
	)

	const tracksBodyHeight =
		RULER_HEIGHT + edit.tracks.length * TRACK_ROW_HEIGHT

	const seekFromEvent = useCallback(
		(clientX: number) => {
			const time = timeAtClientX(clientX)
			onPlayheadChange(Math.min(time, timelineSeconds))
		},
		[onPlayheadChange, timeAtClientX, timelineSeconds]
	)

	const handleAddTrack = useCallback(
		(type: EditTrackType) => {
			onEditChange(addTrackToEdit(edit, type))
		},
		[edit, onEditChange]
	)

	const beginClipDrag = useCallback(
		(
			event: React.PointerEvent,
			clip: TimelineClip,
			placement: Pick<TimelineClip, "startOnTimeline" | "trackId">
		) => {
			event.stopPropagation()
			event.preventDefault()

			const pointerTime = timeAtClientX(event.clientX)
			const grabOffsetSec = pointerTime - placement.startOnTimeline

			setClipDrag({
				clipId: clip.id,
				pointerId: event.pointerId,
				grabOffsetSec,
				originTrackId: placement.trackId,
				previewStart: placement.startOnTimeline,
				previewTrackId: placement.trackId,
			})

			event.currentTarget.setPointerCapture(event.pointerId)
		},
		[timeAtClientX]
	)

	useEffect(() => {
		if (!clipDrag) return

		function onPointerMove(event: PointerEvent) {
			const drag = clipDragRef.current
			if (!drag || event.pointerId !== drag.pointerId) return

			const pointerTime = timeAtClientX(event.clientX)
			const previewStart = snapToFrame(
				pointerTime - drag.grabOffsetSec,
				edit.fps
			)
			const trackId =
				getTrackIdAtClientY(event.clientY) ?? drag.previewTrackId

			setClipDrag({
				...drag,
				previewStart,
				previewTrackId: trackId,
			})
			setDropTargetTrackId(trackId)
		}

		function finishDrag(event: PointerEvent) {
			const drag = clipDragRef.current
			if (!drag || event.pointerId !== drag.pointerId) return

			const original = edit.clips.find((c) => c.id === drag.clipId)
			if (original) {
				const moved = moveTimelineClip(edit, drag.clipId, {
					startOnTimeline: snapToFrame(drag.previewStart, edit.fps),
					trackId: drag.previewTrackId,
				})
				onEditChange(moved)
			}

			setClipDrag(null)
			setDropTargetTrackId(null)
		}

		document.addEventListener("pointermove", onPointerMove)
		document.addEventListener("pointerup", finishDrag)
		document.addEventListener("pointercancel", finishDrag)

		return () => {
			document.removeEventListener("pointermove", onPointerMove)
			document.removeEventListener("pointerup", finishDrag)
			document.removeEventListener("pointercancel", finishDrag)
		}
	}, [clipDrag, edit, getTrackIdAtClientY, onEditChange, timeAtClientX])

	const handleAssetDragOver = useCallback(
		(event: React.DragEvent, trackId: string) => {
			if (!event.dataTransfer.types.includes(CLIP_DRAG_MIME)) return
			event.preventDefault()
			event.dataTransfer.dropEffect = "copy"
			setDropTargetTrackId(trackId)
		},
		[]
	)

	const handleAssetDrop = useCallback(
		(event: React.DragEvent, trackId: string) => {
			const clipFile = event.dataTransfer.getData(CLIP_DRAG_MIME)
			if (!clipFile || !onAddClipFromAsset) return

			event.preventDefault()
			const start = snapToFrame(timeAtClientX(event.clientX), edit.fps)
			onAddClipFromAsset(clipFile, trackId, start)
			setDropTargetTrackId(null)
		},
		[edit.fps, onAddClipFromAsset, timeAtClientX]
	)

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-700/80 px-2 py-1.5">
				<p className="text-xs text-zinc-500">
					{edit.clips.length} clip{edit.clips.length === 1 ? "" : "s"} ·{" "}
					{edit.tracks.length} track{edit.tracks.length === 1 ? "" : "s"} ·{" "}
					{formatRulerLabel(Math.round(edit.duration))}
					{saving ? " · Saving…" : ""}
				</p>
				<div className="flex flex-wrap items-center gap-2">
					{onPlayToggle && (
						<button
							type="button"
							onClick={onPlayToggle}
							disabled={edit.clips.length === 0}
							className="inline-flex items-center gap-1 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:border-orange-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
							aria-label={isPlaying ? "Pause" : "Play"}
						>
							{isPlaying ? (
								<Pause className="h-3.5 w-3.5" />
							) : (
								<Play className="h-3.5 w-3.5" />
							)}
							{isPlaying ? "Pause" : "Play"}
						</button>
					)}
					<button
						type="button"
						onClick={() => handleAddTrack("video")}
						className="inline-flex items-center gap-1 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:border-orange-500 hover:text-white"
					>
						<Film className="h-3.5 w-3.5" />
						Add video track
					</button>
					<button
						type="button"
						onClick={() => handleAddTrack("audio")}
						className="inline-flex items-center gap-1 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:border-sky-500 hover:text-white"
					>
						<Mic className="h-3.5 w-3.5" />
						Add audio track
					</button>
					{onVolumeChange && (
						<label className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200">
							{volume <= 0 ? (
								<VolumeX className="h-3.5 w-3.5 shrink-0" aria-hidden />
							) : (
								<Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
							)}
							<input
								type="range"
								min={0}
								max={100}
								step={1}
								value={Math.round(volume * 100)}
								onChange={(event) =>
									onVolumeChange(
										parseInt(event.target.value, 10) / 100
									)
								}
								className="h-1 w-16 cursor-pointer accent-orange-500"
								aria-label="Preview volume"
							/>
						</label>
					)}
					<p className="text-xs tabular-nums text-zinc-400 min-w-10 text-right">
						{formatRulerLabel(Math.round(playheadSeconds * 10) / 10)}
					</p>
				</div>
			</div>

			<div
				ref={verticalScrollRef}
				className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
			>
				<div
					className="flex w-full items-start"
					style={{ minHeight: tracksBodyHeight }}
				>
					<div
						className="sticky left-0 z-10 flex shrink-0 flex-col border-r border-zinc-700 bg-zinc-900/90"
						style={{ width: TRACK_LABEL_WIDTH }}
					>
						<div
							className="sticky top-0 z-20 shrink-0 border-b border-zinc-700/80 bg-zinc-900/95"
							style={{ height: RULER_HEIGHT }}
						/>
						{edit.tracks.map((track) => (
							<div
								key={track.id}
								className="flex items-center gap-1 border-b border-zinc-800 px-2 text-xs font-medium text-zinc-300"
								style={{ height: TRACK_ROW_HEIGHT }}
							>
								{track.type === "audio" ? (
									<Mic className="h-3.5 w-3.5 shrink-0 text-sky-400" />
								) : (
									<Film className="h-3.5 w-3.5 shrink-0 text-orange-400" />
								)}
								<span className="truncate" title={track.label}>
									{track.label}
								</span>
							</div>
						))}
					</div>

					<div className="min-w-0 flex-1 self-stretch">
						<div
							ref={horizontalScrollRef}
							className="h-full overflow-x-auto overflow-y-hidden overscroll-y-contain"
							onWheel={(event) => {
								if (event.deltaY === 0 || !verticalScrollRef.current) {
									return
								}
								verticalScrollRef.current.scrollTop += event.deltaY
							}}
						>
							<div
								ref={contentRef}
								className="relative"
								style={{
									width: timelineWidth,
									minWidth: "100%",
									minHeight: tracksBodyHeight,
								}}
							>
								<div
									role="slider"
									aria-label="Timeline position"
									aria-valuemin={0}
									aria-valuemax={timelineSeconds}
									aria-valuenow={playheadSeconds}
									className="sticky top-0 z-30 cursor-crosshair border-b border-zinc-700/80 bg-zinc-950/95 backdrop-blur-sm"
									style={{ height: RULER_HEIGHT }}
									onPointerDown={(event) => {
										if (clipDrag) return
										seekFromEvent(event.clientX)
										event.currentTarget.setPointerCapture(
											event.pointerId
										)
									}}
									onPointerMove={(event) => {
										if (clipDrag || event.buttons !== 1) return
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
									const isDropTarget = dropTargetTrackId === track.id

									return (
										<div
											key={track.id}
											role="presentation"
											className={`relative border-b border-zinc-800 transition-colors ${
												isDropTarget
													? "bg-orange-500/10 ring-1 ring-inset ring-orange-500/40"
													: "bg-zinc-900/40"
											} ${clipDrag ? "cursor-grabbing" : "cursor-crosshair"}`}
											style={{ height: TRACK_ROW_HEIGHT }}
											onDragEnter={() =>
												setDropTargetTrackId(track.id)
											}
											onDragLeave={(event) => {
												if (
													event.currentTarget.contains(
														event.relatedTarget as Node
													)
												) {
													return
												}
												setDropTargetTrackId(null)
											}}
											onDragOver={(event) =>
												handleAssetDragOver(event, track.id)
											}
											onDrop={(event) =>
												handleAssetDrop(event, track.id)
											}
											onPointerDown={(event) => {
												if (clipDrag) return
												seekFromEvent(event.clientX)
												event.currentTarget.setPointerCapture(
													event.pointerId
												)
											}}
											onPointerMove={(event) => {
												if (clipDrag || event.buttons !== 1) return
												seekFromEvent(event.clientX)
											}}
										>
											{trackClips.map((clip, index) => {
												const placement = resolveClipPlacement(
													clip,
													clipDrag
												)
												const isDragging =
													clipDrag?.clipId === clip.id
												const width =
													clipTimelineDuration(clip) * pxPerSec
												const left =
													placement.startOnTimeline * pxPerSec

												return (
													<div
														key={clip.id}
														role="button"
														tabIndex={0}
														onPointerDown={(event) =>
															beginClipDrag(
																event,
																clip,
																placement
															)
														}
														className={`absolute top-1 bottom-1 flex min-w-[2px] cursor-grab items-center overflow-hidden rounded border px-1 text-[10px] font-medium text-white active:cursor-grabbing ${trackClipColor(track, index, isDragging)}`}
														style={{
															left,
															width: Math.max(width, 4),
															zIndex: isDragging
																? 60
																: 10 + index,
														}}
														title={`${basename(clip.clipFile)} · drag to move`}
													>
														<span className="pointer-events-none truncate">
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
			</div>
		</div>
	)
}
