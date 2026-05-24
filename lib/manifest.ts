import fs from "fs/promises"
import path from "path"
import { mergeVideoSettings, type VideoSettings } from "@/lib/video-settings"
import {
	mergeSmartEditingSettings,
	type SmartEditingSettings,
} from "@/lib/smart-editing-settings"
import { CLIP_SEGMENT_LEGEND, type ClipSegment } from "@/lib/clip-segments"
import type { CvScoringMeta } from "@/lib/cv-scorer"

export const PROJECTS_DIR = path.join(process.cwd(), "storage/projects")

export type Manifest = {
	projectId?: string
	name?: string
	slug?: string
	sourceFiles: string[]
	settings?: Partial<VideoSettings>
	smartEditing?: Partial<SmartEditingSettings>
	processedFiles?: string[]
	clips?: string[]
	/** Top picks by finalScore (subset of clips) for a future combined edit */
	selectedClips?: string[]
	clipSegments?: ClipSegment[]
	clipSegmentLegend?: typeof CLIP_SEGMENT_LEGEND
	/** Summary of the last CLIP scoring run on files in clips/ */
	cvScoring?: CvScoringMeta
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

export function getSmartEditingSettingsFromManifest(
	manifest: Manifest | null
): SmartEditingSettings {
	return mergeSmartEditingSettings(manifest?.smartEditing)
}