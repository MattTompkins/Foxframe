"use client"

import Link from "next/link"

export function EditorHeader({
    projectId,
    projectName }:
    {
        projectId: string,
        projectName: string
    }
) {
	return (
		<header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-700 bg-zinc-900 px-4">
			<h1 className="truncate text-sm font-semibold text-white sm:text-base">
				<span className="text-zinc-400">Editor</span>
				<span className="mx-2 text-zinc-600" aria-hidden>
					/
				</span>
				{projectName}
			</h1>
			<nav className="flex shrink-0 items-center gap-2 sm:gap-3">
				<Link
					className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white sm:px-4 sm:py-2.5"
					href={`/project/${projectId}`}
				>
					Project home
				</Link>
				<button
					type="button"
					className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900 sm:px-4 sm:py-2.5"
				>
					Save / Export
				</button>
			</nav>
		</header>
	)
}