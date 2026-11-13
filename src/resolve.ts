import type { JiraIssueLinkType, JiraTransition, JiraUser } from "./jira-client.js";

/**
 * Accepts "WEB-1234", "web-1234", or a bare "1234" (prefixed with the
 * configured project key). Returns null for anything else.
 */
export function normalizeIssueKey(input: string, project: string): string | null {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) return `${project}-${trimmed}`.toUpperCase();
  if (/^[a-z][a-z0-9]*-\d+$/i.test(trimmed)) return trimmed.toUpperCase();

  return null;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

/**
 * Finds the transitions that match a target, by transition name or by the
 * status it moves to ("done", "In Progress", "in-progress"). Exact matches win;
 * otherwise any transition whose name or status contains the target counts.
 * More than one result means the target is ambiguous.
 */
export function findTransitions(
  transitions: JiraTransition[],
  target: string
): JiraTransition[] {
  const wanted = normalizeName(target);
  const namesOf = (t: JiraTransition) =>
    [t.name, t.to?.name].filter((n): n is string => Boolean(n)).map(normalizeName);

  const exact = transitions.filter((t) => namesOf(t).includes(wanted));
  if (exact.length > 0) return exact;

  return transitions.filter((t) => namesOf(t).some((n) => n.includes(wanted)));
}

/**
 * Finds the users that match a query by display name or email. Exact matches
 * win; otherwise any user whose name or email contains the query counts.
 */
export function findUsers(users: JiraUser[], query: string): JiraUser[] {
  const wanted = normalizeName(query);
  const namesOf = (u: JiraUser) =>
    [u.displayName, u.emailAddress]
      .filter((n): n is string => Boolean(n))
      .map(normalizeName);

  const exact = users.filter((u) => namesOf(u).includes(wanted));
  if (exact.length > 0) return exact;

  return users.filter((u) => namesOf(u).some((n) => n.includes(wanted)));
}

export interface LinkRelation {
  type: JiraIssueLinkType;
  /**
   * "outward" when the relation reads from the first issue, like "blocks";
   * "inward" when it reads the other way, like "is blocked by".
   */
  direction: "outward" | "inward";
}

/**
 * Finds the link relations that match a phrase ("blocks", "is blocked by",
 * "relates to"), by the link type's outward or inward description or its
 * name. Exact matches win; otherwise any description containing the phrase
 * counts. A type whose inward and outward descriptions are the same (like
 * "relates to") only counts once.
 */
export function findLinkRelations(
  types: JiraIssueLinkType[],
  relation: string
): LinkRelation[] {
  const wanted = normalizeName(relation);
  const relations = types.flatMap((type) => {
    const outward = {
      relation: { type, direction: "outward" as const },
      names: [normalizeName(type.outward), normalizeName(type.name)],
    };
    const inward = {
      relation: { type, direction: "inward" as const },
      names: [normalizeName(type.inward)],
    };
    const symmetric = normalizeName(type.inward) === normalizeName(type.outward);
    return symmetric ? [outward] : [outward, inward];
  });

  const exact = relations.filter((r) => r.names.includes(wanted));
  if (exact.length > 0) return exact.map((r) => r.relation);

  return relations
    .filter((r) => r.names.some((n) => n.includes(wanted)))
    .map((r) => r.relation);
}
