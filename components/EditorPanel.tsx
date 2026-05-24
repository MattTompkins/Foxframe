import type { ReactNode } from "react"

export function EditorPanel({
	title,
	children,
	className = "",
	scrollable = true,
	padded = true,
}: {
	title: string
	children?: ReactNode
	className?: string
	/** Asset panels scroll; canvas should not. */
	scrollable?: boolean
	padded?: boolean
}) {
	return (
		<section
			className={`flex min-h-0 flex-col border-zinc-700 bg-zinc-900 ${className}`}
		>
			<div className="shrink-0 border-b border-zinc-700 px-3 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
					{title}
				</h2>
			</div>
			<div
				className={`flex min-h-0 flex-1 flex-col ${
					padded ? "p-3" : ""
				} ${scrollable ? "overflow-auto" : "overflow-hidden"}`}
				{...(scrollable ? { "data-panel-scroll": true } : {})}
			>
				{children}
			</div>
		</section>
	)
}
