import { sha256 } from "./canonical";
import { WorkifyError } from "./errors";

export interface GitHubPullEvidence {
  repository: string;
  issueNumber: number;
  pullNumber: number;
  baseSha: string;
  headSha: string;
  state: string;
  merged: boolean;
  files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
  checks: Array<{ name: string; status: string; conclusion: string | null }>;
  canonicalUrl: string;
  snapshotHash: string;
}

function parseUrl(input: string): { owner: string; repo: string; type: "issues" | "pull"; number: number } {
  const url = new URL(input);
  if (url.hostname !== "github.com") throw new WorkifyError("USER_INPUT", "Only github.com URLs are supported");
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/u);
  if (!match) throw new WorkifyError("USER_INPUT", "Use a complete GitHub issue or pull request URL");
  return { owner: match[1]!, repo: match[2]!, type: match[3] as "issues" | "pull", number: Number(match[4]) };
}

async function github(path: string, token?: string): Promise<Response> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Workify-Protocol/1.0",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 403 || response.status === 429) {
    throw new WorkifyError("GITHUB_RATE_LIMITED", "GitHub rate limit reached", true);
  }
  if (!response.ok) throw new WorkifyError("EVIDENCE_UNAVAILABLE", `GitHub returned ${response.status}`, response.status >= 500);
  return response;
}

export async function resolveGitHubPull(
  issueUrl: string,
  pullUrl: string,
  token = process.env.GITHUB_READ_TOKEN,
): Promise<GitHubPullEvidence> {
  const issue = parseUrl(issueUrl);
  const pull = parseUrl(pullUrl);
  if (issue.type !== "issues" || pull.type !== "pull" || issue.owner !== pull.owner || issue.repo !== pull.repo) {
    throw new WorkifyError("USER_INPUT", "Issue and pull request must belong to the same public repository");
  }
  const prefix = `/repos/${pull.owner}/${pull.repo}`;
  const [pullData, issueData, filesData] = await Promise.all([
    github(`${prefix}/pulls/${pull.number}`, token).then((response) => response.json()),
    github(`${prefix}/issues/${issue.number}`, token).then((response) => response.json()),
    github(`${prefix}/pulls/${pull.number}/files?per_page=100`, token).then((response) => response.json()),
  ]) as [any, any, any[]];
  const checksData = await github(`${prefix}/commits/${pullData.head.sha}/check-runs?per_page=100`, token).then((response) => response.json()) as any;
  const snapshot = {
    repository: `${pull.owner}/${pull.repo}`,
    issueNumber: issue.number,
    pullNumber: pull.number,
    issue: { title: issueData.title, body: issueData.body, state: issueData.state },
    pull: { title: pullData.title, body: pullData.body, state: pullData.state, merged: Boolean(pullData.merged) },
    baseSha: pullData.base.sha,
    headSha: pullData.head.sha,
    files: filesData.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      ...(file.patch ? { patch: String(file.patch).slice(0, 12_000) } : {}),
    })),
    checks: (checksData.check_runs ?? []).map((check: any) => ({ name: check.name, status: check.status, conclusion: check.conclusion })),
  };
  return {
    repository: snapshot.repository,
    issueNumber: issue.number,
    pullNumber: pull.number,
    baseSha: snapshot.baseSha,
    headSha: snapshot.headSha,
    state: snapshot.pull.state,
    merged: snapshot.pull.merged,
    files: snapshot.files,
    checks: snapshot.checks,
    canonicalUrl: `https://github.com/${snapshot.repository}/pull/${pull.number}`,
    snapshotHash: sha256(JSON.stringify(snapshot)),
  };
}
