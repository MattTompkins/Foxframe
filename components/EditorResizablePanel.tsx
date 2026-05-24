"use client"

import { useCallback, useRef, type ReactNode } from "react"
import { GripHorizontal, GripVertical } from "lucide-react"
import { EditorPanel } from "@/components/EditorPanel"

type ResizeEdge = "top" | "right" | "bottom"

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function useResizeDrag(
	edge: ResizeEdge,
	size: number,
	onSizeChange: (size: number) => void,
	limits: { min: number; max: number }
) {
	const dragRef = useRef<{ startCoord: number; startSize: number } | null>(null)

	const onPointerDown = useCallback(
		(event: React.PointerEvent) => {
			event.preventDefault()
			const startCoord =
				edge === "right" ? event.clientX : event.clientY

			dragRef.current = { startCoord, startSize: size }

			const onPointerMove = (moveEvent: PointerEvent) => {
				const drag = dragRef.current
				if (!drag) return

				const currentCoord =
					edge === "right" ? moveEvent.clientX : moveEvent.clientY

				let delta = currentCoord - drag.startCoord
				if (edge === "top") {
					delta = drag.startCoord - currentCoord
				}

				onSizeChange(
					clamp(drag.startSize + delta, limits.min, limits.max)
				)
			}

			const onPointerUp = () => {
				dragRef.current = null
				document.removeEventListener("pointermove", onPointerMove)
				document.removeEventListener("pointerup", onPointerUp)
				document.removeEventListener("pointercancel", onPointerUp)
			}

			document.addEventListener("pointermove", onPointerMove)
			document.addEventListener("pointerup", onPointerUp)
			document.addEventListener("pointercancel", onPointerUp)
		},
		[edge, limits.max, limits.min, onSizeChange, size]
	)

	return onPointerDown
}

function ResizeHandle({
	edge,
	onPointerDown,
}: {
	edge: ResizeEdge
	onPointerDown: (event: React.PointerEvent) => void
}) {
	const isHorizontalEdge = edge === "top" || edge === "bottom"
	const GripIcon = isHorizontalEdge ? GripHorizontal : GripVertical

	return (
		<div
			role="separator"
			aria-orientation={isHorizontalEdge ? "horizontal" : "vertical"}
			aria-label="Drag to resize panel"
			title="Drag to resize"
			onPointerDown={onPointerDown}
			className={`group z-20 flex shrink-0 touch-none items-center justify-center transition-colors ${
				isHorizontalEdge
					? "h-3 w-full cursor-ns-resize border-y border-zinc-600 bg-zinc-800 hover:border-orange-500/60 hover:bg-zinc-700 active:border-orange-500 active:bg-zinc-700"
					: "h-full w-3 cursor-ew-resize border-l border-zinc-600 bg-zinc-800 hover:border-orange-500/60 hover:bg-zinc-700 active:border-orange-500 active:bg-zinc-700"
			}`}
		>
			<GripIcon
				size={16}
				strokeWidth={2}
				aria-hidden
				className="pointer-events-none text-zinc-500 transition-colors group-hover:text-orange-400 group-active:text-orange-400"
			/>
		</div>
	)
}

export function EditorResizablePanel({
	title,
	edge,
	size,
	onSizeChange,
	min,
	max,
	children,
	className = "",
	scrollable = true,
	padded = true,
}: {
	title: string
	edge: ResizeEdge
	size: number
	onSizeChange: (size: number) => void
	min: number
	max: number
	children?: ReactNode
	className?: string
	scrollable?: boolean
	padded?: boolean
}) {
	const onPointerDown = useResizeDrag(edge, size, onSizeChange, { min, max })

	const sizeStyle =
		edge === "right"
			? { width: size, maxWidth: "100%" }
			: { height: size, maxHeight: "100%" }

	if (edge === "right") {
		return (
			<div
				className={`flex min-h-0 shrink-0 ${className}`}
				style={sizeStyle}
			>
				<EditorPanel
					title={title}
					className="min-h-0 min-w-0 flex-1"
					scrollable={scrollable}
					padded={padded}
				>
					{children}
				</EditorPanel>
				<ResizeHandle edge={edge} onPointerDown={onPointerDown} />
			</div>
		)
	}

	return (
		<div
			className={`flex min-h-0 shrink-0 flex-col ${className}`}
			style={sizeStyle}
		>
			{edge === "top" && (
				<ResizeHandle edge={edge} onPointerDown={onPointerDown} />
			)}
			<EditorPanel
				title={title}
				className="min-h-0 min-w-0 flex-1"
				scrollable={scrollable}
				padded={padded}
			>
				{children}
			</EditorPanel>
			{edge === "bottom" && (
				<ResizeHandle edge={edge} onPointerDown={onPointerDown} />
			)}
		</div>
	)
}
