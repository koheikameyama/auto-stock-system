import { Suspense } from "react"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import AuthenticatedLayout from "@/app/components/AuthenticatedLayout"
import MyStocksClient from "./MyStocksClient"
import { MyStocksSkeleton } from "@/components/skeletons/my-stocks-skeleton"

export default async function MyStocksPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  return (
    <AuthenticatedLayout maxWidth="6xl">
      <Suspense fallback={<MyStocksSkeleton />}>
        <MyStocksClient />
      </Suspense>
    </AuthenticatedLayout>
  )
}
