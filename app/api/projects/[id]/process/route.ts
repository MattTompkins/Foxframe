import { NextResponse } from "next/server"
import {
	isProcessing,
	readProcessStatus,
} from "@/lib/process-status"
import { processProjectVideos } from "@/lib/video-processor"

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

		const status = await readProcessStatus(projectId)
		return NextResponse.json({ status })
	} catch (error) {
		console.error("GET PROCESS STATUS ERROR:", error)
		return NextResponse.json(
			{ error: "Failed to load process status" },
			{ status: 500 }
		)
	}
}

export async function POST(
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

		const current = await readProcessStatus(projectId)

		if (isProcessing(current)) {
			return NextResponse.json(
				{ message: "Processing already in progress", status: current },
				{ status: 409 }
			)
		}

		void processProjectVideos(projectId)

		return NextResponse.json(
			{ message: "Processing started" },
			{ status: 202 }
		)
	} catch (error) {
		console.error("POST PROCESS ERROR:", error)
		return NextResponse.json(
			{ error: "Failed to start processing" },
			{ status: 500 }
		)
	}
}
