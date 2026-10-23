---
name: why-first-design-comments
description: Use when changing application behavior or architecture and the codebase needs concise Japanese comments that preserve the reason for the design decision, not a restatement of what the code does.
---

# Why-first design comments

When implementing a behavior or architecture change, add a short Japanese comment only where the choice is not obvious from the code.

Explain:

- why the change is necessary;
- what failure mode, invariant, or user experience it protects;
- why the behavior is intentionally bounded or different from the obvious alternative.

Do not write comments that merely translate the next line of code. Keep the comment beside the decision, avoid repeating the same rationale in multiple files, and omit comments for self-explanatory code. Preserve existing comments and unrelated behavior.

For reliability changes, prefer wording that describes the failure being prevented. For validation changes, explain why the server must decide rather than trusting browser input. For CI or deployment checks, explain what unsafe artifact or release state the check prevents.
