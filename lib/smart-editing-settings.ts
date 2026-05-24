export type KeyMomentDetection =
	| "camera-movement"
	| "audio"
	| "combined"
	| "scene-state"

export type ClipDistribution = "start" | "end" | "mixed"

export type SmartEditingSettings = {
	enabled: boolean
	minClipLengthSeconds: number
	maxClipLengthSeconds: number
	keyMomentDetection: KeyMomentDetection
	clipsPerSourceFile: number
	/** 0 = key-moment detection only, 100 = computer vision fully drives clip ranking */
	computerVisionWeight: number
	positivePrompt: string
	negativePrompt: string
	clipDistribution: ClipDistribution
}

export const DEFAULT_SMART_EDITING_SETTINGS: SmartEditingSettings = {
	enabled: false,
	minClipLengthSeconds: 3,
	maxClipLengthSeconds: 15,
	keyMomentDetection: "combined",
	clipsPerSourceFile: 3,
	computerVisionWeight: 0,
	positivePrompt: "",
	negativePrompt: "",
	clipDistribution: "mixed",
}

const KEY_MOMENT_DETECTION = new Set<KeyMomentDetection>([
	"camera-movement",
	"audio",
	"combined",
	"scene-state",
])

const CLIP_DISTRIBUTION = new Set<ClipDistribution>(["start", "end", "mixed"])

function clampInt(value: unknown, min: number, max: number, fallback: number) {
	if (typeof value !== "number" || !Number.isInteger(value)) return fallback
	return Math.max(min, Math.min(max, value))
}

function resolveComputerVisionWeight(
	partial: Partial<SmartEditingSettings> & { computerVisionEnabled?: boolean }
): number {
	if (typeof partial.computerVisionWeight === "number") {
		return clampInt(partial.computerVisionWeight, 0, 100, 0)
	}

	if (partial.computerVisionEnabled === true) {
		return 100
	}

	if (partial.computerVisionEnabled === false) {
		return 0
	}

	return DEFAULT_SMART_EDITING_SETTINGS.computerVisionWeight
}

export function mergeSmartEditingSettings(
	partial: Partial<SmartEditingSettings> & { computerVisionEnabled?: boolean } | null | undefined
): SmartEditingSettings {
	if (!partial) {
		return { ...DEFAULT_SMART_EDITING_SETTINGS }
	}

	const minClipLengthSeconds = clampInt(
		partial.minClipLengthSeconds,
		1,
		120,
		DEFAULT_SMART_EDITING_SETTINGS.minClipLengthSeconds
	)
	const maxClipLengthSeconds = clampInt(
		partial.maxClipLengthSeconds,
		1,
		300,
		DEFAULT_SMART_EDITING_SETTINGS.maxClipLengthSeconds
	)

	return {
		enabled:
			typeof partial.enabled === "boolean"
				? partial.enabled
				: DEFAULT_SMART_EDITING_SETTINGS.enabled,
		minClipLengthSeconds: Math.min(minClipLengthSeconds, maxClipLengthSeconds),
		maxClipLengthSeconds: Math.max(minClipLengthSeconds, maxClipLengthSeconds),
		keyMomentDetection: KEY_MOMENT_DETECTION.has(
			partial.keyMomentDetection as KeyMomentDetection
		)
			? (partial.keyMomentDetection as KeyMomentDetection)
			: DEFAULT_SMART_EDITING_SETTINGS.keyMomentDetection,
		clipsPerSourceFile: clampInt(
			partial.clipsPerSourceFile,
			1,
			50,
			DEFAULT_SMART_EDITING_SETTINGS.clipsPerSourceFile
		),
		computerVisionWeight: resolveComputerVisionWeight(partial),
		positivePrompt:
			typeof partial.positivePrompt === "string"
				? partial.positivePrompt.slice(0, 500)
				: DEFAULT_SMART_EDITING_SETTINGS.positivePrompt,
		negativePrompt:
			typeof partial.negativePrompt === "string"
				? partial.negativePrompt.slice(0, 500)
				: DEFAULT_SMART_EDITING_SETTINGS.negativePrompt,
		clipDistribution: CLIP_DISTRIBUTION.has(
			partial.clipDistribution as ClipDistribution
		)
			? (partial.clipDistribution as ClipDistribution)
			: DEFAULT_SMART_EDITING_SETTINGS.clipDistribution,
	}
}

export function usesComputerVision(settings: SmartEditingSettings) {
	return settings.computerVisionWeight > 0
}
