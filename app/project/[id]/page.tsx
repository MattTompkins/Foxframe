"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Modal } from "@/components/Modal"
import { FileVideoCamera, Cog, BrainCog, Cpu, ScanEye, Clapperboard, Trash2 } from "lucide-react"

type Project = {
	id: string
	slug: string
	name: string
	createdAt?: string
}

const fetchProjectDetails = async (projectId: string) => {
	const response = await fetch(`/api/projects/${projectId}`)

	if (!response.ok) {
		throw new Error("Failed to fetch project details")
	}

	return response.json()
}

async function deleteProject(projectId: string) {
	const response = await fetch(`/api/projects/${projectId}`, {
		method: "DELETE",
	})

	if (!response.ok) {
		const data = await response.json().catch(() => ({}))
		throw new Error(
			typeof data.error === "string" ? data.error : "Failed to delete project"
		)
	}

	window.location.href = "/"
}

export default function projectOverview() {
	const [deleteModalOpen, setDeleteModalOpen] = useState(false)
	const [deleteError, setDeleteError] = useState<string | null>(null)
	const [deleting, setDeleting] = useState(false)

	const projectId = useParams().id as string

	async function handleDeleteProject() {
		try {
			setDeleting(true)
			setDeleteError(null)
			await deleteProject(projectId)
		} catch (err) {
			setDeleteError(
				err instanceof Error ? err.message : "Failed to delete project"
			)
			setDeleting(false)
		}
	}

	return (
		<div className="flex min-h-full flex-1 flex-col bg-zinc-900 font-sans">
			<main className="mx-auto flex w-full max-w-3xl flex-col px-6 py-16 sm:py-24">
				<header className="mb-10">
					<span className="text-sm text-orange-400">Project ID: {projectId}</span>
					<h1 className="mt-2 text-4xl font-bold text-white sm:text-5xl">

					</h1>
					<p className="mt-4 text-lg leading-relaxed text-zinc-300">
						Modify, edit and manage your existing video project.
					</p>
				</header>

				<div className="flex flex-col gap-4">
					<Link
						href={`/project/${projectId}/files`}
						className="flex rounded-lg border items-center border-gray-700 bg-gray-800 px-4 py-3 hover:border-orange-600/40 hover:bg-gray-700"
					>

						<FileVideoCamera className="mr-3 text-orange-400 h-6 w-6" />
						<span className="text-lg font-semibold text-white">
							Media & files
						</span>
					</Link>

					<Link
						href={`/project/${projectId}/settings`}
						className="flex rounded-lg border items-center border-gray-700 bg-gray-800 px-4 py-3 hover:border-orange-600/40 hover:bg-gray-700"
					>
						<Cog className="mr-3 text-orange-400 h-6 w-6" />
						<span className="text-lg font-semibold text-white">
							Processing & output settings
						</span>
					</Link>

					<Link
						href={`/project/${projectId}/smart-editing`}
						className="flex rounded-lg border items-center border-gray-700 bg-gray-800 px-4 py-3 hover:border-orange-600/40 hover:bg-gray-700"
					>
						<BrainCog className="mr-3 text-orange-400 h-6 w-6" />
						<span className="text-lg font-semibold text-white">
							Smart editing settings
						</span>
					</Link>

					<Link
						href={`/project/${projectId}/process`}
						className="flex rounded-lg border items-center border-gray-700 bg-gray-800 px-4 py-3 hover:border-orange-600/40 hover:bg-gray-700"
					>
						<Cpu className="mr-3 text-orange-400 h-6 w-6" />
						<span className="text-lg font-semibold text-white">
							Video clip processor
						</span>
					</Link>

					<Link
						href={`/project/${projectId}/review`}
						className="flex rounded-lg border items-center border-gray-700 bg-gray-800 px-4 py-3 hover:border-orange-600/40 hover:bg-gray-700"
					>
						<ScanEye className="mr-3 text-orange-400 h-6 w-6" />
						<span className="text-lg font-semibold text-white">
							Manual review & fine-tuning
						</span>
					</Link>

					<Link
						href={`/project/${projectId}/editor`}
						className="flex rounded-lg border items-center border-gray-700 bg-gray-800 px-4 py-3 hover:border-orange-600/40 hover:bg-gray-700"
					>
						<Clapperboard className="mr-3 text-orange-400 h-6 w-6" />
						<span className="text-lg font-semibold text-white">
							Editor & video output
						</span>
					</Link>

					<div
						className="flex rounded-lg border items-center border-red-400 bg-red-600 px-4 py-3 hover:border-red-800/40 hover:bg-red-800 mt-5"
						onClick={() => setDeleteModalOpen(true)}
					>
						<Trash2 className="mr-3 text-white-400 h-6 w-6" />
						<span className="text-lg font-semibold text-white">
							Delete project
						</span>
					</div>

					{deleteModalOpen && (
						<Modal
							title="Are you sure you want to delete this project?"
							subtitle="This action will delete all of your project files, data, and settings. This action cannot be undone."
							exitEnabled={true}
							onExit={() => setDeleteModalOpen(false)}
						>
							<p className="text-sm text-zinc-300 mb-6">
								Yes, I would like to delete my project, including raw uploaded files, processed files, configurations, settings and final outputs.
							</p>


							{deleteError && (
								<p className="mb-4 text-sm text-red-300">{deleteError}</p>
							)}

							<div className="flex gap-4 justify-end">
								<button
									type="button"
									className="rounded-lg border border-zinc-600 px-4 py-2 text-white hover:bg-zinc-700"
									onClick={() => setDeleteModalOpen(false)}
									disabled={deleting}
								>
									Cancel
								</button>
								<button
									type="button"
									className="flex items-center rounded-lg border border-red-400 bg-red-600 px-4 py-2 hover:bg-red-800 disabled:opacity-50"
									onClick={handleDeleteProject}
									disabled={deleting}
								>
									<Trash2 className="mr-2 h-5 w-5 text-white" />
									<span className="font-semibold text-white">
										{deleting ? "Deleting…" : "Delete project"}
									</span>
								</button>
							</div>
						</Modal>
					)}
				</div>
			</main>
		</div>
	);

}