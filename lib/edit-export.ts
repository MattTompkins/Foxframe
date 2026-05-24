import fs from "fs/promises"
import path from "path"
import { spawn } from "child_process"
import {
	clipTimelineEnd,
	computeEditDuration,
	resolvePlaybackAtTime,
	roundTimelineSeconds,
	type ProjectEdit,
} from "@/lib/edit-core"
import { editDir, readEdit } from "@/lib/edit"
import { cutClip } from "@/lib/clip-cutter"
import {
	PROJECTS_DIR,
	getVideoSettingsFromManifest,
	readManifest,
} from "@/lib/manifest"
import {
	mergeVideoSettings,
	type OutputFormat,
	type VideoSettings,
} from "@/lib/video-settings"

export type EditExportMeta = {
	filename: string
	storageFile: string
	createdAt: string
	duration: number
	settings: VideoSettings
	status: "complete" | "failed"
	error?: string
}

export type ProgramSegment = {
	clipFile: string | null
	sourceIn: number
	duration: number
}

export function editExportStoragePath(
	projectId: string,
	editId: string,
	format: OutputFormat
) {
	return path.join(editDir(projectId, editId), `export.${format}`)
}

export function editExportMetaPath(projectId: string, editId: string) {
	return path.join(editDir(projectId, editId), "export.json")
}

export function exportDownloadFilename(
	projectSlug: string,
	format: OutputFormat
) {
	const safe = projectSlug
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "")
	return `${safe || "export"}.${format}`
}

/** Build contiguous program segments (video track fallback, gaps as null clipFile). */
export function buildProgramSegments(edit: ProjectEdit): ProgramSegment[] {
	const duration = computeEditDuration(edit.clips)
	if (duration <= 0) return []

	const videoTrackIds = new Set(
		edit.tracks.filter((track) => track.type === "video").map((track) => track.id)
	)

	const boundaries = new Set<number>([0, duration])
	for (const clip of edit.clips) {
		if (!videoTrackIds.has(clip.trackId)) continue
		boundaries.add(clip.startOnTimeline)
		boundaries.add(clipTimelineEnd(clip))
	}

	const points = [...boundaries].sort((a, b) => a - b)
	const raw: ProgramSegment[] = []

	for (let i = 0; i < points.length - 1; i++) {
		const t0 = points[i]
		const t1 = points[i + 1]
		const segmentDuration = roundTimelineSeconds(t1 - t0)
		if (segmentDuration < 0.001) continue

		const frame = resolvePlaybackAtTime(edit, t0 + 0.0005)
		if (!frame) {
			raw.push({ clipFile: null, sourceIn: 0, duration: segmentDuration })
			continue
		}

		const sourceIn = roundTimelineSeconds(
			frame.clip.sourceIn + (t0 - frame.clip.startOnTimeline)
		)

		raw.push({
			clipFile: frame.clip.clipFile,
			sourceIn,
			duration: segmentDuration,
		})
	}

	return mergeProgramSegments(raw)
}

function mergeProgramSegments(segments: ProgramSegment[]): ProgramSegment[] {
	const merged: ProgramSegment[] = []

	for (const segment of segments) {
		const last = merged[merged.length - 1]
		if (
			last &&
			last.clipFile &&
			last.clipFile === segment.clipFile &&
			segment.clipFile
		) {
			const lastEnd = roundTimelineSeconds(last.sourceIn + last.duration)
			if (Math.abs(lastEnd - segment.sourceIn) < 0.02) {
				last.duration = roundTimelineSeconds(last.duration + segment.duration)
				continue
			}
		}
		merged.push({ ...segment })
	}

	return merged
}

function clipPath(projectId: string, clipFile: string) {
	return path.join(PROJECTS_DIR, projectId, "clips", clipFile)
}

function codecArgs(settings: VideoSettings) {
	const videoCodec = settings.outputCodec === "h265" ? "libx265" : "libx264"
	return ["-c:v", videoCodec, "-crf", String(settings.crf), "-c:a", "aac"]
}

