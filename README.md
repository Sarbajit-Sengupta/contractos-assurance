# CONTRACTOS Assurance 0.5

A standalone, fail-closed TypeScript CI gate and explicit HTTP runtime test runner. This complements the browser studio; the browser's existing check is not upgraded into a runtime test by installing this package.

## Windows quick start

Requires Node.js 22 or newer. Extract the archive, open PowerShell in this folder, then run:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd test
node scripts/gate.mjs examples/typed/contractos.project.json
node scripts/demo.mjs
node scripts/demo.mjs --broken
```

The last command intentionally exits 1: its disposable local server simulates two charges for one order. The ordinary demo exits 0. No payment provider or real API is contacted by the examples. The demo server closes after each run.

## The enforceable result

| Exit | Status | Meaning |
|---|---|---|
| 0 | passed | Every configured check in this runner completed and met its expectations |
| 1 | failed | A completed check found new compiler errors or a failed runtime expectation |
| 2 | incomplete | Invalid baseline, missing dependency, unsupported setting, unbound contract, timeout, network/body failure, or invalid input prevents a passing verdict |

Any nonzero exit must block the CI job. The supervisor writes an incomplete report before work starts, then replaces it with the final result. A killed or crashed process cannot return a successful exit. Compare runId and timestamps when inspecting downloaded evidence; do not treat an old report as a new CI run. Malformed configuration uses the default contractos-report directory because its custom output cannot be trusted.

## Use the type gate on your project

Install your project's pinned dependencies first. Keep this tool in tools/contractos-assurance or run it from this extracted folder. Write contractos.project.json beside the project configuration:

```json
{
  "baseline": "contracts/baseline.yaml",
  "candidate": "contracts/candidate.yaml",
  "tsconfig": "tsconfig.assurance.json",
  "generatedFile": "src/api.d.ts",
  "output": "contractos-report",
  "timeoutMs": 60000
}
```

```powershell
node tools/contractos-assurance/scripts/gate.mjs contractos.project.json
```

Both contracts must be bundled OpenAPI 3.0/3.1 with internal references. The generatedFile must be the declaration module actually imported by your consumer graph. Its contents are overlaid in memory; your checked-in declaration file is not rewritten. Consumers are compiled against both versions with the same source/dependency snapshot. A baseline with diagnostics is incomplete, even if no new errors are found.

The strict assurance configuration must enable strict without disabling strict subchecks; skipLibCheck, skipDefaultLibCheck, noCheck, noResolve, noLib, compiler plugins and project references are rejected. JavaScript inputs require checkJs. Check referenced leaf projects separately. This deliberately supports a narrower scope than arbitrary tsconfig files. Structural API classification is a separate check: use the browser contract diff or oasdiff alongside this gate.

Evidence includes contract/configuration fingerprints, checked files including dependency declarations, compiler options, effective configuration files, dependency-lock hashes, generated declaration hashes, tool source hashes and versions. Stable input hashes are compared between baseline and candidate. Keep the source revision with the report. Reports contain diagnostic text and local file paths; review before public sharing.

## Use runtime tests on a disposable test environment

Create contractos.runtime.json:

```json
{
  "baseUrl": "http://127.0.0.1:4318",
  "allowMutations": false,
  "output": "runtime-report",
  "timeoutMs": 30000,
  "requestTimeoutMs": 5000,
  "tests": [
    {
      "name": "Product contract",
      "path": "/products/example",
      "expectedStatus": 200,
      "assertions": [
        { "pointer": "/name", "type": "string" },
        { "pointer": "/price", "type": "number", "min": 0 },
        { "pointer": "/status", "equals": "available" }
      ]
    }
  ]
}
```

```powershell
node scripts/runtime.mjs path/to/contractos.runtime.json
```

This does not start your API. Start and seed your test environment first. Runtime suites require at least one test and one body assertion per test. Assertions use RFC6901 JSON pointers and support type, exact equals, numeric min/max and string/array length. Missing fields fail. Unknown assertions fail closed. Status checks and all assertions are evaluated; reports count completed assertions. Responses must be JSON and fit within 1 MB. Redirects are rejected. Non-GET requests require allowMutations: true; use a disposable environment because they can change data.

For authentication, use headersFromEnv, for example {"Authorization":"CONTRACTOS_API_AUTH"}; set that environment variable through your CI secret store. Never put a live credential in a checked-in suite. Reports omit header values, request/response bodies and full URLs; response hashes and suite fingerprints provide evidence without copying bodies. Do not put secrets in test names or JSON pointers. A JSON response supplied by a server is evidence about that response, not an independent ledger audit.

The selected business rule must be written as an assertion. The demo's /charges equals 1 assertion detects its intentionally broken server; it does not automatically discover all payment behavior. Runtime assertions are explicit fixtures, not full JSON Schema validation or an inferred OpenAPI test suite.

## CI

.github/workflows/contractos.yml is a ready-to-run workflow when this folder is used as the repository root. It runs regression tests, the typed example, and the disposable runtime demo in separate jobs, retaining evidence even on failures. When embedding this tool, adapt working-directory and replace example commands with your project gate and your configured runtime suite. Require BOTH contractos-types and contractos-runtime in your repository rules/branch protection. Do not add continue-on-error to gate steps. Missing evidence also fails the upload step.

The published repository at https://github.com/Sarbajit-Sengupta/contractos-assurance runs this workflow. Its main branch requires contractos-types, contractos-runtime and assurance-regression-tests, requires up-to-date checks, and disables administrator bypass. The first clean run passed all three jobs; draft pull request #1 deliberately demonstrates a rejected type break. When copying this tool into another repository, install its workflow and configure required checks there too. Anyone allowed to change a workflow or branch rules can weaken enforcement; protect those files through ordinary repository review. The bundled demo gate checks example files until you point it at your application.

## Evidence and scope

reports/assurance-tests.json records the local regression suite. It includes independent ordinary tsc comparisons for unchanged, breaking and repaired consumers; stale-result replacement; deadline and dependency failures; runtime assertion failures; rejected redirects; malformed/oversized bodies; empty suites; secret redaction; and mutation opt-in.

The supported promise is that exit 0 means all recorded checks completed and met their explicit criteria. Type and runtime results are separate. This is not a guarantee about consumers outside the selected project, untested API behavior, third-party server honesty, or all future requests. Those are concrete coverage boundaries, not reasons to weaken the gate.
