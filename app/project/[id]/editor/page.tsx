"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { clipMediaUrl } from "@/components/ClipVideoPreview"
import { EditorAssetBrowser } from "@/components/EditorAssetBrowser"
import { EditorHeader } from "@/components/EditorHeader"
import { EditorPanel } from "@/components/EditorPanel"
import { EditorTimeline } from "@/components/EditorTimeline"
import { VideoPlayer } from "@/components/VideoPlayer"
import type { ClipSegment } from "@/lib/clip-segments"
import {
	addClipToEdit,
	createEmptyEdit,
	fetchMostRecentEdit,
	persistEdit,
} from "@/lib/edit-client"
import { DEFAULT_VIDEO_TRACK_ID, type ProjectEdit } from "@/lib/edit-core"

type ProjectDetails = {
	id: string
	name: string
	slug: string
}

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
	const [clips, setClips] = useState<string[]>([])
	const [clipSegments, setClipSegments] = useState<ClipSegment[]>([])
	const [selectedClipFile, setSelectedClipFile] = useState<string | null>(null)
	const [currentEdit, setCurrentEdit] = useState<ProjectEdit | null>(null)
	const [editLoading, setEditLoading] = useState(true)
	const [editSaving, setEditSaving] = useState(false)
	const [editPersistError, setEditPersistError] = useState<string | null>(null)
	const [playheadSeconds, setPlayheadSeconds] = useState(0)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

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
				setClips(data.clips)
				setClipSegments(data.clipSegments)
				setSelectedClipFile(data.clips[0] ?? null)
			} catch (loadError) {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load editor data"
					)
					setProjectName("Project")
					setClips([])
					setClipSegments([])
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
		},
		[applyEdit]
	)

	const handleAddToTimeline = useCallback(
		(clipFile: string) => {
			if (!currentEdit) return

			const duration = clipDurationFromSegments(clipFile, clipSegments)

			updateEdit((edit) =>
				addClipToEdit(edit, {
					clipFile,
					trackId: DEFAULT_VIDEO_TRACK_ID,
					startOnTimeline: playheadSeconds,
					sourceDurationSeconds: duration,
				})
			)
		},
		[currentEdit, clipSegments, playheadSeconds, updateEdit]
	)

	return (
		<div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-100">
			<EditorHeader
				projectId={projectId}
				projectName={projectName}
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
				<EditorPanel
					title="Assets"
					className="w-full shrink-0 border-b lg:w-72 lg:border-b-0 lg:border-r xl:w-80"
				>
					<EditorAssetBrowser
						projectId={projectId}
						clips={clips}
						clipSegments={clipSegments}
						loading={loading}
						error={null}
						selectedClipFile={selectedClipFile}
						onSelectClip={setSelectedClipFile}
						onAddToTimeline={
							currentEdit && !editLoading
								? handleAddToTimeline
								: undefined
						}
					/>
				</EditorPanel>

				<EditorPanel
					title="Canvas"
					className="min-h-0 min-w-0 flex-1"
					scrollable={false}
					padded={false}
				>
					{selectedClipFile ? (
						<div className="relative h-full w-full">
							<button
								className="absolute top-4 text-xs right-5 z-20 text-orange-600 bg-zinc-800/50 px-2 py-1 rounded cursor-pointer hover:bg-zinc-800/80 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
								onClick={() => setSelectedClipFile(null)}
							>
								Exit media preview
							</button>
							<VideoPlayer
								key={selectedClipFile}
								fill
								source={clipMediaUrl(projectId, selectedClipFile)}
								clipFileName={selectedClipFile}
								autoPlay
								muted
								loop
							/>
						</div>
					) : (
						<div className="flex h-full min-h-0 flex-1 items-center justify-center">
							<p className="text-center text-sm text-zinc-500">
								Select a clip to preview
							</p>
						</div>
					)}
				</EditorPanel>
			</div>

			<EditorPanel
				title="Timeline"
				className="h-52 shrink-0 border-t border-zinc-700 sm:h-56 md:h-60"
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
						onPlayheadChange={setPlayheadSeconds}
						saving={editSaving}
					/>
				)}
			</EditorPanel>
		</div>
	)
}
