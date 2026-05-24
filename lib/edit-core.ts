/** Pure edit model helpers (safe for client and server). */

export const DEFAULT_EDIT_FPS = 30
export const DEFAULT_VIDEO_TRACK_ID = "track-video-1"

export type EditTrackType = "video" | "audio"

export type EditTrack = {
	id: string
	type: EditTrackType
	label: string
}

/** One clip placed on the timeline (file lives in project `clips/`). */
export type TimelineClip = {
	id: string
	clipFile: string
	trackId: string
	/** Where this clip starts on the sequence timeline (seconds). */
	startOnTimeline: number
	/** Trim in-point within the clip file (seconds). */
	sourceIn: number
	/** Trim out-point within the clip file (seconds). */
	sourceOut: number
}

export type ProjectEdit = {
	id: string
	projectId: string
	name: string
	createdAt: string
	updatedAt: string
	fps: number
	/** Sequence duration in seconds (end of last clip). */
	duration: number
	tracks: EditTrack[]
	clips: TimelineClip[]
}

export type EditSummary = Pick<
	ProjectEdit,
	"id" | "projectId" | "name" | "createdAt" | "updatedAt" | "duration" | "fps"
> & {
	clipCount: number
}

export function roundTimelineSeconds(value: number) {
	return Math.round(value * 1000) / 1000
}

export function clipTimelineDuration(
	clip: Pick<TimelineClip, "sourceIn" | "sourceOut">
) {
	return Math.max(0, roundTimelineSeconds(clip.sourceOut - clip.sourceIn))
}

export function clipTimelineEnd(clip: TimelineClip) {
	return roundTimelineSeconds(clip.startOnTimeline + clipTimelineDuration(clip))
}

export function computeEditDuration(
	clips: Pick<TimelineClip, "startOnTimeline" | "sourceIn" | "sourceOut">[]
) {
	let maxEnd = 0
	for (const clip of clips) {
		const end = clip.startOnTimeline + clipTimelineDuration(clip)
		maxEnd = Math.max(maxEnd, end)
	}
	return roundTimelineSeconds(maxEnd)
}

export function defaultVideoTrack(): EditTrack {
	return {
		id: DEFAULT_VIDEO_TRACK_ID,
		type: "video",
		label: "Video 1",
	}
}

export function defaultVideoTrack2(): EditTrack {
	return {
		id: "track-video-2",
		type: "video",
		label: "Video 2",
	}
}

export function normalizeTimelineClip(raw: TimelineClip): TimelineClip {
	const sourceIn = roundTimelineSeconds(Math.max(0, raw.sourceIn))
	const sourceOut = roundTimelineSeconds(Math.max(sourceIn + 0.001, raw.sourceOut))

	return {
		id: raw.id,
		clipFile: raw.clipFile,
		trackId: raw.trackId,
		startOnTimeline: roundTimelineSeconds(Math.max(0, raw.startOnTimeline)),
		sourceIn,
		sourceOut,
	}
}

export function normalizeProjectEdit(edit: ProjectEdit): ProjectEdit {
	const clips = edit.clips.map(normalizeTimelineClip)
	const duration = computeEditDuration(clips)

	return {
		...edit,
		fps: edit.fps > 0 ? edit.fps : DEFAULT_EDIT_FPS,
		clips,
		duration,
		updatedAt: edit.updatedAt,
	}
}

export function toEditSummary(edit: ProjectEdit): EditSummary {
	return {
		id: edit.id,
		projectId: edit.projectId,
		name: edit.name,
		createdAt: edit.createdAt,
		updatedAt: edit.updatedAt,
		duration: edit.duration,
		fps: edit.fps,
		clipCount: edit.clips.length,
	}
}

/** Clips whose visible range contains `time` (overlaps allowed). */
export function clipsActiveAtTime(edit: ProjectEdit, time: number) {
	return edit.clips.filter((clip) => {
		const start = clip.startOnTimeline
		const end = clipTimelineEnd(clip)
		return time >= start && time < end
	})
}

/** Topmost clip on a track at `time` (last in array wins). */
export function topClipAtTime(
	edit: ProjectEdit,
	trackId: string,
	time: number
) {
	const onTrack = clipsActiveAtTime(edit, time).filter(
		(clip) => clip.trackId === trackId
	)
	return onTrack.length > 0 ? onTrack[onTrack.length - 1] : null
}
