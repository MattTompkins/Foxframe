"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { FileVideoCamera, Cog, BrainCog, Cpu, ScanEye, Clapperboard } from "lucide-react"

type Props = {
	params: {
		id: string
	}
}

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

export default function projectOverview({ params }: Props) {

	const projectId = useParams().id;

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
				</div>
			</main>
		</div>
	);

}