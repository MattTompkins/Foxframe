"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { StepCounter } from "@/components/StepCounter"
import { VideoPlayer } from "@/components/VideoPlayer"
import { SettingSection } from "@/components/SettingSection"
import { SettingField } from "@/components/SettingField"
import type { ClipSegment } from "@/lib/clip-segments"
import { Grid2X2, Rows3 } from "lucide-react"

type ClipViewMode = "list" | "grid"

function clipMediaUrl(projectId: string, clipFile: string) {
	return `/api/projects/${projectId}/media/clips/${encodeURIComponent(clipFile)}`
}

type ClipDraft = {
	finalScore: number
}

function segmentToDraft(segment: ClipSegment): ClipDraft {
	return {
		finalScore: segment.manualFinalScore ?? segment.finalScore,
	}
}

function ClipViewerAndEditor({
	projectId,
	clipFile,
	segment,
	onSegmentUpdated,
}: {
	projectId: string
	clipFile: string | null
	segment: ClipSegment | null
	onSegmentUpdated: (segment: ClipSegment) => void
}) {
	const [draft, setDraft] = useState<ClipDraft | null>(null)
	const [saving, setSaving] = useState(false)
	const [saveError, setSaveError] = useState<string | null>(null)

	useEffect(() => {
		if (segment) {
			setDraft(segmentToDraft(segment))
		} else {
			setDraft(null)
		}
		setSaveError(null)
	}, [segment, clipFile])

	if (!clipFile) {
		return (
			<section className="w-full max-w-7xl rounded-xl border border-zinc-700 bg-zinc-800/50 p-6">
				<p className="text-sm text-zinc-400">
					Select a clip from the list below to preview it.
				</p>
			</section>
		)
	}

	async function handleUpdate() {
		if (!clipFile || !draft) return

		setSaving(true)
		setSaveError(null)

		try {
			const response = await fetch(
				`/api/projects/${projectId}/manifest/clips`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						clipFile,
						manualFinalScore: draft.finalScore,
					}),
				}
			)

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				throw new Error(
					typeof data.error === "string"
						? data.error
						: "Failed to update clip metadata"
				)
			}

			const data = (await response.json()) as { segment?: ClipSegment }
			if (data.segment) {
				onSegmentUpdated(data.segment)
			}
		} catch (err) {
			setSaveError(
				err instanceof Error ? err.message : "Failed to update clip metadata"
			)
		} finally {
			setSaving(false)
		}
	}

	return (
		<section className="grid w-full max-w-7xl grid-cols-1 gap-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-6 lg:grid-cols-2">
			<VideoPlayer
				key={clipFile}
				source={clipMediaUrl(projectId, clipFile)}
				clipFileName={clipFile}
			/>
			<div className="flex flex-col">
				<SettingSection
					title="Clip details"
					summary="Adjust the score and save to the manifest."
				>
					<SettingField
						label="Scores"
						help="Ranking and scoring breakdown from smart editing."
					>
						{segment && draft ? (
							<>
								<div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-300">
									<span>
										Signal:{" "}
										<strong className="text-white">
											{segment.signalScore.toFixed(2)}
										</strong>
									</span>
									<span>
										CV:{" "}
										<strong className="text-white">
											{segment.cvScore !== undefined
												? segment.cvScore.toFixed(2)
												: "-"}
										</strong>
									</span>
									<span>
										Blended:{" "}
										<strong className="text-white">
											{segment.blendedScore.toFixed(2)}
										</strong>
									</span>
									<span>
										Final:{" "}
										<strong className="text-white">
											{draft.finalScore.toFixed(2)}
										</strong>
									</span>
									{segment.globalRank !== undefined &&
										segment.globalClipCount !== undefined && (
											<span>
												Overall:{" "}
												<strong className="text-white">
													#{segment.globalRank} of{" "}
													{segment.globalClipCount}
												</strong>
											</span>
										)}
								</div>
								{segment.selectedBecause && (
									<p className="mb-3 whitespace-pre-line text-xs leading-relaxed text-zinc-500">
										{segment.selectedBecause}
									</p>
								)}
								<label className="block text-sm font-medium text-white">
									Final score manual override
								</label>
								<p className="mb-2 text-xs text-zinc-500">
									Manually adjust the final score. Saved as a manual
									override in the manifest.
								</p>
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={draft.finalScore}
									onChange={(e) =>
										setDraft((prev) =>
											prev
												? {
													...prev,
													finalScore: parseFloat(
														e.target.value
													),
												}
												: prev
										)
									}
									className="w-full accent-orange-500"
								/>
							</>
						) : (
							<p className="text-sm text-zinc-500">
								No segment metadata in the manifest for this file.
							</p>
						)}
					</SettingField>

					{saveError && (
						<p className="text-sm text-red-400" role="alert">
							{saveError}
						</p>
					)}

					<button
						type="button"
						disabled={!draft || saving}
						onClick={() => void handleUpdate()}
						className="mt-auto rounded-lg bg-orange-600 px-4 py-3 font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-zinc-700"
					>
						{saving ? "Saving…" : "Update metadata"}
					</button>
				</SettingSection>
			</div>
		</section>
	)
}

