import path from "path"
import { analyseVideoTimeline } from "@/lib/clip-analyser"
import { pickAllClipWindows } from "@/lib/clip-selector"
import {
	assignRanksByFinalScore,
	buildClipScoreFields,
	indexManualFinalScores,
	listSelectedClipFiles,
	markSelectedClips,
	roundScore,
} from "@/lib/clip-scores"
import { cutClip } from "@/lib/clip-cutter"
import {
	describeCvScore,
	describeSegmentOutcome,
	describeSignalScore,
	type ClipSegment,
} from "@/lib/clip-segments"
import {
	scoreClipFilesWithCv,
	type CvScoreDetail,
	type CvScoringMeta,
} from "@/lib/cv-scorer"
import type { ProcessStatus } from "@/lib/process-stages"
import {
	type SmartEditingSettings,
	usesComputerVision,
} from "@/lib/smart-editing-settings"

export type { ClipSegment } from "@/lib/clip-segments"
export type { CvScoringMeta } from "@/lib/cv-scorer"

type SmartClipOptions = {
	projectId: string
	processedDir: string
	clipsDir: string
	processedFiles: string[]
	smartEditing: SmartEditingSettings
	existingSegments?: ClipSegment[]
	onStatus: (patch: Partial<ProcessStatus>) => Promise<ProcessStatus>
}

type CutDraft = {
	sourceFile: string
	clipFile: string
	clipPath: string
	window: ReturnType<typeof pickAllClipWindows>[number]
}

function clipOutputName(processedFile: string, index: number) {
	const base = path.parse(processedFile).name
	const ext = path.extname(processedFile) || ".mp4"
	return `${base}-clip-${String(index + 1).padStart(2, "0")}${ext}`
}

