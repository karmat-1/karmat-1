// Renders a contribution activity graph (last N days) as an SVG.
// Usage: GITHUB_TOKEN=... node scripts/activity-graph.mjs <username> <output.svg> [days]

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [username, outputPath = "dist/activity-graph.svg", daysArg = "31"] = process.argv.slice(2);
const days = Number(daysArg);
const token = process.env.GITHUB_TOKEN;

if (!username || !token) {
  console.error("Usage: GITHUB_TOKEN=... node scripts/activity-graph.mjs <username> <output.svg> [days]");
  process.exit(1);
}

const colors = {
  bg: "#1a1b27",
  title: "#38BDF8",
  text: "#a9b1d6",
  grid: "#2a2e42",
  line: "#38BDF8",
  point: "#7dd3fc",
};

async function fetchContributions() {
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: username } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GitHub API error: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .slice(-days);
}

function render(data) {
  const width = 1200;
  const height = 420;
  const pad = { top: 80, right: 40, bottom: 60, left: 70 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = Math.max(1, ...data.map((d) => d.contributionCount));
  const step = Math.max(1, Math.ceil(max / 5));
  const yMax = step * 5;

  const x = (i) => pad.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;

  const points = data.map((d, i) => [x(i), y(d.contributionCount)]);
  const line = points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${pad.top + plotH} L${x(0).toFixed(1)},${pad.top + plotH} Z`;

  const gridLines = [];
  for (let v = 0; v <= yMax; v += step) {
    gridLines.push(
      `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}" stroke="${colors.grid}" stroke-width="1"/>`,
      `<text x="${pad.left - 12}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text>`,
    );
  }

  const labels = data.map((d, i) => {
    const day = Number(d.date.slice(8, 10));
    return `<text x="${x(i)}" y="${pad.top + plotH + 24}" text-anchor="middle" class="axis">${day}</text>`;
  });

  const dots = points.map(
    ([px, py], i) =>
      `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${colors.point}"><title>${data[i].date}: ${data[i].contributionCount} contributions</title></circle>`,
  );

  const total = data.reduce((sum, d) => sum + d.contributionCount, 0);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${username}'s contribution activity">
  <style>
    .title { font: 600 22px 'Segoe UI', Ubuntu, sans-serif; fill: ${colors.title}; }
    .sub { font: 400 14px 'Segoe UI', Ubuntu, sans-serif; fill: ${colors.text}; }
    .axis { font: 400 12px 'Segoe UI', Ubuntu, sans-serif; fill: ${colors.text}; }
  </style>
  <defs>
    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colors.line}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${colors.line}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="8" fill="${colors.bg}"/>
  <text x="${width / 2}" y="40" text-anchor="middle" class="title">Contribution Activity</text>
  <text x="${width / 2}" y="62" text-anchor="middle" class="sub">${total} contributions in the last ${data.length} days</text>
  ${gridLines.join("\n  ")}
  <path d="${area}" fill="url(#fill)"/>
  <path d="${line}" fill="none" stroke="${colors.line}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots.join("\n  ")}
  ${labels.join("\n  ")}
  <text x="${width / 2}" y="${height - 12}" text-anchor="middle" class="axis">Days</text>
</svg>
`;
}

const data = await fetchContributions();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, render(data));
console.log(`Wrote ${outputPath} (${data.length} days)`);
