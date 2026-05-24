import { createReadStream } from "fs"
import fs from "fs/promises"
import path from "path"
import mime from "mime"
import { Readable } from "stream"
import {
	EditNotFoundError,
	ProjectNotFoundError,
	editDir,
	readEdit,
} from "@/lib/edit"
import { readEditExportMeta } from "@/lib/edit-export"

function nodeStreamToWeb(stream: Readable) {
	return Readable.toWeb(stream) as ReadableStream
}

export async function GET(
	_req: Request,
	context: { params: Promise<{ id: string; editId: string }> }
) {
	try {
		const { id: projectId, editId } = await context.params

		if (!projectId || !editId) {
			return new Response("Missing project or edit ID", { status: 400 })
		}

		await readEdit(projectId, editId)

		const meta = await readEditExportMeta(projectId, editId)
		if (!meta) {
			return new Response("Export not found", { status: 404 })
		}

		const filePath = path.join(editDir(projectId, editId), meta.storageFile)

		let stat
		try {
			stat = await fs.stat(filePath)
		} catch {
			return new Response("Export file not found", { status: 404 })
		}

		const contentType = mime.getType(filePath) ?? "application/octet-stream"
		const stream = createReadStream(filePath)

		return new Response(nodeStreamToWeb(stream), {
			headers: {
				"Content-Type": contentType,
				"Content-Length": String(stat.size),
				"Content-Disposition": `attachment; filename="${meta.filename}"`,
				"Cache-Control": "private, no-cache",
			},
		})
	} catch (error) {
		if (error instanceof ProjectNotFoundError || error instanceof EditNotFoundError) {
			return new Response(error.message, { status: 404 })
		}
		console.error("GET export download error:", error)
		return new Response("Internal Server Error", { status: 500 })
	}
}