export async function processSmartClips(
	options: SmartClipOptions
): Promise<{
	clipFiles: string[]
	segments: ClipSegment[]
	selectedClips: string[]
	cvScoring: CvScoringMeta
}> {
	const {
		processedDir,
		clipsDir,
		processedFiles,
		smartEditing,
		existingSegments,
		onStatus,
	} = options

	const clipFiles: string[] = []
	const cutDrafts: CutDraft[] = []
	const totalFiles = processedFiles.length
	const cvEnabled = usesComputerVision(smartEditing)
	const manualOverrides = indexManualFinalScores(existingSegments)

	// Phase 1 — find key moments (per source file)
	await onStatus({
		stage: "clip-analysing",
		overallProgress: 84,
		message: "Finding key moments on formatted videos…",
		currentFile: undefined,
	})

	for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
		const processedFile = processedFiles[fileIndex]
		const inputPath = path.join(processedDir, processedFile)

		await onStatus({
			currentFile: processedFile,
			message: `Finding cut points in ${processedFile}…`,
			overallProgress: 84 + Math.round((fileIndex / totalFiles) * 2),
		})

		const { duration, timeline } = await analyseVideoTimeline(
			inputPath,
			smartEditing.keyMomentDetection
		)

		const windows = pickAllClipWindows(duration, timeline, smartEditing)

		// Phase 2 — cut every candidate short clip
		await onStatus({
			stage: "clip-cutting",
			message: `Cutting ${windows.length} short clip(s) from ${processedFile} (${fileIndex + 1}/${totalFiles})…`,
			overallProgress: 86 + Math.round((fileIndex / totalFiles) * 6),
		})

		for (let clipIndex = 0; clipIndex < windows.length; clipIndex++) {
			const window = windows[clipIndex]
			const clipFile = clipOutputName(processedFile, clipIndex)
			const clipPath = path.join(clipsDir, clipFile)
			const clipDuration = roundScore(window.end - window.start)

			await cutClip(inputPath, clipPath, window.start, clipDuration, {
				accurateDuration: true,
			})

			clipFiles.push(clipFile)
			cutDrafts.push({ sourceFile: processedFile, clipFile, clipPath, window })
		}
	}

	// Phase 3 — computer vision on every file in clips/
	let cvScoring: CvScoringMeta = {
		status: cvEnabled ? "failed" : "skipped",
		scoredClipCount: 0,
		requestedClipCount: cutDrafts.length,
	}

	const cvDetails = new Map<string, CvScoreDetail>()

	if (cvEnabled && cutDrafts.length > 0) {
		await onStatus({
			stage: "clip-cv-scoring",
			overallProgress: 93,
			message: `Scoring all ${cutDrafts.length} short clip(s) in clips/ with computer vision…`,
			currentFile: undefined,
		})

		const result = await scoreClipFilesWithCv(
			cutDrafts.map(({ clipFile, clipPath }) => ({ clipFile, clipPath })),
			smartEditing
		)
		cvScoring = result.meta

		for (const [id, detail] of result.details) {
			cvDetails.set(id, detail)
		}

		if (cvScoring.status === "failed" && cvScoring.error) {
			await onStatus({
				message: `Computer vision: ${cvScoring.error}`,
			})
		}
	} else if (cutDrafts.length > 0) {
		cvScoring = {
			status: "skipped",
			scoredClipCount: 0,
			requestedClipCount: cutDrafts.length,
		}
	}

	// Phase 4 — score every cut, rank all, then select top N per source
	await onStatus({
		stage: "clip-selecting",
		overallProgress: 96,
		message: `Ranking ${cutDrafts.length} clip(s) and selecting the best per source file…`,
		currentFile: undefined,
	})

	let segments: ClipSegment[] = []

	for (const draft of cutDrafts) {
		const { sourceFile, clipFile, window } = draft
		const clipDuration = roundScore(window.end - window.start)
		const signalScore = roundScore(window.momentScore ?? window.score)
		const manualFinalScore = manualOverrides.get(clipFile)
		const cvDetail = cvDetails.get(clipFile) ?? null

		const scoreFields = buildClipScoreFields(smartEditing, {
			signalScore,
			cvDetail,
			cvRequested: cvEnabled,
			manualFinalScore,
		})

		segments.push({
			sourceFile,
			clipFile,
			rank: 0,
			startSeconds: window.start,
			endSeconds: window.end,
			durationSeconds: clipDuration,
			targetDurationSeconds: window.targetDurationSeconds,
			signalScore: scoreFields.signalScore,
			signalScoreDescription: describeSignalScore(
				scoreFields.signalScore,
				smartEditing.keyMomentDetection
			),
			cvScore: scoreFields.cvScore,
			cvScoreStatus: scoreFields.cvScoreStatus,
			cvPositiveSimilarity: scoreFields.cvPositiveSimilarity,
			cvNegativeSimilarity: scoreFields.cvNegativeSimilarity,
			cvScoreError: scoreFields.cvScoreError,
			cvScoreDescription:
				scoreFields.cvScore !== undefined
					? describeCvScore(
							scoreFields.cvScore,
							smartEditing.computerVisionWeight,
							scoreFields.cvPositiveSimilarity,
							scoreFields.cvNegativeSimilarity
						)
					: scoreFields.cvScoreError,
			blendedScore: scoreFields.blendedScore,
			finalScore: scoreFields.finalScore,
			finalScoreSource: scoreFields.finalScoreSource,
			manualFinalScore: scoreFields.manualFinalScore,
			detectionMethod: smartEditing.keyMomentDetection,
			selectedBecause: "",
		})
	}

	for (const processedFile of processedFiles) {
		let ranked = assignRanksByFinalScore(segments, processedFile).filter(
			(s) => s.sourceFile === processedFile
		)
		ranked = markSelectedClips(ranked, smartEditing.clipsPerSourceFile)

		for (const segment of ranked) {
			segment.selectedBecause = describeSegmentOutcome(
				segment,
				smartEditing.clipsPerSourceFile
			)
		}

		segments = segments
			.filter((s) => s.sourceFile !== processedFile)
			.concat(ranked)
	}

	const selectedClips = listSelectedClipFiles(segments)

	await onStatus({
		message: `Cut ${clipFiles.length} short clip(s); selected ${selectedClips.length} best clip(s) for use (${smartEditing.clipsPerSourceFile} per source).`,
	})

	return { clipFiles, segments, selectedClips, cvScoring }
}
