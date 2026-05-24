export function StepCounter({
	current,
	total,
	stepName,
}: {
	current: number
	total: number
	stepName?: string
}) {
	return (
		<p className="text-sm font-medium uppercase tracking-wide text-orange-400">
			Step {current} of {total} · {stepName}
		</p>

	)
}