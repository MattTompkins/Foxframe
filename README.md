# Foxframe — short form video editor

## Setup

From the project root:

```bash
npm run setup-app
```

This installs Node dependencies, creates `lib/py/.venv` with CV scoring packages, and prepares `storage/`. **ffmpeg** must be on your PATH for video work:

```bash
brew install ffmpeg   # macOS
```

### Options

```bash
npm run setup-app -- --skip-npm          # only Python + storage
npm run setup-app -- --skip-python       # only npm + storage
npm run setup-app -- --prepull-clip      # also download CLIP weights (~350MB)
```

### Run

```bash
npm run dev
```

CV scoring runs locally (no API keys). See `lib/py/requirements.txt` for Python details.
