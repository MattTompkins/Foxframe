import { spawn } from "child_process"
import fs from "fs/promises"
import path from "path"
import { readManifest, writeManifest, PROJECTS_DIR, getVideoSettingsFromManifest } from "@/lib/manifest"
import {
	readProcessStatus,
	updateProcessStatus,
	writeProcessStatus,
} from "@/lib/process-status"
import type { FileProcessStatus, ProcessStatus } from "@/lib/process-stages"
import type { VideoSettings } from "@/lib/video-settings"
import {
	buildFramingFilterSync,
	buildSmartFramingFilter,
} from "@/lib/framing"

import { filterVideoFiles } from "@/lib/video-files"

type VideoProbe = {
	width: number
	height: number
	duration: number
}

async function buildVideoFilter(
	settings: VideoSettings,
	probe: VideoProbe,
	inputPath: string
) {
	const filters: string[] = []

	if (settings.lensK1 !== 0 || settings.lensK2 !== 0) {
		filters.push(
			`lenscorrection=k1=${settings.lensK1}:k2=${settings.lensK2}`
		)
	}

	if (settings.framingMode === "smart") {
		const { filter } = await buildSmartFramingFilter(
			settings,
			probe.width,
			probe.height,
			inputPath,
			probe.duration
		)
		filters.push(filter)
	} else {
		filters.push(
			buildFramingFilterSync(settings, probe.width, probe.height)
		)
	}

	return filters.join(",")
}

function codecArgs(settings: VideoSettings) {
	const videoCodec = settings.outputCodec === "h265" ? "libx265" : "libx264"
	return ["-c:v", videoCodec, "-crf", String(settings.crf), "-c:a", "aac"]
}

function parseDuration(stderr: string) {
	const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/)
	if (!match) return 0
	const [, h, m, s] = match
	return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s)
}

function parseTime(stderr: string) {
	const match = stderr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
	if (!match) return 0
	const [, h, m, s] = match
	return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s)
}

async function runCommand(
	command: string,
	args: string[]
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args)
		let stdout = ""
		let stderr = ""

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString()
		})
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
		})

		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) resolve({ stdout, stderr })
			else
				reject(
					new Error(
						`${command} exited with code ${code}: ${stderr.slice(-500)}`
					)
				)
		})
	})
}

async function probeVideo(filePath: string): Promise<VideoProbe> {
	const { stdout } = await runCommand("ffprobe", [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=width,height",
		"-show_entries",
		"format=duration",
		"-of",
		"json",
		filePath,
	])

	const data = JSON.parse(stdout) as {
		streams?: { width?: number; height?: number }[]
		format?: { duration?: string }
	}

	const stream = data.streams?.[0]
	const width = stream?.width ?? 0
	const height = stream?.height ?? 0
	const duration = parseFloat(data.format?.duration ?? "0")

	if (!width || !height) {
		throw new Error("Could not read video dimensions")
	}

	return { width, height, duration }
}

async function encodeVideo(
	inputPath: string,
	outputPath: string,
	settings: VideoSettings,
	probe: VideoProbe,
	onProgress: (progress: number) => void
) {
	await fs.mkdir(path.dirname(outputPath), { recursive: true })

	const filter = await buildVideoFilter(settings, probe, inputPath)
	const args = [
		"-y",
		...(settings.autoRotate ? [] : ["-noautorotate"]),
		"-i",
		inputPath,
		"-vf",
		filter,
		...codecArgs(settings),
		outputPath,
	]

	return new Promise<void>((resolve, reject) => {
		const child = spawn("ffmpeg", args)
		let stderr = ""

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
			const duration = probe.duration || parseDuration(stderr)
			const current = parseTime(stderr)
			if (duration > 0) {
				onProgress(Math.min(99, Math.round((current / duration) * 100)))
			}
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
			if (code === 0) {
				onProgress(100)
				resolve()
			} else {
				reject(new Error(`ffmpeg failed: ${stderr.slice(-500)}`))
			}
		})
	})
}

function outputFileName(sourceFile: string, settings: VideoSettings) {
	const base = path.parse(sourceFile).name
	return `${base}-processed.${settings.outputFormat}`
}

async function setStatus(
	projectId: string,
	patch: Partial<ProcessStatus>
) {
	return updateProcessStatus(projectId, patch)
}

