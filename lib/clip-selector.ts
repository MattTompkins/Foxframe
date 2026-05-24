import type { TimelinePoint } from "@/lib/clip-analyser"
import type {
	ClipDistribution,
	SmartEditingSettings,
} from "@/lib/smart-editing-settings"

export type ClipWindow = {
	start: number
	end: number
	/** Signal strength at this window (key-moment detection) */
	score: number
	targetDurationSeconds: number
	momentScore?: number
	cvScore?: number
}

function roundSeconds(value: number) {
	return Math.round(value * 100) / 100
}

function scoreAtTime(timeline: TimelinePoint[], time: number) {
	if (!timeline.length) return 0
	const index = Math.max(
		0,
		Math.min(timeline.length - 1, Math.round(time))
	)
	return timeline[index].score
}

/**
 * Split the full source duration into non-overlapping clip windows (max length per
 * settings). Every processed file yields at least one clip when duration allows.
 * Signal scores come from the timeline at each window centre (for ranking / blend).
 */
export function pickAllClipWindows(
	duration: number,
	timeline: TimelinePoint[],
	settings: SmartEditingSettings
): ClipWindow[] {
	const minLen = settings.minClipLengthSeconds
	const maxLen = settings.maxClipLengthSeconds

	if (duration < 0.5) {
		return []
	}

	if (duration < minLen) {
		const score = scoreAtTime(timeline, duration / 2)
		return [
			{
				start: 0,
				end: roundSeconds(duration),
				score,
				momentScore: score,
				targetDurationSeconds: roundSeconds(duration),
			},
		]
	}

	const windows: ClipWindow[] = []
	let start = 0

	while (start < duration) {
		const remaining = duration - start
		if (remaining < minLen) {
			break
		}

		let clipLen = Math.min(maxLen, remaining)
		const tail = remaining - clipLen
		if (tail > 0 && tail < minLen) {
			clipLen = remaining
		}
		if (clipLen > maxLen) {
			clipLen = maxLen
		}

		const end = roundSeconds(start + clipLen)
		const center = start + (end - start) / 2
		const signalScore = scoreAtTime(timeline, center)

		windows.push({
			start: roundSeconds(start),
			end,
			score: signalScore,
			momentScore: signalScore,
			targetDurationSeconds: roundSeconds(end - start),
		})

		start = end
	}

	return windows
}

/** Order selected clips for a future combined export (does not remove any files). */
export function applyDistribution(
	windows: ClipWindow[],
	distribution: ClipDistribution
): ClipWindow[] {
	const sorted = [...windows].sort((a, b) => a.start - b.start)

	switch (distribution) {
		case "start":
			return sorted
		case "end":
			return sorted.reverse()
		case "mixed": {
			if (sorted.length <= 2) return sorted

			const result: ClipWindow[] = []
			let left = 0
			let right = sorted.length - 1

			while (left <= right) {
				if (left === right) {
					result.push(sorted[left])
				} else {
					result.push(sorted[left])
					result.push(sorted[right])
				}
				left++
				right--
			}

			return result
		}
		default:
			return sorted
	}
}
