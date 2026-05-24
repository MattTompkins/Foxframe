import {
	clipTimelineEnd,
	computeEditDuration,
	DEFAULT_VIDEO_TRACK_ID,
	normalizeProjectEdit,
	type ProjectEdit,
	type TimelineClip,
} from "@/lib/edit-core"

function newClipId() {
	return crypto.randomUUID()
}

export function addClipToEdit(
	edit: ProjectEdit,
	options: {
		clipFile: string
		trackId?: string
		startOnTimeline: number
		sourceDurationSeconds: number
	}
): ProjectEdit {
	const trackId = options.trackId ?? DEFAULT_VIDEO_TRACK_ID
	const sourceOut = Math.max(0.001, options.sourceDurationSeconds)

	const clip: TimelineClip = {
		id: newClipId(),
		clipFile: options.clipFile,
		trackId,
		startOnTimeline: options.startOnTimeline,
		sourceIn: 0,
		sourceOut,
	}

	return normalizeProjectEdit({
		...edit,
		clips: [...edit.clips, clip],
		updatedAt: new Date().toISOString(),
	})
}

export function appendClipToEdit(
	edit: ProjectEdit,
	options: {
		clipFile: string
		trackId?: string
		sourceDurationSeconds: number
	}
) {
	const startOnTimeline = computeEditDuration(edit.clips)
	return addClipToEdit(edit, {
		...options,
		startOnTimeline,
	})
}

export function updateEditClips(
	edit: ProjectEdit,
	clips: TimelineClip[]
): ProjectEdit {
	return normalizeProjectEdit({
		...edit,
		clips,
		updatedAt: new Date().toISOString(),
	})
}

export async function persistEdit(
	projectId: string,
	edit: ProjectEdit
): Promise<ProjectEdit> {
	const normalized = normalizeProjectEdit({
		...edit,
		updatedAt: new Date().toISOString(),
	})

	const res = await fetch(
		`/api/projects/${projectId}/edits/${normalized.id}`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(normalized),
		}
	)

	const data = await res.json().catch(() => ({}))

	if (!res.ok) {
		throw new Error(
			typeof data.error === "string" ? data.error : "Failed to save edit"
		)
	}

	return (data.edit as ProjectEdit) ?? normalized
}

export async function fetchMostRecentEdit(
	projectId: string
): Promise<ProjectEdit | null> {
	const res = await fetch(`/api/projects/${projectId}/edits`)
	const data = await res.json().catch(() => ({}))

	if (!res.ok) {
		throw new Error(
			typeof data.error === "string" ? data.error : "Failed to load edits"
		)
	}

	const edits = Array.isArray(data.edits) ? data.edits : []
	if (edits.length === 0) return null

	const res2 = await fetch(
		`/api/projects/${projectId}/edits/${edits[0].id}`
	)
	const data2 = await res2.json().catch(() => ({}))

	if (!res2.ok) {
		throw new Error(
			typeof data2.error === "string" ? data2.error : "Failed to load edit"
		)
	}

	return (data2.edit as ProjectEdit) ?? null
}

export async function createEmptyEdit(projectId: string): Promise<ProjectEdit> {
	const res = await fetch(`/api/projects/${projectId}/edits`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			name: "Untitled edit",
			seedFromManifest: false,
		}),
	})

	const data = await res.json().catch(() => ({}))

	if (!res.ok) {
		throw new Error(
			typeof data.error === "string" ? data.error : "Failed to create edit"
		)
	}

	return data.edit as ProjectEdit
}

export { clipTimelineEnd, computeEditDuration }
