import { Suspense } from "react"
import { getTranslations } from "next-intl/server"
import AdminStocksClient from "./AdminStocksClient"

export default async function AdminPage() {
  const t = await getTranslations("admin")
  return (
    <Suspense fallback={<div className="text-gray-500">{t("loading")}</div>}>
      <AdminStocksClient />
    </Suspense>
  )
}
