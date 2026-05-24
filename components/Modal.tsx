import { X } from "lucide-react"

export function Modal({
    title,
    subtitle,
    exitEnabled = true,
    children,
    onExit,
}: {
    title: string
    subtitle?: string
    exitEnabled?: boolean
    children: React.ReactNode
    onExit?: () => void
}) {
    return (
        <>
            <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs" />

            <div className="fixed inset-0 z-50 flex items-center justify-center">
                <div className="bg-gray-800 rounded-lg p-6 w-full max-w-3xl mx-4 border border-gray-700 relative">

                    <h2 className="text-3xl font-semibold text-white mb-2">{title}</h2>
                    {exitEnabled && <X className="absolute top-4 right-4 text-white h-6 w-6 cursor-pointer" onClick={onExit} />}
                    {subtitle && <p className="text-xs font-medium uppercase tracking-wide text-orange-400 mb-4">{subtitle}</p>}
                    {children}
                </div>
            </div>
        </>
    )
}