"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Film, Mic, Pause, Play, Volume2, VolumeX } from "lucide-react"
import {
	CLIP_DRAG_MIME,
	addTrackToEdit,
	moveTimelineClip,
	removeTimelineClip,
	snapToFrame,
	trimTimelineClip,
} from "@/lib/edit-client"
import {
	clipTimelineDuration,
	roundTimelineSeconds,
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
const MIN_CLIP_DURATION_SECONDS = 0.001
const CLIP_DRAG_THRESHOLD_PX = 5
const TRIM_HANDLE_WIDTH_PX = 8

type ClipTrimEdge = "left" | "right"

type ClipTrimState = {
	clipId: string
	edge: ClipTrimEdge
	pointerId: number
	originStartOnTimeline: number
	originSourceIn: number
	originSourceOut: number
	previewStartOnTimeline: number
	previewSourceIn: number
	previewSourceOut: number
}

type ClipDragState = {
	clipId: string
	pointerId: number
	grabOffsetSec: number
	originTrackId: string
	previewStart: number
	previewTrackId: string
}

type PendingClipPointer = {
	clipId: string
	pointerId: number
	startClientX: number
	startClientY: number
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
	const t = roundTimelineSeconds(Math.max(0, seconds))
	if (t < 60) {
		if (Math.abs(t - Math.round(t)) < 0.05) return `${Math.round(t)}s`
		return `${t.toFixed(1)}s`
	}
	const totalSec = Math.floor(t + 1e-6)
	const m = Math.floor(totalSec / 60)
	const s = totalSec % 60
	return s > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${m}:00`
}

function formatPlayheadTime(seconds: number, fps: number) {
	const t =
		fps > 0
			? roundTimelineSeconds(Math.max(0, Math.round(seconds * fps) / fps))
			: roundTimelineSeconds(Math.max(0, seconds))
	const totalSec = Math.floor(t + 1e-6)
	const m = Math.floor(totalSec / 60)
	const s = totalSec % 60
	if (m > 0 || totalSec >= 60) {
		return `${m}:${String(s).padStart(2, "0")}`
	}
	return `${s}s`
}

function rulerTickStep(durationSeconds: number) {
	if (durationSeconds <= 60) return 1
	if (durationSeconds <= 5 * 60) return 5
	if (durationSeconds <= 15 * 60) return 10
	if (durationSeconds <= 60 * 60) return 30
	return 60
}

function trackClipColor(
	track: EditTrack,
	index: number,
	isDragging: boolean,
	isSelected: boolean
) {
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
		: isSelected
			? `${base} ring-2 ring-white/90 shadow-md`
			: `${base} shadow-sm`
}

function timeFromPointer(
	clientX: number,
	scrollLeft: number,
	viewportLeft: number,
	pxPerSec: number
) {
	const x = clientX - viewportLeft + scrollLeft
	return roundTimelineSeconds(Math.max(0, x / pxPerSec))
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

function minClipDuration(fps: number) {
	return fps > 0 ? 1 / fps : MIN_CLIP_DURATION_SECONDS
}

function previewTrimLeft(
	origin: {
		startOnTimeline: number
		sourceIn: number
		sourceOut: number
	},
	pointerTime: number,
	fps: number
) {
	const minDuration = minClipDuration(fps)
	const originDuration = origin.sourceOut - origin.sourceIn
	const originEnd = origin.startOnTimeline + originDuration

	let newStart = Math.max(0, Math.min(pointerTime, originEnd - minDuration))
	const delta = newStart - origin.startOnTimeline
	let newSourceIn = origin.sourceIn + delta
	newSourceIn = Math.max(
		0,
		Math.min(newSourceIn, origin.sourceOut - minDuration)
	)

	const actualDelta = newSourceIn - origin.sourceIn
	newStart = origin.startOnTimeline + actualDelta

	return {
		startOnTimeline: roundTimelineSeconds(newStart),
		sourceIn: roundTimelineSeconds(newSourceIn),
		sourceOut: origin.sourceOut,
	}
}

function previewTrimRight(
	origin: {
		startOnTimeline: number
		sourceIn: number
		sourceOut: number
	},
	pointerTime: number,
	fps: number,
	maxSourceDuration: number
) {
	const minDuration = minClipDuration(fps)
	let newEnd = Math.max(
		origin.startOnTimeline + minDuration,
		pointerTime
	)

	let newSourceOut =
		origin.sourceIn + (newEnd - origin.startOnTimeline)
	newSourceOut = Math.min(
		maxSourceDuration,
		Math.max(newSourceOut, origin.sourceIn + minDuration)
	)

	return {
		startOnTimeline: origin.startOnTimeline,
		sourceIn: origin.sourceIn,
		sourceOut: roundTimelineSeconds(newSourceOut),
	}
}

function resolveClipDisplay(
	clip: TimelineClip,
	drag: ClipDragState | null,
	trim: ClipTrimState | null
): TimelineClip {
	if (trim?.clipId === clip.id) {
		return {
			...clip,
			startOnTimeline: trim.previewStartOnTimeline,
			sourceIn: trim.previewSourceIn,
			sourceOut: trim.previewSourceOut,
		}
	}

	const placement = resolveClipPlacement(clip, drag)
	return { ...clip, ...placement }
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
	clipSourceDuration,
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
	/** Full media duration for a clip file (seconds). */
	clipSourceDuration?: (clipFile: string) => number
}) {
	const verticalScrollRef = useRef<HTMLDivElement>(null)
	const horizontalScrollRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const [clipDrag, setClipDrag] = useState<ClipDragState | null>(null)
	const clipDragRef = useRef<ClipDragState | null>(null)
	const [pendingClipPointer, setPendingClipPointer] =
		useState<PendingClipPointer | null>(null)
	const pendingClipPointerRef = useRef<PendingClipPointer | null>(null)
	const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
	const [clipTrim, setClipTrim] = useState<ClipTrimState | null>(null)
	const clipTrimRef = useRef<ClipTrimState | null>(null)
	const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(
		null
	)

	clipDragRef.current = clipDrag
	pendingClipPointerRef.current = pendingClipPointer
	clipTrimRef.current = clipTrim

	useEffect(() => {
		if (
			selectedClipId &&
			!edit.clips.some((clip) => clip.id === selectedClipId)
		) {
			setSelectedClipId(null)
		}
	}, [edit.clips, selectedClipId])

	const timelineSeconds = Math.max(
		edit.duration,
		MIN_TIMELINE_SECONDS,
		playheadSeconds + 2
	)
	const timelineWidth = timelineSeconds * pxPerSec
	const playheadLeft = Math.round(playheadSeconds * pxPerSec)

	const clipsByTrack = useMemo(() => {
		const map = new Map<string, TimelineClip[]>()
		for (const track of edit.tracks) {
			map.set(track.id, [])
		}
		for (const clip of edit.clips) {
			const display = resolveClipDisplay(clip, clipDrag, clipTrim)
			const list = map.get(display.trackId)
			if (list) {
				list.push(display)
			} else {
				map.set(display.trackId, [display])
			}
		}
		return map
	}, [edit.clips, edit.tracks, clipDrag, clipTrim])

	const rulerTicks = useMemo(() => {
		const ticks: number[] = []
		const step = rulerTickStep(timelineSeconds)
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
			if (!scrollEl) return 0

			const rect = scrollEl.getBoundingClientRect()
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
			const time = snapToFrame(timeAtClientX(clientX), edit.fps)
			onPlayheadChange(Math.min(time, timelineSeconds))
		},
		[edit.fps, onPlayheadChange, timeAtClientX, timelineSeconds]
	)

	const clearClipSelection = useCallback(() => {
		setSelectedClipId(null)
	}, [])

	const handleTimelineSeek = useCallback(
		(clientX: number) => {
			clearClipSelection()
			seekFromEvent(clientX)
		},
		[clearClipSelection, seekFromEvent]
	)

	const handleAddTrack = useCallback(
		(type: EditTrackType) => {
			onEditChange(addTrackToEdit(edit, type))
		},
		[edit, onEditChange]
	)

	const beginClipPointerDown = useCallback(
		(
			event: React.PointerEvent,
			clip: TimelineClip,
			placement: Pick<TimelineClip, "startOnTimeline" | "trackId">
		) => {
			event.stopPropagation()
			event.preventDefault()

			const pointerTime = timeAtClientX(event.clientX)
			const grabOffsetSec = pointerTime - placement.startOnTimeline

			setPendingClipPointer({
				clipId: clip.id,
				pointerId: event.pointerId,
				startClientX: event.clientX,
				startClientY: event.clientY,
				grabOffsetSec,
				originTrackId: placement.trackId,
				previewStart: placement.startOnTimeline,
				previewTrackId: placement.trackId,
			})

			event.currentTarget.setPointerCapture(event.pointerId)
		},
		[timeAtClientX]
	)

	const getMaxSourceDuration = useCallback(
		(clip: TimelineClip) => {
			const fromManifest = clipSourceDuration?.(clip.clipFile)
			if (fromManifest && fromManifest > 0) return fromManifest
			return clip.sourceOut
		},
		[clipSourceDuration]
	)

	const beginTrimHandle = useCallback(
		(
			event: React.PointerEvent,
			clip: TimelineClip,
			edge: ClipTrimEdge
		) => {
			event.stopPropagation()
			event.preventDefault()
			setSelectedClipId(clip.id)

			setClipTrim({
				clipId: clip.id,
				edge,
				pointerId: event.pointerId,
				originStartOnTimeline: clip.startOnTimeline,
				originSourceIn: clip.sourceIn,
				originSourceOut: clip.sourceOut,
				previewStartOnTimeline: clip.startOnTimeline,
				previewSourceIn: clip.sourceIn,
				previewSourceOut: clip.sourceOut,
			})

			event.currentTarget.setPointerCapture(event.pointerId)
		},
		[]
	)

	const promotePendingToDrag = useCallback((pending: PendingClipPointer) => {
		setClipDrag({
			clipId: pending.clipId,
			pointerId: pending.pointerId,
			grabOffsetSec: pending.grabOffsetSec,
			originTrackId: pending.originTrackId,
			previewStart: pending.previewStart,
			previewTrackId: pending.previewTrackId,
		})
		setPendingClipPointer(null)
	}, [])

	useEffect(() => {
		if (!selectedClipId) return

		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "Delete" && event.key !== "Backspace") return

			const target = event.target
			if (
				target instanceof HTMLElement &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable)
			) {
				return
			}

			event.preventDefault()
			onEditChange(removeTimelineClip(edit, selectedClipId))
			setSelectedClipId(null)
		}

		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [edit, onEditChange, selectedClipId])

	useEffect(() => {
		if (!clipDrag && !pendingClipPointer) return

		function onPointerMove(event: PointerEvent) {
			if (clipTrimRef.current) return
			const pending = pendingClipPointerRef.current
			if (pending && event.pointerId === pending.pointerId) {
				const dx = event.clientX - pending.startClientX
				const dy = event.clientY - pending.startClientY
				if (
					Math.hypot(dx, dy) >= CLIP_DRAG_THRESHOLD_PX
				) {
					promotePendingToDrag(pending)
				}
				return
			}

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

		function finishInteraction(event: PointerEvent) {
			const pending = pendingClipPointerRef.current
			if (pending && event.pointerId === pending.pointerId) {
				setSelectedClipId(pending.clipId)
				setPendingClipPointer(null)
				return
			}

			const drag = clipDragRef.current
			if (!drag || event.pointerId !== drag.pointerId) return

			const original = edit.clips.find((c) => c.id === drag.clipId)
			if (original) {
				const moved = moveTimelineClip(edit, drag.clipId, {
					startOnTimeline: snapToFrame(drag.previewStart, edit.fps),
					trackId: drag.previewTrackId,
				})
				onEditChange(moved)
				setSelectedClipId(drag.clipId)
			}

			setClipDrag(null)
			setDropTargetTrackId(null)
		}

		document.addEventListener("pointermove", onPointerMove)
		document.addEventListener("pointerup", finishInteraction)
		document.addEventListener("pointercancel", finishInteraction)

		return () => {
			document.removeEventListener("pointermove", onPointerMove)
			document.removeEventListener("pointerup", finishInteraction)
			document.removeEventListener("pointercancel", finishInteraction)
		}
	}, [
		clipDrag,
		edit,
		getTrackIdAtClientY,
		onEditChange,
		pendingClipPointer,
		promotePendingToDrag,
		timeAtClientX,
	])

	useEffect(() => {
		if (!clipTrim) return

		function onPointerMove(event: PointerEvent) {
			const trim = clipTrimRef.current
			if (!trim || event.pointerId !== trim.pointerId) return

			const original = edit.clips.find((c) => c.id === trim.clipId)
			if (!original) return

			const pointerTime = snapToFrame(timeAtClientX(event.clientX), edit.fps)
			const origin = {
				startOnTimeline: trim.originStartOnTimeline,
				sourceIn: trim.originSourceIn,
				sourceOut: trim.originSourceOut,
			}

			const preview =
				trim.edge === "left"
					? previewTrimLeft(origin, pointerTime, edit.fps)
					: previewTrimRight(
							origin,
							pointerTime,
							edit.fps,
							getMaxSourceDuration(original)
						)

			setClipTrim({
				...trim,
				previewStartOnTimeline: preview.startOnTimeline,
				previewSourceIn: preview.sourceIn,
				previewSourceOut: preview.sourceOut,
			})
		}

		function finishTrim(event: PointerEvent) {
			const trim = clipTrimRef.current
			if (!trim || event.pointerId !== trim.pointerId) return

			const trimmed = trimTimelineClip(edit, trim.clipId, {
				startOnTimeline: trim.previewStartOnTimeline,
				sourceIn: trim.previewSourceIn,
				sourceOut: trim.previewSourceOut,
			})
			onEditChange(trimmed)
			setSelectedClipId(trim.clipId)
			setClipTrim(null)
		}

		document.addEventListener("pointermove", onPointerMove)
		document.addEventListener("pointerup", finishTrim)
		document.addEventListener("pointercancel", finishTrim)

		return () => {
			document.removeEventListener("pointermove", onPointerMove)
			document.removeEventListener("pointerup", finishTrim)
			document.removeEventListener("pointercancel", finishTrim)
		}
	}, [clipTrim, edit, getMaxSourceDuration, onEditChange, timeAtClientX])

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
						{formatPlayheadTime(playheadSeconds, edit.fps)}
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
									style={{ height: RULER_HEIGHT, userSelect: "none" }}
									onPointerDown={(event) => {
										if (clipDrag || pendingClipPointer || clipTrim) {
											return
										}
										handleTimelineSeek(event.clientX)
										event.currentTarget.setPointerCapture(
											event.pointerId
										)
									}}
									onPointerMove={(event) => {
										if (
											clipDrag ||
											pendingClipPointer ||
											clipTrim ||
											event.buttons !== 1
										) {
											return
										}
										handleTimelineSeek(event.clientX)
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
											} ${clipDrag || clipTrim ? "cursor-grabbing" : "cursor-crosshair"}`}
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
												if (
													clipDrag ||
													pendingClipPointer ||
													clipTrim
												) {
													return
												}
												handleTimelineSeek(event.clientX)
												event.currentTarget.setPointerCapture(
													event.pointerId
												)
											}}
											onPointerMove={(event) => {
												if (
													clipDrag ||
													pendingClipPointer ||
													clipTrim ||
													event.buttons !== 1
												) {
													return
												}
												handleTimelineSeek(event.clientX)
											}}
										>
											{trackClips.map((clip, index) => {
												const originalClip =
													edit.clips.find(
														(c) => c.id === clip.id
													) ?? clip
												const isDragging =
													clipDrag?.clipId === clip.id
												const isTrimming =
													clipTrim?.clipId === clip.id
												const isSelected =
													selectedClipId === clip.id
												const width =
													clipTimelineDuration(clip) *
													pxPerSec
												const left =
													clip.startOnTimeline * pxPerSec

												return (
													<div
														key={clip.id}
														role="button"
														tabIndex={0}
														onPointerDown={(event) =>
															beginClipPointerDown(
																event,
																clip,
																{
																	startOnTimeline:
																		clip.startOnTimeline,
																	trackId:
																		clip.trackId,
																}
															)
														}
														className={`absolute top-1 bottom-1 border-x-3 border-x-orange-400 flex min-w-[2px] cursor-grab items-center overflow-hidden rounded border text-[10px] font-medium text-white active:cursor-grabbing ${trackClipColor(track, index, isDragging, isSelected || isTrimming)}`}
														style={{
															left,
															width: Math.max(
																width,
																TRIM_HANDLE_WIDTH_PX *
																	2
															),
															zIndex: isDragging
																? 60
																: isTrimming
																	? 55
																	: 10 + index,
														}}
														title={`${basename(clip.clipFile)} · drag to move · drag edges to trim · Delete to remove`}
													>
														<button
															type="button"
															aria-label="Trim clip start"
															className="absolute inset-y-0 left-0 z-10 w-2 shrink-0 cursor-ew-resize touch-none border-l-2 border-white/0 hover:border-white/70 active:border-white"
															style={{
																width: TRIM_HANDLE_WIDTH_PX,
															}}
															onPointerDown={(
																event
															) =>
																beginTrimHandle(
																	event,
																	originalClip,
																	"left"
																)
															}
														/>
														<span className="pointer-events-none min-w-0 flex-1 truncate px-1 text-center">
															{basename(
																clip.clipFile
															)}
														</span>
														<button
															type="button"
															aria-label="Trim clip end"
															className="absolute inset-y-0 right-0 z-10 w-2 shrink-0 cursor-ew-resize touch-none border-r-2 border-white/0 hover:border-white/70 active:border-white"
															style={{
																width: TRIM_HANDLE_WIDTH_PX,
															}}
															onPointerDown={(
																event
															) =>
																beginTrimHandle(
																	event,
																	originalClip,
																	"right"
																)
															}
														/>
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
