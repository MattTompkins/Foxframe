import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { PROJECTS_DIR, readManifest } from "@/lib/manifest"
import { filterVideoFiles } from "@/lib/video-files"

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
		const fromManifest = manifest?.sourceFiles ?? []
		const { videoFiles } = filterVideoFiles(fromManifest)

		return NextResponse.json({ sourceFiles: videoFiles })
	} catch (error) {
		console.error("GET sources error:", error)
		return NextResponse.json(
			{ error: "Failed to load source files" },
			{ status: 500 }
		)
	}
}
