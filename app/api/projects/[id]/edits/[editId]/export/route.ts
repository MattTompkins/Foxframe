import { NextResponse } from "next/server"
import {
	EditNotFoundError,
	ProjectNotFoundError,
	readEdit,
} from "@/lib/edit"
import {
	exportEditVideo,
	readEditExportMeta,
} from "@/lib/edit-export"
import { readManifest } from "@/lib/manifest"
import path from "path"
import fs from "fs/promises"
import type { VideoSettings } from "@/lib/video-settings"

const INDEX_FILE = path.join(process.cwd(), "storage/projects.json")

async function projectSlug(projectId: string) {
	try {
		const indexData = await fs.readFile(INDEX_FILE, "utf-8")
		const projects = JSON.parse(indexData) as { id: string; slug?: string }[]
		const entry = projects.find((project) => project.id === projectId)
		if (entry?.slug) return entry.slug
	} catch {
		// fall through
	}

	const manifest = await readManifest(projectId)
	return manifest?.slug ?? projectId
}

export async function GET(
	_req: Request,
	context: { params: Promise<{ id: string; editId: string }> }
) {
	try {
		const { id: projectId, editId } = await context.params

		if (!projectId || !editId) {
			return NextResponse.json(
				{ error: "Missing project or edit ID" },
				{ status: 400 }
			)
		}

		await readEdit(projectId, editId)
		const exportMeta = await readEditExportMeta(projectId, editId)

		if (!exportMeta) {
			return NextResponse.json({ export: null })
		}

		return NextResponse.json({
			export: exportMeta,
			downloadUrl: `/api/projects/${projectId}/edits/${editId}/export/download`,
		})
	} catch (error) {
		if (error instanceof ProjectNotFoundError || error instanceof EditNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 })
		}
		console.error("GET edit export error:", error)
		return NextResponse.json(
			{ error: "Failed to load export" },
			{ status: 500 }
		)
	}
}

export async function POST(
	req: Request,
	context: { params: Promise<{ id: string; editId: string }> }
) {
	try {
		const { id: projectId, editId } = await context.params

		if (!projectId || !editId) {
			return NextResponse.json(
				{ error: "Missing project or edit ID" },
				{ status: 400 }
			)
		}

		const body = (await req.json().catch(() => ({}))) as {
			settingsOverrides?: Partial<VideoSettings>
		}

		const slug = await projectSlug(projectId)

		const exportMeta = await exportEditVideo({
			projectId,
			editId,
			projectSlug: slug,
			settingsOverrides: body.settingsOverrides,
		})

		return NextResponse.json({
			export: exportMeta,
			downloadUrl: `/api/projects/${projectId}/edits/${editId}/export/download`,
		})
	} catch (error) {
		if (error instanceof ProjectNotFoundError || error instanceof EditNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 })
		}
		if (error instanceof Error) {
			return NextResponse.json({ error: error.message }, { status: 400 })
		}
		console.error("POST edit export error:", error)
		return NextResponse.json(
			{ error: "Failed to export edit" },
			{ status: 500 }
		)
	}
}
