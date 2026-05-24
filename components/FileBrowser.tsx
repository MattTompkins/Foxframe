"use client"

import { useParams } from "next/navigation"

function readManifest(projectId: string) {
    
}

export default function FileBrowser() {

	const params = useParams()
	const projectId = params.id as string

	if (!projectId) {
		return
	}

	
}