import { CirclePlus } from "lucide-react"

export default function Home() {
	return (
		<div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans bg-zinc-900">
			<main className="flex w-full max-w-3xl flex-col items-center justify-between py-32 sm:items-start">
				<h1 className="text-6xl font-bold text-white">
					Welcome to <a href="https://foxframe.dev" className="text-blue-500">Foxframe</a>
				</h1>
				<p className="text-2xl text-center text-gray-300">
					A simple short-form video editor built with Next.js and Tailwind CSS.
				</p>

				<div className="mt-10 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 xxl:grid-cols-3">
					<a href="/project/create" className="flex items-center justify-center rounded-lg border px-4 py-2 border-gray-700 bg-gray-800 hover:bg-gray-700 h-60">
						<CirclePlus className="h-8 w-8 text-gray-300 mr-2" />
						<span className="font-medium text-white">Create new project</span>
					</a>
				</div>
			</main>
		</div>
	);
}
