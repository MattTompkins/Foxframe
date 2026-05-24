import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { isVideoFileName, VIDEO_EXTENSIONS_LABEL } from "@/lib/video-files"

const PROJECTS_DIR = path.join(process.cwd(), "storage/projects")
const INDEX_FILE = path.join(process.cwd(), "storage/projects.json")

type Manifest = {
	sourceFiles: string[]
}

export async function DELETE(
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
		const projectPath = path.join(PROJECTS_DIR, projectId)

		try {
			await fs.access(projectPath)
		} catch (err) {
			return NextResponse.json(
				{ error: "Project not found" },
				{ status: 404 }
			)
		}

		await fs.rm(projectPath, { recursive: true, force: true })

		let projects: { id: string }[] = []

		try {
			const projectsData = await fs.readFile(INDEX_FILE, "utf-8")
			projects = JSON.parse(projectsData) as { id: string }[]
		} catch (err: unknown) {
			if (
				err &&
				typeof err === "object" &&
				"code" in err &&
				err.code !== "ENOENT"
			) {
				throw err
			}
		}

		const updated = projects.filter((project) => project.id !== projectId)
		await fs.writeFile(INDEX_FILE, JSON.stringify(updated, null, 2))

		return NextResponse.json({ message: "Project deleted successfully" })
	} catch (error) {
		console.error("DELETE project error:", error)
		return NextResponse.json(
			{ error: "Failed to delete project" },
			{ status: 500 }
		)
	}
}