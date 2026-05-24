import { NextResponse } from "next/server"
import {
	createEdit,
	listEdits,
	ProjectNotFoundError,
} from "@/lib/edit"

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

		const edits = await listEdits(projectId)

		return NextResponse.json({ edits })
	} catch (error) {
		if (error instanceof ProjectNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 })
		}
		console.error("GET edits error:", error)
		return NextResponse.json(
			{ error: "Failed to list edits" },
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

		const body = (await req.json().catch(() => ({}))) as {
			name?: string
			seedFromManifest?: boolean
		}

		const edit = await createEdit(projectId, {
			name: body.name,
			seedFromManifest: body.seedFromManifest !== false,
		})

		return NextResponse.json({ edit }, { status: 201 })
	} catch (error) {
		if (error instanceof ProjectNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 })
		}
		console.error("POST edits error:", error)
		return NextResponse.json(
			{ error: "Failed to create edit" },
			{ status: 500 }
		)
	}
}
