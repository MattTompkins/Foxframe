"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { StepCounter } from "@/components/StepCounter"
import { useParams } from "next/navigation"
import {
	CheckCircle2,
	Circle,
	Clapperboard,
	FileSearch,
	Film,
	Loader2,
	RefreshCw,
	Scissors,
	ScanEye,
	ListChecks,
	Settings2,
	SkipForward,
	XCircle,
} from "lucide-react"
import {
	PIPELINE_STAGES,
	stageState,
	type FileProcessStatus,
	type ProcessStage,
	type ProcessStatus,
} from "@/lib/process-stages"

const STAGE_ICONS: Record<ProcessStage, typeof Settings2> = {
	idle: Circle,
	preparing: Settings2,
	analysing: FileSearch,
	processing: Film,
	saving: Loader2,
	"clip-analysing": FileSearch,
	"clip-cutting": Scissors,
	"clip-cv-scoring": ScanEye,
	"clip-selecting": ListChecks,
	complete: CheckCircle2,
	error: XCircle,
}

function FileStatusIcon({ file }: { file: FileProcessStatus }) {
	switch (file.stage) {
		case "done":
			return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
		case "skipped":
			return <SkipForward className="h-5 w-5 shrink-0 text-amber-400" />
		case "failed":
			return <XCircle className="h-5 w-5 shrink-0 text-red-400" />
		case "encoding":
		case "analysing":
			return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-orange-400" />
		default:
			return <Circle className="h-5 w-5 shrink-0 text-zinc-600" />
	}
}

function fileStageLabel(stage: FileProcessStatus["stage"]) {
	switch (stage) {
		case "waiting":
			return "Waiting"
		case "analysing":
			return "Analysing"
		case "encoding":
			return "Encoding"
		case "done":
			return "Done"
		case "skipped":
			return "Skipped"
		case "failed":
			return "Failed"
	}
}