async function runFfmpeg(args: string[]) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn("ffmpeg", args)
		let stderr = ""

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
		})

		child.on("error", (err) => {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				reject(
					new Error(
						"ffmpeg is not installed. Run `brew install ffmpeg` and try again."
					)
				)
				return
			}
			reject(err)
		})

		child.on("close", (code) => {
			if (code === 0) resolve()
			else reject(new Error(`ffmpeg failed: ${stderr.slice(-500)}`))
		})
	})
}

async function createBlackSegment(
	outputPath: string,
	settings: VideoSettings,
	duration: number
) {
	const [width, height] = settings.outputResolution.split("x")
	await runFfmpeg([
		"-y",
		"-f",
		"lavfi",
		"-i",
		`color=c=black:s=${width}x${height}:r=30:d=${duration.toFixed(3)}`,
		"-t",
		duration.toFixed(3),
		...codecArgs(settings),
		"-pix_fmt",
		"yuv420p",
		outputPath,
	])
}

async function concatSegments(
	segmentPaths: string[],
	outputPath: string,
	settings: VideoSettings
) {
	const listPath = `${outputPath}.concat.txt`
	const listBody = segmentPaths
		.map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`)
		.join("\n")

	await fs.writeFile(listPath, listBody)

	try {
		await runFfmpeg([
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			listPath,
			"-c",
			"copy",
			outputPath,
		])
	} catch {
		await runFfmpeg([
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			listPath,
			...codecArgs(settings),
			"-pix_fmt",
			"yuv420p",
			outputPath,
		])
	} finally {
		await fs.rm(listPath, { force: true })
	}
}

export async function exportEditVideo(options: {
	projectId: string
	editId: string
	projectSlug: string
	settingsOverrides?: Partial<VideoSettings>
}): Promise<EditExportMeta> {
	const { projectId, editId, projectSlug, settingsOverrides } = options

	const manifest = await readManifest(projectId)
	if (!manifest) {
		throw new Error("Project not found")
	}

	const edit = await readEdit(projectId, editId)
	const settings = mergeVideoSettings({
		...getVideoSettingsFromManifest(manifest),
		...settingsOverrides,
	})

	const segments = buildProgramSegments(edit)
	if (segments.length === 0) {
		throw new Error("Nothing to export — add clips to video tracks first")
	}

	const workDir = path.join(editDir(projectId, editId), "export-work")
	await fs.rm(workDir, { recursive: true, force: true })
	await fs.mkdir(workDir, { recursive: true })

	const segmentPaths: string[] = []

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i]
		const segmentPath = path.join(
			workDir,
			`segment-${String(i).padStart(4, "0")}.mp4`
		)

		if (!segment.clipFile) {
			await createBlackSegment(segmentPath, settings, segment.duration)
		} else {
			const input = clipPath(projectId, segment.clipFile)
			await cutClip(input, segmentPath, segment.sourceIn, segment.duration, {
				accurateDuration: true,
			})
		}

		segmentPaths.push(segmentPath)
	}

	const storageFile = `export.${settings.outputFormat}`
	const outputPath = editExportStoragePath(
		projectId,
		editId,
		settings.outputFormat
	)
	const tempOutput = `${outputPath}.tmp`

	await concatSegments(segmentPaths, tempOutput, settings)
	await fs.rename(tempOutput, outputPath)
	await fs.rm(workDir, { recursive: true, force: true })

	const filename = exportDownloadFilename(projectSlug, settings.outputFormat)
	const meta: EditExportMeta = {
		filename,
		storageFile,
		createdAt: new Date().toISOString(),
		duration: computeEditDuration(edit.clips),
		settings,
		status: "complete",
	}

	await fs.writeFile(
		editExportMetaPath(projectId, editId),
		JSON.stringify(meta, null, 2)
	)

	return meta
}

export async function readEditExportMeta(
	projectId: string,
	editId: string
): Promise<EditExportMeta | null> {
	try {
		const raw = await fs.readFile(editExportMetaPath(projectId, editId), "utf-8")
		return JSON.parse(raw) as EditExportMeta
	} catch {
		return null
	}
}
