import { NextRequest, NextResponse } from "next/server"
import { createReadStream } from "fs"
import fs from "fs/promises"
import path from "path"
import mime from "mime"
import { Readable } from "stream"
import { PROJECTS_DIR } from "@/lib/manifest"

const VIDEO_CONTENT_TYPES: Record<string, string> = {
	".mp4": "video/mp4",
	".m4v": "video/mp4",
	".mov": "video/quicktime",
	".webm": "video/webm",
	".avi": "video/x-msvideo",
	".mkv": "video/x-matroska",
	".mpeg": "video/mpeg",
	".mpg": "video/mpeg",
	".3gp": "video/3gpp",
}

function videoContentType(filePath: string) {
	const ext = path.extname(filePath).toLowerCase()
	return VIDEO_CONTENT_TYPES[ext] ?? mime.getType(filePath) ?? "application/octet-stream"
}

function resolveMediaFile(projectId: string, pathSegments: string[]) {
	const relativePath = pathSegments
		.map((segment) => decodeURIComponent(segment))
		.join("/")

	if (!relativePath || relativePath.includes("..")) {
		return null
	}

	const projectRoot = path.resolve(path.join(PROJECTS_DIR, projectId))
	let filePath: string

	if (relativePath.startsWith("clips/")) {
		const clipFile = relativePath.slice("clips/".length)
		if (!clipFile || clipFile.includes("/") || path.basename(clipFile) !== clipFile) {
			return null
		}
		filePath = path.resolve(path.join(projectRoot, "clips", clipFile))
	} else if (path.basename(relativePath) === relativePath) {
		filePath = path.resolve(path.join(projectRoot, relativePath))
	} else {
		return null
	}

	if (!filePath.startsWith(projectRoot + path.sep) && filePath !== projectRoot) {
		return null
	}

	return { fileName: relativePath, filePath }
}

function nodeStreamToWeb(stream: Readable) {
	return Readable.toWeb(stream) as ReadableStream
}

export async function GET(
	req: NextRequest,
	context: { params: Promise<{ id: string; path: string[] }> }
) {
	try {
		const { id: projectId, path: pathSegments } = await context.params

		if (!projectId) {
			return new Response("Missing project ID", { status: 400 })
		}

		const resolved = resolveMediaFile(projectId, pathSegments)
		if (!resolved) {
			return new Response("Forbidden", { status: 403 })
		}

		const { filePath } = resolved
		let stat

		try {
			stat = await fs.stat(filePath)
		} catch {
			return new Response("Not found", { status: 404 })
		}

		if (!stat.isFile()) {
			return new Response("Not found", { status: 404 })
		}

		const contentType = videoContentType(filePath)
		const rangeHeader = req.headers.get("range")

		if (rangeHeader) {
			const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
			if (!match) {
				return new Response("Invalid range", { status: 416 })
			}

			const size = stat.size
			let start = match[1] ? parseInt(match[1], 10) : 0
			let end = match[2] ? parseInt(match[2], 10) : size - 1

			if (Number.isNaN(start) || Number.isNaN(end) || start >= size) {
				return new Response(null, {
					status: 416,
					headers: { "Content-Range": `bytes */${size}` },
				})
			}

			end = Math.min(end, size - 1)
			const chunkSize = end - start + 1
			const stream = createReadStream(filePath, { start, end })

			return new NextResponse(nodeStreamToWeb(stream), {
				status: 206,
				headers: {
					"Content-Type": contentType,
					"Content-Length": String(chunkSize),
					"Content-Range": `bytes ${start}-${end}/${size}`,
					"Accept-Ranges": "bytes",
					"Cache-Control": "private, max-age=3600",
				},
			})
		}

		const stream = createReadStream(filePath)

		return new NextResponse(nodeStreamToWeb(stream), {
			headers: {
				"Content-Type": contentType,
				"Content-Length": String(stat.size),
				"Accept-Ranges": "bytes",
				"Cache-Control": "private, max-age=3600",
			},
		})
	} catch (error) {
		console.error("GET media error:", error)
		return new Response("Internal Server Error", { status: 500 })
	}
}
