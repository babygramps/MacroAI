'use client';

interface ErrorAlertProps {
    /** Title displayed at the top of the alert (e.g., "Search Error", "Analysis Error") */
    title: string;
    /** The error message to display to the user */
    message: string;
    /** Optional additional CSS classes */
    className?: string;
}

/**
 * Reusable error alert component for displaying action errors.
 * Uses consistent styling across all AI features.
 * 
 * @example
 * <ErrorAlert title="Search Error" message="No foods found" />
 */
export function ErrorAlert({ title, message, className = '' }: ErrorAlertProps) {
    return (
        <div className={`p-4 rounded-xl bg-red-500/10 border border-red-500/30 ${className}`}>
            <div className="flex items-start gap-3">
                <svg
                    className="w-5 h-5 text-red-400 shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                </svg>
                <div>
                    <p className="text-red-400 font-medium text-sm">{title}</p>
                    <p className="text-red-300/80 text-sm mt-1">{message}</p>
                </div>
            </div>
        </div>
    );
}
