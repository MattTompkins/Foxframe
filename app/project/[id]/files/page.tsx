"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import  FileBrowser  from "@/components/FileBrowser"

type Props = {
	params: {
		id: string
	}
}

export default function ProjectFilesPage({ params }: Props) {

	const projectId = useParams().id;

	const [renumberFilesOption, setRenumberFilesOption] = useState(true)
	const [uploadStatus, setUploadStatus] = useState(0);
	const [error, setError] = useState<string | null>(null)
	const [isDragging, setIsDragging] = useState(false)

	const uploadFiles = async (files: FileList | File[]) => {
		const totalFiles = files.length

		for (let i = 0; i < totalFiles; i++) {
			await uploadSingleFile(files[i], i, totalFiles)
		}
	}

	const uploadSingleFile = async (file: File, index: number, totalFiles: number) => {
		const formData = new FormData();
		formData.append("file", file)
		formData.append("index", index.toString())
		formData.append("totalFiles", totalFiles.toString())
		formData.append("renumberFiles", renumberFilesOption.toString())

		try {
			const response = await fetch(`/api/projects/${projectId}/upload`, {
				method: "POST",
				body: formData,
			})

			if (!response.ok) {
				throw new Error(`Failed to upload file: ${file.name}`)
			}

			const data = await response.json()
			console.log("Upload successful for file:", file.name, data)

		} catch (error) {
			console.error("Error uploading file:", file.name, error)
			setError(
				error instanceof Error
					? `Error uploading ${file.name}: ${error.message}`
					: `Error uploading ${file.name}: Something went wrong`
			)
		} finally {
			setUploadStatus(((index + 1) / totalFiles) * 100)
		}
	}

	function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
		e.preventDefault()
		setIsDragging(true)
	}

	function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
		e.preventDefault()
		setIsDragging(false)
	}

	function handleDrop(e: React.DragEvent<HTMLDivElement>) {
		e.preventDefault()
		setIsDragging(false)

		const files = e.dataTransfer.files

		if (files && files.length > 0) {
			uploadFiles(files)
		}
	}

	return (
		<div className="flex flex-col flex-1 items-center justify-center bg-zinc-900 font-sans">

			<main className="flex w-full max-w-3xl flex-col items-center justify-between py-32 sm:items-start">

				<h1 className="text-6xl font-bold text-white">
					Choose your media
				</h1>

				<p className="text-2xl text-gray-300 mt-3 mb-6">
					Configure your upload settings and then upload your media files to get started.
				</p>

				<div className="flex w-full flex-col items-start gap-4">
					<label className="flex items-center gap-2 text-white">
						<input
							type="checkbox"
							checked={renumberFilesOption}
							onChange={(e) =>
								setRenumberFilesOption(e.target.checked)
							}
						/>
						Rename uploaded files to be numerically sequential for easier sorting
					</label>
				</div>

				{/* DRAG & DROP AREA */}
				<div
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					className={`mt-10 h-60 w-full rounded-lg border-2 border-dashed transition-colors ${isDragging
							? "border-blue-500 bg-blue-500/10"
							: "border-gray-700 bg-gray-800 hover:bg-gray-700"
						}`}
				>

					<label
						htmlFor="file-upload"
						className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-gray-300"
					>
						<div className="text-2xl font-semibold">
							Upload video files
						</div>

						<div className="mt-2 text-sm text-gray-400">
							Click to browse or drag and drop
						</div>
					</label>

					<input
						type="file"
						id="file-upload"
						multiple
						className="hidden"
						onChange={(e) => {
							if (e.target.files) {
								uploadFiles(e.target.files)
							}
						}}
					/>
				</div>

				<div className="w-full bg-zinc-700 rounded-full h-2 mt-5">
					<div className="bg-blue-500 h-2 rounded-full" style={{ width: `${uploadStatus}%` }}></div>
				</div>

				{error && (
					<div className="mt-4 text-red-500">
						{error}
					</div>
				)}

			<a
				href={`/project/${projectId}/settings`}
				disabled={uploadStatus < 100}
				className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
			>
				Continue
			</a>


				<h2 className="text-4xl font-bold text-white mt-10">
					Uploaded Files (todo)
				</h2>
				<FileBrowser id={projectId} />
			</main>

		</div>
	)
}