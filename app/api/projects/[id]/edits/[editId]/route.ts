import { NextResponse } from "next/server"
import {
	EditNotFoundError,
	normalizeProjectEdit,
	ProjectNotFoundError,
	readEdit,
	writeEdit,
	deleteEdit,
	type ProjectEdit,
} from "@/lib/edit"

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

		const edit = await readEdit(projectId, editId)

		return NextResponse.json({ edit })
	} catch (error) {
		if (error instanceof ProjectNotFoundError || error instanceof EditNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 })
		}
		console.error("GET edit error:", error)
		return NextResponse.json(
			{ error: "Failed to load edit" },
			{ status: 500 }
		)
	}
}

export async function PUT(
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

		const body = (await req.json()) as ProjectEdit

		if (!body || typeof body !== "object") {
			return NextResponse.json(
				{ error: "Missing edit in request body" },
				{ status: 400 }
			)
		}

		if (body.id !== editId || body.projectId !== projectId) {
			return NextResponse.json(
				{ error: "Edit id or projectId does not match URL" },
				{ status: 400 }
			)
		}

		const existing = await readEdit(projectId, editId)
		const edit = normalizeProjectEdit({
			...body,
			createdAt: existing.createdAt,
		})

		const saved = await writeEdit(edit)

		return NextResponse.json({ edit: saved })
	} catch (error) {
		if (error instanceof ProjectNotFoundError || error instanceof EditNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 })
		}
		console.error("PUT edit error:", error)
		return NextResponse.json(
			{ error: "Failed to save edit" },
			{ status: 500 }
		)
	}
}

export async function DELETE(
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

		await deleteEdit(projectId, editId)

		return NextResponse.json({ message: "Edit deleted" })
	} catch (error) {
		if (error instanceof ProjectNotFoundError || error instanceof EditNotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 })
		}
		console.error("DELETE edit error:", error)
		return NextResponse.json(
			{ error: "Failed to delete edit" },
			{ status: 500 }
		)
	}
}