export default function ReviewPage() {
	const projectId = useParams().id as string
	const [clips, setClips] = useState<string[]>([])
	const [segmentsByFile, setSegmentsByFile] = useState<
		Map<string, ClipSegment>
	>(new Map())
	const [selectedClipFile, setSelectedClipFile] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [clipViewMode, setClipViewMode] = useState<ClipViewMode>("list")

	const sortedClips = useMemo(() => {
		return [...clips].sort((a, b) => {
			const rankA =
				segmentsByFile.get(a)?.globalRank ?? Number.MAX_SAFE_INTEGER
			const rankB =
				segmentsByFile.get(b)?.globalRank ?? Number.MAX_SAFE_INTEGER
			return rankA - rankB
		})
	}, [clips, segmentsByFile])

	useEffect(() => {
		if (!projectId) return

		let cancelled = false

		async function load() {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/projects/${projectId}/manifest`)

				if (!response.ok) {
					const data = await response.json().catch(() => ({}))
					throw new Error(
						typeof data.error === "string"
							? data.error
							: "Failed to load clips"
					)
				}

				const data = (await response.json()) as {
					clips?: string[]
					clipSegments?: ClipSegment[]
				}

				const clipList = data.clips ?? []
				const byFile = new Map(
					(data.clipSegments ?? []).map((segment) => [
						segment.clipFile,
						segment,
					])
				)

				if (!cancelled) {
					setClips(clipList)
					setSegmentsByFile(byFile)
					setSelectedClipFile(clipList[0] ?? null)
				}
			} catch (loadError) {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load clips"
					)
					setClips([])
					setSegmentsByFile(new Map())
					setSelectedClipFile(null)
				}
			} finally {
				if (!cancelled) {
					setLoading(false)
				}
			}
		}

		void load()

		return () => {
			cancelled = true
		}
	}, [projectId])

	const selectedSegment = useMemo(() => {
		if (!selectedClipFile) return null
		return segmentsByFile.get(selectedClipFile) ?? null
	}, [selectedClipFile, segmentsByFile])

	function handleSegmentUpdated(segment: ClipSegment) {
		setSegmentsByFile((prev) => {
			const next = new Map(prev)
			next.set(segment.clipFile, segment)
			return next
		})
	}

	return (
		<div className="flex min-h-full flex-1 flex-col items-center bg-zinc-900 px-6 font-sans pb-16">
			<div className="flex w-full max-w-7xl flex-col pt-24 sm:pt-32">
				<div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 flex-1">
						<StepCounter
							current={4}
							total={5}
							stepName="Review intelligent clipping"
						/>
						<h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">
							Review your clips
						</h1>
						<p className="mt-4 max-w-3xl text-lg leading-relaxed text-zinc-300">
							Select a clip below to preview it. Overall rank compares every clip
							in the project; export picks the top few from each source file
							separately.
						</p>
						{error && (
							<p className="mt-6 text-sm text-red-400" role="alert">
								{error}
							</p>
						)}
					</div>
					<Link
						href={`/project/${projectId}/editor`}
						className="shrink-0 rounded-lg bg-orange-600 px-6 py-3 text-center font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900 sm:mt-8"
					>
						Continue to editor
					</Link>
				</div>

				<div className="mt-10">
					<ClipViewerAndEditor
						projectId={projectId}
						clipFile={selectedClipFile}
						segment={selectedSegment}
						onSegmentUpdated={handleSegmentUpdated}
					/>
				</div>

				<section className="mt-10 w-full">
					<div className="mb-4 flex items-center justify-between gap-4">
						<h2 className="text-lg font-semibold text-white">All clips</h2>
						<div className="flex flex-row gap-1">
							<button
								type="button"
								aria-label="List view"
								aria-pressed={clipViewMode === "list"}
								className="cursor-pointer rounded p-1 transition-colors hover:opacity-80"
								onClick={() => setClipViewMode("list")}
							>
								<Rows3
									size={22}
									className={
										clipViewMode === "list"
											? "text-orange-500"
											: "text-zinc-400"
									}
								/>
							</button>
							<button
								type="button"
								aria-label="Grid view"
								aria-pressed={clipViewMode === "grid"}
								className="cursor-pointer rounded p-1 transition-colors hover:opacity-80"
								onClick={() => setClipViewMode("grid")}
							>
								<Grid2X2
									size={22}
									className={
										clipViewMode === "grid"
											? "text-orange-500"
											: "text-zinc-400"
									}
								/>
							</button>
						</div>
					</div>
					{loading ? (
						<p className="text-sm text-zinc-400">Loading clips…</p>
					) : clips.length === 0 ? (
						<p className="text-sm text-zinc-400">
							No clips in the manifest yet. Run processing with smart editing
							enabled first.
						</p>
					) : clipViewMode === "list" ? (
						<ul className="divide-y divide-zinc-700 rounded-lg border border-zinc-700">
							{sortedClips.map((clipFile) => {
								const segment = segmentsByFile.get(clipFile)
								const isSelected = clipFile === selectedClipFile

								return (
									<li key={clipFile}>
										<button
											type="button"
											onClick={() => setSelectedClipFile(clipFile)}
											className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${
												isSelected
													? "bg-orange-500/15 text-white"
													: "text-zinc-300 hover:bg-zinc-800"
											}`}
										>
											<span className="truncate font-medium">
												{clipFile}
											</span>
											{segment && (
												<span className="shrink-0 text-xs text-zinc-400">
													#{segment.globalRank ?? "?"}/
													{segment.globalClipCount ?? "?"} overall ·
													score {segment.finalScore.toFixed(2)}
													{segment.selectedForUse ? " · export" : ""}
												</span>
											)}
										</button>
									</li>
								)
							})}
						</ul>
					) : (
						<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
							{sortedClips.map((clipFile) => {
								const segment = segmentsByFile.get(clipFile)
								const isSelected = clipFile === selectedClipFile

								return (
									<li key={clipFile}>
										<button
											type="button"
											onClick={() => setSelectedClipFile(clipFile)}
											className={`flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors ${
												isSelected
													? "border-orange-500 bg-orange-500/10"
													: "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
											}`}
										>
											<video
												src={clipMediaUrl(projectId, clipFile)}
												preload="metadata"
												muted
												playsInline
												className="aspect-video w-full bg-black object-contain"
											/>
											<div className="px-2 py-2">
												<p
													className="truncate text-xs font-medium text-white"
													title={clipFile}
												>
													{clipFile}
												</p>
												{segment && (
													<p className="mt-0.5 text-xs text-zinc-400">
														#{segment.globalRank ?? "?"} ·{" "}
														{segment.finalScore.toFixed(2)}
														{segment.selectedForUse ? " · export" : ""}
													</p>
												)}
											</div>
										</button>
									</li>
								)
							})}
						</ul>
					)}
				</section>
			</div>
		</div>
	)
}
