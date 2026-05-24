import type { KeyMomentDetection } from "@/lib/smart-editing-settings"

export type ClipSegment = {
	sourceFile: string
	clipFile: string
	rank: number
	startSeconds: number
	endSeconds: number
	durationSeconds: number
	targetDurationSeconds: number
	momentScore: number
	momentScoreDescription: string
	detectionMethod: KeyMomentDetection
	selectedBecause: string
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

export function describeMomentScore(
	score: number,
	detectionMethod: KeyMomentDetection
): string {
	const strength = momentStrength(score)
	const signal = DETECTION_LABELS[detectionMethod]

	if (score <= 0.11) {
		return `Score ${score.toFixed(2)} — filler clip placed to reach your requested clip count (no strong ${signal} peak found here).`
	}

	return `Score ${score.toFixed(2)} — ${strength} ${signal} signal at this moment (0 = no activity, 1 = strongest detected peak in this file).`
}

export function describeSelection(
	score: number,
	rank: number,
	totalRequested: number
): string {
	if (score <= 0.11) {
		return `Rank ${rank} of ${totalRequested} — added to honour your clips-per-file setting.`
	}

	return `Rank ${rank} of ${totalRequested} — selected for having the #${rank} highest key-moment score in this source file.`
}

export { DETECTION_LABELS }

export const CLIP_SEGMENT_LEGEND = {
	momentScore:
		"Normalised strength (0–1) of the key-moment signal at the clip centre for your chosen detection method.",
	momentScoreDescription: "Plain-English explanation of what the score means for this clip.",
	rank: "Quality rank within the source file (1 = strongest detected moment).",
	durationSeconds: "Actual exported clip length in seconds.",
	targetDurationSeconds:
		"Requested clip length from your min/max settings before edge clamping.",
	selectedBecause: "Why this clip was chosen relative to your clips-per-file setting.",
	detectionMethod:
		"Which signal was used to score moments: camera movement, audio, scene changes, or combined.",
	computerVisionWeight:
		"How much computer vision (vs key-moment detection) influences clip ranking, from 0% to 100%. Stored on manifest.smartEditing.",
	clipDistribution:
		"Where the highest-scoring clips are placed in the sequence: at the start, at the end, or mixed throughout.",
}
