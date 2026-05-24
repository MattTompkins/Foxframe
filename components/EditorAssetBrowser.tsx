"use client"

import { useMemo } from "react"
import { ClipVideoPreview, clipMediaUrl } from "@/components/ClipVideoPreview"
import { CLIP_DRAG_MIME } from "@/lib/edit-client"
import type { ClipSegment } from "@/lib/clip-segments"

const CARD_MIN_PX = 132

export type EditorAssetBrowserProps = {
	projectId: string
	clips: string[]
	clipSegments: ClipSegment[]
	loading?: boolean
	error?: string | null
	selectedClipFile?: string | null
	onSelectClip?: (clipFile: string) => void
	/** When true, clips can be dragged onto the timeline. */
	canDragToTimeline?: boolean
}

function AssetClipCard({
	projectId,
	clipFile,
	segment,
	isSelected,
	onSelectClip,
	canDragToTimeline,
}: {
	projectId: string
	clipFile: string
	segment?: ClipSegment
	isSelected: boolean
	onSelectClip?: (clipFile: string) => void
	canDragToTimeline?: boolean
}) {
	return (
		<div
			className={`flex h-full min-w-0 flex-col gap-2 rounded-lg border p-2 transition-colors ${
				isSelected
					? "border-orange-500 bg-orange-500/10"
					: "border-zinc-700 bg-zinc-800/80"
			}`}
		>
			<button
				type="button"
				draggable={canDragToTimeline}
				onDragStart={(event) => {
					event.dataTransfer.setData(CLIP_DRAG_MIME, clipFile)
					event.dataTransfer.effectAllowed = "copy"
				}}
				onClick={() => onSelectClip?.(clipFile)}
				className="flex min-w-0 flex-1 flex-col gap-2 text-left hover:opacity-95"
			>
				<ClipVideoPreview
					src={clipMediaUrl(projectId, clipFile)}
					className="aspect-video w-full shrink-0 overflow-hidden rounded bg-black"
					videoClassName="h-full w-full"
					objectFit="cover"
				/>
				<div className="min-w-0">
					<p
						className="line-clamp-2 text-xs font-medium leading-snug text-white"
						title={clipFile}
					>
						{clipFile}
					</p>
					{segment && (
						<p className="mt-0.5 text-[11px] text-zinc-400">
							#{segment.globalRank ?? "?"} · {segment.finalScore.toFixed(2)}
							{segment.selectedForUse ? " · export" : ""}
						</p>
					)}
				</div>
			</button>
		</div>
	)
}

export function EditorAssetBrowser({
	projectId,
	clips,
	clipSegments,
	loading = false,
	error = null,
	selectedClipFile = null,
	onSelectClip,
	canDragToTimeline = false,
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
		<ul
			className="grid gap-2"
			style={{
				gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_PX}px, 1fr))`,
			}}
		>
			{sortedClips.map((clipFile) => {
				const segment = segmentsByFile.get(clipFile)
				const isSelected = clipFile === selectedClipFile

				return (
					<li key={clipFile} className="min-w-0">
						<AssetClipCard
							projectId={projectId}
							clipFile={clipFile}
							segment={segment}
							isSelected={isSelected}
							onSelectClip={onSelectClip}
							canDragToTimeline={canDragToTimeline}
						/>
					</li>
				)
			})}
		</ul>
	)
}
