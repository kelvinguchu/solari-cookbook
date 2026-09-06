import type { BaseLayoutProps, MainItemType } from "fumadocs-ui/layouts/shared"

import { Logo } from "@/components/logo"
import { packageUrl, projectUrl } from "@/lib/site"

type RightAlignedMainItem = MainItemType & { secondary: true }

const primaryLinks: MainItemType[] = [
  { text: "Documentation", type: "main", url: "/docs" },
  { text: "Commands", type: "main", url: "/docs/commands" },
  { text: "Faults", type: "main", url: "/docs/faults" },
  { external: true, text: "npm", type: "main", url: packageUrl },
]

function menuLink(link: MainItemType): MainItemType {
  return { ...link, on: "menu" }
}

function rightAlignedLink(link: MainItemType): RightAlignedMainItem {
  return { ...link, on: "nav", secondary: true }
}

export function baseOptions(): BaseLayoutProps {
  return {
    githubUrl: projectUrl,
    links: [...primaryLinks.map(menuLink), ...primaryLinks.map(rightAlignedLink)],
    nav: {
      title: <Logo />,
      url: "/",
    },
  }
}
