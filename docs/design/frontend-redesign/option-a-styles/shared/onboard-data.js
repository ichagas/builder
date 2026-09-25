/*
 * Shared scenario for the onboarding prototypes: existing applications that are
 * not built in Pronghorn but adopt its Standards and the Assurance Mesh.
 *
 * Assurance Mesh agents follow Velocity White Paper No. 07,
 * "Red, Blue, Green, and Yellow Agents".
 */
window.OB = (function () {
  "use strict";

  const MESH = [
    { id: "green", name: "Green", role: "Code quality and hygiene", kind: "Deterministic", checks: "Dependency vulnerabilities, secrets, dangerous patterns, test coverage" },
    { id: "yellow", name: "Yellow", role: "Plain language", kind: "Deterministic", checks: "12 writing rules for UI copy, docs and messages to the public" },
    { id: "red", name: "Red", role: "Attacker view", kind: "Recon + judgment", checks: "Recon of the Test environment, then proposed attack paths" },
    { id: "blue", name: "Blue", role: "Defender summary", kind: "Judgment, runs last", checks: "Threat model, 285 OWASP ASVS L2 requirements, 62 Alberta cybersecurity rules" },
  ];

  const PACKS = [
    { v: "2025.4", when: "Dec 2025", notes: "First pack with the Assurance Mesh workflow" },
    { v: "2026.1", when: "Mar 2026", notes: "Java 17 profile, Yellow rules 1–12" },
    { v: "2026.2", when: "Jun 2026", notes: "ASVS L2 mapping, .NET 8 profile, reusable mesh workflow v3" },
    { v: "2026.3", when: "Sep 2026", latest: true, notes: "Alberta rules 2026 update, testing agent v2, Python profile",
      changes: [
        ["New", "Alberta cybersecurity rules 2026 (62 rules, 4 new)", "blue"],
        ["Changed", "Testing agent v2: generates contract tests for public APIs", "agents"],
        ["Changed", "Yellow rule 7 now also checks error messages", "yellow"],
        ["New", "Python 3.12 stack profile", "profiles"],
      ] },
  ];

  const PROFILES = { dotnet: ".NET 8", node: "Node 20", java: "Java 17", python: "Python 3.12" };

  // Files generated per repository from the standard template + the repo's own context.
  function generated(repo) {
    const layer = { dotnet: "api", node: "web", java: "batch", python: "service" }[repo.profile];
    return [
      [".github/copilot-instructions.md", "new", `Mission, architecture and conventions of ${repo.name}, written from the code review`],
      [".github/agents/code-review.agent.md", "new", "Standard template, tuned to this repo's layers"],
      [".github/agents/security.agent.md", "new", "Standard template with the Alberta rules skill"],
      [".github/agents/testing.agent.md", "new", `Uses ${repo.test}`],
      [`.github/instructions/${layer}.instructions.md`, "new", `${PROFILES[repo.profile]} conventions found in the code`],
      [".github/skills/build-and-test/SKILL.md", "new", `Runs ${repo.build}`],
      [".github/workflows/assurance-mesh.yml", "new", "Calls goa-standards/assurance-mesh@v3 on merge to main"],
      ["pronghorn.standards.yml", "new", "Pins the Standards pack, stack profile and mesh policy"],
    ];
  }

  function apps() {
    return [
      {
        id: "permits", name: "Permit Tracker", owner: "Municipal Affairs · Permits team", pack: "2026.2",
        repos: [
          { name: "permits-api", profile: "dotnet", stack: ".NET 8 · ASP.NET Core", build: "dotnet build && dotnet test", test: "xUnit", ci: "Azure Pipelines", sync: "2026.2", pr: null, mesh: { green: "pass", yellow: "pass", red: "pass", blue: "warn" }, asvs: 271, baseline: 18, newFindings: 0 },
          { name: "permits-web", profile: "node", stack: "Node 20 · React", build: "npm ci && npm test", test: "Vitest", ci: "GitHub Actions", sync: "2026.3", pr: { n: 214, state: "merged" }, mesh: { green: "pass", yellow: "fail", red: "pass", blue: "pass" }, asvs: 280, baseline: 31, newFindings: 3 },
          { name: "permits-batch", profile: "java", stack: "Java 17 · Maven", build: "mvn verify", test: "JUnit 5", ci: "GitHub Actions", sync: "2026.2", pr: { n: 88, state: "open" }, mesh: { green: "warn", yellow: "pass", red: "skip", blue: "pass" }, asvs: 262, baseline: 9, newFindings: 0 },
        ],
        merges: [
          { pr: 212, repo: "permits-web", when: "2 days ago", verdict: "pass" }, { pr: 87, repo: "permits-batch", when: "2 days ago", verdict: "warn" },
          { pr: 415, repo: "permits-api", when: "yesterday", verdict: "pass" }, { pr: 214, repo: "permits-web", when: "today 09:12", verdict: "fail", note: "Yellow: 3 new findings in error messages" },
        ],
        exceptions: [{ repo: "permits-batch", rule: "Red recon", why: "Batch job has no public endpoint", until: "Mar 2027" }],
      },
      {
        id: "renewal", name: "Licence Renewal", owner: "Service Alberta · Licensing", pack: "2026.1",
        repos: [{ name: "licence-renewal", profile: "node", stack: "Node 20 · Express", build: "npm ci && npm test", test: "Jest", ci: "GitHub Actions", sync: "2026.1", pr: null, mesh: { green: "pass", yellow: "warn", red: "pass", blue: "warn" }, asvs: 248, baseline: 40, newFindings: 0 }],
        merges: [{ pr: 301, repo: "licence-renewal", when: "4 days ago", verdict: "warn" }], exceptions: [],
      },
      {
        id: "grants", name: "Grants Portal", owner: "Arts, Culture · Grants", pack: "2026.2",
        repos: [
          { name: "grants-portal", profile: "java", stack: "Java 17 · Spring Boot", build: "mvn verify", test: "JUnit 5", ci: "GitHub Actions", sync: "2026.2", pr: null, mesh: { green: "pass", yellow: "pass", red: "pass", blue: "pass" }, asvs: 283, baseline: 4, newFindings: 0 },
          { name: "grants-reports", profile: "python", stack: "Python 3.11 · FastAPI", build: "pip install -r requirements.txt && pytest", test: "pytest", ci: "GitHub Actions", sync: "2026.2", pr: null, mesh: { green: "pass", yellow: "pass", red: "pass", blue: "pass" }, asvs: 279, baseline: 6, newFindings: 0 },
        ],
        merges: [{ pr: 540, repo: "grants-portal", when: "1 week ago", verdict: "pass" }], exceptions: [],
      },
    ];
  }

  // A repository that is being onboarded right now (for the onboarding flows).
  function candidate() {
    return {
      id: "inspections", name: "Food Inspections", owner: "Health · Environmental Public Health", pack: "2026.3",
      repos: [
        { name: "inspections-api", profile: "dotnet", stack: ".NET 8 · ASP.NET Core", build: "dotnet build && dotnet test", test: "xUnit", ci: "Azure Pipelines",
          review: ["3 layers: Controllers, Services, EF Core data", "42 endpoints, 11 without tests", "Connection string found in appsettings.Development.json", "Azure Pipelines build, no security scan"],
          baseline: { green: 12, yellow: 0, red: 0, blue: 58 } },
        { name: "inspections-web", profile: "node", stack: "Node 20 · Angular 17", build: "npm ci && npm test", test: "Karma", ci: "GitHub Actions",
          review: ["27 screens, 2 shared form libraries", "Error messages use internal codes (E1043)", "No end-to-end tests", "GitHub Actions: lint and build only"],
          baseline: { green: 7, yellow: 26, red: 0, blue: 21 } },
      ],
    };
  }

  const verdictIcon = { pass: "✓", warn: "!", fail: "✕", skip: "–" };
  const verdictWord = { pass: "Pass", warn: "Warnings", fail: "New findings", skip: "Exempt" };

  const meshDots = (m) => `<span class="mesh-dots" aria-label="Assurance Mesh: ${MESH.map((a) => `${a.name} ${m ? verdictWord[m[a.id]] : "not run"}`).join(", ")}">${MESH.map((a) => `<span class="md md-${a.id} ${m ? m[a.id] : "none"}" title="${a.name}: ${m ? verdictWord[m[a.id]] : "Not run"}">${a.name[0]}</span>`).join("")}</span>`;
  const legend = () => `<div class="mesh-legend">${MESH.map((a) => `<span><span class="md md-${a.id}">${a.name[0]}</span>${a.name}: ${a.role}</span>`).join("")}</div>`;
  const latestPack = () => PACKS.find((p) => p.latest).v;

  return { MESH, PACKS, PROFILES, generated, apps, candidate, verdictIcon, verdictWord, meshDots, legend, latestPack };
})();