export async function processProjectVideos(projectId: string) {
	const existing = await readProcessStatus(projectId)
	if (["preparing", "analysing", "processing", "finalizing"].includes(existing.stage)) {
		return
	}

	const startedAt = new Date().toISOString()
	const projectDir = path.join(PROJECTS_DIR, projectId)
	const processedDir = path.join(projectDir, "processed")

	await writeProcessStatus(projectId, {
		stage: "preparing",
		startedAt,
		completedAt: undefined,
		overallProgress: 0,
		message: "Loading project manifest and settings…",
		error: undefined,
		currentFile: undefined,
		files: [],
		outputFiles: [],
	})

	try {
		const manifest = await readManifest(projectId)
		if (!manifest) {
			throw new Error("Project not found")
		}

		if (manifest.sourceFiles.length === 0) {
			throw new Error("No source files uploaded. Go back and upload videos first.")
		}

		const { videoFiles, skippedFiles } = filterVideoFiles(manifest.sourceFiles)

		if (videoFiles.length === 0) {
			throw new Error(
				`No supported video files found. These files are not videos: ${skippedFiles.join(", ")}. Upload .mov, .mp4, or other video files and try again.`
			)
		}

		const settings = getVideoSettingsFromManifest(manifest)
		const skippedMessage =
			skippedFiles.length > 0
				? ` Skipping non-video files: ${skippedFiles.join(", ")}.`
				: ""

		const fileStatuses: FileProcessStatus[] = [
			...videoFiles.map((fileName) => ({
				fileName,
				stage: "waiting" as const,
				progress: 0,
			})),
			...skippedFiles.map((fileName) => ({
				fileName,
				stage: "skipped" as const,
				progress: 0,
				error: "Not a supported video format",
			})),
		]

		function updateFileStatus(
			fileName: string,
			updater: (file: FileProcessStatus) => FileProcessStatus
		) {
			for (let index = 0; index < fileStatuses.length; index++) {
				if (fileStatuses[index].fileName === fileName) {
					fileStatuses[index] = updater(fileStatuses[index])
					return
				}
			}
		}

		await setStatus(projectId, {
			stage: "preparing",
			overallProgress: 5,
			message: `Found ${videoFiles.length} video file(s) to process.${skippedMessage}`,
			files: fileStatuses,
		})

		await setStatus(projectId, {
			stage: "analysing",
			overallProgress: 10,
			message: "Probing source files with ffprobe…",
		})

		const probes = new Map<string, VideoProbe>()
		for (let i = 0; i < videoFiles.length; i++) {
			const fileName = videoFiles[i]
			const filePath = path.join(projectDir, fileName)

			updateFileStatus(fileName, (file) => ({
				...file,
				stage: "analysing",
				progress: 0,
			}))

			await setStatus(projectId, {
				currentFile: fileName,
				message: `Analysing ${fileName}…`,
				files: fileStatuses,
			})

			probes.set(fileName, await probeVideo(filePath))

			const analyseProgress =
				10 + Math.round(((i + 1) / videoFiles.length) * 15)
			await setStatus(projectId, { overallProgress: analyseProgress })
		}

		await setStatus(projectId, {
			stage: "processing",
			overallProgress: 25,
			message: "Starting video encoding…",
			currentFile: undefined,
		})

		const outputFiles: string[] = []
		const totalFiles = videoFiles.length

		for (let i = 0; i < totalFiles; i++) {
			const fileName = videoFiles[i]
			const inputPath = path.join(projectDir, fileName)
			const outName = outputFileName(fileName, settings)
			const outputPath = path.join(processedDir, outName)
			const probe = probes.get(fileName)!

			updateFileStatus(fileName, (file) => ({
				...file,
				stage: "encoding",
				progress: 0,
			}))

			await setStatus(projectId, {
				currentFile: fileName,
				message: `Processing ${fileName}…`,
				files: fileStatuses,
			})

			let lastProgressWrite = 0
			await encodeVideo(inputPath, outputPath, settings, probe, async (progress) => {
				const now = Date.now()
				if (progress < 100 && now - lastProgressWrite < 500) {
					return
				}
				lastProgressWrite = now

				const fileWeight = 65 / totalFiles
				const baseProgress = 25 + i * fileWeight
				const overallProgress = Math.round(
					baseProgress + (progress / 100) * fileWeight
				)

				updateFileStatus(fileName, (file) => ({ ...file, progress }))

				await setStatus(projectId, {
					overallProgress,
					files: fileStatuses,
				})
			})

			outputFiles.push(outName)

			updateFileStatus(fileName, (file) => ({
				...file,
				stage: "done",
				progress: 100,
				outputFile: outName,
			}))

			await setStatus(projectId, { files: fileStatuses })
		}

		await setStatus(projectId, {
			stage: "finalizing",
			overallProgress: 92,
			message: "Updating project manifest…",
			currentFile: undefined,
		})

		manifest.processedFiles = outputFiles
		await writeManifest(projectId, manifest)

		await setStatus(projectId, {
			stage: "complete",
			overallProgress: 100,
			completedAt: new Date().toISOString(),
			message: `Successfully processed ${outputFiles.length} video(s).`,
			outputFiles,
			currentFile: undefined,
		})
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Processing failed unexpectedly"

		try {
			const current = await readProcessStatus(projectId)
			await setStatus(projectId, {
				stage: "error",
				failedAtStage:
					current.stage === "error" || current.stage === "idle"
						? "processing"
						: current.stage,
				error: message,
				message,
				completedAt: new Date().toISOString(),
				files: current.files.map((f) =>
					f.stage === "encoding" || f.stage === "analysing"
						? { ...f, stage: "failed", error: message }
						: f
				),
			})
		} catch (statusError) {
			console.error("Failed to write error status:", statusError)
		}
	}
}
