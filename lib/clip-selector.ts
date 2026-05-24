import type { TimelinePoint } from "@/lib/clip-analyser"
import type {
	ClipDistribution,
	SmartEditingSettings,
} from "@/lib/smart-editing-settings"

export type ClipWindow = {
	start: number
	end: number
	score: number
	targetDurationSeconds: number
}

function roundSeconds(value: number) {
	return Math.round(value * 100) / 100
}

function smoothTimeline(timeline: TimelinePoint[]): TimelinePoint[] {
	return timeline.map((point, index, array) => {
		const prev = array[Math.max(0, index - 1)].score
		const next = array[Math.min(array.length - 1, index + 1)].score
		return {
			time: point.time,
			score: (prev + point.score + next) / 3,
		}
	})
}

function findPeaks(
	timeline: TimelinePoint[],
	minDistanceSeconds: number
): { time: number; score: number }[] {
	const peaks: { time: number; score: number }[] = []

	for (let index = 1; index < timeline.length - 1; index++) {
		const prev = timeline[index - 1].score
		const current = timeline[index].score
		const next = timeline[index + 1].score

		if (current >= prev && current >= next && current > 0.05) {
			const tooClose = peaks.some(
				(peak) => Math.abs(peak.time - timeline[index].time) < minDistanceSeconds
			)
			if (!tooClose) {
				peaks.push({ time: timeline[index].time, score: current })
			} else {
				const existingIndex = peaks.findIndex(
					(peak) =>
						Math.abs(peak.time - timeline[index].time) < minDistanceSeconds
				)
				if (existingIndex >= 0 && current > peaks[existingIndex].score) {
					peaks[existingIndex] = {
						time: timeline[index].time,
						score: current,
					}
				}
			}
		}
	}

	return peaks.sort((a, b) => b.score - a.score)
}

function windowsOverlap(a: ClipWindow, b: ClipWindow) {
	return a.start < b.end && b.start < a.end
}

function buildWindow(
	peakTime: number,
	duration: number,
	settings: SmartEditingSettings,
	score: number
): ClipWindow | null {
	const minLen = settings.minClipLengthSeconds
	const maxLen = settings.maxClipLengthSeconds

	if (duration < minLen) {
		return null
	}

	const clipLength = Math.min(maxLen, duration)
	let start = peakTime - clipLength / 2

	if (start < 0) start = 0
	if (start + clipLength > duration) start = Math.max(0, duration - clipLength)

	const end = start + clipLength
	const actualDuration = end - start

	if (actualDuration < minLen) {
		return null
	}

	return {
		start: roundSeconds(start),
		end: roundSeconds(end),
		score,
		targetDurationSeconds: clipLength,
	}
}

function findLargestGap(
	duration: number,
	windows: ClipWindow[],
	minClipLengthSeconds: number
): { start: number; end: number } | null {
	const sorted = [...windows].sort((a, b) => a.start - b.start)
	const gaps: { start: number; end: number; size: number }[] = []

	if (sorted.length === 0) {
		return { start: 0, end: duration }
	}

	if (sorted[0].start > 0) {
		gaps.push({ start: 0, end: sorted[0].start, size: sorted[0].start })
	}

	for (let index = 0; index < sorted.length - 1; index++) {
		const gapStart = sorted[index].end
		const gapEnd = sorted[index + 1].start
		gaps.push({ start: gapStart, end: gapEnd, size: gapEnd - gapStart })
	}

	const last = sorted[sorted.length - 1]
	if (last.end < duration) {
		gaps.push({ start: last.end, end: duration, size: duration - last.end })
	}

	const best = gaps.sort((a, b) => b.size - a.size)[0]
	if (!best || best.size < minClipLengthSeconds) {
		return null
	}

	return { start: best.start, end: best.end }
}

function fillMissingClips(
	duration: number,
	selected: ClipWindow[],
	settings: SmartEditingSettings
): ClipWindow[] {
	const result = [...selected]
	let attempts = 0

	while (
		result.length < settings.clipsPerSourceFile &&
		attempts < settings.clipsPerSourceFile * 3
	) {
		attempts++

		const gap = findLargestGap(duration, result, settings.minClipLengthSeconds)
		if (!gap) break

		const gapDuration = gap.end - gap.start
		if (gapDuration < settings.minClipLengthSeconds) break

		const clipLength = Math.min(
			settings.maxClipLengthSeconds,
			gapDuration,
			Math.max(settings.minClipLengthSeconds, gapDuration)
		)
		const centre = gap.start + gapDuration / 2
		const candidate = buildWindow(centre, duration, settings, 0.1)

		if (!candidate) break
		if (result.some((existing) => windowsOverlap(existing, candidate))) continue

		result.push({
			...candidate,
			score: 0.1,
		})
	}

	return result
}

function applyDistribution(
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

export function selectClipWindows(
	duration: number,
	timeline: TimelinePoint[],
	settings: SmartEditingSettings
): ClipWindow[] {
	const minLen = settings.minClipLengthSeconds
	const maxLen = settings.maxClipLengthSeconds

	if (duration < minLen) {
		return []
	}

	const smoothed = smoothTimeline(timeline)
	const peaks = findPeaks(smoothed, maxLen)
	const maxCandidates = Math.max(settings.clipsPerSourceFile * 4, peaks.length)

	const rankedPeaks = peaks.slice(0, maxCandidates).map((peak) => ({
		peak,
		window: buildWindow(peak.time, duration, settings, peak.score),
	}))

	let selected: ClipWindow[] = []

	for (const candidate of rankedPeaks) {
		if (!candidate.window) continue
		if (selected.length >= settings.clipsPerSourceFile) break
		if (selected.some((existing) => windowsOverlap(existing, candidate.window!))) {
			continue
		}
		selected.push(candidate.window)
	}

	selected = fillMissingClips(duration, selected, settings)

	if (selected.length < settings.clipsPerSourceFile && duration >= minLen * settings.clipsPerSourceFile) {
		const segmentLength = Math.min(
			maxLen,
			Math.max(minLen, duration / settings.clipsPerSourceFile)
		)
		const evenlySpaced: ClipWindow[] = []

		for (let index = 0; index < settings.clipsPerSourceFile; index++) {
			const centre =
				segmentLength / 2 +
				index * ((duration - segmentLength) / Math.max(1, settings.clipsPerSourceFile - 1))
			const window = buildWindow(centre, duration, settings, 0.05)
			if (window) evenlySpaced.push(window)
		}

		for (const candidate of evenlySpaced) {
			if (selected.length >= settings.clipsPerSourceFile) break
			if (selected.some((existing) => windowsOverlap(existing, candidate))) continue
			selected.push(candidate)
		}
	}

	selected = selected
		.sort((a, b) => b.score - a.score)
		.slice(0, settings.clipsPerSourceFile)

	if (selected.length === 0) {
		const fallback = buildWindow(duration / 2, duration, settings, 1)
		if (fallback) selected = [fallback]
	}

	return applyDistribution(selected, settings.clipDistribution)
}
