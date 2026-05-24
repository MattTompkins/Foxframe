"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { clipMediaUrl } from "@/components/ClipVideoPreview"
import { EditorAssetBrowser } from "@/components/EditorAssetBrowser"
import { EditorHeader } from "@/components/EditorHeader"
import { EditorPanel } from "@/components/EditorPanel"
import { EditorResizablePanel } from "@/components/EditorResizablePanel"
import { EditorTimeline } from "@/components/EditorTimeline"
import { SequencePreview } from "@/components/SequencePreview"
import { VideoPlayer } from "@/components/VideoPlayer"
import type { ClipSegment } from "@/lib/clip-segments"
import {
	addClipToEdit,
	createEmptyEdit,
	fetchMostRecentEdit,
	persistEdit,
} from "@/lib/edit-client"
import type { ProjectEdit } from "@/lib/edit-core"
import {
	DEFAULT_EDITOR_LAYOUT,
	layoutLimits,
	loadEditorLayout,
	saveEditorLayout,
	type EditorLayoutPrefs,
} from "@/lib/editor-layout"

type ProjectDetails = {
	id: string
	name: string
	slug: string
}

const DEFAULT_PROJECT_SLUG = "export"

type EditorProjectData = {
	project: ProjectDetails
	clips: string[]
	clipSegments: ClipSegment[]
}

async function fetchEditorProjectData(
	projectId: string
): Promise<EditorProjectData> {
	const [projectRes, manifestRes] = await Promise.all([
		fetch(`/api/projects/${projectId}`),
		fetch(`/api/projects/${projectId}/manifest`),
	])

	if (!projectRes.ok) {
		const data = await projectRes.json().catch(() => ({}))
		throw new Error(
			typeof data.error === "string" ? data.error : "Failed to load project"
		)
	}

	if (!manifestRes.ok) {
		const data = await manifestRes.json().catch(() => ({}))
		throw new Error(
			typeof data.error === "string"
				? data.error
				: "Failed to load project assets"
		)
	}

	const project = (await projectRes.json()) as ProjectDetails
	const manifest = (await manifestRes.json()) as {
		clips?: string[]
		clipSegments?: ClipSegment[]
	}

	return {
		project,
		clips: manifest.clips ?? [],
		clipSegments: manifest.clipSegments ?? [],
	}
}

function clipDurationFromSegments(
	clipFile: string,
	clipSegments: ClipSegment[]
) {
	const segment = clipSegments.find((s) => s.clipFile === clipFile)
	return segment && segment.durationSeconds > 0
		? segment.durationSeconds
		: 5
}

