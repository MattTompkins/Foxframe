"use client"

import { useEffect, useState } from "react"
import { ClipVideoPreview } from "@/components/ClipVideoPreview"
import { isVideoFileName } from "@/lib/video-files"
import { Grid2X2, Grid3X3, Trash2 } from "lucide-react"

type FileBrowserProps = {
	projectId: string
	/** Bump after uploads so the list refreshes */
	refreshKey?: number
}

function mediaUrl(projectId: string, fileName: string) {
	return `/api/projects/${projectId}/media/${encodeURIComponent(fileName)}`
}

export default function FileBrowser({
	projectId,
	refreshKey = 0,
}: FileBrowserProps) {
	const [files, setFiles] = useState<string[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [gridMode, setGridMode] = useState<"large" | "small">("small")

	useEffect(() => {
		if (!projectId) {
			setFiles([])
			setLoading(false)
			return
		}

		let cancelled = false

		async function load() {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/projects/${projectId}/sources`)

				if (!response.ok) {
					const data = await response.json().catch(() => ({}))
					throw new Error(
						typeof data.error === "string"
							? data.error
							: "Could not load uploaded files"
					)
				}

				const data = (await response.json()) as { sourceFiles?: string[] }
				const names = (data.sourceFiles ?? []).filter(isVideoFileName)

				if (!cancelled) {
					setFiles(names)
				}
			} catch (loadError) {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Failed to load uploaded files"
					)
					setFiles([])
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
	}, [projectId, refreshKey])

	if (!projectId) {
		return null
	}

	if (loading) {
		return (
			<p className="mt-4 w-full text-sm text-zinc-400">Loading uploads…</p>
		)
	}

	if (error) {
		return (
			<p className="mt-4 w-full text-sm text-red-400" role="alert">
				{error}
			</p>
		)
	}

	if (files.length === 0) {
		return (
			<p className="mt-4 w-full text-sm text-zinc-400">
				No video files uploaded yet.
			</p>
		)
	}

	return (
		<>
			<div className="flex items-center gap-2 items-center justify-between w-full mt-10">
				<h2 className="text-2xl font-semibold text-white">
					Uploaded files
				</h2>
				<div className="flex flex-row gap-1">
					<button
						type="button"
						aria-label="Larger grid"
						aria-pressed={gridMode === "large"}
						className="cursor-pointer rounded p-0.5 transition-colors hover:opacity-80"
						onClick={() => setGridMode("large")}
					>
						<Grid2X2
							size={30}
							className={
								gridMode === "large" ? "text-orange-500" : "text-zinc-400"
							}
						/>
					</button>
					<button
						type="button"
						aria-label="Smaller grid"
						aria-pressed={gridMode === "small"}
						className="cursor-pointer rounded p-0.5 transition-colors hover:opacity-80"
						onClick={() => setGridMode("small")}
					>
						<Grid3X3
							size={30}
							className={
								gridMode === "small" ? "text-orange-500" : "text-zinc-400"
							}
						/>
					</button>
				</div>
			</div>

			<ul
				className={
					gridMode === "large"
						? "mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2"
						: "mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
				}
			>
				{files.map((fileName) => (
					<li
						key={fileName}
						className="relative overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800"
					>
						<button
							type="button"
							className="absolute right-0 top-0 z-20 m-2 rounded-full bg-red-600 p-2 text-white opacity-70 transition-opacity hover:opacity-100"
						>
							<Trash2 size={gridMode === "large" ? 20 : 14} />
						</button>
						<ClipVideoPreview src={mediaUrl(projectId, fileName)} />
						<p
							className="truncate px-2 py-1.5 text-xs text-zinc-300"
							title={fileName}
						>
							{fileName}
						</p>
					</li>
				))}
			</ul>
		</>
	)
}
