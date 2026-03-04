"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from 'next-intl'

interface BackButtonProps {
  href?: string
  label?: string
}

export default function BackButton({ href, label }: BackButtonProps) {
  const router = useRouter()
  const t = useTranslations('common.buttons')

  return (
    <button
      onClick={() => href ? router.push(href) : router.back()}
      className="mb-4 sm:mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
    >
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 19l-7-7 7-7"
        />
      </svg>
      <span className="text-sm sm:text-base font-semibold">{label || t('back')}</span>
    </button>
  )
}
