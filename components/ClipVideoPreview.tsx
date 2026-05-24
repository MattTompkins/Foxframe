"use client"

import { useEffect, useRef, useState } from "react"

export function clipMediaUrl(projectId: string, clipFile: string) {
	return `/api/projects/${projectId}/media/clips/${encodeURIComponent(clipFile)}`
}

type ClipVideoPreviewProps = {
	src: string
	className?: string
	videoClassName?: string
	objectFit?: "contain" | "cover"
}

/** Lazy-loads clip metadata when visible inside a scrollable panel or viewport. */
export function ClipVideoPreview({
	src,
	className = "relative aspect-video w-full bg-black",
	videoClassName = "aspect-video w-full object-contain",
	objectFit = "contain",
}: ClipVideoPreviewProps) {
	const rootRef = useRef<HTMLDivElement>(null)
	const [shouldLoad, setShouldLoad] = useState(false)
	const [failed, setFailed] = useState(false)
	const [retryCount, setRetryCount] = useState(0)

	useEffect(() => {
		setShouldLoad(false)
		setFailed(false)
		setRetryCount(0)
	}, [src])

	useEffect(() => {
		const node = rootRef.current
		if (!node) return

		const scrollRoot = node.closest("[data-panel-scroll]")

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setShouldLoad(true)
					observer.disconnect()
				}
			},
			{
				root: scrollRoot instanceof Element ? scrollRoot : null,
				rootMargin: "120px",
				threshold: 0.01,
			}
		)

		observer.observe(node)

		return () => observer.disconnect()
	}, [src])

	const videoSrc =
		shouldLoad && !failed
			? retryCount > 0
				? `${src}?retry=${retryCount}#t=0.001`
				: `${src}#t=0.001`
			: undefined

	function handleError() {
		if (retryCount < 2) {
			setRetryCount((count) => count + 1)
			return
		}
		setFailed(true)
	}

	function handleLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>) {
		const video = event.currentTarget
		if (!Number.isFinite(video.duration) || video.duration <= 0) return
		const target = Math.min(0.1, video.duration * 0.01)
		if (video.currentTime < target) {
			video.currentTime = target
		}
	}

	const fitClass = objectFit === "cover" ? "object-cover" : "object-contain"

	return (
		<div ref={rootRef} className={className}>
			{failed ? (
				<div className="flex h-full min-h-[4.5rem] items-center justify-center px-2 text-center text-xs text-zinc-500">
					Preview unavailable
				</div>
			) : shouldLoad ? (
				<video
					key={`${src}-${retryCount}`}
					src={videoSrc}
					preload="metadata"
					muted
					playsInline
					onError={handleError}
					onLoadedMetadata={handleLoadedMetadata}
					className={`${videoClassName} ${fitClass}`}
				/>
			) : (
				<div className="h-full min-h-[4.5rem] w-full animate-pulse bg-zinc-800" />
			)}
		</div>
	)
}
