"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { Modal } from "@/components/Modal"
import type { EditSummary, ProjectEdit } from "@/lib/edit"

function formatEditDuration(seconds: number) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`
    }
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

function formatEditDate(iso: string) {
    const date = new Date(iso)
    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    })
}

export function EditorHeader({
    projectId,
    projectName,
    currentEditId,
    onEditLoaded,
}: {
    projectId: string
    projectName: string
    currentEditId?: string | null
    onEditLoaded?: (edit: ProjectEdit) => void
}) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [edits, setEdits] = useState<EditSummary[]>([])
    const [listLoading, setListLoading] = useState(false)
    const [listError, setListError] = useState<string | null>(null)
    const [saveModalOpen, setSaveModalOpen] = useState(false)
    const [newEditName, setNewEditName] = useState("")
    const [saveError, setSaveError] = useState<string | null>(null)
    const [savingNew, setSavingNew] = useState(false)
    const [loadingEditId, setLoadingEditId] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const nameInputRef = useRef<HTMLInputElement>(null)

    const fetchEdits = useCallback(async () => {
        setListLoading(true)
        setListError(null)

        try {
            const res = await fetch(`/api/projects/${projectId}/edits`)
            const data = await res.json().catch(() => ({}))

            if (!res.ok) {
                throw new Error(
                    typeof data.error === "string"
                        ? data.error
                        : "Failed to load edits"
                )
            }

            setEdits(Array.isArray(data.edits) ? data.edits : [])
        } catch (err) {
            setEdits([])
            setListError(
                err instanceof Error ? err.message : "Failed to load edits"
            )
        } finally {
            setListLoading(false)
        }
    }, [projectId])

    useEffect(() => {
        if (!menuOpen) return
        void fetchEdits()
    }, [menuOpen, fetchEdits])

    useEffect(() => {
        if (!menuOpen) return

        function handlePointerDown(event: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target as Node)
            ) {
                setMenuOpen(false)
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setMenuOpen(false)
            }
        }

        document.addEventListener("mousedown", handlePointerDown)
        document.addEventListener("keydown", handleKeyDown)

        return () => {
            document.removeEventListener("mousedown", handlePointerDown)
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [menuOpen])

    useEffect(() => {
        if (!saveModalOpen) return
        nameInputRef.current?.focus()
    }, [saveModalOpen])

    function openSaveModal() {
        setNewEditName("")
        setSaveError(null)
        setSaveModalOpen(true)
        setMenuOpen(false)
    }

    function closeSaveModal() {
        if (savingNew) return
        setSaveModalOpen(false)
        setSaveError(null)
    }

    async function confirmSaveNewEdit() {
        setSavingNew(true)
        setSaveError(null)

        try {
            const res = await fetch(`/api/projects/${projectId}/edits`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newEditName.trim() || undefined,
                    seedFromManifest: true,
                }),
            })
            const data = await res.json().catch(() => ({}))

            if (!res.ok) {
                throw new Error(
                    typeof data.error === "string"
                        ? data.error
                        : "Failed to save edit"
                )
            }

            if (data.edit) {
                onEditLoaded?.(data.edit as ProjectEdit)
            }

            setSaveModalOpen(false)
            setNewEditName("")
            await fetchEdits()
        } catch (err) {
            setSaveError(
                err instanceof Error ? err.message : "Failed to save edit"
            )
        } finally {
            setSavingNew(false)
        }
    }

    async function handleLoadEdit(editId: string) {
        setLoadingEditId(editId)
        setListError(null)

        try {
            const res = await fetch(
                `/api/projects/${projectId}/edits/${editId}`
            )
            const data = await res.json().catch(() => ({}))

            if (!res.ok) {
                throw new Error(
                    typeof data.error === "string"
                        ? data.error
                        : "Failed to load edit"
                )
            }

            if (data.edit) {
                onEditLoaded?.(data.edit as ProjectEdit)
            }

            setMenuOpen(false)
        } catch (err) {
            setListError(
                err instanceof Error ? err.message : "Failed to load edit"
            )
        } finally {
            setLoadingEditId(null)
        }
    }

    return (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-700 bg-zinc-900 px-4">
            <h1 className="truncate text-sm font-semibold text-white sm:text-base">
                <span className="text-zinc-400">Editor</span>
                <span className="mx-2 text-zinc-600" aria-hidden>
                    /
                </span>
                {projectName}
            </h1>
            <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
                <Link
                    className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white sm:px-4 sm:py-2.5"
                    href={`/project/${projectId}`}
                >
                    Project home
                </Link>

                <button
                    className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white sm:px-4 sm:py-2.5"
                >Auto-generate timeline
                </button>

                <div className="relative" ref={menuRef}>
                    <button
                        type="button"
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        onClick={() => setMenuOpen((open) => !open)}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white sm:px-4 sm:py-2.5"
                    >
                        Save / view edits
                        <ChevronDown
                            className={`ml-1 inline-block h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                        />
                    </button>

                    {menuOpen && (
                        <div
                            role="menu"
                            className="absolute right-0 z-50 mt-1 w-72 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl sm:w-80"
                        >
                            <div className="border-b border-zinc-700 p-1">
                                <button
                                    type="button"
                                    role="menuitem"
                                    disabled={savingNew}
                                    onClick={openSaveModal}
                                    className="flex w-full items-center justify-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {savingNew ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : null}
                                    Save new edit
                                </button>
                            </div>

                            <div className="max-h-64 overflow-y-auto p-1">
                                {listLoading && edits.length === 0 ? (
                                    <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-zinc-400">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading edits…
                                    </div>
                                ) : edits.length === 0 ? (
                                    <p className="px-3 py-4 text-center text-sm text-zinc-500">
                                        No saved edits yet
                                    </p>
                                ) : (
                                    <ul className="space-y-0.5">
                                        {edits.map((edit) => {
                                            const isActive =
                                                currentEditId === edit.id
                                            const isLoading =
                                                loadingEditId === edit.id

                                            return (
                                                <li key={edit.id}>
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        disabled={
                                                            isLoading ||
                                                            loadingEditId !==
                                                            null
                                                        }
                                                        onClick={() =>
                                                            void handleLoadEdit(
                                                                edit.id
                                                            )
                                                        }
                                                        className={`flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isActive
                                                            ? "bg-zinc-700/80 text-white"
                                                            : "text-zinc-200 hover:bg-zinc-700"
                                                            }`}
                                                    >
                                                        <span className="flex w-full items-center gap-2 font-medium">
                                                            <span className="min-w-0 flex-1 truncate">
                                                                {edit.name}
                                                            </span>
                                                            {isLoading ? (
                                                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
                                                            ) : null}
                                                        </span>
                                                        <span className="mt-0.5 text-xs text-zinc-400">
                                                            {edit.clipCount}{" "}
                                                            clip
                                                            {edit.clipCount ===
                                                                1
                                                                ? ""
                                                                : "s"}
                                                            {" · "}
                                                            {formatEditDuration(
                                                                edit.duration
                                                            )}
                                                            {" · "}
                                                            {formatEditDate(
                                                                edit.updatedAt
                                                            )}
                                                        </span>
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </div>

                            {listError && (
                                <p className="border-t border-zinc-700 px-3 py-2 text-xs text-red-400">
                                    {listError}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <button
                    type="button"
                    className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900 sm:px-4 sm:py-2.5"
                >
                    Export
                </button>
            </nav>

            {saveModalOpen && (
                <Modal
                    title="Save new edit"
                    subtitle="Create a new version of this project edit. Leave the name blank to use a default."
                    onExit={closeSaveModal}
                >
                    <form
                        onSubmit={(event) => {
                            event.preventDefault()
                            void confirmSaveNewEdit()
                        }}
                    >
                        <label
                            htmlFor="new-edit-name"
                            className="mb-2 block text-sm font-medium text-zinc-300"
                        >
                            Edit name
                        </label>
                        <input
                            ref={nameInputRef}
                            id="new-edit-name"
                            type="text"
                            value={newEditName}
                            onChange={(event) => setNewEditName(event.target.value)}
                            placeholder="e.g. Rough cut v1"
                            disabled={savingNew}
                            className="mb-4 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 disabled:opacity-60"
                        />

                        {saveError && (
                            <p className="mb-4 text-sm text-red-300">{saveError}</p>
                        )}

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
                                onClick={closeSaveModal}
                                disabled={savingNew}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                                disabled={savingNew}
                            >
                                {savingNew ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : null}
                                {savingNew ? "Saving…" : "Save edit"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </header>
    )
}
