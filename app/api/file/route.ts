import { NextRequest } from "next/server"
import fs from "fs"
import path from "path"
import mime from "mime"

const STORAGE_ROOT = path.join(process.cwd(), "storage")

export async function GET(
	req: NextRequest,
	{ params }: { params: { path: string[] } }
) {
	try {

		const relativePath = params.path.join("/")

		const filePath = path.join(STORAGE_ROOT, relativePath)

		const normalized = path.normalize(filePath)

		if (!normalized.startsWith(STORAGE_ROOT)) {
			return new Response("Forbidden", { status: 403 })
		}

		if (!fs.existsSync(normalized)) {
			return new Response("Not found", { status: 404 })
		}

		const fileBuffer = fs.readFileSync(normalized)

		const contentType =
			mime.getType(normalized) || "application/octet-stream"

		return new Response(fileBuffer, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=31536000, immutable",
			},
		})
	} catch (err) {
		console.error(err)

		return new Response("Internal Server Error", {
			status: 500,
		})
	}
}