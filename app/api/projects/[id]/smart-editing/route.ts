import { NextResponse } from "next/server"
import {
	getSmartEditingSettingsFromManifest,
	readManifest,
	writeManifest,
} from "@/lib/manifest"
import {
	mergeSmartEditingSettings,
	type SmartEditingSettings,
} from "@/lib/smart-editing-settings"

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
			smartEditing: getSmartEditingSettingsFromManifest(manifest),
			hasProcessedFiles: (manifest.processedFiles?.length ?? 0) > 0,
			processedFileCount: manifest.processedFiles?.length ?? 0,
		})
	} catch (error) {
		console.error("GET SMART EDITING ERROR:", error)
		return NextResponse.json(
			{ error: "Failed to load smart editing settings" },
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

		const body = (await req.json()) as {
			smartEditing?: Partial<SmartEditingSettings>
		}

		if (!body.smartEditing || typeof body.smartEditing !== "object") {
			return NextResponse.json(
				{ error: "Missing smartEditing in request body" },
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

		const smartEditing = mergeSmartEditingSettings(body.smartEditing)
		manifest.smartEditing = smartEditing

		await writeManifest(projectId, manifest)

		return NextResponse.json({
			message: "Smart editing settings saved successfully",
			smartEditing,
		})
	} catch (error) {
		console.error("POST SMART EDITING ERROR:", error)
		return NextResponse.json(
			{ error: "Failed to save smart editing settings" },
			{ status: 500 }
		)
	}
}
