import { spawn } from "child_process"
import type { CropMode, VideoSettings } from "@/lib/video-settings"

export type FramingMode = "smart" | "fit" | "fill"

export type ContentRect = {
	x: number
	y: number
	width: number
	height: number
}

const SMART_FIT_THRESHOLD = 0.18

function runFfmpeg(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn("ffmpeg", args)
		let stderr = ""

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
		})

		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) resolve(stderr)
			else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-400)}`))
		})
	})
}

function parseCropdetect(stderr: string): ContentRect | null {
	const matches = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)]
	if (matches.length === 0) return null

	const last = matches[matches.length - 1]
	const width = parseInt(last[1], 10)
	const height = parseInt(last[2], 10)
	const x = parseInt(last[3], 10)
	const y = parseInt(last[4], 10)

	if (!width || !height) return null
	return { x, y, width, height }
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value))
}

function aspectRatioValue(ratio: VideoSettings["aspectRatio"]) {
	const [w, h] = ratio.split(":").map(Number)
	return w / h
}

function fillCropLossRatio(
	srcW: number,
	srcH: number,
	targetAspect: number
) {
	const srcAspect = srcW / srcH
	let cropW = srcW
	let cropH = srcH

	if (srcAspect > targetAspect) {
		cropH = srcH
		cropW = srcH * targetAspect
	} else if (srcAspect < targetAspect) {
		cropW = srcW
		cropH = srcW / targetAspect
	}

	return 1 - (cropW * cropH) / (srcW * srcH)
}

function pickBestContentRect(crops: ContentRect[]) {
	return crops.reduce((best, current) => {
		const bestArea = best.width * best.height
		const currentArea = current.width * current.height
		return currentArea > bestArea ? current : best
	})
}

function isMeaningfulTrim(
	content: ContentRect,
	srcW: number,
	srcH: number
) {
	const trimmedWidth = content.width < srcW * 0.98
	const trimmedHeight = content.height < srcH * 0.98
	return trimmedWidth || trimmedHeight
}

function focusPoint(
	srcW: number,
	srcH: number,
	cropMode: CropMode,
	content: ContentRect | null
) {
	if (content) {
		switch (cropMode) {
			case "top":
				return {
					x: content.x + content.width / 2,
					y: content.y + content.height * 0.3,
				}
			case "bottom":
				return {
					x: content.x + content.width / 2,
					y: content.y + content.height * 0.7,
				}
			default:
				return {
					x: content.x + content.width / 2,
					y: content.y + content.height / 2,
				}
		}
	}

	switch (cropMode) {
		case "top":
			return { x: srcW / 2, y: srcH * 0.3 }
		case "bottom":
			return { x: srcW / 2, y: srcH * 0.7 }
		default:
			return { x: srcW / 2, y: srcH / 2 }
	}
}

function computeFillCrop(
	srcW: number,
	srcH: number,
	targetAspect: number,
	cropMode: CropMode,
	content: ContentRect | null
): ContentRect {
	const srcAspect = srcW / srcH
	let cropW = srcW
	let cropH = srcH

	if (srcAspect > targetAspect) {
		cropH = srcH
		cropW = Math.round(srcH * targetAspect)
	} else if (srcAspect < targetAspect) {
		cropW = srcW
		cropH = Math.round(srcW / targetAspect)
	}

	const focus = focusPoint(srcW, srcH, cropMode, content)

	return {
		width: cropW,
		height: cropH,
		x: clamp(Math.round(focus.x - cropW / 2), 0, srcW - cropW),
		y: clamp(Math.round(focus.y - cropH / 2), 0, srcH - cropH),
	}
}

export async function detectContentBounds(
	filePath: string,
	duration: number
): Promise<ContentRect | null> {
	const sampleTimes =
		duration > 3
			? [duration * 0.25, duration * 0.5, duration * 0.75]
			: [Math.min(duration * 0.5, Math.max(duration - 0.1, 0))]

	const crops: ContentRect[] = []

	for (const timestamp of sampleTimes) {
		try {
			const stderr = await runFfmpeg([
				"-ss",
				timestamp.toFixed(2),
				"-i",
				filePath,
				"-frames:v",
				"1",
				"-vf",
				"cropdetect=24:16:0",
				"-f",
				"null",
				"-",
			])

			const crop = parseCropdetect(stderr)
			if (crop) crops.push(crop)
		} catch {
			// Try next sample point if one frame fails.
		}
	}

	if (crops.length === 0) return null
	return pickBestContentRect(crops)
}

function resolveFramingMode(
	settings: VideoSettings,
	srcW: number,
	srcH: number,
	content: ContentRect | null
): "fill" | "fit" {
	if (settings.framingMode === "fill") return "fill"
	if (settings.framingMode === "fit") return "fit"

	const targetAspect = aspectRatioValue(settings.aspectRatio)
	let workW = srcW
	let workH = srcH

	if (content && isMeaningfulTrim(content, srcW, srcH)) {
		workW = content.width
		workH = content.height
	}

	const loss = fillCropLossRatio(workW, workH, targetAspect)
	return loss > SMART_FIT_THRESHOLD ? "fit" : "fill"
}

export function buildFramingFilter(
	settings: VideoSettings,
	srcW: number,
	srcH: number,
	content: ContentRect | null,
	mode: "fill" | "fit"
) {
	const [outW, outH] = settings.outputResolution.split("x").map(Number)
	const targetAspect = aspectRatioValue(settings.aspectRatio)
	const filters: string[] = []

	let workW = srcW
	let workH = srcH

	if (content && isMeaningfulTrim(content, srcW, srcH)) {
		filters.push(`crop=${content.width}:${content.height}:${content.x}:${content.y}`)
		workW = content.width
		workH = content.height
	}

	const focusContent =
		content && isMeaningfulTrim(content, srcW, srcH) ? null : content

	if (mode === "fit") {
		filters.push(
			`scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
			`pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`
		)
		return filters.join(",")
	}

	const fill = computeFillCrop(
		workW,
		workH,
		targetAspect,
		settings.cropMode,
		focusContent
	)

	filters.push(`crop=${fill.width}:${fill.height}:${fill.x}:${fill.y}`)
	filters.push(`scale=${outW}:${outH}`)
	return filters.join(",")
}

export async function buildSmartFramingFilter(
	settings: VideoSettings,
	srcW: number,
	srcH: number,
	inputPath: string,
	duration: number
) {
	let content: ContentRect | null = null

	if (settings.framingMode === "smart") {
		content = await detectContentBounds(inputPath, duration)
	}

	const mode = resolveFramingMode(settings, srcW, srcH, content)
	return {
		filter: buildFramingFilter(settings, srcW, srcH, content, mode),
		mode,
		contentDetected: content !== null,
	}
}

export function buildFramingFilterSync(
	settings: VideoSettings,
	srcW: number,
	srcH: number
) {
	const mode =
		settings.framingMode === "fit"
			? "fit"
			: settings.framingMode === "fill"
				? "fill"
				: resolveFramingMode(settings, srcW, srcH, null)

	return buildFramingFilter(settings, srcW, srcH, null, mode)
}
