"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { clipMediaUrl } from "@/components/ClipVideoPreview"
import { EditorAssetBrowser } from "@/components/EditorAssetBrowser"
import { EditorHeader } from "@/components/EditorHeader"
import { EditorPanel } from "@/components/EditorPanel"
import { VideoPlayer } from "@/components/VideoPlayer"
import type { ClipSegment } from "@/lib/clip-segments"
import type { ProjectEdit } from "@/lib/edit"

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

export default function EditorPage() {
	const projectId = useParams().id as string

	const [projectName, setProjectName] = useState("Loading…")
	const [clips, setClips] = useState<string[]>([])
	const [clipSegments, setClipSegments] = useState<ClipSegment[]>([])
	const [selectedClipFile, setSelectedClipFile] = useState<string | null>(null)
	const [currentEdit, setCurrentEdit] = useState<ProjectEdit | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

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

	return (
		<div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-100">
			<EditorHeader
				projectId={projectId}
				projectName={projectName}
				currentEditId={currentEdit?.id}
				onEditLoaded={setCurrentEdit}
			/>

			{error && (
				<p className="shrink-0 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
					{error}
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
			>
				<div className="flex h-full min-h-[6rem] items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/80">
					<p className="text-sm text-zinc-500">Tracks and clips</p>
				</div>
			</EditorPanel>
		</div>
	)
}
