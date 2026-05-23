import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"

const PROJECTS_DIR = path.join(process.cwd(), "storage/projects")
const INDEX_FILE = path.join(process.cwd(), "storage/projects.json")

/**
 * POST /api/projects - Create a new project
 * @param request 
 * 
 * @todo - Ensure slug is unique (append random string if necessary)
 */
export async function POST(request: Request) {
	const { name } = await request.json()

	const id = randomUUID()
	const projectDir = path.join(PROJECTS_DIR, id)
	const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "")

	await fs.mkdir(projectDir, { recursive: true })

	const newProject = {
		id,
		name,
		slug,
		status: "new-project",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	}

	let projectsIndex = [];

	try {
		const indexData = await fs.readFile(INDEX_FILE, "utf-8")
		projectsIndex = JSON.parse(indexData)
	} catch (err: any) {
		if (err.code === "ENOENT") {
			await fs.writeFile(INDEX_FILE, JSON.stringify([], null, 2));
		} else {
			throw err;
		}
	}

	projectsIndex.push(newProject)
	await fs.writeFile(INDEX_FILE, JSON.stringify(projectsIndex, null, 2));

	const manifest = {
		projectId: id,
		name,
		slug,
		sourceFiles: [],
	};

	await fs.writeFile(path.join(projectDir, "manifest.json"), JSON.stringify(manifest, null, 2));

	return NextResponse.json(newProject, { status: 201 });
}

export async function GET() {

	const indexData = await fs.readFile(INDEX_FILE, "utf-8")
	const projectsIndex = JSON.parse(indexData)

	return NextResponse.json(projectsIndex)

}