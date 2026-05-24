import { probeDuration, runCommand } from "@/lib/ffmpeg-run"
import type { KeyMomentDetection } from "@/lib/smart-editing-settings"

export type TimelinePoint = {
	time: number
	score: number
}


function buildEmptyTimeline(duration: number): TimelinePoint[] {
	const length = Math.max(1, Math.ceil(duration))
	return Array.from({ length }, (_, index) => ({
		time: index,
		score: 0,
	}))
}

function addBump(
	timeline: TimelinePoint[],
	time: number,
	weight: number,
	spread = 2
) {
	const index = Math.round(time)
	for (let offset = -spread; offset <= spread; offset++) {
		const bucket = index + offset
		if (bucket < 0 || bucket >= timeline.length) continue
		const falloff = 1 - Math.abs(offset) / (spread + 1)
		timeline[bucket].score += weight * falloff
	}
}

function normalizeTimeline(timeline: TimelinePoint[]): TimelinePoint[] {
	const max = Math.max(...timeline.map((point) => point.score), 0.0001)
	return timeline.map((point) => ({
		time: point.time,
		score: point.score / max,
	}))
}

function mergeTimelines(
	timelines: TimelinePoint[][],
	weights: number[]
): TimelinePoint[] {
	if (timelines.length === 0) return []
	const length = timelines[0].length

	return Array.from({ length }, (_, index) => ({
		time: index,
		score: timelines.reduce(
			(sum, timeline, timelineIndex) =>
				sum + timeline[index].score * weights[timelineIndex],
			0
		),
	}))
}

async function detectSceneTimeline(
	filePath: string,
	duration: number,
	threshold: number
): Promise<TimelinePoint[]> {
	const timeline = buildEmptyTimeline(duration)

	try {
		const { stderr } = await runCommand("ffmpeg", [
			"-hide_banner",
			"-i",
			filePath,
			"-vf",
			`select='gt(scene,${threshold})',showinfo`,
			"-an",
			"-f",
			"null",
			"-",
		])

		for (const line of stderr.split("\n")) {
			const timeMatch = line.match(/pts_time:([0-9.]+)/)
			if (!timeMatch) continue

			const sceneMatch = line.match(/scene:([0-9.]+)/i)
			const weight = sceneMatch ? parseFloat(sceneMatch[1]) : 1
			addBump(timeline, parseFloat(timeMatch[1]), weight, 3)
		}
	} catch {
		// Fall back to a flat timeline if scene detection fails.
	}

	return normalizeTimeline(timeline)
}

async function detectAudioTimeline(
	filePath: string,
	duration: number
): Promise<TimelinePoint[]> {
	const timeline = buildEmptyTimeline(duration)

	try {
		const { stderr } = await runCommand("ffmpeg", [
			"-hide_banner",
			"-i",
			filePath,
			"-af",
			"astats=metadata=1:reset=48000,ametadata=print:file=-",
			"-f",
			"null",
			"-",
		])

		let bucket = 0
		for (const line of stderr.split("\n")) {
			const ptsMatch = line.match(/pts_time:([0-9.]+)/)
			if (ptsMatch) {
				bucket = Math.min(
					timeline.length - 1,
					Math.round(parseFloat(ptsMatch[1]))
				)
			}

			const rmsMatch = line.match(/RMS level dB: (-?[0-9.]+)/i)
			if (rmsMatch) {
				const db = parseFloat(rmsMatch[1])
				const linear = Math.pow(10, db / 20)
				timeline[bucket].score = Math.max(timeline[bucket].score, linear)
			}
		}
	} catch {
		// Ignore audio analysis failures.
	}

	return normalizeTimeline(timeline)
}

export async function analyseVideoTimeline(
	filePath: string,
	detection: KeyMomentDetection
): Promise<{ duration: number; timeline: TimelinePoint[] }> {
	const duration = await probeDuration(filePath)
	const motionTimeline = await detectSceneTimeline(filePath, duration, 0.12)
	const sceneTimeline = await detectSceneTimeline(filePath, duration, 0.35)
	const audioTimeline = await detectAudioTimeline(filePath, duration)

	let timeline: TimelinePoint[]

	switch (detection) {
		case "camera-movement":
			timeline = motionTimeline
			break
		case "audio":
			timeline = audioTimeline
			break
		case "scene-state":
			timeline = sceneTimeline
			break
		case "combined":
		default:
			timeline = mergeTimelines(
				[audioTimeline, motionTimeline, sceneTimeline],
				[0.45, 0.35, 0.2]
			)
			timeline = normalizeTimeline(timeline)
			break
	}

	return { duration, timeline }
}
