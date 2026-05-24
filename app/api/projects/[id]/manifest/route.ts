import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { enrichClipSegments } from "@/lib/clip-scores"
import {
	getSmartEditingSettingsFromManifest,
	PROJECTS_DIR,
	readManifest,
} from "@/lib/manifest"
import { normalizeClipSegment } from "@/lib/clip-segments"

export async function GET(
	_req: Request,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id: projectId } = await context.params

		if (!projectId) {
			return NextResponse.json(
				{ error: "Missing project ID" },
				{ status: 400 }
			)
		}

		const projectDir = path.join(PROJECTS_DIR, projectId)

		try {
			await fs.access(projectDir)
		} catch {
			return NextResponse.json(
				{ error: "Project not found" },
				{ status: 404 }
			)
		}

		const manifest = await readManifest(projectId)

		if (!manifest) {
			return NextResponse.json(
				{ error: "Project not found" },
				{ status: 404 }
			)
		}

		const smartEditing = getSmartEditingSettingsFromManifest(manifest)
		const normalized = (manifest.clipSegments ?? []).map((segment) =>
			normalizeClipSegment(segment as unknown as Record<string, unknown>)
		)
		const clipSegments = enrichClipSegments(
			normalized,
			smartEditing.clipsPerSourceFile
		)

		return NextResponse.json({
			clips: manifest.clips ?? [],
			clipSegments,
			selectedClips: manifest.selectedClips ?? [],
		})
	} catch (error) {
		console.error("GET manifest error:", error)
		return NextResponse.json(
			{ error: "Failed to load manifest" },
			{ status: 500 }
		)
	}
}
