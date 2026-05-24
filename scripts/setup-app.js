#!/usr/bin/env node
/**
 * Foxframe local dev setup:
 * - Node dependencies (npm install)
 * - Python CV venv (lib/py/.venv + requirements.txt)
 * - storage/ directories
 * - ffmpeg check (required for video; install via Homebrew on macOS)
 *
 * Usage:
 *   node scripts/setup-app.js
 *   npm run setup-app
 *
 * Options:
 *   --skip-npm       Skip npm install
 *   --skip-python    Skip Python venv / pip install
 *   --prepull-clip   Download CLIP weights after Python setup (~350MB)
 */

const { spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const PY_DIR = path.join(ROOT, "lib", "py")
const VENV_DIR = path.join(PY_DIR, ".venv")
const REQUIREMENTS = path.join(PY_DIR, "requirements.txt")

const args = new Set(process.argv.slice(2))
const skipNpm = args.has("--skip-npm")
const skipPython = args.has("--skip-python")
const prepullClip = args.has("--prepull-clip")

function log(section, message) {
	console.log(`\n[${section}] ${message}`)
}

function run(command, commandArgs, options = {}) {
	const result = spawnSync(command, commandArgs, {
		cwd: options.cwd ?? ROOT,
		stdio: "inherit",
		env: { ...process.env, ...options.env },
		shell: options.shell ?? false,
	})

	if (result.error) {
		if (!options.optional) {
			console.error(`\nFailed to run ${command}: ${result.error.message}`)
			process.exit(1)
		}
		return false
	}

	if (result.status !== 0) {
		if (!options.optional) {
			console.error(
				`\nCommand failed (exit ${result.status}): ${command} ${commandArgs.join(" ")}`
			)
			process.exit(result.status ?? 1)
		}
		return false
	}

	return true
}

function commandExists(name) {
	const checker = process.platform === "win32" ? "where" : "which"
	const result = spawnSync(checker, [name], { stdio: "ignore", shell: true })
	return result.status === 0
}

function resolvePython() {
	if (commandExists("python3")) return "python3"
	if (commandExists("python")) return "python"
	return null
}

function venvPython() {
	return process.platform === "win32"
		? path.join(VENV_DIR, "Scripts", "python.exe")
		: path.join(VENV_DIR, "bin", "python")
}

function ensureStorage() {
	log("storage", "Creating project storage directories…")
	fs.mkdirSync(path.join(ROOT, "storage", "projects"), { recursive: true })

	const indexPath = path.join(ROOT, "storage", "projects.json")
	if (!fs.existsSync(indexPath)) {
		fs.writeFileSync(indexPath, "[]\n", "utf8")
	}
}

function checkFfmpeg() {
	log("ffmpeg", "Checking for ffmpeg on PATH…")

	if (commandExists("ffmpeg")) {
		const probe = spawnSync("ffmpeg", ["-version"], {
			stdio: "ignore",
			encoding: "utf8",
		})
		if (probe.status === 0) {
			console.log("  ffmpeg found.")
			return
		}
	}

	console.warn("  ffmpeg not found — video processing will fail until it is installed.")

	if (process.platform === "darwin" && commandExists("brew")) {
		console.warn("  Install with: brew install ffmpeg")
	} else {
		console.warn("  Install from: https://ffmpeg.org/download.html")
	}
}

function installNodeDeps() {
	log("npm", "Installing Node dependencies…")
	run("npm", ["install"], { cwd: ROOT })
}

function installPythonDeps() {
	const python = resolvePython()
	if (!python) {
		console.error(
			"\nPython 3 not found. Install Python 3.11+ and re-run setup."
		)
		process.exit(1)
	}

	if (!fs.existsSync(REQUIREMENTS)) {
		console.error(`\nMissing ${REQUIREMENTS}`)
		process.exit(1)
	}

	log("python", `Using ${python} for lib/py virtualenv…`)
	fs.mkdirSync(PY_DIR, { recursive: true })

	if (!fs.existsSync(venvPython())) {
		run(python, ["-m", "venv", ".venv"], { cwd: PY_DIR })
	}

	const py = venvPython()
	log("python", "Upgrading pip and installing requirements…")
	run(py, ["-m", "pip", "install", "-U", "pip"], { cwd: PY_DIR })
	run(py, ["-m", "pip", "install", "-r", "requirements.txt"], { cwd: PY_DIR })

	console.log(`\n  Python venv: ${VENV_DIR}`)
	console.log(
		"  Activate: source lib/py/.venv/bin/activate  (Windows: lib\\py\\.venv\\Scripts\\activate)"
	)
}

function prepullClipModel() {
	const py = venvPython()
	if (!fs.existsSync(py)) {
		console.warn("\n[clip] Skipping model download — venv not found.")
		return
	}

	log("clip", "Downloading openai/clip-vit-base-patch32 (~350MB, one-time)…")

	const script = `
from transformers import CLIPModel, CLIPProcessor
name = "openai/clip-vit-base-patch32"
CLIPProcessor.from_pretrained(name)
CLIPModel.from_pretrained(name)
print("CLIP model cached locally.")
`

	run(py, ["-c", script], { cwd: PY_DIR })
}

function main() {
	console.log("Foxframe setup\n==============")

	ensureStorage()
	checkFfmpeg()

	if (!skipNpm) {
		installNodeDeps()
	} else {
		log("npm", "Skipped (--skip-npm).")
	}

	if (!skipPython) {
		installPythonDeps()
		if (prepullClip) {
			prepullClipModel()
		}
	} else {
		log("python", "Skipped (--skip-python).")
	}

	console.log("\nSetup complete.")
	console.log("  Dev server:  npm run dev")
	console.log("  Production:  npm run build && npm run start")
	if (!prepullClip && !skipPython) {
		console.log(
			"  Optional:    npm run setup-app -- --prepull-clip  (cache CLIP weights offline)"
		)
	}
}

main()
