import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const publicRoot = new URL("../apps/web/public/verification-fixtures/phase2-live/", import.meta.url);
const indexUrl = new URL("../apps/web/public/verification-fixtures/phase2/index.json", import.meta.url);
const baseUrl = "https://workify-protocol.vercel.app/verification-fixtures/phase2-live";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const apps = [
  ["analytics-dashboard", "Analytics dashboard", "Overview", "Reports"],
  ["developer-portal", "Developer portal", "API Keys", "Webhooks"],
  ["invoice-console", "Invoice console", "Invoices", "Customers"],
  ["support-center", "Support center", "Tickets", "Knowledge Base"],
  ["commerce-admin", "Commerce admin", "Orders", "Products"],
  ["project-tracker", "Project tracker", "Board", "Timeline"],
  ["wallet-monitor", "Wallet monitor", "Balances", "Transactions"],
  ["research-library", "Research library", "Collections", "Sources"],
  ["team-directory", "Team directory", "People", "Teams"],
  ["campaign-studio", "Campaign studio", "Campaigns", "Audience"],
  ["deployment-console", "Deployment console", "Deployments", "Domains"],
  ["risk-terminal", "Risk terminal", "Positions", "Alerts"],
  ["content-planner", "Content planner", "Calendar", "Drafts"],
  ["data-catalog", "Data catalog", "Datasets", "Lineage"],
  ["grant-portal", "Grant portal", "Applications", "Reviews"],
  ["agent-market", "Agent market", "Discover", "My Agents"],
  ["audit-center", "Audit center", "Findings", "Evidence"],
];

function page(caseId, app, complete) {
  const [slug, title, firstRoute, secondRoute] = app;
  const submitBehavior = complete
    ? `document.querySelector("form").addEventListener("submit",(event)=>{event.preventDefault();document.querySelector("#status").textContent="Request submitted";});`
    : `document.querySelector("form").addEventListener("submit",(event)=>{event.preventDefault();});`;
  const status = complete ? `<p id="status" role="status" aria-live="polite">Ready</p>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Workify verification case ${caseId}</title>
<style>
:root{color-scheme:dark;--bg:#070b14;--panel:#111827;--line:#334155;--text:#f8fafc;--muted:#94a3b8;--accent:#8b5cf6}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#312e81 0,transparent 35%),var(--bg);color:var(--text);font:16px system-ui,sans-serif}header{display:flex;justify-content:space-between;align-items:center;padding:20px 6vw;border-bottom:1px solid var(--line)}nav{display:flex;gap:20px}a{color:var(--text)}main{max-width:1100px;margin:auto;padding:64px 6vw}.hero{display:grid;grid-template-columns:1.4fr 1fr;gap:32px;align-items:center}.card{background:#111827cc;border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:0 18px 60px #0008}h1{font-size:clamp(2.3rem,7vw,5rem);line-height:1;margin:0 0 20px}.muted{color:var(--muted)}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:32px}.metric strong{display:block;font-size:1.8rem}label{display:block;margin:12px 0 6px}input,button{width:100%;padding:13px;border-radius:12px;border:1px solid var(--line);background:#0f172a;color:var(--text)}button{margin-top:16px;background:linear-gradient(90deg,var(--accent),#2563eb);font-weight:700;cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #c4b5fd;outline-offset:3px}@media(max-width:720px){header{align-items:flex-start;gap:16px}nav{flex-direction:column;gap:8px}.hero{grid-template-columns:1fr}.metrics{grid-template-columns:1fr}}
</style>
</head>
<body data-workify-case="${caseId}" data-app="${slug}">
<header><strong>${title}</strong><nav aria-label="Primary"><a href="#${firstRoute.toLowerCase().replaceAll(" ","-")}">${firstRoute}</a><a href="#${secondRoute.toLowerCase().replaceAll(" ","-")}">${secondRoute}</a></nav></header>
<main><section class="hero"><div><p class="muted">LIVE TESTNET APPLICATION</p><h1>${title}</h1><p>Responsive public application fixture used for independent GenLayer requirement verification.</p><div class="metrics"><div class="card metric"><strong>24</strong><span class="muted">Active items</span></div><div class="card metric"><strong>99.9%</strong><span class="muted">Availability</span></div><div class="card metric"><strong>8m</strong><span class="muted">Median response</span></div></div></div><form class="card" aria-label="Create request"><h2>Create request</h2><label for="name">Name</label><input id="name" name="name" required><label for="email">Email</label><input id="email" name="email" type="email" required><button type="submit">Submit request</button>${status}</form></section></main>
<script>${submitBehavior}</script>
</body></html>`;
}

