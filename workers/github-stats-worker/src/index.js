// ── GitHub Stats Card — Cloudflare Worker ──
// Self-hosted alternative to github-readme-stats.vercel.app
// Fetches data from GitHub API and renders SVG stats cards

const CACHE_TTL = 3600 // 1 hour

// GitHub theme colors (matching "radical" theme)
const THEMES = {
  radical: {
    bg: 'rgba(17,24,39,1)',
    card: 'rgba(31,41,55,0.5)',
    border: 'rgba(55,65,81,0.5)',
    title: '#f472b6',
    text: '#e2e8f0',
    muted: '#94a3b8',
    accent: '#a78bfa',
    green: '#34d399',
    orange: '#fb923c',
  },
}

function getTheme(name) {
  return THEMES[name.toLowerCase()] || THEMES.radical
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── SVG Templates ──

function statsCard(user, theme) {
  const t = getTheme(theme)
  const repos = user.public_repos || 0
  const gists = user.public_gists || 0
  const followers = user.followers || 0
  const following = user.following || 0

  return `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="195" viewBox="0 0 450 195">
  <rect x="0.5" y="0.5" rx="12" height="194" width="449" fill="${t.card}" stroke="${t.border}" stroke-opacity="0.5"/>
  <text x="25" y="35" font-family="Segoe UI, system-ui, sans-serif" font-size="18" font-weight="600" fill="${t.title}">GitHub Stats</text>

  <g transform="translate(25, 65)">
    <circle cx="8" cy="8" r="6" fill="${t.green}" opacity="0.8"/>
    <text x="22" y="13" font-family="Segoe UI, system-ui, sans-serif" font-size="14" fill="${t.text}">Repos:</text>
    <text x="405" y="13" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="600" fill="${t.text}" text-anchor="end">${repos}</text>
  </g>

  <g transform="translate(25, 95)">
    <circle cx="8" cy="8" r="6" fill="${t.orange}" opacity="0.8"/>
    <text x="22" y="13" font-family="Segoe UI, system-ui, sans-serif" font-size="14" fill="${t.text}">Gists:</text>
    <text x="405" y="13" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="600" fill="${t.text}" text-anchor="end">${gists}</text>
  </g>

  <g transform="translate(25, 125)">
    <circle cx="8" cy="8" r="6" fill="${t.accent}" opacity="0.8"/>
    <text x="22" y="13" font-family="Segoe UI, system-ui, sans-serif" font-size="14" fill="${t.text}">Followers:</text>
    <text x="405" y="13" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="600" fill="${t.text}" text-anchor="end">${followers}</text>
  </g>

  <g transform="translate(25, 155)">
    <circle cx="8" cy="8" r="6" fill="${t.title}" opacity="0.8"/>
    <text x="22" y="13" font-family="Segoe UI, system-ui, sans-serif" font-size="14" fill="${t.text}">Following:</text>
    <text x="405" y="13" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="600" fill="${t.text}" text-anchor="end">${following}</text>
  </g>
</svg>`
}

function languagesCard(langs, theme) {
  const t = getTheme(theme)
  const colors = ['#f472b6', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#fbbf24', '#f87171', '#818cf8']
  const total = Object.values(langs).reduce((a, b) => a + b, 0)
  let items = Object.entries(langs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  let yPos = 65
  let langSvg = ''
  items.forEach(([lang, bytes], i) => {
    const pct = total > 0 ? ((bytes / total) * 100).toFixed(1) : 0
    langSvg += `<g transform="translate(25, ${yPos})">
      <rect x="0" y="0" width="12" height="12" rx="3" fill="${colors[i % colors.length]}"/>
      <text x="22" y="10" font-family="Segoe UI, system-ui, sans-serif" font-size="13" fill="${t.text}">${escapeHtml(lang)}</text>
      <text x="405" y="10" font-family="Segoe UI, system-ui, sans-serif" font-size="13" fill="${t.muted}" text-anchor="end">${pct}%</text>
    </g>`
    yPos += 32
  })

  const height = Math.max(yPos + 10, 195)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="${height}" viewBox="0 0 450 ${height}">
  <rect x="0.5" y="0.5" rx="12" height="${height - 1}" width="449" fill="${t.card}" stroke="${t.border}" stroke-opacity="0.5"/>
  <text x="25" y="35" font-family="Segoe UI, system-ui, sans-serif" font-size="18" font-weight="600" fill="${t.title}">Top Languages</text>
  ${langSvg}
</svg>`
}

// ── Main Handler ──

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname
    const username = url.searchParams.get('username') || 'VijayaKumarchinta'
    const theme = url.searchParams.get('theme') || 'radical'
    const cacheKey = new Request(url.toString(), request)
    const cache = caches.default

    // Check cache first
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    try {
      const userResp = await fetch(`https://api.github.com/users/${username}`, {
        headers: { 'User-Agent': 'github-stats-worker' },
      })
      if (!userResp.ok) {
        return new Response('User not found', { status: 404 })
      }
      const user = await userResp.json()

      let svg
      if (path.includes('/top-langs')) {
        // Fetch repos for language stats
        const reposResp = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, {
          headers: { 'User-Agent': 'github-stats-worker' },
        })
        const repos = await reposResp.json()
        const langMap = {}
        for (const repo of repos) {
          if (repo.fork) continue
          if (repo.language) {
            langMap[repo.language] = (langMap[repo.language] || 0) + 1
          }
        }
        svg = languagesCard(langMap, theme)
      } else {
        svg = statsCard(user, theme)
      }

      const response = new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
          'Access-Control-Allow-Origin': '*',
        },
      })

      // Store in cache
      ctx.waitUntil(cache.put(cacheKey, response.clone()))

      return response
    } catch (e) {
      return new Response(`Error: ${e.message}`, { status: 500 })
    }
  },
}
