---
name: githubplanet-cost-monitor
description: Review GitHubPlanet's Google Cloud billing and cost-related infrastructure changes without mutating resources. Use for recurring cost and configuration checks.
metadata:
  short-description: Monitor GitHubPlanet cost drivers safely
---

# GitHubPlanet Cost Monitor

Use this skill for a recurring, read-only check of GitHubPlanet's Google Cloud project.

## Scope

- Project: `gen-lang-client-0068654703`
- Cloud Run service: `githubplanet-git`
- Region: `asia-northeast2`

## Check

1. Review the available billing report or usage data and compare it with the previous check when available. Distinguish actual charges from forecasts, credits, and estimates.
2. Check for unexpected external load-balancer resources: forwarding rules, backend services, URL maps, reserved external IPs, and related managed resources.
3. Check Cloud Run's minimum and maximum instances, billing mode, CPU, memory, and traffic routing. Treat a minimum instance count above zero, unexpected scaling/resource increases, or traffic sent to an unexpected revision as actionable.
4. Check for other newly added cost-bearing resources or unusually large usage when the connected billing view exposes them.

## Safety and reporting

- Perform read-only inspection only. Never delete, pause, reconfigure, or deploy resources from this monitoring skill.
- Never print or quote environment-variable values, API keys, database URLs, cookies, OAuth codes, session secrets, or other credentials. Report names and redacted metadata only.
- If there is no meaningful change or actionable anomaly, remain quiet.
- If a meaningful change exists, report the affected resource, evidence, likely cost implication, and the smallest safe next step. Do not claim an exact amount unless the billing data explicitly provides it.
- If billing data is unavailable, say so clearly and report only the infrastructure evidence that was verified.
