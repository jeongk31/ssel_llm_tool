# Deferred features

The following work is intentionally excluded from CAT's initial publication release.
Keeping the requirements here prevents unfinished functionality from being mistaken for
supported behavior.

## Results Analysis and inter-rater agreement

Before this feature returns, the implementation must:

- identify and label Cohen's and Fleiss' kappa precisely;
- document category and missing-value handling;
- validate every coefficient against published numerical examples;
- test two coders, multiple coders, missing data, constant variables, unequal category
  sets, and insufficient observations;
- remove or methodologically justify averages across coefficients, coder pairs, or
  variables; and
- use a reviewed permissively licensed implementation for every statistic.

The previous implementation called a Fleiss calculation through a field labelled as
Cohen's kappa and depended on GPL-licensed `irrCAC`; it was therefore removed from the
active publication release. Statistical terminology and methodology require author
approval before reintroduction.

## Category generation

Automatic category generation is not part of the published CAT scope. Its hidden routes,
runner, and interface component were removed rather than shipping an incomplete and
untested feature. A future implementation would require a separately specified method,
visible workflow, validation, tests, and documentation.
