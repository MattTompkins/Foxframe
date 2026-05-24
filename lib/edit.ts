import { randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"
import type { Manifest } from "@/lib/manifest"
import { PROJECTS_DIR, readManifest } from "@/lib/manifest"
import {
	DEFAULT_EDIT_FPS,
	DEFAULT_VIDEO_TRACK_ID,
	defaultVideoTrack,
	defaultVideoTrack2,
	normalizeProjectEdit,
	roundTimelineSeconds,
	toEditSummary,
	type EditSummary,
	type ProjectEdit,
	type TimelineClip,
} from "@/lib/edit-core"

export {
	DEFAULT_EDIT_FPS,
	DEFAULT_VIDEO_TRACK_ID,
	clipTimelineDuration,
	clipTimelineEnd,
	clipsActiveAtTime,
	computeEditDuration,
	defaultVideoTrack,
	defaultVideoTrack2,
	normalizeProjectEdit,
	normalizeTimelineClip,
	roundTimelineSeconds,
	toEditSummary,
	topClipAtTime,
	type EditSummary,
	type EditTrack,
	type EditTrackType,
	type ProjectEdit,
	type TimelineClip,
} from "@/lib/edit-core"

/** `storage/projects/{projectId}/edits/{editId}/edit.json` */
export const EDITS_DIR_NAME = "edits"

const EDIT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

export function isValidEditId(editId: string) {
	return EDIT_ID_PATTERN.test(editId) && editId.length > 0 && editId.length <= 64
}

export function editsRoot(projectId: string) {
	return path.join(PROJECTS_DIR, projectId, EDITS_DIR_NAME)
}

export function editDir(projectId: string, editId: string) {
	return path.join(editsRoot(projectId), editId)
}

export function editFilePath(projectId: string, editId: string) {
	return path.join(editDir(projectId, editId), "edit.json")
}

export async function assertProjectExists(projectId: string) {
	const projectDir = path.join(PROJECTS_DIR, projectId)
	try {
		await fs.access(projectDir)
	} catch {
		throw new ProjectNotFoundError()
	}
}

export class ProjectNotFoundError extends Error {
	constructor() {
		super("Project not found")
		this.name = "ProjectNotFoundError"
	}
}

export class EditNotFoundError extends Error {
	constructor() {
		super("Edit not found")
		this.name = "EditNotFoundError"
	}
}

/** Build a new edit by placing manifest clips back-to-back on the default video track. */
export function createEditFromManifest(
	projectId: string,
	manifest: Manifest,
	options?: { name?: string; editId?: string; clipFiles?: string[] }
): ProjectEdit {
	const now = new Date().toISOString()
	const editId = options?.editId ?? randomUUID()
	const clipFiles =
		options?.clipFiles ??
		(manifest.selectedClips?.length
			? manifest.selectedClips
			: (manifest.clips ?? []))

	const segmentsByFile = new Map(
		(manifest.clipSegments ?? []).map((segment) => [segment.clipFile, segment])
	)

	let cursor = 0
	const clips: TimelineClip[] = []

	for (const clipFile of clipFiles) {
		const segment = segmentsByFile.get(clipFile)
		const duration =
			segment && segment.durationSeconds > 0
				? segment.durationSeconds
				: 5

		clips.push({
			id: randomUUID(),
			clipFile,
			trackId: DEFAULT_VIDEO_TRACK_ID,
			startOnTimeline: roundTimelineSeconds(cursor),
			sourceIn: 0,
			sourceOut: roundTimelineSeconds(duration),
		})

		cursor += duration
	}

	const edit: ProjectEdit = {
		id: editId,
		projectId,
		name: options?.name?.trim() || `Edit ${editId.slice(0, 8)}`,
		createdAt: now,
		updatedAt: now,
		fps: DEFAULT_EDIT_FPS,
		duration: 0,
		tracks: [defaultVideoTrack(), defaultVideoTrack2()],
		clips,
	}

	return normalizeProjectEdit(edit)
}

export async function listEdits(projectId: string): Promise<EditSummary[]> {
	await assertProjectExists(projectId)

	const root = editsRoot(projectId)
	let entries: string[] = []

	try {
		entries = await fs.readdir(root)
	} catch (err: unknown) {
		if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
			return []
		}
		throw err
	}

	const summaries: EditSummary[] = []

	for (const entry of entries) {
		if (!isValidEditId(entry)) continue

		try {
			const edit = await readEdit(projectId, entry)
			summaries.push(toEditSummary(edit))
		} catch (err) {
			if (err instanceof EditNotFoundError) continue
			throw err
		}
	}

	return summaries.sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
	)
}

export async function readEdit(
	projectId: string,
	editId: string
): Promise<ProjectEdit> {
	if (!isValidEditId(editId)) {
		throw new EditNotFoundError()
	}

	await assertProjectExists(projectId)

	try {
		const raw = await fs.readFile(editFilePath(projectId, editId), "utf-8")
		const parsed = JSON.parse(raw) as ProjectEdit

		if (parsed.projectId !== projectId || parsed.id !== editId) {
			throw new EditNotFoundError()
		}

		return normalizeProjectEdit(parsed)
	} catch (err: unknown) {
		if (err instanceof EditNotFoundError) throw err
		if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
			throw new EditNotFoundError()
		}
		throw err
	}
}

export async function writeEdit(edit: ProjectEdit): Promise<ProjectEdit> {
	if (!isValidEditId(edit.id)) {
		throw new Error("Invalid edit id")
	}

	await assertProjectExists(edit.projectId)

	const normalized = normalizeProjectEdit({
		...edit,
		updatedAt: new Date().toISOString(),
	})

	const dir = editDir(normalized.projectId, normalized.id)
	await fs.mkdir(dir, { recursive: true })
	await fs.writeFile(
		editFilePath(normalized.projectId, normalized.id),
		JSON.stringify(normalized, null, 2)
	)

	return normalized
}

export async function createEdit(
	projectId: string,
	options?: {
		name?: string
		seedFromManifest?: boolean
		clipFiles?: string[]
	}
): Promise<ProjectEdit> {
	await assertProjectExists(projectId)

	const manifest = await readManifest(projectId)

	if (!manifest) {
		throw new ProjectNotFoundError()
	}

	let edit = createEditFromManifest(projectId, manifest, {
		name: options?.name,
		clipFiles:
			options?.seedFromManifest === false ? [] : options?.clipFiles,
	})

	if (options?.seedFromManifest === false) {
		edit = normalizeProjectEdit({
			...edit,
			clips: [],
			tracks: [defaultVideoTrack(), defaultVideoTrack2()],
		})
	}

	return writeEdit(edit)
}

export async function deleteEdit(projectId: string, editId: string) {
	if (!isValidEditId(editId)) {
		throw new EditNotFoundError()
	}

	await assertProjectExists(projectId)

	try {
		await fs.rm(editDir(projectId, editId), { recursive: true, force: true })
	} catch (err: unknown) {
		if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
			throw new EditNotFoundError()
		}
		throw err
	}
}
