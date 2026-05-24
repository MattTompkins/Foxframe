import path from "path"

export const VIDEO_EXTENSIONS = new Set([
	".mov",
	".mp4",
	".m4v",
	".webm",
	".avi",
	".mkv",
	".mpeg",
	".mpg",
	".3gp",
])

export function isVideoFileName(fileName: string) {
	return VIDEO_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

export function filterVideoFiles(fileNames: string[]) {
	const videoFiles: string[] = []
	const skippedFiles: string[] = []

	for (const fileName of fileNames) {
		if (isVideoFileName(fileName)) {
			videoFiles.push(fileName)
		} else {
			skippedFiles.push(fileName)
		}
	}

	return { videoFiles, skippedFiles }
}

export const VIDEO_EXTENSIONS_LABEL = Array.from(VIDEO_EXTENSIONS)
	.map((ext) => ext.slice(1))
	.sort()
	.join(", ")
