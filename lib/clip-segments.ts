import type {
	FinalScoreSource,
	KeyMomentDetection,
} from "@/lib/smart-editing-settings"

/** Which value was used for finalScore / rank */
export type ClipScoreSource = FinalScoreSource | "manual"

export type ClipSegment = {
	sourceFile: string
	clipFile: string
	rank: number
	startSeconds: number
	endSeconds: number
	durationSeconds: number
	targetDurationSeconds: number
	/** Key-moment (motion / audio / scene) score at the cut window */
	signalScore: number
	signalScoreDescription: string
	/** CLIP score from the final file in clips/ */
	cvScore?: number
	cvScoreStatus?: "scored" | "skipped" | "failed" | "unavailable"
	cvScoreDescription?: string
	cvPositiveSimilarity?: number
	cvNegativeSimilarity?: number
	cvScoreError?: string
	/** (1 − blend) × signal + blend × cv — always computed when cv exists */
	blendedScore: number
	/** Rank driver: blended, signal, cv, or manualFinalScore override */
	finalScore: number
	finalScoreSource: ClipScoreSource
	/** When set, finalScore uses this value and finalScoreSource is manual */
	manualFinalScore?: number
	detectionMethod: KeyMomentDetection
	selectedBecause: string
	/** True when this clip is in the top clipsPerSourceFile by finalScore for its source */
	selectedForUse?: boolean
	/** How many short clips were cut from this source file before selection */
	totalCutsFromSource?: number
}

const DETECTION_LABELS: Record<KeyMomentDetection, string> = {
	"camera-movement": "camera movement",
	audio: "audio activity",
	combined: "combined motion, audio, and scene changes",
	"scene-state": "scene changes",
}

function momentStrength(score: number) {
	if (score >= 0.75) return "strong"
	if (score >= 0.4) return "moderate"
	if (score >= 0.15) return "weak"
	return "fallback"
}

export function describeSignalScore(
	score: number,
	detectionMethod: KeyMomentDetection
): string {
	const strength = momentStrength(score)
	const signal = DETECTION_LABELS[detectionMethod]

	return `Score ${score.toFixed(2)} — ${strength} ${signal} signal at this cut (0 = no activity, 1 = strongest peak in this source file).`
}

export function describeCvScore(
	cvScore: number,
	computerVisionWeight: number,
	positiveSimilarity?: number,
	negativeSimilarity?: number
) {
	const parts = [
		`Score ${cvScore.toFixed(2)} — CLIP match on the clip file in clips/ (blend weight ${computerVisionWeight}%).`,
	]
	if (positiveSimilarity !== undefined && negativeSimilarity !== undefined) {
		parts.push(
			` Raw similarity: +${positiveSimilarity.toFixed(3)} vs prompt, −${negativeSimilarity.toFixed(3)} vs avoid.`
		)
	}
	return parts.join("")
}

export function describeSelection(
	finalScore: number,
	rank: number,
	totalRequested: number,
	finalScoreSource: ClipScoreSource
): string {
	if (finalScore <= 0.11) {
		return `Rank ${rank} of ${totalRequested} — added to honour your clips-per-file setting.`
	}

	switch (finalScoreSource) {
		case "manual":
			return `Rank ${rank} of ${totalRequested} — ranked using your manual final score override.`
		case "cv":
			return `Rank ${rank} of ${totalRequested} — ranked by computer vision score on the clip file.`
		case "signal":
			return `Rank ${rank} of ${totalRequested} — ranked by key-moment (signal) score.`
		case "blended":
		default:
			return `Rank ${rank} of ${totalRequested} — ranked by blended signal and computer vision score.`
	}
}

export function describeSegmentOutcome(
	segment: Pick<
		ClipSegment,
		| "rank"
		| "finalScore"
		| "finalScoreSource"
		| "selectedForUse"
		| "totalCutsFromSource"
		| "cvScoreStatus"
	>,
	clipsPerSourceFile: number
) {
	const total = segment.totalCutsFromSource ?? 0
	const hasCv = segment.cvScoreStatus === "scored"

	if (segment.selectedForUse) {
		const basis =
			segment.finalScoreSource === "blended" && !hasCv
				? "signal score (CV unavailable)"
				: `${segment.finalScoreSource} score`
		return `Selected #${segment.rank} of ${total} cut(s) — top ${clipsPerSourceFile} by ${basis} (final ${segment.finalScore.toFixed(2)}).`
	}

	return `Rank ${segment.rank} of ${total} cut(s) — not in top ${clipsPerSourceFile} (final ${segment.finalScore.toFixed(2)}).`
}

