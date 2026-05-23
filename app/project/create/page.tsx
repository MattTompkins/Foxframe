"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function CreateProjectPage() {

	const router = useRouter();
	const [projectName, setProjectName] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function createProject() {
		if (!projectName.trim()) {
			setError("Project name cannot be empty");
			return;
		}

		try {
			setLoading(true);
			const response = await fetch("/api/projects", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: projectName }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || "Failed to create project");
			}

			const project = await response.json();
			router.push(`/project/${project.id}/files`);
		} catch (error) {
			setError((error as Error).message);
			console.error("Error creating project:", error);
		} finally {
			setLoading(false);
		}
	};

return (
	<div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans bg-zinc-900">
		<main className="flex w-full max-w-3xl flex-col items-center justify-between py-32 sm:items-start">
			<h1 className="text-6xl font-bold text-white">
				Let's get started!
			</h1>
			<p className="text-2xl text-center text-gray-300 mt-3 mb-6">
				Provide a name for your project
			</p>

			<input
				type="text"
				placeholder="Project Name"
				className="px-4 py-2 w-full rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				value={projectName}
				onChange={(e) => setProjectName(e.target.value)}
			/>

			<span className="text-red-500 mt-2">{error}</span>

			<button
				onClick={createProject}
				disabled={loading}
				className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
			>
				{loading ? "Creating project..." : "Continue"}
			</button>
		</main>
	</div>
);
}
