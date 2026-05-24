"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { StepCounter } from "@/components/StepCounter"
import {
	DEFAULT_SMART_EDITING_SETTINGS,
	type ClipDistribution,
	type KeyMomentDetection,
	type SmartEditingSettings,
} from "@/lib/smart-editing-settings"

function SettingSection({
	title,
	summary,
	disabled,
	children,
}: {
	title: string
	summary: string
	disabled?: boolean
	children: React.ReactNode
}) {
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

function SettingField({
	label,
	help,
	example,
	disabled,
	children,
}: {
	label: string
	help: string
	example?: string
	disabled?: boolean
	children: React.ReactNode
}) {
	return (
		<div className={`flex flex-col gap-2 ${disabled ? "pointer-events-none" : ""}`}>
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

const inputClassName =
	"w-full rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-3 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"

export default function SmartEditingPage() {
	const projectId = useParams().id as string
	const router = useRouter()

	const [settings, setSettings] = useState<SmartEditingSettings>(
		DEFAULT_SMART_EDITING_SETTINGS
	)
	const [hasProcessedFiles, setHasProcessedFiles] = useState(false)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [saveMessage, setSaveMessage] = useState<string | null>(null)

	useEffect(() => {
		async function loadSettings() {
			try {
				setLoading(true)
				setError(null)

				const response = await fetch(
					`/api/projects/${projectId}/smart-editing`
				)

				if (!response.ok) {
					const data = await response.json().catch(() => ({}))
					throw new Error(data.error ?? "Failed to load smart editing settings")
				}

				const data = await response.json()
				setSettings(data.smartEditing)
				setHasProcessedFiles(Boolean(data.hasProcessedFiles))
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Failed to load smart editing settings"
				)
			} finally {
				setLoading(false)
			}
		}

		loadSettings()
	}, [projectId])

	function update<K extends keyof SmartEditingSettings>(
		key: K,
		value: SmartEditingSettings[K]
	) {
		setSaveMessage(null)
		setSettings((prev) => ({ ...prev, [key]: value }))
	}

	async function handleSave() {
		try {
			setSaving(true)
			setError(null)
			setSaveMessage(null)

			const response = await fetch(
				`/api/projects/${projectId}/smart-editing`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ smartEditing: settings }),
				}
			)

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				throw new Error(data.error ?? "Failed to save smart editing settings")
			}

			if (hasProcessedFiles) {
				const reclipResponse = await fetch(
					`/api/projects/${projectId}/reclip`,
					{ method: "POST" }
				)

				if (reclipResponse.status === 409) {
					router.push(`/project/${projectId}/process`)
					return
				}

				if (!reclipResponse.ok && reclipResponse.status !== 202) {
					const data = await reclipResponse.json().catch(() => ({}))
					throw new Error(data.error ?? "Failed to start re-clipping")
				}
			}

			router.push(`/project/${projectId}/process`)
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to save smart editing settings"
			)
		} finally {
			setSaving(false)
		}
	}

	const editingDisabled = !settings.enabled

	return (
		<div className="flex min-h-full flex-1 flex-col bg-zinc-900 font-sans">
			<main className="mx-auto flex w-full max-w-3xl flex-col px-6 py-16 sm:py-24">
				<header className="mb-10">
					<StepCounter current={3} total={4} stepName="Smart editing" />
					<h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">
						How should we cut your clips?
					</h1>
					<p className="mt-4 text-lg leading-relaxed text-zinc-300">
						Configure how processed videos are split into short clips, how
						key moments are detected and what advanced features to use to produce
						your video.
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

				{hasProcessedFiles && (
					<p className="mb-6 text-sm text-zinc-400">
						This project already has processed videos. Saving here will{" "}
						<strong className="text-zinc-300">re-run clipping only</strong>{" "}
						using your updated settings - formatting won&apos;t run again.
					</p>
				)}

				<form
					className={`flex flex-col gap-8 ${loading ? "pointer-events-none opacity-60" : ""}`}
					onSubmit={(e) => {
						e.preventDefault()
						handleSave()
					}}
				>
					<SettingSection
						title="Smart editing features"
						summary="Turn on automatic clip selection and cutting after your videos are processed."
					>
						<SettingField
							label="Enable smart editing"
							help="When enabled, source videos will be cut into separate highlight clips as defined below. When disabled, processed videos are kept as single files."
							example="Enable this for highlight reels from longer raw footage."
						>
							<label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-4">
								<input
									type="checkbox"
									checked={settings.enabled}
									onChange={(e) => update("enabled", e.target.checked)}
									className="mt-1 h-4 w-4 accent-blue-500"
								/>
								<span className="flex flex-col gap-1">
									<span className="font-medium text-white">
										Automatically cut processed videos into clips
									</span>
									<span className="text-sm text-zinc-400">
										{settings.enabled
											? "Enabled - videos will be automatically cut into clips."
											: "Disabled - no automatic clipping will run."}
									</span>
								</span>
							</label>
						</SettingField>
					</SettingSection>

					<SettingSection
						title="Clip length & quantity"
						summary="Control how long each extracted clip can be and how many clips to pull from each source file."
						disabled={editingDisabled}
					>
						<div className="grid gap-6 sm:grid-cols-2">
							<SettingField
								label={`Minimum clip length (${settings.minClipLengthSeconds}s)`}
								help="The shortest a clip is allowed to be. Shorter detected moments are merged or skipped."
								example="3 seconds works well for Reels and TikTok."
								disabled={editingDisabled}
							>
								<input
									type="range"
									min={1}
									max={60}
									step={1}
									value={settings.minClipLengthSeconds}
									disabled={editingDisabled}
									onChange={(e) => {
										const value = parseInt(e.target.value, 10)
										update("minClipLengthSeconds", value)
										if (value > settings.maxClipLengthSeconds) {
											update("maxClipLengthSeconds", value)
										}
									}}
									className="w-full accent-blue-500"
								/>
							</SettingField>

							<SettingField
								label={`Maximum clip length (${settings.maxClipLengthSeconds}s)`}
								help="The longest a single clip can run. Longer moments are split into multiple clips."
								example="15 seconds keeps clips punchy for short-form feeds."
								disabled={editingDisabled}
							>
								<input
									type="range"
									min={1}
									max={120}
									step={1}
									value={settings.maxClipLengthSeconds}
									disabled={editingDisabled}
									onChange={(e) => {
										const value = parseInt(e.target.value, 10)
										update("maxClipLengthSeconds", value)
										if (value < settings.minClipLengthSeconds) {
											update("minClipLengthSeconds", value)
										}
									}}
									className="w-full accent-blue-500"
								/>
							</SettingField>
						</div>

						<SettingField
							label={`Clips per source file (${settings.clipsPerSourceFile})`}
							help="How many separate clips to extract from each processed source video. Higher numbers give more options but may include weaker moments."
							example="3–5 clips per file is a good starting point for highlight edits, depending on the length of your source videos."
							disabled={editingDisabled}
						>
							<input
								type="range"
								min={1}
								max={20}
								step={1}
								value={settings.clipsPerSourceFile}
								disabled={editingDisabled}
								onChange={(e) =>
									update("clipsPerSourceFile", parseInt(e.target.value, 10))
								}
								className="w-full accent-blue-500"
							/>
							<div className="flex justify-between text-xs text-zinc-500">
								<span>1 clip</span>
								<span>10 clips</span>
								<span>20 clips</span>
							</div>
						</SettingField>
					</SettingSection>

					<SettingSection
						title="Key moment detection"
						summary="Choose what signals Foxframe uses to find the best moments worth keeping as clips."
						disabled={editingDisabled}
					>
						<SettingField
							label="Detection method"
							help="This determines how candidate clip start points are scored before cutting. Combined uses both motion and audio for the most balanced results."
							example="Pick camera movement for action footage; audio for music or speech-heavy clips."
							disabled={editingDisabled}
						>
							<select
								value={settings.keyMomentDetection}
								disabled={editingDisabled}
								onChange={(e) =>
									update(
										"keyMomentDetection",
										e.target.value as KeyMomentDetection
									)
								}
								className={inputClassName}
							>
								<option value="camera-movement">
									Most camera movement - action, pans, and motion peaks
								</option>
								<option value="audio">
									Most audio activity - loudness, beats, and speech energy
								</option>
								<option value="combined">
									Combined - motion and audio scored together (recommended)
								</option>
								<option value="scene-state">
									Scene state - hard cuts and visual scene changes
								</option>
							</select>
						</SettingField>
					</SettingSection>

					<SettingSection
						title="Clip scoring and distribution"
						summary="Balance key-moment detection against computer vision when ranking clips, and choose where the strongest clips appear in each source file."
						disabled={editingDisabled}
					>
						<SettingField
							label={`Scoring blend (${settings.computerVisionWeight}% computer vision)`}
							help="Slide toward key-moment detection to rank clips by motion, audio, and scene signals only. Slide toward computer vision to weight visual prompt matching more heavily when CV is available."
							example="50% blends both signals equally once computer vision scoring is active."
							disabled={editingDisabled}
						>
							<input
								type="range"
								min={0}
								max={100}
								step={1}
								value={settings.computerVisionWeight}
								disabled={editingDisabled}
								onChange={(e) =>
									update(
										"computerVisionWeight",
										parseInt(e.target.value, 10)
									)
								}
								className="w-full accent-blue-500"
							/>
							<div className="flex justify-between text-xs text-zinc-500">
								<span>Key moment detection</span>
								<span>Balanced</span>
								<span>Computer vision</span>
							</div>
						</SettingField>

						<SettingField
							label="Best clip distribution"
							help="Where to place the highest-scoring clips in the final sequence cut from each source file."
							example="Use “Mixed” for a natural-feeling edit; “At start” for strong hooks."
							disabled={editingDisabled}
						>
							<fieldset className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
								{(
									[
										{
											value: "start" as const,
											title: "At start",
											desc: "Front-load the strongest clips for an immediate hook.",
										},
										{
											value: "end" as const,
											title: "At end",
											desc: "Build toward the best moments at the finish.",
										},
										{
											value: "mixed" as const,
											title: "Mixed",
											desc: "Spread top clips throughout for variety.",
										},
									] as const
								).map((opt) => (
									<label
										key={opt.value}
										className={`flex flex-1 cursor-pointer flex-col rounded-lg border px-4 py-3 transition-colors ${
											settings.clipDistribution === opt.value
												? "border-blue-500 bg-blue-500/10"
												: "border-zinc-600 bg-zinc-900 hover:border-zinc-500"
										} ${editingDisabled ? "pointer-events-none opacity-60" : ""}`}
									>
										<span className="flex items-center gap-2">
											<input
												type="radio"
												name="clipDistribution"
												value={opt.value}
												checked={settings.clipDistribution === opt.value}
												disabled={editingDisabled}
												onChange={() =>
													update("clipDistribution", opt.value)
												}
												className="accent-blue-500"
											/>
											<span className="font-medium text-white">
												{opt.title}
											</span>
										</span>
										<span className="mt-1 pl-6 text-sm text-zinc-400">
											{opt.desc}
										</span>
									</label>
								))}
							</fieldset>
						</SettingField>
					</SettingSection>

					<SettingSection
						title="Computer vision scoring"
						summary="Describe what good and bad clips look like. These prompts apply when the scoring blend above includes any computer vision."
						disabled={editingDisabled || settings.computerVisionWeight === 0}
					>
						<SettingField
							label="Positive prompt"
							help="Describe what good clips should contain. Clips that visually match this description score higher and are more likely to be kept."
							example="Close-up of presenter, stable framing, good lighting, engaging expression"
							disabled={editingDisabled || settings.computerVisionWeight === 0}
						>
							<textarea
								value={settings.positivePrompt}
								disabled={editingDisabled || settings.computerVisionWeight === 0}
								onChange={(e) => update("positivePrompt", e.target.value)}
								rows={3}
								maxLength={500}
								placeholder="What should the best clips look like?"
								className={`${inputClassName} resize-y min-h-24`}
							/>
						</SettingField>

						<SettingField
							label="Negative prompt"
							help="Describe what to avoid. Clips matching this description are ranked lower and may be excluded from the final selection."
							example="Blurry, shaky, empty frame, looking at floor, poor lighting"
							disabled={editingDisabled || settings.computerVisionWeight === 0}
						>
							<textarea
								value={settings.negativePrompt}
								disabled={editingDisabled || settings.computerVisionWeight === 0}
								onChange={(e) => update("negativePrompt", e.target.value)}
								rows={3}
								maxLength={500}
								placeholder="What should we avoid keeping?"
								className={`${inputClassName} resize-y min-h-24`}
							/>
						</SettingField>

						{settings.computerVisionWeight === 0 && !editingDisabled && (
							<p className="text-sm text-zinc-500">
								Increase the scoring blend slider above to enable prompt fields.
							</p>
						)}
					</SettingSection>

					<div className="flex flex-col gap-4 border-t border-zinc-700 pt-8 sm:flex-row sm:items-center sm:justify-between">
						<Link
							href={`/project/${projectId}/settings`}
							className="text-center text-sm text-zinc-400 underline-offset-2 hover:text-white hover:underline"
						>
							← Back to output settings
						</Link>
						<button
							type="submit"
							disabled={loading || saving}
							className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
						>
							{saving
								? "Saving…"
								: hasProcessedFiles
									? "Save & re-run clipping"
									: "Save & continue to processing"}
						</button>
					</div>
				</form>
			</main>
		</div>
	)
}
