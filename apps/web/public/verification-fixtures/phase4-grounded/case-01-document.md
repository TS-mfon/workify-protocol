# Workify API Quickstart

## Authentication
Send the server-only token in the Authorization header as `Bearer $WORKIFY_API_TOKEN`. Never expose it in browser code.

## Create an evidence manifest

```http
POST /api/evidence/prepare HTTP/1.1
Authorization: Bearer test-token
Content-Type: application/json

{"jobId":"0xabc","artifacts":[{"type":"DOCUMENT","url":"https://example.com/report.md"}]}
```

## Successful response

```json
{"manifestHash":"7f2a...","artifactCount":1,"status":"READY"}
```

## Error example

A missing token returns HTTP 401:

```json
{"error":{"code":"UNAUTHORIZED","message":"Bearer token required"}}
```
