import path from "path"
import { analyseVideoTimeline } from "@/lib/clip-analyser"
import { cutClip } from "@/lib/clip-cutter"
import { selectClipWindows } from "@/lib/clip-selector"
import {
	describeMomentScore,
	describeSelection,
	type ClipSegment,
} from "@/lib/clip-segments"
import type { ProcessStatus } from "@/lib/process-stages"
import type { SmartEditingSettings } from "@/lib/smart-editing-settings"

export type { ClipSegment } from "@/lib/clip-segments"

type SmartClipOptions = {
	projectId: string
	processedDir: string
	clipsDir: string
	processedFiles: string[]
	smartEditing: SmartEditingSettings
	onStatus: (patch: Partial<ProcessStatus>) => Promise<ProcessStatus>
}

function clipOutputName(processedFile: string, index: number) {
	const base = path.parse(processedFile).name
	const outputBase = base.endsWith("-processed") ? base.slice(0, -"-processed".length) : base
	const ext = path.extname(processedFile) || ".mp4"
	return `${base}-clip-${String(index + 1).padStart(2, "0")}${ext}`
}

function roundSeconds(value: number) {
	return Math.round(value * 100) / 100
}

export async function processSmartClips(
	options: SmartClipOptions
): Promise<{ clipFiles: string[]; segments: ClipSegment[] }> {
	const {
		processedDir,
		clipsDir,
		processedFiles,
		smartEditing,
		onStatus,
	} = options

	const clipFiles: string[] = []
	const segments: ClipSegment[] = []
	const totalFiles = processedFiles.length

	await onStatus({
		stage: "clip-analysing",
		overallProgress: 84,
		message: "Analysing processed videos for key moments…",
		currentFile: undefined,
	})

	for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
		const processedFile = processedFiles[fileIndex]
		const inputPath = path.join(processedDir, processedFile)

		await onStatus({
			currentFile: processedFile,
			message: `Detecting key moments in ${processedFile}…`,
			overallProgress: 84 + Math.round((fileIndex / totalFiles) * 6),
		})

		const { duration, timeline } = await analyseVideoTimeline(
			inputPath,
			smartEditing.keyMomentDetection
		)

		const windows = selectClipWindows(duration, timeline, smartEditing)

		await onStatus({
			stage: "clip-cutting",
			message: `Cutting ${windows.length} clip(s) from ${processedFile}…`,
			overallProgress: 90 + Math.round((fileIndex / totalFiles) * 4),
		})

		const rankedWindows = [...windows].sort((a, b) => b.score - a.score)

		for (let clipIndex = 0; clipIndex < windows.length; clipIndex++) {
			const window = windows[clipIndex]
			const clipFile = clipOutputName(processedFile, clipIndex)
			const outputPath = path.join(clipsDir, clipFile)
			const clipDuration = roundSeconds(window.end - window.start)
			const rank =
				rankedWindows.findIndex(
					(ranked) =>
						ranked.start === window.start && ranked.end === window.end
				) + 1

			await cutClip(inputPath, outputPath, window.start, clipDuration, {
				accurateDuration: true,
			})

			clipFiles.push(clipFile)
			segments.push({
				sourceFile: processedFile,
				clipFile,
				rank,
				startSeconds: window.start,
				endSeconds: window.end,
				durationSeconds: clipDuration,
				targetDurationSeconds: window.targetDurationSeconds,
				momentScore: roundSeconds(window.score),
				momentScoreDescription: describeMomentScore(
					window.score,
					smartEditing.keyMomentDetection
				),
				detectionMethod: smartEditing.keyMomentDetection,
				selectedBecause: describeSelection(
					window.score,
					rank,
					smartEditing.clipsPerSourceFile
				),
			})
		}
	}

	return { clipFiles, segments }
}
