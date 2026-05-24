import fs from "fs/promises"
import path from "path"
import {
	INITIAL_PROCESS_STATUS,
	type ProcessStatus,
} from "@/lib/process-stages"
import { PROJECTS_DIR } from "@/lib/manifest"

const projectLocks = new Map<string, Promise<unknown>>()

export function processStatusPath(projectId: string) {
	return path.join(PROJECTS_DIR, projectId, "process-status.json")
}

function withProjectLock<T>(
	projectId: string,
	fn: () => Promise<T>
): Promise<T> {
	const prev = projectLocks.get(projectId) ?? Promise.resolve()
	const next = prev.then(fn, fn)
	projectLocks.set(projectId, next)
	return next.finally(() => {
		if (projectLocks.get(projectId) === next) {
			projectLocks.delete(projectId)
		}
	})
}

async function readProcessStatusUnsafe(
	projectId: string
): Promise<ProcessStatus> {
	const filePath = processStatusPath(projectId)

	try {
		const raw = await fs.readFile(filePath, "utf-8")
		return JSON.parse(raw) as ProcessStatus
	} catch (err: unknown) {
		if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
			return { ...INITIAL_PROCESS_STATUS }
		}

		if (err instanceof SyntaxError) {
			const corruptPath = `${filePath}.corrupt`
			try {
				await fs.rename(filePath, corruptPath)
			} catch {
				// Best-effort backup of corrupt status file.
			}
			console.warn(
				`Corrupt process-status.json for project ${projectId}; reset to idle. Backup: ${corruptPath}`
			)
			return { ...INITIAL_PROCESS_STATUS }
		}

		throw err
	}
}

async function writeProcessStatusUnsafe(
	projectId: string,
	status: ProcessStatus
) {
	const projectDir = path.join(PROJECTS_DIR, projectId)
	const filePath = processStatusPath(projectId)
	const tempPath = `${filePath}.tmp`

	await fs.mkdir(projectDir, { recursive: true })
	await fs.writeFile(tempPath, JSON.stringify(status, null, 2))
	await fs.rename(tempPath, filePath)
}

export async function readProcessStatus(
	projectId: string
): Promise<ProcessStatus> {
	return withProjectLock(projectId, () => readProcessStatusUnsafe(projectId))
}

export async function writeProcessStatus(
	projectId: string,
	status: ProcessStatus
) {
	return withProjectLock(projectId, () =>
		writeProcessStatusUnsafe(projectId, status)
	)
}

export async function updateProcessStatus(
	projectId: string,
	patch: Partial<ProcessStatus>
) {
	return withProjectLock(projectId, async () => {
		const current = await readProcessStatusUnsafe(projectId)
		const next = { ...current, ...patch }
		await writeProcessStatusUnsafe(projectId, next)
		return next
	})
}

export async function patchProcessStatus(
	projectId: string,
	patcher: (current: ProcessStatus) => ProcessStatus
) {
	return withProjectLock(projectId, async () => {
		const current = await readProcessStatusUnsafe(projectId)
		const next = patcher(current)
		await writeProcessStatusUnsafe(projectId, next)
		return next
	})
}

export function isProcessing(status: ProcessStatus) {
	return ["preparing", "analysing", "processing", "finalizing"].includes(
		status.stage
	)
}