/** Backward-compatible read for manifests saved before signalScore rename */
export function normalizeClipSegment(
	raw: Record<string, unknown>
): ClipSegment {
	const signalScore =
		typeof raw.signalScore === "number"
			? raw.signalScore
			: typeof raw.momentScore === "number"
				? raw.momentScore
				: 0

	const blendedScore =
		typeof raw.blendedScore === "number" ? raw.blendedScore : signalScore

	const finalScore =
		typeof raw.finalScore === "number"
			? raw.finalScore
			: typeof raw.blendedScore === "number"
				? raw.blendedScore
				: signalScore

	return {
		sourceFile: String(raw.sourceFile ?? ""),
		clipFile: String(raw.clipFile ?? ""),
		rank: typeof raw.rank === "number" ? raw.rank : 0,
		startSeconds: typeof raw.startSeconds === "number" ? raw.startSeconds : 0,
		endSeconds: typeof raw.endSeconds === "number" ? raw.endSeconds : 0,
		durationSeconds:
			typeof raw.durationSeconds === "number" ? raw.durationSeconds : 0,
		targetDurationSeconds:
			typeof raw.targetDurationSeconds === "number"
				? raw.targetDurationSeconds
				: 0,
		signalScore,
		signalScoreDescription:
			typeof raw.signalScoreDescription === "string"
				? raw.signalScoreDescription
				: typeof raw.momentScoreDescription === "string"
					? raw.momentScoreDescription
					: "",
		cvScore: typeof raw.cvScore === "number" ? raw.cvScore : undefined,
		cvScoreStatus:
			raw.cvScoreStatus === "scored" ||
			raw.cvScoreStatus === "skipped" ||
			raw.cvScoreStatus === "failed" ||
			raw.cvScoreStatus === "unavailable"
				? raw.cvScoreStatus
				: undefined,
		cvScoreDescription:
			typeof raw.cvScoreDescription === "string"
				? raw.cvScoreDescription
				: undefined,
		cvPositiveSimilarity:
			typeof raw.cvPositiveSimilarity === "number"
				? raw.cvPositiveSimilarity
				: undefined,
		cvNegativeSimilarity:
			typeof raw.cvNegativeSimilarity === "number"
				? raw.cvNegativeSimilarity
				: undefined,
		cvScoreError:
			typeof raw.cvScoreError === "string" ? raw.cvScoreError : undefined,
		blendedScore,
		finalScore,
		finalScoreSource:
			raw.finalScoreSource === "manual" ||
			raw.finalScoreSource === "signal" ||
			raw.finalScoreSource === "cv" ||
			raw.finalScoreSource === "blended"
				? raw.finalScoreSource
				: "blended",
		manualFinalScore:
			typeof raw.manualFinalScore === "number"
				? raw.manualFinalScore
				: undefined,
		detectionMethod:
			raw.detectionMethod === "camera-movement" ||
			raw.detectionMethod === "audio" ||
			raw.detectionMethod === "combined" ||
			raw.detectionMethod === "scene-state"
				? raw.detectionMethod
				: "combined",
		selectedBecause:
			typeof raw.selectedBecause === "string" ? raw.selectedBecause : "",
		selectedForUse:
			typeof raw.selectedForUse === "boolean" ? raw.selectedForUse : undefined,
		totalCutsFromSource:
			typeof raw.totalCutsFromSource === "number"
				? raw.totalCutsFromSource
				: undefined,
	}
}

export { DETECTION_LABELS }

export const CLIP_SEGMENT_LEGEND = {
	signalScore:
		"Key-moment score (0–1) from motion, audio, or scene analysis at the cut window on the source video.",
	signalScoreDescription: "Plain-English explanation of the signal score.",
	cvScore:
		"Computer vision score (0–1) from CLIP on the final file in clips/.",
	cvScoreStatus:
		"scored = CLIP ran on clip file; skipped = CV weight 0; failed/unavailable = error or missing Python env.",
	cvScoreDescription: "Plain-English explanation of the CV score.",
	cvPositiveSimilarity: "Raw CLIP cosine similarity to the positive prompt.",
	cvNegativeSimilarity: "Raw CLIP cosine similarity to the negative prompt.",
	cvScoreError: "Error message when cvScoreStatus is failed or unavailable.",
	blendedScore:
		"Weighted average: (1 − blend%) × signalScore + blend% × cvScore. Equals signalScore only if CV did not run.",
	finalScore:
		"Score used for rank — from blended, signal, cv, or manualFinalScore per smartEditing.finalScoreSource.",
	finalScoreSource:
		"Which score drove rank: blended, signal, cv, or manual (override).",
	manualFinalScore:
		"Optional 0–1 override; when set, finalScore equals this and finalScoreSource is manual.",
	rank: "Quality rank within the source file (1 = highest finalScore).",
	durationSeconds: "Actual exported clip length in seconds.",
	targetDurationSeconds:
		"Requested clip length from your min/max settings before edge clamping.",
	selectedBecause: "Why this clip was ranked and whether it was selected for use.",
	selectedForUse:
		"True if this clip is among the top clipsPerSourceFile by finalScore for its source (for a future combined edit).",
	totalCutsFromSource:
		"Total short clips cut from this source before selection.",
	detectionMethod:
		"Which signal was used for signalScore: camera movement, audio, scene changes, or combined.",
	computerVisionWeight:
		"Blend weight for blendedScore. Stored on manifest.smartEditing.",
	finalScoreSource:
		"Default ranking score when manualFinalScore is not set. Stored on manifest.smartEditing.",
	clipDistribution:
		"Where the highest-scoring clips are placed in the sequence: at the start, at the end, or mixed throughout.",
}
