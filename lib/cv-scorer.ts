import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import type { SmartEditingSettings } from "@/lib/smart-editing-settings"
import { usesComputerVision } from "@/lib/smart-editing-settings"

const PY_DIR = path.join(process.cwd(), "lib", "py")
const SCORER_SCRIPT = path.join(PY_DIR, "cv_scorer.py")
const SCORER_TIMEOUT_MS = 30 * 60 * 1000

function venvPythonPath() {
	return process.platform === "win32"
		? path.join(PY_DIR, ".venv", "Scripts", "python.exe")
		: path.join(PY_DIR, ".venv", "bin", "python")
}

export function resolvePythonExecutable() {
	const venvPython = venvPythonPath()
	if (fs.existsSync(venvPython)) {
		return { python: venvPython, usingVenv: true }
	}
	const system = process.platform === "win32" ? "python" : "python3"
	return { python: system, usingVenv: false }
}

export function isCvScoringAvailable() {
	return fs.existsSync(SCORER_SCRIPT)
}

export type CvScoreDetail = {
	cvScore: number
	positiveSimilarity: number
	negativeSimilarity: number
	error?: string
}

export type CvScoringMeta = {
	status: "complete" | "partial" | "failed" | "skipped"
	model?: string
	device?: string
	framesSampled?: number
	scoredClipCount: number
	requestedClipCount: number
	error?: string
	pythonPath?: string
	usedProjectVenv: boolean
}

type CvBatchScore = {
	id: string
	cvScore: number
	positiveSimilarity?: number
	negativeSimilarity?: number
	error?: string
}

type CvBatchResponse = {
	scores: CvBatchScore[]
	model?: string
	device?: string
	framesSampled?: number
	error?: string
}

function runPythonScorer(payload: object): Promise<CvBatchResponse> {
	return new Promise((resolve, reject) => {
		const { python } = resolvePythonExecutable()
		const child = spawn(python, [SCORER_SCRIPT], {
			cwd: PY_DIR,
			stdio: ["pipe", "pipe", "pipe"],
		})

		let stdout = ""
		let stderr = ""
		let timedOut = false

		const timer = setTimeout(() => {
			timedOut = true
			child.kill("SIGTERM")
		}, SCORER_TIMEOUT_MS)

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString()
		})
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
		})

		child.on("error", (error) => {
			clearTimeout(timer)
			reject(error)
		})

		child.on("close", (code) => {
			clearTimeout(timer)

			if (timedOut) {
				reject(
					new Error(
						`CV scorer timed out after ${SCORER_TIMEOUT_MS / 60000} minutes`
					)
				)
				return
			}

			if (code !== 0) {
				let message = stderr.trim() || `CV scorer exited with code ${code}`
				try {
					const parsed = JSON.parse(stderr) as { error?: string }
					if (parsed.error) message = parsed.error
				} catch {
					// use raw stderr
				}
				reject(new Error(message))
				return
			}

			try {
				const parsed = JSON.parse(stdout) as CvBatchResponse
				if (parsed.error) {
					reject(new Error(parsed.error))
					return
				}
				resolve(parsed)
			} catch {
				reject(
					new Error(
						`Invalid CV scorer output: ${stdout.slice(0, 300) || "(empty)"}`
					)
				)
			}
		})

		child.stdin.write(JSON.stringify(payload))
		child.stdin.end()
	})
}

export type ClipFileToScore = {
	clipFile: string
	clipPath: string
}

export type CvScoringRunResult = {
	details: Map<string, CvScoreDetail>
	meta: CvScoringMeta
}

/** Score all final clip files in clips/ in a single Python run (one model load). */
export async function scoreClipFilesWithCv(
	clips: ClipFileToScore[],
	settings: SmartEditingSettings
): Promise<CvScoringRunResult> {
	const { python, usingVenv } = resolvePythonExecutable()

	const emptyMeta = (status: CvScoringMeta["status"], error?: string): CvScoringMeta => ({
		status,
		scoredClipCount: 0,
		requestedClipCount: clips.length,
		error,
		pythonPath: python,
		usedProjectVenv: usingVenv,
	})

	if (!usesComputerVision(settings) || clips.length === 0) {
		return { details: new Map(), meta: emptyMeta("skipped") }
	}

	if (!fs.existsSync(SCORER_SCRIPT)) {
		return {
			details: new Map(),
			meta: emptyMeta(
				"failed",
				"CV scorer not found at lib/py/cv_scorer.py. Run npm run setup-app."
			),
		}
	}

	const missing = clips.filter((clip) => !fs.existsSync(clip.clipPath))
	if (missing.length > 0) {
		return {
			details: new Map(),
			meta: emptyMeta(
				"failed",
				`Clip file(s) missing on disk: ${missing.map((c) => c.clipFile).join(", ")}`
			),
		}
	}

	if (!usingVenv) {
		console.warn(
			"lib/py/.venv not found — using system Python for CV. Run npm run setup-app for a reliable environment."
		)
	}

	try {
		const payload = {
			positive: settings.positivePrompt,
			negative: settings.negativePrompt,
			clips: clips.map((clip) => ({
				id: clip.clipFile,
				video: path.resolve(clip.clipPath),
			})),
		}

		const response = await runPythonScorer(payload)
		const details = new Map<string, CvScoreDetail>()
		let scored = 0

		for (const entry of response.scores ?? []) {
			if (entry.error) {
				details.set(entry.id, {
					cvScore: 0,
					positiveSimilarity: 0,
					negativeSimilarity: 0,
					error: entry.error,
				})
				continue
			}

			details.set(entry.id, {
				cvScore: entry.cvScore,
				positiveSimilarity: entry.positiveSimilarity ?? 0,
				negativeSimilarity: entry.negativeSimilarity ?? 0,
			})
			scored++
		}

		const status =
			scored === clips.length ? "complete" : scored > 0 ? "partial" : "failed"

		return {
			details,
			meta: {
				status,
				model: response.model,
				device: response.device,
				framesSampled: response.framesSampled,
				scoredClipCount: scored,
				requestedClipCount: clips.length,
				pythonPath: python,
				usedProjectVenv: usingVenv,
			},
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "CV scoring failed unexpectedly"
		return {
			details: new Map(),
			meta: emptyMeta("failed", message),
		}
	}
}

export async function checkCvScorer(): Promise<boolean> {
	if (!isCvScoringAvailable()) {
		return false
	}

	try {
		const { python } = resolvePythonExecutable()
		await new Promise<void>((resolve, reject) => {
			const child = spawn(python, [SCORER_SCRIPT, "--check"], {
				cwd: PY_DIR,
				stdio: ["ignore", "pipe", "pipe"],
			})
			let stderr = ""
			child.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString()
			})
			child.on("close", (code) => {
				if (code === 0) resolve()
				else reject(new Error(stderr || `check failed with code ${code}`))
			})
			child.on("error", reject)
		})
		return true
	} catch {
		return false
	}
}
