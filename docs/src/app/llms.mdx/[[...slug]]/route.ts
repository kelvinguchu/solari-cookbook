import { notFound } from "next/navigation"

import { getLLMText } from "@/lib/llm-text"
import { source } from "@/lib/source"

export const revalidate = false
export const dynamicParams = false

interface RouteContext {
  params: Promise<{ slug?: string[] }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) {
    notFound()
  }

  return new Response(await getLLMText(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  })
}

export function generateStaticParams() {
  return source.generateParams()
}
