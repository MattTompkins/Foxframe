import type { ReactNode } from "react"

type SettingFieldProps = {
	label: string
	help: string
	example?: string
	disabled?: boolean
	children: ReactNode
}

export function SettingField({
	label,
	help,
	example,
	disabled,
	children,
}: SettingFieldProps) {
	return (
		<div
			className={`flex flex-col gap-2 ${disabled ? "pointer-events-none" : ""}`}
		>
			<label className="text-base font-medium text-white">{label}</label>
			<p className="text-sm leading-relaxed text-zinc-400">{help}</p>
			{example && (
				<p className="text-xs leading-relaxed text-zinc-500">
					<span className="font-medium text-zinc-400">Example: </span>
					{example}
				</p>
			)}
			<div className="mt-1">{children}</div>
		</div>
	)
}
