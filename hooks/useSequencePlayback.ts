import { useEffect, useRef } from "react"

/** Advance playhead while `isPlaying` using a wall-clock RAF loop. */
export function useSequencePlayback({
	isPlaying,
	duration,
	onTick,
	onReachEnd,
}: {
	isPlaying: boolean
	duration: number
	onTick: (nextSeconds: number) => void
	onReachEnd: () => void
}) {
	const onTickRef = useRef(onTick)
	const onReachEndRef = useRef(onReachEnd)

	onTickRef.current = onTick
	onReachEndRef.current = onReachEnd

	useEffect(() => {
		if (!isPlaying || duration <= 0) return

		let last = performance.now()
		let frameId = 0

		function tick(now: number) {
			const deltaSeconds = (now - last) / 1000
			last = now

			onTickRef.current((previous) => {
				const next = previous + deltaSeconds
				if (next >= duration) {
					onReachEndRef.current()
					return duration
				}
				return next
			})

			frameId = requestAnimationFrame(tick)
		}

		frameId = requestAnimationFrame(tick)

		return () => cancelAnimationFrame(frameId)
	}, [duration, isPlaying])
}
