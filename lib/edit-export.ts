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

function outputFfmpegFormatArgs(format: OutputFormat): string[] {
	return format === "mov" ? ["-f", "mov"] : ["-f", "mp4"]
}

function tempExportPath(outputPath: string) {
	const ext = path.extname(outputPath)
	const base = path.basename(outputPath, ext)
	return path.join(path.dirname(outputPath), `${base}.partial${ext}`)
}

function codecArgs(settings: VideoSettings) {
	const videoCodec = settings.outputCodec === "h265" ? "libx265" : "libx264"
	return ["-c:v", videoCodec, "-crf", String(settings.crf), "-c:a", "aac"]
}

const EXPORT_FPS = 30
const EXPORT_AUDIO_RATE = 48000

function scalePadFilter(settings: VideoSettings) {
	const [width, height] = settings.outputResolution.split("x")
	return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p`
}

function segmentOutputArgs(settings: VideoSettings) {
	const args = [
		...codecArgs(settings),
		"-pix_fmt",
		"yuv420p",
		"-r",
		String(EXPORT_FPS),
		"-ar",
		String(EXPORT_AUDIO_RATE),
		"-ac",
		"2",
		"-vsync",
		"cfr",
	]

	if (settings.outputCodec === "h265" && settings.outputFormat === "mp4") {
		args.push("-tag:v", "hvc1")
	}

	return args
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
	const durationArg = duration.toFixed(3)

	await runFfmpeg([
		"-y",
		"-f",
		"lavfi",
		"-i",
		`color=c=black:s=${width}x${height}:r=${EXPORT_FPS}:d=${durationArg}`,
		"-f",
		"lavfi",
		"-i",
		`anullsrc=r=${EXPORT_AUDIO_RATE}:cl=stereo:d=${durationArg}`,
		"-t",
		durationArg,
		"-map",
		"0:v:0",
		"-map",
		"1:a:0",
		...segmentOutputArgs(settings),
		"-shortest",
		outputPath,
	])
}

async function renderClipSegment(
	inputPath: string,
	outputPath: string,
	segment: ProgramSegment,
	settings: VideoSettings
) {
	const durationArg = segment.duration.toFixed(3)

	await runFfmpeg([
		"-y",
		"-i",
		inputPath,
		"-ss",
		segment.sourceIn.toFixed(3),
		"-t",
		durationArg,
		"-vf",
		scalePadFilter(settings),
		"-map",
		"0:v:0",
		"-map",
		"0:a:0?",
		...segmentOutputArgs(settings),
		"-shortest",
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
		// Always re-encode the final mux. Stream copy often leaves broken timestamps
		// so players show only the first clip while audio runs longer.
		await runFfmpeg([
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			listPath,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0?",
			...segmentOutputArgs(settings),
			"-movflags",
			"+faststart",
			...outputFfmpegFormatArgs(settings.outputFormat),
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
			await renderClipSegment(
				clipPath(projectId, segment.clipFile),
				segmentPath,
				segment,
				settings
			)
		}

		segmentPaths.push(segmentPath)
	}

	const storageFile = `export.${settings.outputFormat}`
	const outputPath = editExportStoragePath(
		projectId,
		editId,
		settings.outputFormat
	)
	const tempOutput = tempExportPath(outputPath)

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
