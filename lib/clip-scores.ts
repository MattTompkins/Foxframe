import {
	describeSegmentOutcome,
	type ClipSegment,
	type ClipScoreSource,
} from "@/lib/clip-segments"
import type { CvScoreDetail } from "@/lib/cv-scorer"
import type { FinalScoreSource, SmartEditingSettings } from "@/lib/smart-editing-settings"

export function roundScore(value: number) {
	return Math.round(value * 100) / 100
}

/** Blended score from signal + CV using the scoring blend slider. */
export function computeBlendedScore(
	signalScore: number,
	cvScore: number,
	computerVisionWeight: number
) {
	const weight = Math.max(0, Math.min(100, computerVisionWeight)) / 100
	return roundScore((1 - weight) * signalScore + weight * cvScore)
}

export function resolveFinalScore(
	settings: SmartEditingSettings,
	scores: {
		signalScore: number
		cvScore?: number
		blendedScore: number
		manualFinalScore?: number
	}
): { finalScore: number; finalScoreSource: ClipScoreSource } {
	if (typeof scores.manualFinalScore === "number") {
		return {
			finalScore: roundScore(
				Math.max(0, Math.min(1, scores.manualFinalScore))
			),
			finalScoreSource: "manual",
		}
	}

	const source = settings.finalScoreSource

	if (source === "signal") {
		return { finalScore: scores.signalScore, finalScoreSource: "signal" }
	}

	if (source === "cv") {
		return {
			finalScore: roundScore(scores.cvScore ?? scores.signalScore),
			finalScoreSource: "cv",
		}
	}

	return { finalScore: scores.blendedScore, finalScoreSource: "blended" }
}

export function buildClipScoreFields(
	settings: SmartEditingSettings,
	input: {
		signalScore: number
		cvDetail?: CvScoreDetail | null
		cvRequested: boolean
		manualFinalScore?: number
	}
) {
	const signalScore = roundScore(input.signalScore)
	let cvScore: number | undefined
	let cvScoreStatus: ClipSegment["cvScoreStatus"] = "skipped"
	let cvPositiveSimilarity: number | undefined
	let cvNegativeSimilarity: number | undefined
	let cvScoreError: string | undefined

	if (input.cvRequested) {
		if (input.cvDetail && !input.cvDetail.error) {
			cvScore = roundScore(input.cvDetail.cvScore)
			cvScoreStatus = "scored"
			cvPositiveSimilarity = roundScore(input.cvDetail.positiveSimilarity)
			cvNegativeSimilarity = roundScore(input.cvDetail.negativeSimilarity)
		} else if (input.cvDetail?.error) {
			cvScoreStatus = "failed"
			cvScoreError = input.cvDetail.error
		} else {
			cvScoreStatus = "unavailable"
			cvScoreError =
				"Computer vision did not return a score for this clip (see manifest.cvScoring)."
		}
	}

	const blendedScore =
		cvScore !== undefined
			? computeBlendedScore(
					signalScore,
					cvScore,
					settings.computerVisionWeight
				)
			: signalScore

	const { finalScore, finalScoreSource } = resolveFinalScore(settings, {
		signalScore,
		cvScore,
		blendedScore,
		manualFinalScore: input.manualFinalScore,
	})

	return {
		signalScore,
		cvScore,
		cvScoreStatus,
		cvPositiveSimilarity,
		cvNegativeSimilarity,
		cvScoreError,
		blendedScore,
		finalScore,
		finalScoreSource,
		manualFinalScore: input.manualFinalScore,
	}
}

export function indexManualFinalScores(segments: ClipSegment[] | undefined) {
	const map = new Map<string, number>()
	for (const segment of segments ?? []) {
		if (typeof segment.manualFinalScore === "number") {
			map.set(segment.clipFile, segment.manualFinalScore)
		}
	}
	return map
}

/** Rank every clip by finalScore across the whole project. */
export function assignGlobalRanks(segments: ClipSegment[]): ClipSegment[] {
	const total = segments.length
	if (total === 0) {
		return segments
	}

	const sorted = [...segments].sort((a, b) => b.finalScore - a.finalScore)
	const rankByClipFile = new Map(
		sorted.map((segment, index) => [segment.clipFile, index + 1])
	)

	return segments.map((segment) => ({
		...segment,
		globalRank: rankByClipFile.get(segment.clipFile) ?? 0,
		globalClipCount: total,
	}))
}

export function assignRanksByFinalScore(
	segments: ClipSegment[],
	sourceFile: string
): ClipSegment[] {
	const forSource = segments.filter((s) => s.sourceFile === sourceFile)
	const others = segments.filter((s) => s.sourceFile !== sourceFile)

	const sorted = [...forSource].sort((a, b) => b.finalScore - a.finalScore)
	const ranked = sorted.map((segment, index) => ({
		...segment,
		rank: index + 1,
	}))

	return [...others, ...ranked]
}

/** Mark top N clips per source file by finalScore (after all cuts are scored). */
export function markSelectedClips(
	segments: ClipSegment[],
	clipsPerSourceFile: number
): ClipSegment[] {
	const bySource = new Map<string, ClipSegment[]>()

	for (const segment of segments) {
		const list = bySource.get(segment.sourceFile) ?? []
		list.push(segment)
		bySource.set(segment.sourceFile, list)
	}

	return segments.map((segment) => {
		const sourceSegments = bySource.get(segment.sourceFile) ?? []
		const selectedForUse = segment.rank <= clipsPerSourceFile
		return {
			...segment,
			selectedForUse,
			totalCutsFromSource: sourceSegments.length,
		}
	})
}

export function listSelectedClipFiles(segments: ClipSegment[]) {
	return segments.filter((s) => s.selectedForUse).map((s) => s.clipFile)
}

/** Recompute global ranks and human-readable outcome text (e.g. when loading manifest). */
export function enrichClipSegments(
	segments: ClipSegment[],
	clipsPerSourceFile: number
): ClipSegment[] {
	const ranked = assignGlobalRanks(segments)
	return ranked.map((segment) => ({
		...segment,
		selectedBecause: describeSegmentOutcome(segment, clipsPerSourceFile),
	}))
}
