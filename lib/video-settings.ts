export type AspectRatio = "9:16" | "1:1" | "16:9"
export type CropMode = "center" | "top" | "bottom"
export type FramingMode = "smart" | "fit" | "fill"
export type OutputResolution = "1080x1920" | "720x1280" | "1080x1080" | "1920x1080"
export type OutputFormat = "mp4" | "mov"
export type OutputCodec = "h264" | "h265"

export type VideoSettings = {
	aspectRatio: AspectRatio
	framingMode: FramingMode
	cropMode: CropMode
	lensK1: number
	lensK2: number
	autoRotate: boolean
	outputResolution: OutputResolution
	outputFormat: OutputFormat
	outputCodec: OutputCodec
	crf: number
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
	aspectRatio: "9:16",
	framingMode: "smart",
	cropMode: "center",
	lensK1: 0,
	lensK2: 0,
	autoRotate: true,
	outputResolution: "1080x1920",
	outputFormat: "mp4",
	outputCodec: "h264",
	crf: 18,
}

const ASPECT_RATIOS = new Set<AspectRatio>(["9:16", "1:1", "16:9"])
const CROP_MODES = new Set<CropMode>(["center", "top", "bottom"])
const FRAMING_MODES = new Set<FramingMode>(["smart", "fit", "fill"])
const OUTPUT_RESOLUTIONS = new Set<OutputResolution>([
	"1080x1920",
	"720x1280",
	"1080x1080",
	"1920x1080",
])
const OUTPUT_FORMATS = new Set<OutputFormat>(["mp4", "mov"])
const OUTPUT_CODECS = new Set<OutputCodec>(["h264", "h265"])

export function mergeVideoSettings(
	partial: Partial<VideoSettings> | undefined | null
): VideoSettings {
	if (!partial) {
		return { ...DEFAULT_VIDEO_SETTINGS }
	}

	return {
		aspectRatio: ASPECT_RATIOS.has(partial.aspectRatio as AspectRatio)
			? (partial.aspectRatio as AspectRatio)
			: DEFAULT_VIDEO_SETTINGS.aspectRatio,
		cropMode: CROP_MODES.has(partial.cropMode as CropMode)
			? (partial.cropMode as CropMode)
			: DEFAULT_VIDEO_SETTINGS.cropMode,
		framingMode: FRAMING_MODES.has(partial.framingMode as FramingMode)
			? (partial.framingMode as FramingMode)
			: DEFAULT_VIDEO_SETTINGS.framingMode,
		lensK1:
			typeof partial.lensK1 === "number" && Number.isFinite(partial.lensK1)
				? partial.lensK1
				: DEFAULT_VIDEO_SETTINGS.lensK1,
		lensK2:
			typeof partial.lensK2 === "number" && Number.isFinite(partial.lensK2)
				? partial.lensK2
				: DEFAULT_VIDEO_SETTINGS.lensK2,
		autoRotate:
			typeof partial.autoRotate === "boolean"
				? partial.autoRotate
				: DEFAULT_VIDEO_SETTINGS.autoRotate,
		outputResolution: OUTPUT_RESOLUTIONS.has(
			partial.outputResolution as OutputResolution
		)
			? (partial.outputResolution as OutputResolution)
			: DEFAULT_VIDEO_SETTINGS.outputResolution,
		outputFormat: OUTPUT_FORMATS.has(partial.outputFormat as OutputFormat)
			? (partial.outputFormat as OutputFormat)
			: DEFAULT_VIDEO_SETTINGS.outputFormat,
		outputCodec: OUTPUT_CODECS.has(partial.outputCodec as OutputCodec)
			? (partial.outputCodec as OutputCodec)
			: DEFAULT_VIDEO_SETTINGS.outputCodec,
		crf:
			typeof partial.crf === "number" &&
			Number.isInteger(partial.crf) &&
			partial.crf >= 15 &&
			partial.crf <= 28
				? partial.crf
				: DEFAULT_VIDEO_SETTINGS.crf,
	}
}
