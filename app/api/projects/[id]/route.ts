import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { PROJECTS_DIR, readManifest } from "@/lib/manifest"

const INDEX_FILE = path.join(process.cwd(), "storage/projects.json")

type ProjectIndexEntry = {
	id: string
	name?: string
	slug?: string
	createdAt?: string
	updatedAt?: string
}

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

		const projectPath = path.join(PROJECTS_DIR, projectId)

		try {
			await fs.access(projectPath)
		} catch {
			return NextResponse.json(
				{ error: "Project not found" },
				{ status: 404 }
			)
		}

		let indexEntry: ProjectIndexEntry | undefined

		try {
			const indexData = await fs.readFile(INDEX_FILE, "utf-8")
			const projects = JSON.parse(indexData) as ProjectIndexEntry[]
			indexEntry = projects.find((project) => project.id === projectId)
		} catch (err: unknown) {
			if (
				!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")
			) {
				throw err
			}
		}

		const manifest = await readManifest(projectId)

		return NextResponse.json({
			id: projectId,
			name:
				indexEntry?.name ??
				manifest?.name ??
				`Project ${projectId.slice(0, 8)}`,
			slug: indexEntry?.slug ?? manifest?.slug ?? projectId,
			createdAt: indexEntry?.createdAt,
			updatedAt: indexEntry?.updatedAt,
		})
	} catch (error) {
		console.error("GET project error:", error)
		return NextResponse.json(
			{ error: "Failed to load project" },
			{ status: 500 }
		)
	}
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