function StageTimeline({
	currentStage,
	error,
	failedAtStage,
}: {
	currentStage: ProcessStage
	error?: string
	failedAtStage?: ProcessStage
}) {
	return (
		<ol className="flex flex-col gap-0">
			{PIPELINE_STAGES.map((stage, index) => {
				const state = stageState(stage.id, currentStage, failedAtStage)
				const isError = state === "error"

				const Icon = isError ? XCircle : STAGE_ICONS[stage.id]

				return (
					<li key={stage.id} className="flex gap-4">
						<div className="flex flex-col items-center">
							<div
								className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
									state === "complete"
										? "border-green-500 bg-green-500/15 text-green-400"
										: state === "active"
											? "border-orange-500 bg-orange-500/15 text-orange-400"
											: isError
												? "border-red-500 bg-red-500/15 text-red-400"
												: "border-zinc-600 bg-zinc-800 text-zinc-500"
								}`}
							>
								<Icon
									className={`h-5 w-5 ${state === "active" && !isError ? "animate-spin" : ""}`}
								/>
							</div>
							{index < PIPELINE_STAGES.length - 1 && (
								<div
									className={`my-1 w-0.5 flex-1 min-h-8 ${
										state === "complete" ? "bg-green-500/60" : "bg-zinc-700"
									}`}
								/>
							)}
						</div>

						<div className={`pb-8 ${index === PIPELINE_STAGES.length - 1 ? "pb-0" : ""}`}>
							<p
								className={`font-medium ${
									state === "active"
										? "text-white"
										: state === "complete"
											? "text-green-300"
											: isError
												? "text-red-300"
												: "text-zinc-500"
								}`}
							>
								{stage.label}
								{state === "active" && !isError && (
									<span className="ml-2 text-sm font-normal text-orange-400">
										In progress…
									</span>
								)}
							</p>
							<p className="mt-1 text-sm leading-relaxed text-zinc-400">
								{isError && error ? error : stage.description}
							</p>
						</div>
					</li>
				)
			})}
		</ol>
	)
}

export default function ProcessVideoPage() {
	const projectId = useParams().id as string
	const [status, setStatus] = useState<ProcessStatus | null>(null)
	const [starting, setStarting] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const startedRef = useRef(false)
	const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

	const fetchStatus = useCallback(async () => {
		const response = await fetch(`/api/projects/${projectId}/process`)
		if (!response.ok) {
			const data = await response.json().catch(() => ({}))
			throw new Error(data.error ?? "Failed to load process status")
		}
		const data = await response.json()
		setStatus(data.status)
		return data.status as ProcessStatus
	}, [projectId])

	const startProcessing = useCallback(async () => {
		const response = await fetch(`/api/projects/${projectId}/process`, {
			method: "POST",
		})

		if (response.status === 409) {
			return
		}

		if (!response.ok && response.status !== 202) {
			const data = await response.json().catch(() => ({}))
			throw new Error(data.error ?? "Failed to start processing")
		}
	}, [projectId])

	const startReclip = useCallback(async () => {
		const response = await fetch(`/api/projects/${projectId}/reclip`, {
			method: "POST",
		})

		if (response.status === 409) {
			return
		}

		if (!response.ok && response.status !== 202) {
			const data = await response.json().catch(() => ({}))
			throw new Error(data.error ?? "Failed to start re-clipping")
		}
	}, [projectId])

	const startPolling = useCallback(() => {
		if (pollRef.current) clearInterval(pollRef.current)

		pollRef.current = setInterval(async () => {
			try {
				const next = await fetchStatus()
				if (
					next.stage === "complete" ||
					next.stage === "error" ||
					next.stage === "idle"
				) {
					if (pollRef.current) clearInterval(pollRef.current)
					pollRef.current = undefined
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to refresh status"
				)
				if (pollRef.current) clearInterval(pollRef.current)
				pollRef.current = undefined
			}
		}, 1000)
	}, [fetchStatus])

	useEffect(() => {
		let cancelled = false

		async function init() {
			try {
				setStarting(true)
				setError(null)

				const current = await fetchStatus()

				if (!startedRef.current && current.stage === "idle") {
					startedRef.current = true
					await startProcessing()
				} else {
					startedRef.current = true
				}

				if (cancelled) return

				const latest = await fetchStatus()
				if (
					!cancelled &&
					latest.stage !== "complete" &&
					latest.stage !== "error"
				) {
					startPolling()
				}
			} catch (err) {
				if (!cancelled) {
					setError(
						err instanceof Error ? err.message : "Failed to start processing"
					)
				}
			} finally {
				if (!cancelled) setStarting(false)
			}
		}

		init()

		return () => {
			cancelled = true
			if (pollRef.current) clearInterval(pollRef.current)
		}
	}, [fetchStatus, startProcessing, startPolling])

	async function handleReclip() {
		try {
			setStarting(true)
			setError(null)
			setStatus(null)
			await startReclip()
			await fetchStatus()
			startPolling()
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to re-run clipping")
		} finally {
			setStarting(false)
		}
	}

	async function handleRetry() {
		try {
			setStarting(true)
			setError(null)
			setStatus(null)
			await startProcessing()
			await fetchStatus()
			startPolling()
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to retry processing")
		} finally {
			setStarting(false)
		}
	}

	const currentStage = status?.stage ?? "preparing"
	const isDone = currentStage === "complete"
	const isFailed = currentStage === "error"
	const isReclipping =
		currentStage === "clip-analysing" ||
		currentStage === "clip-cutting" ||
		currentStage === "clip-cv-scoring" ||
		currentStage === "clip-selecting"
	const canReclip = Boolean(status?.outputFiles && status.outputFiles.length > 0)

	return (
		<div className="flex min-h-full flex-1 flex-col bg-zinc-900 font-sans">
			<main className="mx-auto flex w-full max-w-3xl flex-col px-6 py-16 sm:py-24">
				<header className="mb-10">
					<StepCounter current={4} total={4} stepName="Video formatting & processing" />
					<h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">
						{isDone
							? "Your videos are ready"
							: isFailed
								? "Processing failed"
								: "Processing your videos"}
					</h1>
					<p className="mt-4 text-lg leading-relaxed text-zinc-300">
						{status?.message ??
							(starting
								? "Starting the processing pipeline…"
								: "Applying your saved settings to each uploaded clip.")}
					</p>
				</header>

				{error && (
					<div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
						{error}
					</div>
				)}

				<div className="mb-8">
					<div className="mb-2 flex items-center justify-between text-sm">
						<span className="text-zinc-400">Overall progress</span>
						<span className="font-medium text-white">
							{status?.overallProgress ?? 0}%
						</span>
					</div>
					<div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800">
						<div
							className={`h-full rounded-full transition-all duration-500 ${
								isFailed
									? "bg-red-500"
									: isDone
										? "bg-green-500"
										: "bg-orange-500"
							}`}
							style={{ width: `${status?.overallProgress ?? 0}%` }}
						/>
					</div>
					{status?.currentFile && !isDone && !isFailed && (
						<p className="mt-2 text-sm text-zinc-500">
							Currently working on{" "}
							<span className="text-zinc-300">{status.currentFile}</span>
						</p>
					)}
				</div>

				<section className="mb-8 rounded-xl border border-zinc-700 bg-zinc-800/50 p-6">
					<h2 className="text-lg font-semibold text-white">Pipeline stages</h2>
					<p className="mt-1 text-sm text-zinc-400">
						Each step runs in order. You can keep this tab open to watch progress.
					</p>
					<div className="mt-6">
						<StageTimeline
							currentStage={currentStage}
							error={status?.error}
							failedAtStage={status?.failedAtStage}
						/>
					</div>

					<div className="mt-8">
						{isDone ? (
							<Link
								href={`/project/${projectId}/review`}
								className="rounded-lg block bg-orange-600 px-6 py-3 text-center font-medium mb-4 text-white hover:bg-orange-700"
							>
								Proceed to review clips
							</Link>
						) : isFailed ? (
							<button
								type="button"
								onClick={handleRetry}
								disabled={starting}
								className="rounded-lg bg-red-600 px-6 py-3 text-center font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								Retry processing
							</button>
						) : null}
					</div>
				</section>

				

				{(status?.files?.length ?? 0) > 0 && (
					<section className="mb-8 rounded-xl border border-zinc-700 bg-zinc-800/50 p-6">
						<h2 className="text-lg font-semibold text-white">Source files</h2>
						<p className="mt-1 text-sm text-zinc-400">
							Per-file status while lens correction, reframing, and encoding run.
						</p>
						<ul className="mt-5 flex flex-col gap-3">
							{status!.files.map((file) => (
								<li
									key={file.fileName}
									className="rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3"
								>
									<div className="flex items-center gap-3">
										<FileStatusIcon file={file} />
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-white">
												{file.fileName}
											</p>
											<p className="text-sm text-zinc-400">
												{fileStageLabel(file.stage)}
												{file.outputFile && (
													<>
														{" "}
														→{" "}
														<span className="text-zinc-300">
															{file.outputFile}
														</span>
													</>
												)}
											</p>
										</div>
									</div>
									{(file.stage === "encoding" || file.stage === "analysing") && (
										<div className="mt-3">
											<div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
												<div
													className="h-full rounded-full bg-orange-500 transition-all duration-300"
													style={{ width: `${file.progress}%` }}
												/>
											</div>
										</div>
									)}
									{file.error && (
										<p className="mt-2 text-sm text-red-400">{file.error}</p>
									)}
								</li>
							))}
						</ul>
					</section>
				)}

				{isDone && status && status.clipFiles && status.clipFiles.length > 0 && (
					<section className="mb-8 rounded-xl border border-orange-500/30 bg-orange-500/5 p-6">
						<h2 className="text-lg font-semibold text-orange-300">
							Short clips cut
						</h2>
						<p className="mt-1 text-sm text-zinc-400">
							Smart editing clips are stored in your project&apos;s{" "}
							<code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
								clips/
							</code>{" "}
							folder.
						</p>
						<ul className="mt-4 flex flex-col gap-2">
							{status.clipFiles.map((file) => (
								<li
									key={file}
									className="flex items-center gap-2 text-sm text-zinc-200"
								>
									<Scissors className="h-4 w-4 text-orange-400" />
									{file}
								</li>
							))}
						</ul>
					</section>
				)}

				{isDone && status && status.outputFiles.length > 0 && (
					<section className="mb-8 rounded-xl border border-green-500/30 bg-green-500/5 p-6">
						<h2 className="text-lg font-semibold text-green-300">
							Processed & formatted files saved
						</h2>
						<p className="mt-1 text-sm text-zinc-400">
							Processed videos are stored in your project&apos;s{" "}
							<code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
								processed/
							</code>{" "}
							folder.
						</p>
						<ul className="mt-4 flex flex-col gap-2">
							{status.outputFiles.map((file) => (
								<li
									key={file}
									className="flex items-center gap-2 text-sm text-zinc-200"
								>
									<CheckCircle2 className="h-4 w-4 text-green-400" />
									{file}
								</li>
							))}
						</ul>
					</section>
				)}

				<div className="flex flex-col gap-4 border-t border-zinc-700 pt-8 sm:flex-row sm:items-center sm:justify-between">
					<Link
						href={`/project/${projectId}/smart-editing`}
							className="text-center text-sm text-zinc-400 underline-offset-2 hover:text-white hover:underline"
						>
							← Back to smart editing
					</Link>

					<div className="flex flex-col gap-3 sm:flex-row">
						{isDone && canReclip && (
							<button
								type="button"
								onClick={handleReclip}
								disabled={starting || isReclipping}
								className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-600 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<RefreshCw
									className={`h-4 w-4 ${starting || isReclipping ? "animate-spin" : ""}`}
								/>
								Re-run clipping
							</button>
						)}
						{isFailed && (
							<button
								type="button"
								onClick={handleRetry}
								disabled={starting}
								className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-600 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<RefreshCw
									className={`h-4 w-4 ${starting ? "animate-spin" : ""}`}
								/>
								Retry processing
							</button>
						)}
						<Link
							href={`/project/${projectId}/files`}
							className="rounded-lg bg-orange-600 px-6 py-3 text-center font-medium text-white hover:bg-orange-700"
						>
							{isDone ? "Upload more files" : "View uploads"}
						</Link>
					</div>
				</div>
			</main>
		</div>
	)
}
