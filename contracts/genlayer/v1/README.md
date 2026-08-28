# Workify GenLayer V1

`WorkVerifierV1.py` is deployed five times with immutable constructor arguments:

| Deployment | `work_type` | `policy_version` |
| --- | --- | --- |
| GitHub Software | `GITHUB_SOFTWARE` | `github-software-v1.0` |
| Web Application | `WEB_APPLICATION` | `web-application-v1.0` |
| Research/Data | `RESEARCH_DATA` | `research-data-v1.0` |
| Content/Document | `CONTENT_DOCUMENT` | `content-document-v1.0` |
| Design/Creative | `DESIGN_CREATIVE` | `design-creative-v1.0` |

This keeps one audited implementation while producing five independently addressed,
immutable policy deployments. `GenTreasuryV1.py` receives exact 0.1 GEN attempt fees and
exact 1 GEN appeal fees and supports owner withdrawal through a finalized native transfer.
