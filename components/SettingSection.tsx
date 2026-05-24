import type { ReactNode } from "react"

type SettingSectionProps = {
	title: string
	summary: string
	disabled?: boolean
	children: ReactNode
}

export function SettingSection({
	title,
	summary,
	disabled,
	children,
}: SettingSectionProps) {
	return (
		<section
			className={`w-full rounded-xl border border-zinc-700 bg-zinc-800/50 p-6 ${disabled ? "opacity-50" : ""}`}
		>
			<h2 className="text-xl font-semibold text-white">{title}</h2>
			<p className="mt-1 text-sm leading-relaxed text-zinc-400">{summary}</p>
			<div className="mt-5 flex flex-col gap-6">{children}</div>
		</section>
	)
}
