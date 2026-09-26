'use strict';

const MODES = new Set(['issue', 'notify', 'block', 'off']);
const AGENTS = ['green', 'yellow', 'red', 'blue'];

/**
 * Evaluate the mesh policy (data-model.md `mesh_policy`, research.md D-15)
 * per check, given each agent's verdict and its count of NEW findings
 * (post-baseline-ratchet, research.md D-11).
 *
 * mode:
 *  - "issue"  (default): open an issue/work item for new findings, don't block
 *  - "notify": notify only (e.g. Slack/Teams via the caller), don't block
 *  - "block":  fail the CI job when there are new findings
 *  - "off":    take no action
 *
 * A verdict of "fail" with zero new findings (e.g. a pre-existing baseline
 * issue resurfacing) does not by itself trigger issue/notify/block — only
 * new findings do (D-11: "the policy acts on new findings only").
 *
 * @param {{green:string,yellow:string,red:string,blue:string}} verdicts
 * @param {{green:number,yellow:number,red:number,blue:number}} newFindingsByAgent
 * @param {{green?:string,yellow?:string,red?:string,blue?:string}} policy - mode per agent; defaults to "issue"
 * @returns {{
 *   perAgent: Record<string, {mode:string, newFindings:number, verdict:string, openIssue:boolean, notify:boolean, block:boolean}>,
 *   shouldBlockJob: boolean,
 *   agentsToBlock: string[],
 *   agentsToOpenIssue: string[],
 *   agentsToNotify: string[],
 * }}
 */
function evaluatePolicy(verdicts, newFindingsByAgent, policy = {}) {
  const perAgent = {};
  const agentsToBlock = [];
  const agentsToOpenIssue = [];
  const agentsToNotify = [];

  for (const agent of AGENTS) {
    const mode = policy[agent] || 'issue';
    if (!MODES.has(mode)) {
      throw new Error(`Invalid policy mode "${mode}" for agent "${agent}"; must be one of ${[...MODES].join(', ')}`);
    }
    const newFindings = newFindingsByAgent && typeof newFindingsByAgent[agent] === 'number'
      ? newFindingsByAgent[agent]
      : 0;
    const hasNewFindings = newFindings > 0;

    const openIssue = mode === 'issue' && hasNewFindings;
    const notify = (mode === 'issue' || mode === 'notify') && hasNewFindings;
    const block = mode === 'block' && hasNewFindings;

    if (openIssue) agentsToOpenIssue.push(agent);
    if (notify) agentsToNotify.push(agent);
    if (block) agentsToBlock.push(agent);

    perAgent[agent] = {
      mode,
      newFindings,
      verdict: verdicts ? verdicts[agent] : undefined,
      openIssue,
      notify,
      block,
    };
  }

  return {
    perAgent,
    shouldBlockJob: agentsToBlock.length > 0,
    agentsToBlock,
    agentsToOpenIssue,
    agentsToNotify,
  };
}

module.exports = { evaluatePolicy, MODES, AGENTS };
