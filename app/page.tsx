"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from 'next/image'
import { CirclePlus } from "lucide-react"

type Project = {
	id: string
	slug: string
	name: string
	createdAt?: string
}

export default function Home() {

	const [projects, setProjects] = useState<Project[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {

		async function loadProjects() {
			try {
				const response = await fetch("/api/projects")

				if (!response.ok) {
					throw new Error("Failed to fetch projects")
				}

				const data = await response.json()
				setProjects(data)

			} catch (error) {

				console.error("Error fetching projects:", error)

				setError(
					error instanceof Error
						? error.message
						: "Something went wrong"
				)

			} finally {
				setLoading(false)
			}
		}

		loadProjects()

	}, []);

	return (
		<div className="flex flex-1 flex-col items-center justify-center bg-zinc-900 font-sans">

			<main className="flex w-full max-w-3xl flex-col items-center justify-between py-32 sm:items-start">

				<Image src="/fox-logo.png" alt="Foxframe Logo" width={140} height={140}/>
				<h1 className="text-6xl font-bold text-white">
					Welcome to{" "}
					<a
						href="https://foxframe.dev"
						className="text-orange-600"
					>
						Foxframe
					</a>
				</h1>

				<p className="text-2xl text-center text-gray-300">
					A simple short-form video editor built with Next.js and Tailwind CSS.
				</p>

				{error && (
					<div className="mt-4 text-red-500">
						{error}
					</div>
				)}

				<div className="mt-10 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 xxl:grid-cols-3">

					<Link
						href="/project/create"
						className="flex h-60 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 hover:border-orange-600/50 hover:bg-gray-700"
					>
						<CirclePlus className="mr-2 h-8 w-8 text-orange-500" />

						<span className="font-medium text-white">
							Create new project
						</span>
					</Link>

					{loading && (
						<div className="flex h-60 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-300">
							Loading projects...
						</div>
					)}

					{projects.map((project) => (

						<Link
							key={project.id}
							href={`/project/${project.id}`}
							className="flex h-60 flex-col items-center justify-center rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 hover:border-orange-600/40 hover:bg-gray-700"
						>
							<span className="text-lg font-semibold text-white">
								{project.name}
							</span>

							<span className="mt-2 text-sm text-gray-400">
								{project.id}
							</span>
						</Link>

					))}

				</div>

			</main>

		</div>
	)
}