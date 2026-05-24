"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { StepCounter } from "@/components/StepCounter"
import { SettingField } from "@/components/SettingField"
import { SettingSection } from "@/components/SettingSection"
import {
	DEFAULT_VIDEO_SETTINGS,
	type AspectRatio,
	type FramingMode,
	type OutputCodec,
	type OutputFormat,
	type OutputResolution,
	type VideoSettings,
} from "@/lib/video-settings"

function AspectRatioPreview({ ratio }: { ratio: AspectRatio }) {
	const sizes: Record<AspectRatio, string> = {
		"9:16": "h-20 w-11",
		"1:1": "h-14 w-14",
		"16:9": "h-11 w-20",
	}
	return (
		<div className="flex items-center gap-3 rounded-lg border border-zinc-600 bg-zinc-900/80 px-4 py-3">
			<div
				className={`shrink-0 rounded border-2 border-dashed border-orange-400 bg-orange-500/20 ${sizes[ratio]}`}
				aria-hidden
			/>
			<p className="text-sm text-zinc-400">
				Preview of the <strong className="text-zinc-300">output frame shape</strong>.
				Smart and Fit modes keep your full video inside this box; Fill mode crops to it.
			</p>
		</div>
	)
}

export default function ProjectSettingsPage() {
	const projectId = useParams().id as string

	const [settings, setSettings] = useState<VideoSettings>(DEFAULT_VIDEO_SETTINGS)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [saveMessage, setSaveMessage] = useState<string | null>(null)

	useEffect(() => {
		async function loadSettings() {
			try {
				setLoading(true)
				setError(null)

				const response = await fetch(`/api/projects/${projectId}/settings`)

				if (!response.ok) {
					const data = await response.json().catch(() => ({}))
					throw new Error(data.error ?? "Failed to load settings")
				}

				const data = await response.json()
				setSettings(data.settings)
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load settings"
				)
			} finally {
				setLoading(false)
			}
		}

		loadSettings()
	}, [projectId])

	function update<K extends keyof VideoSettings>(key: K, value: VideoSettings[K]) {
		setSaveMessage(null)
		setSettings((prev) => ({ ...prev, [key]: value }))
	}

	async function handleSave() {
		try {
			setSaving(true)
			setError(null)
			setSaveMessage(null)

			const response = await fetch(`/api/projects/${projectId}/settings`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ settings }),
			})

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				throw new Error(data.error ?? "Failed to save settings")
			}

			const data = await response.json()

			window.location.href = `/project/${projectId}/smart-editing`

		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save settings")
		} finally {
			setSaving(false)
		}
	}

	const resolutionOptions: { value: OutputResolution; label: string; forRatio: AspectRatio[] }[] = [
		{ value: "1080x1920", label: "1080 × 1920 (Full HD vertical)", forRatio: ["9:16"] },
		{ value: "720x1280", label: "720 × 1280 (HD vertical)", forRatio: ["9:16"] },
		{ value: "1080x1080", label: "1080 × 1080 (Full HD square)", forRatio: ["1:1"] },
		{ value: "1920x1080", label: "1920 × 1080 (Full HD landscape)", forRatio: ["16:9"] },
	]

	const filteredResolutions = resolutionOptions.filter((opt) =>
		opt.forRatio.includes(settings.aspectRatio)
	)

	return (
		<div className="flex min-h-full flex-1 flex-col bg-zinc-900 font-sans">
			<main className="mx-auto flex w-full max-w-3xl flex-col px-6 py-16 sm:py-24">
				<header className="mb-10">
					<StepCounter current={2} total={4} stepName="Output settings" />
					<h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">
						How should your videos look?
					</h1>
					<p className="mt-4 text-lg leading-relaxed text-zinc-300">
						These options control cropping, lens distortion fixes, and export
						quality. They apply to every uploaded clip (including{" "}
						<code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-zinc-200">
							.mov
						</code>{" "}
						files from iPhone or camera) when you process the project.
					</p>
				</header>

				{loading && (
					<p className="mb-6 text-sm text-zinc-400">Loading saved settings…</p>
				)}

				{error && (
					<div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
						{error}
					</div>
				)}

				{saveMessage && (
					<div className="mb-6 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-300">
						{saveMessage}
					</div>
				)}

				<form
					className={`flex flex-col gap-8 ${loading ? "pointer-events-none opacity-60" : ""}`}
					onSubmit={(e) => {
						e.preventDefault()
						handleSave()
					}}
				>
					<SettingSection
						title="Framing & crop"
						summary="Control how your video is resized to the target shape — keep the full frame, crop aggressively, or let smart mode decide based on your content."
					>
						<SettingField
							label="Framing strategy"
							help="This is the biggest factor in how much of your video survives processing. Smart mode analyses your footage and picks the least destructive approach. Fit never cuts anything off (adds black bars instead). Fill always crops to fill the frame edge-to-edge."
							example="Use Smart for mixed phone clips. Use Fit if heads or text keep getting cut off. Use Fill only when you want a tight, full-bleed crop."
						>
							<fieldset className="flex flex-col gap-2">
								{(
									[
										{
											value: "smart" as const,
											title: "Smart (recommended)",
											desc: "Detects the main content area, frames around it, and switches to letterboxing if a hard crop would cut off too much.",
										},
										{
											value: "fit" as const,
											title: "Fit — show everything",
											desc: "Scales the full video to fit inside the target shape. Nothing is cut off; black bars fill the empty space.",
										},
										{
											value: "fill" as const,
											title: "Fill — crop to fit",
											desc: "Crops edges until the frame is completely filled. Best for footage that already matches your target shape.",
										},
									] as const
								).map((opt) => (
									<label
										key={opt.value}
										className={`flex cursor-pointer flex-col rounded-lg border px-4 py-3 transition-colors ${
											settings.framingMode === opt.value
												? "border-orange-500 bg-orange-500/10"
												: "border-zinc-600 bg-zinc-900 hover:border-zinc-500"
										}`}
									>
										<span className="flex items-center gap-2">
											<input
												type="radio"
												name="framingMode"
												value={opt.value}
												checked={settings.framingMode === opt.value}
												onChange={() => update("framingMode", opt.value)}
												className="accent-orange-500"
											/>
											<span className="font-medium text-white">{opt.title}</span>
										</span>
										<span className="mt-1 pl-6 text-sm text-zinc-400">
											{opt.desc}
										</span>
									</label>
								))}
							</fieldset>
						</SettingField>

						<SettingField
							label="Target aspect ratio"
							help="The width-to-height proportion of the finished video. With Fit or Smart mode, your full video is preserved inside this shape. With Fill mode, we crop to match it exactly."
							example="Pick 9:16 for TikTok, Instagram Reels, and YouTube Shorts."
						>
							<select
								value={settings.aspectRatio}
								onChange={(e) => {
									const aspectRatio = e.target.value as AspectRatio
									update("aspectRatio", aspectRatio)
									const match = resolutionOptions.find((r) =>
										r.forRatio.includes(aspectRatio)
									)
									if (match) update("outputResolution", match.value)
								}}
								className="w-full rounded-lg mb-2 border border-zinc-600 bg-zinc-900 px-4 py-3 text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
							>
								<option value="9:16">9:16 — Vertical (phone / Reels / Shorts)</option>
								<option value="1:1">1:1 — Square (Instagram feed, some ads)</option>
								<option value="16:9">16:9 — Landscape (YouTube, TV-style)</option>
							</select>
							<AspectRatioPreview ratio={settings.aspectRatio} />
						</SettingField>

						{settings.framingMode !== "fit" && (
							<SettingField
								label="Crop focus"
								help="When cropping is needed, this tells us where to anchor the frame — based on the detected content area in Smart mode, or the raw video otherwise. Not used when Framing strategy is Fit."
								example="Use “Keep the top” for talking-head clips where the face is in the upper half."
							>
								<fieldset className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
									{(
										[
											{
												value: "center" as const,
												title: "Center on content",
												desc: "Frames the middle of the detected subject area.",
											},
											{
												value: "top" as const,
												title: "Keep the top",
												desc: "Biases the crop upward — good for faces and heads.",
											},
											{
												value: "bottom" as const,
												title: "Keep the bottom",
												desc: "Biases the crop downward — good for action in the lower frame.",
											},
										] as const
									).map((opt) => (
										<label
											key={opt.value}
											className={`flex flex-1 cursor-pointer flex-col rounded-lg border px-4 py-3 transition-colors ${
												settings.cropMode === opt.value
													? "border-orange-500 bg-orange-500/10"
													: "border-zinc-600 bg-zinc-900 hover:border-zinc-500"
											}`}
										>
											<span className="flex items-center gap-2">
												<input
													type="radio"
													name="cropMode"
													value={opt.value}
													checked={settings.cropMode === opt.value}
													onChange={() => update("cropMode", opt.value)}
													className="accent-orange-500"
												/>
												<span className="font-medium text-white">{opt.title}</span>
											</span>
											<span className="mt-1 pl-6 text-sm text-zinc-400">
												{opt.desc}
											</span>
										</label>
									))}
								</fieldset>
							</SettingField>
						)}

						<SettingField
							label="Output resolution"
							help="The exact pixel size of the exported file. Higher numbers look sharper but produce larger files and take longer to process."
							example="1080 × 1920 is standard for vertical social video."
						>
							<select
								value={settings.outputResolution}
								onChange={(e) =>
									update("outputResolution", e.target.value as OutputResolution)
								}
								className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
							>
								{filteredResolutions.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</SettingField>
					</SettingSection>

					<SettingSection
						title="Lens & distortion"
						summary="Phone and action cameras often bend straight lines near the edges (barrel distortion). These sliders counteract that before cropping."
					>
						<SettingField
							label={`Barrel / pincushion correction (K1): ${settings.lensK1.toFixed(2)}`}
							help="K1 is the main distortion fix. Negative values pull curved edges inward (fixes wide-angle “bulge”). Positive values do the opposite. Start at 0 and only adjust if walls or horizons look bent."
							example="iPhone selfie cam at arm’s length often needs a small negative K1 (around −0.10 to −0.20)."
						>
							<input
								type="range"
								min={-0.5}
								max={0.5}
								step={0.01}
								value={settings.lensK1}
								onChange={(e) => update("lensK1", parseFloat(e.target.value))}
								className="w-full accent-orange-500"
							/>
							<div className="flex justify-between text-xs text-zinc-500">
								<span>−0.50 (fix bulging edges)</span>
								<span>0 (no correction)</span>
								<span>+0.50 (opposite)</span>
							</div>
						</SettingField>

						<SettingField
							label={`Fine distortion tweak (K2): ${settings.lensK2.toFixed(2)}`}
							help="K2 fine-tunes the correction after K1. Most clips can leave this at 0. Only change it if edges still look wrong after adjusting K1."
							example="Rarely needed unless you are matching a specific lens profile."
						>
							<input
								type="range"
								min={-0.5}
								max={0.5}
								step={0.01}
								value={settings.lensK2}
								onChange={(e) => update("lensK2", parseFloat(e.target.value))}
								className="w-full accent-orange-500"
							/>
							<div className="flex justify-between text-xs text-zinc-500">
								<span>−0.50</span>
								<span>0 (default)</span>
								<span>+0.50</span>
							</div>
						</SettingField>
					</SettingSection>

					<SettingSection
						title="Source file handling"
						summary="Options for how we read your original files before applying crop and distortion fixes."
					>
						<SettingField
							label="Respect phone rotation"
							help="Many .mov files from iPhones store rotation in metadata instead of rotating the pixels. When enabled, we rotate the video so it displays upright before cropping. Turn off only if your file already looks correct and processing makes it sideways."
							example="Leave this on for iPhone and most Android camera clips."
						>
							<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-4">
								<input
									type="checkbox"
									checked={settings.autoRotate}
									onChange={(e) => update("autoRotate", e.target.checked)}
									className="mt-1 h-4 w-4 accent-orange-500"
								/>
								<span className="flex flex-col gap-1">
									<span className="font-medium text-white">
										Auto-rotate using file metadata
									</span>
									<span className="text-sm text-zinc-400">
										{settings.autoRotate
											? "Enabled — vertical phone videos will be treated as upright."
											: "Disabled — we use pixels exactly as stored in the file."}
									</span>
								</span>
							</label>
						</SettingField>
					</SettingSection>

					<SettingSection
						title="Export format"
						summary="How the processed files are encoded. These affect compatibility, file size, and quality."
					>
						<SettingField
							label="Container format"
							help="The file extension / wrapper. MP4 plays almost everywhere (web, social apps, editors). MOV is common from Apple devices but less universal for upload."
							example="Choose MP4 unless you specifically need a QuickTime .mov output."
						>
							<select
								value={settings.outputFormat}
								onChange={(e) =>
									update("outputFormat", e.target.value as OutputFormat)
								}
								className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
							>
								<option value="mp4">MP4 — Best for sharing and uploading</option>
								<option value="mov">MOV — Apple / QuickTime style</option>
							</select>
						</SettingField>

						<SettingField
							label="Video codec"
							help="How video is compressed. H.264 works on virtually every platform. H.265 (HEVC) makes smaller files at similar quality but some older apps may not play it."
							example="Use H.264 unless you need smaller files and your audience’s apps support HEVC."
						>
							<select
								value={settings.outputCodec}
								onChange={(e) =>
									update("outputCodec", e.target.value as OutputCodec)
								}
								className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
							>
								<option value="h264">H.264 — Maximum compatibility</option>
								<option value="h265">H.265 (HEVC) — Smaller files, newer devices</option>
							</select>
						</SettingField>

						<SettingField
							label={`Quality (CRF): ${settings.crf}`}
							help="Constant Rate Factor controls compression quality. Lower numbers mean higher quality and larger files. 18 is a common “high quality” default; 23 is smaller with visible loss on close inspection."
							example="Use 18–20 for final social posts; 23–28 for drafts or smaller uploads."
						>
							<input
								type="range"
								min={15}
								max={28}
								step={1}
								value={settings.crf}
								onChange={(e) => update("crf", parseInt(e.target.value, 10))}
								className="w-full accent-orange-500"
							/>
							<div className="flex justify-between text-xs text-zinc-500">
								<span>15 (largest / best)</span>
								<span>18 (recommended)</span>
								<span>28 (smallest / lowest)</span>
							</div>
						</SettingField>
					</SettingSection>

					<div className="flex flex-col gap-4 border-t border-zinc-700 pt-8 sm:flex-row sm:items-center sm:justify-between">
						<Link
							href={`/project/${projectId}/files`}
							className="text-center text-sm text-zinc-400 underline-offset-2 hover:text-white hover:underline"
						>
							← Back to uploads
						</Link>
						<button
							type="submit"
							disabled={loading || saving}
							className="rounded-lg bg-orange-600 px-6 py-3 font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
						>
							{saving ? "Saving…" : "Save & continue"}
						</button>
					</div>
				</form>
			</main>
		</div>
	)
}
