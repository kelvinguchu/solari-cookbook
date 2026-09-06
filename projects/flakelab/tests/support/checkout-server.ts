import { createServer } from "node:http"
import type { Server, ServerResponse } from "node:http"

const checkoutPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab checkout fixture</title></head>
  <body>
    <main>
      <h1>Checkout</h1>
      <button type="button">Place order</button>
      <p role="status">Ready</p>
    </main>
    <script>
      document.querySelector('button').addEventListener('click', async () => {
        const status = document.querySelector('[role=status]')
        status.textContent = 'Processing'
        let expired = false
        const deadline = setTimeout(() => {
          expired = true
          status.textContent = 'Checkout timed out'
        }, 75)
        const response = await fetch('/api/checkout', { method: 'POST' })
        clearTimeout(deadline)
        if (!response.ok) {
          status.textContent = 'Checkout failed'
          return
        }
        if (!expired) status.textContent = 'Checkout complete'
      })
    </script>
  </body>
</html>`

const startupPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab startup fixture</title></head>
  <body>
    <main><h1>Startup</h1><p role="status">Starting</p></main>
    <script>
      window.startupExpired = false
      setTimeout(() => {
        window.startupExpired = true
        document.querySelector('[role=status]').textContent = 'Startup timed out'
      }, 500)
    </script>
    <script src="/assets/startup.js"></script>
  </body>
</html>`

const startupScript = `document.querySelector('[role=status]').textContent =
  window.startupExpired ? 'Startup missed deadline' : 'Ready'`

const hydrationPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab hydration fixture</title></head>
  <body>
    <main><h1>Hydration</h1><p role="status">Waiting for hydration</p></main>
    <script>
      window.hydrationExpired = false
      const hydrationDeadline = setTimeout(() => {
        window.hydrationExpired = true
        document.querySelector('[role=status]').textContent = 'Hydration timed out'
      }, 500)
      document.addEventListener('DOMContentLoaded', () => {
        clearTimeout(hydrationDeadline)
        document.querySelector('[role=status]').textContent = window.hydrationExpired
          ? 'Hydration missed deadline'
          : 'Hydrated'
      })
    </script>
  </body>
</html>`

const loadHydrationPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab load fixture</title></head>
  <body>
    <main><h1>Load startup</h1><p role="status">Waiting for load</p></main>
    <script>
      window.loadExpired = false
      const loadDeadline = setTimeout(() => {
        window.loadExpired = true
        document.querySelector('[role=status]').textContent = 'Load startup timed out'
      }, 500)
      window.addEventListener('load', () => {
        clearTimeout(loadDeadline)
        document.querySelector('[role=status]').textContent = window.loadExpired
          ? 'Load startup missed deadline'
          : 'Loaded'
      })
    </script>
  </body>
</html>`

const eventLoopPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab event-loop fixture</title></head>
  <body>
    <main><h1>Interactive startup</h1><p role="status">Starting interaction</p></main>
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const interactionStartedAt = performance.now()
        setTimeout(() => {
          const startupDuration = performance.now() - interactionStartedAt
          document.querySelector('[role=status]').textContent = startupDuration > 250
            ? 'Main thread missed deadline'
            : 'Interactive'
        }, 100)
      })
    </script>
  </body>
</html>`

const storageSeedPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab storage seed fixture</title></head>
  <body><main><h1>Storage seed</h1></main></body>
</html>`

const storageAuthPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab storage auth fixture</title></head>
  <body>
    <main><h1>Storage authentication</h1><p role="status">Reading storage</p></main>
    <script>
      setTimeout(() => {
        const token = localStorage.getItem('auth-token')
        document.querySelector('[role=status]').textContent = token === 'ready'
          ? 'Authenticated from storage'
          : 'Storage unavailable'
      }, 100)
    </script>
  </body>
</html>`

const temporalPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab temporal fixture</title></head>
  <body>
    <main>
      <h1>Temporal environment</h1>
      <p data-testid="clock">Checking clock</p>
      <p data-testid="locale"></p>
      <p data-testid="timezone"></p>
    </main>
    <script>
      const startedAt = Date.now()
      document.querySelector('[data-testid=locale]').textContent = navigator.language
      document.querySelector('[data-testid=timezone]').textContent =
        Intl.DateTimeFormat().resolvedOptions().timeZone
      setTimeout(() => {
        const elapsed = Date.now() - startedAt
        document.querySelector('[data-testid=clock]').textContent = elapsed > 60000
          ? 'Clock jumped'
          : 'Clock stable'
      }, 100)
    </script>
  </body>
</html>`

const visualEnvironmentPage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>FlakeLab visual environment fixture</title></head>
  <body>
    <main>
      <h1>Visual environment</h1>
      <p data-testid="viewport"></p>
      <p data-testid="motion"></p>
      <p data-testid="animation">Checking animation</p>
      <div data-testid="box"></div>
    </main>
    <script>
      document.querySelector('[data-testid=viewport]').textContent =
        innerWidth >= 1000 ? 'Desktop layout' : 'Compact layout'
      document.querySelector('[data-testid=motion]').textContent =
        matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Reduced motion' : 'Full motion'
      let animationFinished = false
      const animation = document.querySelector('[data-testid=box]').animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 3000 }
      )
      animation.finished.then(() => { animationFinished = true })
      setTimeout(() => {
        document.querySelector('[data-testid=animation]').textContent = animationFinished
          ? 'Animation accelerated'
          : 'Normal animation speed'
      }, 500)
    </script>
  </body>
</html>`

const authenticatedCookiePage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Cookie auth</title></head>
<body><main><p role="status">Authenticated by cookie</p></main></body></html>`

const expiredCookiePage = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Cookie auth</title></head>
<body><main><p role="status">Authentication expired</p></main></body></html>`

export interface CheckoutServer {
  url: string
  close: () => Promise<void>
}

const staticPages = new Map([
  ["/event-loop", eventLoopPage],
  ["/load-hydration", loadHydrationPage],
  ["/hydration", hydrationPage],
  ["/startup", startupPage],
  ["/storage-auth", storageAuthPage],
  ["/storage-seed", storageSeedPage],
  ["/temporal", temporalPage],
  ["/visual-environment", visualEnvironmentPage],
])

function cookieAuthBody(cookieHeader: string | undefined): string {
  return /(?:^|;\s*)session-id=/u.test(cookieHeader ?? "")
    ? authenticatedCookiePage
    : expiredCookiePage
}

function handleOrderRequest(url: string | undefined, response: ServerResponse): boolean {
  if (!url?.startsWith("/api/order")) {
    return false
  }
  const query = url.split("?", 2)[1] ?? ""
  const slot = new URLSearchParams(query).get("slot")
  const waitMs = slot === "second" ? 25 : 0
  setTimeout(() => {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ slot }))
  }, waitMs)
  return true
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

export async function startCheckoutServer(): Promise<CheckoutServer> {
  const server = createServer((request, response) => {
    if (request.url === "/cookie-auth") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      response.end(cookieAuthBody(request.headers.cookie))
      return
    }
    const staticPage = request.url === undefined ? undefined : staticPages.get(request.url)
    if (staticPage !== undefined) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      response.end(staticPage)
      return
    }
    if (request.url === "/assets/startup.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" })
      response.end(startupScript)
      return
    }
    if (handleOrderRequest(request.url, response)) {
      return
    }
    if (request.url === "/api/checkout") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end('{"ok":true}')
      return
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end(checkoutPage)
  })
  await listen(server)
  const address = server.address()
  if (!address || typeof address === "string") {
    await close(server)
    throw new Error("Checkout fixture did not bind to a TCP port")
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => close(server),
  }
}