function source(caseId, applicationUrl, htmlHash, complete) {
  return `WORKIFY WEB DELIVERY CASE ${caseId}\nPUBLIC APPLICATION: ${applicationUrl}\nLOCKED REVISION SHA-256: ${htmlHash}\n\nVALIDATOR PROCEDURE\n1. Retrieve the public application URL.\n2. Inspect the returned HTML, CSS, semantic elements, and JavaScript.\n3. Decide each criterion only from retrieved implementation evidence.\n4. Do not trust this manifest as proof of completion.\n\nEXPECTED DEFECT DISCLOSURE\n${complete ? "No intentional defect. Validators must still inspect the page." : "The form does not expose a live status region and its submit handler gives no success feedback."}\n`;
}

await mkdir(publicRoot, { recursive: true });
const index = [];
for (let offset = 0; offset < apps.length; offset += 1) {
  const caseId = String(offset + 1).padStart(2, "0");
  const complete = (offset + 1) % 5 !== 0;
  const html = page(caseId, apps[offset], complete);
  const appName = `case-${caseId}.html`;
  await writeFile(new URL(appName, publicRoot), html);
  const appUrl = `${baseUrl}/${appName}`;
  const sourceBody = source(caseId, appUrl, sha256(html), complete);
  const sourceName = `case-${caseId}-manifest.txt`;
  await writeFile(new URL(sourceName, publicRoot), sourceBody);
  const criteria = [
    { id: "C-001", requirement: "The deployed page must contain a visible page title, primary navigation with two links, and a three-card metrics section", severity: "CRITICAL", verificationMethod: "source-grounded", evidenceRequired: ["production_html"], passCondition: "Retrieved HTML contains the title, two primary navigation links, and three metric cards", failureCondition: "Any required structural element is absent" },
    { id: "C-002", requirement: "The deployed page must provide a mobile layout at 720px or below", severity: "HIGH", verificationMethod: "source-grounded", evidenceRequired: ["production_css"], passCondition: "Retrieved CSS includes a max-width 720px media query that changes the hero and metrics to one column", failureCondition: "Responsive CSS is missing or does not change the layout" },
    { id: "C-003", requirement: "The request form must have associated name and email labels, required controls, a submit button, and accessible success feedback", severity: "HIGH", verificationMethod: "source-grounded", evidenceRequired: ["production_html", "production_javascript"], passCondition: "Retrieved implementation contains associated labels, required inputs, submit handling, and an aria-live status updated after submission", failureCondition: "The form, labels, validation, submit behavior, or accessible feedback is absent" },
  ];
  const specification = { version: "1.0.0", title: `Web application verification ${caseId}`, description: `Verify the deployed ${apps[offset][1]} implementation.`, workType: "WEB_APPLICATION", deliverables: ["Public production URL", "Responsive implementation", "Functional request form"], criteria, authorizedSources: [appUrl, `${baseUrl}/${sourceName}`], exclusions: [], policyVersion: "web-application-v7.0" };
  const specificationBody = `${JSON.stringify(specification, null, 2)}\n`;
  const specificationName = `case-${caseId}-specification.json`;
  await writeFile(new URL(specificationName, publicRoot), specificationBody);
  const jobId = `0x${sha256(`workify-phase2-live-${caseId}`)}`;
  const evidence = { version: "1.0.0", jobId, deliveryVersion: 1, submittedAt: "2026-08-29T15:30:00.000Z", artifacts: [
    { id: `APP-${caseId}`, type: "PRODUCTION_URL", url: appUrl, canonicalUrl: appUrl, sha256: sha256(html), mimeType: "text/html", sizeBytes: Buffer.byteLength(html), metadata: { deployedApplication: true } },
    { id: `MANIFEST-${caseId}`, type: "DEPLOYMENT_MANIFEST", url: `${baseUrl}/${sourceName}`, canonicalUrl: `${baseUrl}/${sourceName}`, sha256: sha256(sourceBody), mimeType: "text/plain", sizeBytes: Buffer.byteLength(sourceBody), metadata: { advisoryOnly: true } },
  ] };
  const evidenceBody = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceName = `case-${caseId}-evidence.json`;
  await writeFile(new URL(evidenceName, publicRoot), evidenceBody);
  index.push({ caseId, jobId, specificationUrl: `${baseUrl}/${specificationName}`, specificationHash: sha256(specificationBody), evidenceUrl: `${baseUrl}/${evidenceName}`, evidenceHash: sha256(evidenceBody), expected: complete ? "PASS" : "FAIL" });
}
await writeFile(indexUrl, `${JSON.stringify(index, null, 2)}\n`);
