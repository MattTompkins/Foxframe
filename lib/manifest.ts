import fs from "fs/promises"
import path from "path"
import { mergeVideoSettings, type VideoSettings } from "@/lib/video-settings"

export const PROJECTS_DIR = path.join(process.cwd(), "storage/projects")

export type Manifest = {
	projectId?: string
	name?: string
	slug?: string
	sourceFiles: string[]
	settings?: Partial<VideoSettings>
	processedFiles?: string[]
}

export function manifestPath(projectId: string) {
	return path.join(PROJECTS_DIR, projectId, "manifest.json")
}

export async function readManifest(projectId: string): Promise<Manifest | null> {
	try {
		const raw = await fs.readFile(manifestPath(projectId), "utf-8")
		return JSON.parse(raw) as Manifest
	} catch (err: unknown) {
		if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
			return null
		}
		throw err
	}
}

export async function writeManifest(projectId: string, manifest: Manifest) {
	const projectDir = path.join(PROJECTS_DIR, projectId)
	await fs.mkdir(projectDir, { recursive: true })
	await fs.writeFile(manifestPath(projectId), JSON.stringify(manifest, null, 2))
}

export function getVideoSettingsFromManifest(
	manifest: Manifest | null
): VideoSettings {
	return mergeVideoSettings(manifest?.settings)
}