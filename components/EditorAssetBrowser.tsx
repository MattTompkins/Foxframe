"use client"

import { useMemo } from "react"
import { ClipVideoPreview, clipMediaUrl } from "@/components/ClipVideoPreview"
import type { ClipSegment } from "@/lib/clip-segments"

export type EditorAssetBrowserProps = {
	projectId: string
	clips: string[]
	clipSegments: ClipSegment[]
	loading?: boolean
	error?: string | null
	selectedClipFile?: string | null
	onSelectClip?: (clipFile: string) => void
}

export function EditorAssetBrowser({
	projectId,
	clips,
	clipSegments,
	loading = false,
	error = null,
	selectedClipFile = null,
	onSelectClip,
}: EditorAssetBrowserProps) {
	const segmentsByFile = useMemo(
		() => new Map(clipSegments.map((segment) => [segment.clipFile, segment])),
		[clipSegments]
	)

	const sortedClips = useMemo(() => {
		return [...clips].sort((a, b) => {
			const rankA =
				segmentsByFile.get(a)?.globalRank ?? Number.MAX_SAFE_INTEGER
			const rankB =
				segmentsByFile.get(b)?.globalRank ?? Number.MAX_SAFE_INTEGER
			return rankA - rankB
		})
	}, [clips, segmentsByFile])

	if (loading) {
		return <p className="text-sm text-zinc-500">Loading clips…</p>
	}

	if (error) {
		return (
			<p className="text-sm text-red-400" role="alert">
				{error}
			</p>
		)
	}

	if (sortedClips.length === 0) {
		return (
			<p className="text-sm text-zinc-500">
				No clips yet. Process this project with smart editing to populate the
				asset browser.
			</p>
		)
	}

	return (
		<ul className="flex flex-col gap-2">
			{sortedClips.map((clipFile) => {
				const segment = segmentsByFile.get(clipFile)
				const isSelected = clipFile === selectedClipFile

				return (
					<li key={clipFile}>
						<button
							type="button"
							onClick={() => onSelectClip?.(clipFile)}
							className={`flex w-full flex-col gap-2 rounded-lg border p-2 text-left transition-colors ${
								isSelected
									? "border-orange-500 bg-orange-500/10"
									: "border-zinc-700 bg-zinc-800/80 hover:border-zinc-500"
							}`}
						>
							<ClipVideoPreview
								src={clipMediaUrl(projectId, clipFile)}
								className="aspect-video w-full shrink-0 overflow-hidden rounded bg-black"
								videoClassName="h-full w-full"
								objectFit="cover"
							/>
							<div className="min-w-0">
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
	)
}
