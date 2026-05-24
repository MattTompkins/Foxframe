"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import  FileBrowser  from "@/components/FileBrowser"

type Props = {
    params: {
        id: string
    }
}

export default function ProjectSettingsPage({ params }: Props) {

    const projectId = useParams().id;

    return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-900 font-sans">

            <main className="flex w-full max-w-3xl flex-col items-center justify-between py-32 sm:items-start">

                <h1 className="text-6xl font-bold text-white">
                    Select the settings for your video
                </h1>

                <p className="text-2xl text-gray-300 mt-3 mb-6">
                    Configure your video settings to customise your video output.
                </p>

             
            </main>

        </div>
    )
}