export default function EditorPage() {
	const projectId = useParams().id as string

	const [projectName, setProjectName] = useState("Loading…")
	const [projectSlug, setProjectSlug] = useState(DEFAULT_PROJECT_SLUG)
	const [clips, setClips] = useState<string[]>([])
	const [clipSegments, setClipSegments] = useState<ClipSegment[]>([])
	const [sourcePreviewClip, setSourcePreviewClip] = useState<string | null>(
		null
	)
	const [currentEdit, setCurrentEdit] = useState<ProjectEdit | null>(null)
	const [isPlaying, setIsPlaying] = useState(false)
	const [volume, setVolume] = useState(0)
	const [editLoading, setEditLoading] = useState(true)
	const [editSaving, setEditSaving] = useState(false)
	const [editPersistError, setEditPersistError] = useState<string | null>(null)
	const [playheadSeconds, setPlayheadSeconds] = useState(0)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [layout, setLayout] = useState(DEFAULT_EDITOR_LAYOUT)
	const [isWideLayout, setIsWideLayout] = useState(false)
	const [sizeLimits, setSizeLimits] = useState(layoutLimits)

	const editDirtyRef = useRef(false)
	const skipPersistRef = useRef(false)

	const applyEdit = useCallback((edit: ProjectEdit, options?: { dirty?: boolean }) => {
		skipPersistRef.current = options?.dirty !== true
		editDirtyRef.current = options?.dirty === true
		setCurrentEdit(edit)
	}, [])

	const updateEdit = useCallback(
		(updater: (edit: ProjectEdit) => ProjectEdit) => {
			setCurrentEdit((prev) => {
				if (!prev) return prev
				const next = updater(prev)
				editDirtyRef.current = true
				skipPersistRef.current = false
				return next
			})
		},
		[]
	)

	const patchLayout = useCallback((patch: Partial<EditorLayoutPrefs>) => {
		setLayout((prev) => {
			const next = { ...prev, ...patch }
			saveEditorLayout(next)
			return next
		})
	}, [])

	useEffect(() => {
		setLayout(loadEditorLayout())

		const media = window.matchMedia("(min-width: 1024px)")
		const syncWide = () => setIsWideLayout(media.matches)
		syncWide()
		media.addEventListener("change", syncWide)

		const syncLimits = () => setSizeLimits(layoutLimits())
		syncLimits()
		window.addEventListener("resize", syncLimits)

		return () => {
			media.removeEventListener("change", syncWide)
			window.removeEventListener("resize", syncLimits)
		}
	}, [])

	useEffect(() => {
		if (!projectId) return

		let cancelled = false

		async function load() {
			setLoading(true)
			setError(null)

			try {
				const data = await fetchEditorProjectData(projectId)

				if (cancelled) return

				setProjectName(data.project.name)
				setProjectSlug(data.project.slug || DEFAULT_PROJECT_SLUG)
				setClips(data.clips)
				setClipSegments(data.clipSegments)
				setSourcePreviewClip(null)
			} catch (loadError) {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load editor data"
					)
					setProjectName("Project")
					setProjectSlug(DEFAULT_PROJECT_SLUG)
					setClips([])
					setClipSegments([])
					setSourcePreviewClip(null)
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

	useEffect(() => {
		if (!projectId || loading) return

		let cancelled = false

		async function loadEdit() {
			setEditLoading(true)
			setEditPersistError(null)

			try {
				let edit = await fetchMostRecentEdit(projectId)
				if (!edit) {
					edit = await createEmptyEdit(projectId)
				}

				if (!cancelled) {
					applyEdit(edit, { dirty: false })
				}
			} catch (loadError) {
				if (!cancelled) {
					setEditPersistError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load edit"
					)
				}
			} finally {
				if (!cancelled) {
					setEditLoading(false)
				}
			}
		}

		void loadEdit()

		return () => {
			cancelled = true
		}
	}, [projectId, loading, applyEdit])

	useEffect(() => {
		if (!projectId || !currentEdit || skipPersistRef.current) {
			skipPersistRef.current = false
			return
		}
		if (!editDirtyRef.current) return

		const editSnapshot = currentEdit
		const timer = window.setTimeout(() => {
			setEditSaving(true)
			setEditPersistError(null)

			void persistEdit(projectId, editSnapshot)
				.then((saved) => {
					editDirtyRef.current = false
					skipPersistRef.current = true
					setCurrentEdit(saved)
				})
				.catch((persistError) => {
					setEditPersistError(
						persistError instanceof Error
							? persistError.message
							: "Failed to save edit"
					)
				})
				.finally(() => {
					setEditSaving(false)
				})
		}, 700)

		return () => window.clearTimeout(timer)
	}, [projectId, currentEdit])

	const handleEditLoaded = useCallback(
		(edit: ProjectEdit) => {
			applyEdit(edit, { dirty: false })
			setPlayheadSeconds(0)
			setIsPlaying(false)
		},
		[applyEdit]
	)

	const handlePlayToggle = useCallback(() => {
		if (!currentEdit || currentEdit.clips.length === 0) return

		setIsPlaying((playing) => {
			if (playing) return false

			if (playheadSeconds >= currentEdit.duration - 0.05) {
				setPlayheadSeconds(0)
			}
			return true
		})
	}, [currentEdit, playheadSeconds])

	return (
		<div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-100">
			<EditorHeader
				projectId={projectId}
				projectName={projectName}
				projectSlug={projectSlug}
				currentEditId={currentEdit?.id}
				onEditLoaded={handleEditLoaded}
			/>

			{error && (
				<p className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
					{error}
				</p>
			)}

			{editPersistError && (
				<p className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
					{editPersistError}
				</p>
			)}

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				{isWideLayout ? (
					<EditorResizablePanel
						title="Assets"
						edge="right"
						size={layout.assetWidth}
						onSizeChange={(assetWidth) => patchLayout({ assetWidth })}
						min={sizeLimits.assetWidth.min}
						max={sizeLimits.assetWidth.max}
						className="border-b lg:border-b-0"
					>
						<EditorAssetBrowser
							projectId={projectId}
							clips={clips}
							clipSegments={clipSegments}
							loading={loading}
							error={null}
						selectedClipFile={sourcePreviewClip}
						onSelectClip={(clipFile) => {
							setIsPlaying(false)
							setSourcePreviewClip(clipFile)
						}}
							canDragToTimeline={Boolean(currentEdit && !editLoading)}
						/>
					</EditorResizablePanel>
				) : (
					<EditorResizablePanel
						title="Assets"
						edge="bottom"
						size={layout.assetHeight}
						onSizeChange={(assetHeight) => patchLayout({ assetHeight })}
						min={sizeLimits.assetHeight.min}
						max={sizeLimits.assetHeight.max}
						className="w-full border-b"
					>
						<EditorAssetBrowser
							projectId={projectId}
							clips={clips}
							clipSegments={clipSegments}
							loading={loading}
							error={null}
						selectedClipFile={sourcePreviewClip}
						onSelectClip={(clipFile) => {
							setIsPlaying(false)
							setSourcePreviewClip(clipFile)
						}}
							canDragToTimeline={Boolean(currentEdit && !editLoading)}
						/>
					</EditorResizablePanel>
				)}

				<EditorPanel
					title="Canvas"
					className="min-h-0 min-w-0 flex-1"
					scrollable={false}
					padded={false}
				>
					{sourcePreviewClip ? (
						<div className="relative h-full w-full">
							<button
								type="button"
								className="absolute top-4 right-5 z-20 rounded bg-zinc-800/50 px-2 py-1 text-xs text-orange-600 hover:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
								onClick={() => setSourcePreviewClip(null)}
							>
								Back to sequence
							</button>
							<VideoPlayer
								key={sourcePreviewClip}
								fill
								source={clipMediaUrl(projectId, sourcePreviewClip)}
								clipFileName={sourcePreviewClip}
								autoPlay
								muted={volume <= 0}
								loop
							/>
						</div>
					) : currentEdit && !editLoading ? (
						<SequencePreview
							projectId={projectId}
							edit={currentEdit}
							playheadSeconds={playheadSeconds}
							isPlaying={isPlaying}
							volume={volume}
							onPlayheadChange={setPlayheadSeconds}
							onReachEnd={() => setIsPlaying(false)}
						/>
					) : (
						<div className="flex h-full min-h-0 flex-1 items-center justify-center bg-black">
							<p className="text-center text-sm text-zinc-500">
								Load an edit to preview the sequence
							</p>
						</div>
					)}
				</EditorPanel>
			</div>

			<EditorResizablePanel
				title="Timeline"
				edge="top"
				size={layout.timelineHeight}
				onSizeChange={(timelineHeight) => patchLayout({ timelineHeight })}
				min={sizeLimits.timeline.min}
				max={sizeLimits.timeline.max}
				className=" border-zinc-700"
				scrollable={false}
				padded={false}
			>
				{editLoading || !currentEdit ? (
					<div className="flex h-full items-center justify-center">
						<p className="text-sm text-zinc-500">Loading timeline…</p>
					</div>
				) : (
					<EditorTimeline
						edit={currentEdit}
						playheadSeconds={playheadSeconds}
						onPlayheadChange={(seconds) => {
							setIsPlaying(false)
							setPlayheadSeconds(seconds)
						}}
						isPlaying={isPlaying}
						onPlayToggle={handlePlayToggle}
						volume={volume}
						onVolumeChange={setVolume}
						onEditChange={(next) => updateEdit(() => next)}
						onAddClipFromAsset={(clipFile, trackId, startOnTimeline) => {
							const duration = clipDurationFromSegments(
								clipFile,
								clipSegments
							)
							updateEdit((edit) =>
								addClipToEdit(edit, {
									clipFile,
									trackId,
									startOnTimeline,
									sourceDurationSeconds: duration,
								})
							)
						}}
						saving={editSaving}
						clipSourceDuration={(clipFile) =>
							clipDurationFromSegments(clipFile, clipSegments)
						}
					/>
				)}
			</EditorResizablePanel>
		</div>
	)
}
