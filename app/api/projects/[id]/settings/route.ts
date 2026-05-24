import { NextResponse } from "next/server"
import {
	getVideoSettingsFromManifest,
	readManifest,
	writeManifest,
} from "@/lib/manifest"
import { mergeVideoSettings, type VideoSettings } from "@/lib/video-settings"

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

		const manifest = await readManifest(projectId)

		if (!manifest) {
			return NextResponse.json(
				{ error: "Project not found" },
				{ status: 404 }
			)
		}

		return NextResponse.json({
			settings: getVideoSettingsFromManifest(manifest),
		})
	} catch (error) {
		console.error("GET SETTINGS ERROR:", error)
		return NextResponse.json(
			{ error: "Failed to load settings" },
			{ status: 500 }
		)
	}
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

		const body = (await req.json()) as { settings?: Partial<VideoSettings> }

		if (!body.settings || typeof body.settings !== "object") {
			return NextResponse.json(
				{ error: "Missing settings in request body" },
				{ status: 400 }
			)
		}

		const manifest = await readManifest(projectId)

		if (!manifest) {
			return NextResponse.json(
				{ error: "Project not found" },
				{ status: 404 }
			)
		}

		const settings = mergeVideoSettings(body.settings)
		manifest.settings = settings

		await writeManifest(projectId, manifest)

		return NextResponse.json({
			message: "Settings saved successfully",
			settings,
		})
	} catch (error) {
		console.error("POST SETTINGS ERROR:", error)
		return NextResponse.json(
			{ error: "Failed to save settings" },
			{ status: 500 }
		)
	}
}
