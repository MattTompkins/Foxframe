export default function CreateProjectPage() {
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
				/>
				
				<button className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
					Continue
				</button>
			</main>
		</div>
	);
}
