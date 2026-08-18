---
trigger: always_on
---

# Project Overview

This project is an AI-assisted English learning tool designed to help users learn English naturally through reading, vocabulary lookup, contextual understanding, and AI assistance.

The product should prioritize simplicity, readability, low cognitive load, and an efficient learning experience.

# Product Principles

## Language

* All user-facing content must use simple, natural, and easy-to-understand English.
* This includes UI labels, buttons, navigation, dialogs, notifications, error messages, onboarding content, placeholders, and help text.
* Avoid unnecessarily complex vocabulary or technical terminology in user-facing text.
* Chinese must not appear in the user interface unless explicitly required by a specific feature or explicitly requested by the project owner.
* Internal code comments and technical documentation may use English.

## UI and UX

* Prefer simple and clear interfaces over feature-heavy or visually complex designs.
* Minimize unnecessary steps in common user workflows.
* UI text should be concise and immediately understandable.
* Keep visual and interaction patterns consistent across the application.
* When adding a new feature, reuse existing UI patterns whenever appropriate instead of introducing unnecessary new patterns.

# Development Principles

* Before implementing a feature, inspect the existing project structure and reuse existing components, utilities, APIs, and patterns whenever appropriate.
* Avoid unnecessary refactoring unrelated to the current task.
* Do not introduce new dependencies unless they provide a clear benefit.
* Preserve backward compatibility unless a breaking change is explicitly required.
* Do not remove existing functionality unless explicitly requested.
* Keep implementations as simple as reasonably possible.

# Git and Release Rules

When a development task is considered complete:

1. Verify that the implementation works correctly.
2. Run relevant tests, linting, type checks, and build checks when available.
3. Review the final changed files.
4. Ensure temporary files, debug code, test data, and local configuration files are not committed.
5. Stage all intended changes.
6. Create an appropriate Git commit with a clear commit message.
7. Leave the local Git repository in a clean and deployable state.

The development workflow must complete all necessary local Git operations.

For production deployment, the administrator should normally only need to run:

`git push origin`

Do not require the administrator to manually perform additional local Git operations unless there is a specific technical reason.

# Agent Behavior

* Treat the rules in this document as persistent project requirements.
* Check existing project conventions before creating new conventions.
* If a requested change conflicts with these rules, explicitly point out the conflict before proceeding.
* Do not silently change established product behavior or architecture.
* Prefer small, focused changes over large unrelated modifications.
