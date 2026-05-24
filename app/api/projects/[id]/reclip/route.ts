import { NextResponse } from "next/server"
import {
	isProcessing,
	readProcessStatus,
} from "@/lib/process-status"
import { reclipProjectVideos } from "@/lib/video-processor"

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

		void reclipProjectVideos(projectId)

		return NextResponse.json(
			{ message: "Clipping started" },
			{ status: 202 }
		)
	} catch (error) {
		console.error("POST RECLIP ERROR:", error)
		return NextResponse.json(
			{ error: "Failed to start clipping" },
			{ status: 500 }
		)
	}
}
