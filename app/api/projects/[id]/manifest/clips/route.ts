import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { enrichClipSegments, roundScore } from "@/lib/clip-scores"
import { normalizeClipSegment } from "@/lib/clip-segments"
import {
	getSmartEditingSettingsFromManifest,
	PROJECTS_DIR,
	readManifest,
	writeManifest,
} from "@/lib/manifest"

type ClipUpdateBody = {
	clipFile?: string
	startSeconds?: number
	endSeconds?: number
	manualFinalScore?: number
}

function clampScore(value: number) {
	return roundScore(Math.max(0, Math.min(1, value)))
}

export async function PATCH(
	req: Request,
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

		const body = (await req.json()) as ClipUpdateBody

		if (!body.clipFile || typeof body.clipFile !== "string") {
			return NextResponse.json(
				{ error: "Missing clipFile in request body" },
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

		const segments = manifest.clipSegments ?? []
		const index = segments.findIndex(
			(segment) => segment.clipFile === body.clipFile
		)

		if (index === -1) {
			return NextResponse.json(
				{ error: "Clip not found in manifest" },
				{ status: 404 }
			)
		}

		const segment = normalizeClipSegment(
			segments[index] as unknown as Record<string, unknown>
		)

		if (body.startSeconds !== undefined) {
			if (
				typeof body.startSeconds !== "number" ||
				!Number.isFinite(body.startSeconds) ||
				body.startSeconds < 0
			) {
				return NextResponse.json(
					{ error: "Invalid startSeconds" },
					{ status: 400 }
				)
			}
			segment.startSeconds = roundScore(body.startSeconds)
		}

		if (body.endSeconds !== undefined) {
			if (
				typeof body.endSeconds !== "number" ||
				!Number.isFinite(body.endSeconds) ||
				body.endSeconds < 0
			) {
				return NextResponse.json(
					{ error: "Invalid endSeconds" },
					{ status: 400 }
				)
			}
			segment.endSeconds = roundScore(body.endSeconds)
		}

		if (segment.endSeconds <= segment.startSeconds) {
			return NextResponse.json(
				{ error: "endSeconds must be greater than startSeconds" },
				{ status: 400 }
			)
		}

		segment.durationSeconds = roundScore(
			segment.endSeconds - segment.startSeconds
		)

		if (body.manualFinalScore !== undefined) {
			if (
				typeof body.manualFinalScore !== "number" ||
				!Number.isFinite(body.manualFinalScore)
			) {
				return NextResponse.json(
					{ error: "Invalid manualFinalScore" },
					{ status: 400 }
				)
			}
			segment.manualFinalScore = clampScore(body.manualFinalScore)
			segment.finalScore = segment.manualFinalScore
			segment.finalScoreSource = "manual"
		}

		segments[index] = segment

		const smartEditing = getSmartEditingSettingsFromManifest(manifest)
		manifest.clipSegments = enrichClipSegments(
			segments.map((entry) =>
				normalizeClipSegment(entry as unknown as Record<string, unknown>)
			),
			smartEditing.clipsPerSourceFile
		)

		await writeManifest(projectId, manifest)

		const updated = manifest.clipSegments.find(
			(entry) => entry.clipFile === body.clipFile
		)

		return NextResponse.json({ segment: updated })
	} catch (error) {
		console.error("PATCH manifest clip error:", error)
		return NextResponse.json(
			{ error: "Failed to update clip metadata" },
			{ status: 500 }
		)
	}
}
