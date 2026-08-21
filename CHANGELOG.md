# Changelog

Notable changes to CAT will be documented here. The project has not yet assigned its
first archival release version.

## Unreleased

- Reworked the analytics consent notice as a centered privacy dialog with its decision
  buttons below the explanatory text and ensured it appears above first-visit overlays.
- Reworked repeated-call exports into one complete-results ZIP with overall outputs,
  per-LLM outputs, and unchanged individual-run files. Free-text responses are exported
  separately, and categorical aggregates use one binary column per permitted value.
- Changed tied numeric modes to use the median and documented the even-count rule.
- Added consent-gated usage analytics with an anonymous count-only rejection path.
- Removed category-generation and legacy upload endpoints from the publication scope.
- Deferred Results Analysis until its agreement statistics are validated and documented.
- Added locked Python dependencies, automated dependency-vulnerability checks, publication
  metadata, and public privacy, security, and contribution documentation.
- Updated public development and university-hosted deployment documentation.
