"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

interface TermTooltipProps {
  text: string;
  id: string;
}

export default function TermTooltip({ text, id }: TermTooltipProps) {
  const t = useTranslations("common.tooltip");
  const [isOpen, setIsOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const ratio = rect.left / window.innerWidth;
      setAlign(ratio < 0.33 ? "left" : ratio > 0.66 ? "right" : "center");
    }
    setIsOpen(!isOpen);
  }, [isOpen]);

  const tooltipId = `tooltip-${id}`;

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
        className="ml-1 inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 active:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-full"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
          <path strokeLinecap="round" strokeWidth="2" d="M12 16v-4M12 8h.01" />
        </svg>
        <span className="sr-only">{t("showDescription")}</span>
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className={`absolute top-full mt-1 z-50 w-64 max-w-[calc(100vw-3rem)] p-3 bg-gray-800 text-white text-xs leading-relaxed rounded-lg shadow-lg animate-fade-in ${
            align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          <div
            className={`absolute -top-1 w-2 h-2 bg-gray-800 rotate-45 ${
              align === "left" ? "left-3" : align === "right" ? "right-3" : "left-1/2 -translate-x-1/2"
            }`}
          />
          {text}
        </div>
      )}
    </span>
  );
}
