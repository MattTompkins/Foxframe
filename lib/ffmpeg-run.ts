import { spawn } from "child_process"

export async function runCommand(
	command: string,
	args: string[]
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args)
		let stdout = ""
		let stderr = ""

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString()
		})
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
		})

		child.on("error", reject)
		child.on("close", (code) => {
			if (code === 0) resolve({ stdout, stderr })
			else
				reject(
					new Error(
						`${command} exited with code ${code}: ${stderr.slice(-500)}`
					)
				)
		})
	})
}

export async function probeDuration(filePath: string): Promise<number> {
	const { stdout } = await runCommand("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		filePath,
	])

	const duration = parseFloat(stdout.trim())
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`Could not read duration for ${filePath}`)
	}

	return duration
}
