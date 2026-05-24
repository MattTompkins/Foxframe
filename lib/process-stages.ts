import type { LucideIcon } from "lucide-react"
import {
	CheckCircle2,
	Circle,
	Video,
	FileSearch,
	Loader2,
	Settings2,
	XCircle,
	FolderCheck,
	Scissors,
	ScanEye,
	ListChecks,
} from "lucide-react"

export type ProcessStage =
	| "idle"
	| "preparing"
	| "analysing"
	| "processing"
	| "saving"
	| "clip-analysing"
	| "clip-cutting"
	| "clip-cv-scoring"
	| "clip-selecting"
	| "complete"
	| "error"

export type FileProcessStage =
	| "waiting"
	| "analysing"
	| "encoding"
	| "done"
	| "failed"
	| "skipped"

export type FileProcessStatus = {
	fileName: string
	stage: FileProcessStage
	progress: number
	outputFile?: string
	error?: string
}

export type ProcessStatus = {
	stage: ProcessStage
	startedAt?: string
	completedAt?: string
	overallProgress: number
	currentFile?: string
	message?: string
	error?: string
	failedAtStage?: ProcessStage
	files: FileProcessStatus[]
	outputFiles: string[]
	clipFiles?: string[]
}

export const INITIAL_PROCESS_STATUS: ProcessStatus = {
	stage: "idle",
	overallProgress: 0,
	files: [],
	outputFiles: [],
}

export type StageMeta = {
	id: ProcessStage
	label: string
	description: string
	icon: LucideIcon
}

export const PIPELINE_STAGES: StageMeta[] = [
	{
		id: "preparing",
		label: "Preparing project",
		description: "Loading your uploaded files and saved output settings.",
		icon: Settings2,
	},
	{
		id: "analysing",
		label: "Analysing source files",
		description:
			"Reading each video's dimensions, rotation, and duration before processing.",
		icon: FileSearch,
	},
	{
		id: "processing",
		label: "Processing video formatting",
		description:
			"Applying lens correction, reframing to your aspect ratio, and correctly encoding each clip.",
		icon: Video,
	},
	{
		id: "saving",
		label: "Saving formatted video clips",
		description:
			"Writing encoded files to disk and updating your project manifest.",
		icon: FolderCheck,
	},
	{
		id: "clip-analysing",
		label: "Analysing key moments",
		description:
			"Scoring motion, audio, and scene changes to find cut points on each formatted video.",
		icon: FileSearch,
	},
	{
		id: "clip-cutting",
		label: "Cutting short clips",
		description:
			"Cutting every detected key-moment segment into its own file in clips/ (no cap at this step).",
		icon: Scissors,
	},
	{
		id: "clip-cv-scoring",
		label: "Computer vision scoring",
		description:
			"Scoring every short clip in clips/ with local CLIP against your positive and negative prompts.",
		icon: ScanEye,
	},
	{
		id: "clip-selecting",
		label: "Selecting best clips",
		description:
			"Ranking all short clips by your final score and marking the top picks per source file for a future combined edit.",
		icon: ListChecks,
	},
	{
		id: "complete",
		label: "Complete",
		description: "All videos have been processed and clips are ready to use.",
		icon: CheckCircle2,
	},
]

export function stageIndex(stage: ProcessStage): number {
	if (stage === "idle" || stage === "error") return -1
	return PIPELINE_STAGES.findIndex((s) => s.id === stage)
}

export function stageState(
	stageId: ProcessStage,
	currentStage: ProcessStage,
	failedAtStage?: ProcessStage
): "pending" | "active" | "complete" | "error" {
	if (currentStage === "error" && failedAtStage) {
		const idx = stageIndex(stageId)
		const failedIdx = stageIndex(failedAtStage)
		if (failedIdx < 0 || idx < 0) return "pending"
		if (idx < failedIdx) return "complete"
		if (idx === failedIdx) return "error"
		return "pending"
	}

	if (currentStage === "error") {
		return "pending"
	}

	if (currentStage === "complete") {
		return "complete"
	}

	const idx = stageIndex(stageId)
	const currentIdx = stageIndex(currentStage)

	if (idx < currentIdx) return "complete"
	if (idx === currentIdx) return "active"
	return "pending"
}

export function stageIcon(state: "pending" | "active" | "complete" | "error") {
	switch (state) {
		case "complete":
			return CheckCircle2
		case "active":
			return Loader2
		case "error":
			return XCircle
		default:
			return Circle
	}
}
