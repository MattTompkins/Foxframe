import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { isVideoFileName, VIDEO_EXTENSIONS_LABEL } from "@/lib/video-files"

const PROJECTS_DIR = path.join(process.cwd(), "storage/projects")

type Manifest = {
	sourceFiles: string[]
}

export async function POST(
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

		const formData = await req.formData()
		const file = formData.get("file") as File | null
		const renumberFiles = formData.get("renumberFiles") === "true"

		if (!file) {
			return NextResponse.json(
				{ error: "No file provided" },
				{ status: 400 }
			)
		}

		if (!isVideoFileName(file.name)) {
			return NextResponse.json(
				{
					error: `"${file.name}" is not a supported video file. Allowed formats: ${VIDEO_EXTENSIONS_LABEL}`,
				},
				{ status: 400 }
			)
		}

		const projectDir = path.join(PROJECTS_DIR, projectId)
		const manifestPath = path.join(projectDir, "manifest.json")

		await fs.mkdir(projectDir, { recursive: true })

		let manifest: Manifest = { sourceFiles: [] }
		try {
			const existing = await fs.readFile(manifestPath, "utf-8")
			manifest = JSON.parse(existing)
		} catch {
			// ignore missing file
		}

		const buffer = Buffer.from(await file.arrayBuffer())
		const ext = path.extname(file.name)
		const fileName = renumberFiles
			? `${manifest.sourceFiles.length + 1}${ext}`
			: file.name

		await fs.writeFile(path.join(projectDir, fileName), buffer)
		manifest.sourceFiles.push(fileName)

		await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))

		return NextResponse.json({
			message: "File uploaded successfully",
			fileName,
		})
	} catch (error) {
		console.error("UPLOAD ERROR:", error)
		return NextResponse.json(
			{ error: "Upload failed" },
			{ status: 500 }
		)
	}
}