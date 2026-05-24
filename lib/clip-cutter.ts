import fs from "fs/promises"
import path from "path"
import { spawn } from "child_process"

type CutClipOptions = {
	accurateDuration?: boolean
}

export async function cutClip(
	inputPath: string,
	outputPath: string,
	start: number,
	duration: number,
	options: CutClipOptions = {}
) {
	await fs.mkdir(path.dirname(outputPath), { recursive: true })

	const accurateDuration = options.accurateDuration ?? duration <= 10

	if (accurateDuration) {
		await runFfmpegReencode(inputPath, outputPath, start, duration)
		return
	}

	try {
		await runFfmpegCopy(inputPath, outputPath, start, duration)
	} catch {
		await runFfmpegReencode(inputPath, outputPath, start, duration)
	}
}

function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn("ffmpeg", args)
		let stderr = ""

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
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
			if (code === 0) resolve()
			else reject(new Error(`ffmpeg clip cut failed: ${stderr.slice(-400)}`))
		})
	})
}

function runFfmpegCopy(
	inputPath: string,
	outputPath: string,
	start: number,
	duration: number
) {
	return runFfmpeg([
		"-y",
		"-ss",
		start.toFixed(3),
		"-i",
		inputPath,
		"-t",
		duration.toFixed(3),
		"-c",
		"copy",
		"-avoid_negative_ts",
		"make_zero",
		outputPath,
	])
}

function runFfmpegReencode(
	inputPath: string,
	outputPath: string,
	start: number,
	duration: number
) {
	return runFfmpeg([
		"-y",
		"-ss",
		start.toFixed(3),
		"-i",
		inputPath,
		"-t",
		duration.toFixed(3),
		"-c:v",
		"libx264",
		"-crf",
		"20",
		"-c:a",
		"aac",
		outputPath,
	])
}
