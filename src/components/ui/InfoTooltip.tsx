'use client';

import { useState, useRef, useEffect } from 'react';

interface InfoTooltipProps {
    text: string;
    className?: string;
}

export function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Close tooltip when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                tooltipRef.current &&
                buttonRef.current &&
                !tooltipRef.current.contains(event.target as Node) &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setIsVisible(false);
            }
        }

        if (isVisible) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isVisible]);

    return (
        <span className={`relative inline-flex ${className}`}>
            <button
                ref={buttonRef}
                onClick={() => setIsVisible(!isVisible)}
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
                className="w-4 h-4 rounded-full bg-bg-elevated text-text-muted text-xs flex items-center justify-center hover:bg-bg-primary hover:text-text-secondary transition-colors"
                aria-label="More info"
            >
                ?
            </button>
            {isVisible && (
                <div
                    ref={tooltipRef}
                    className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-bg-surface border border-border-subtle rounded-lg shadow-lg text-xs text-text-secondary max-w-[200px] text-center"
                    style={{ whiteSpace: 'normal' }}
                >
                    {text}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
                        <div className="w-2 h-2 bg-bg-surface border-r border-b border-border-subtle transform rotate-45" />
                    </div>
                </div>
            )}
        </span>
    );
}
