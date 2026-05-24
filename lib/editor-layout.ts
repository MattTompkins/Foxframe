const STORAGE_KEY = "foxframe-editor-layout-v1"

export type EditorLayoutPrefs = {
	timelineHeight: number
	assetWidth: number
	assetHeight: number
}

export const DEFAULT_EDITOR_LAYOUT: EditorLayoutPrefs = {
	timelineHeight: 256,
	assetWidth: 288,
	assetHeight: 220,
}

export function loadEditorLayout(): EditorLayoutPrefs {
	if (typeof window === "undefined") {
		return DEFAULT_EDITOR_LAYOUT
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return DEFAULT_EDITOR_LAYOUT

		const parsed = JSON.parse(raw) as Partial<EditorLayoutPrefs>
		return {
			timelineHeight:
				typeof parsed.timelineHeight === "number"
					? parsed.timelineHeight
					: DEFAULT_EDITOR_LAYOUT.timelineHeight,
			assetWidth:
				typeof parsed.assetWidth === "number"
					? parsed.assetWidth
					: DEFAULT_EDITOR_LAYOUT.assetWidth,
			assetHeight:
				typeof parsed.assetHeight === "number"
					? parsed.assetHeight
					: DEFAULT_EDITOR_LAYOUT.assetHeight,
		}
	} catch {
		return DEFAULT_EDITOR_LAYOUT
	}
}

export function saveEditorLayout(prefs: EditorLayoutPrefs) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
	} catch {
		// ignore quota / private mode
	}
}

export function layoutLimits() {
	const vh = typeof window !== "undefined" ? window.innerHeight : 800
	const vw = typeof window !== "undefined" ? window.innerWidth : 1200

	return {
		timeline: { min: 140, max: Math.round(vh * 0.65) },
		assetWidth: { min: 200, max: Math.min(960, Math.round(vw * 0.72)) },
		assetHeight: { min: 120, max: Math.round(vh * 0.45) },
	}
}
