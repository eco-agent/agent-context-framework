import type {
  Authority,
  Evidence,
  Holon,
  LoopContext,
  LoopResult,
} from "../contracts.js";
import {
  assertConfidence,
  assertPositiveSafeInteger,
  toJson,
} from "../contracts.js";
import {
  completed,
  escalated,
  exhausted,
  record,
} from "../loop-support.js";

export interface RouteAttempt {
  readonly holonId: string;
  readonly evidence: readonly Evidence[];
  readonly uncertainty: string;
}

export interface Route {
  readonly holonId: string;
  readonly capability: string;
  readonly authority: Authority;
  readonly reason: string;
  readonly scope: readonly string[];
  readonly acceptanceThreshold: number;
}

export interface RoutedResult<T> {
  readonly artifact: T;
  readonly confidence: number;
  readonly evidence: readonly Evidence[];
  readonly uncertainty: string;
}

export interface MembraneRouter<Request> {
  classify(
    request: Request,
    attempts: readonly RouteAttempt[],
  ): Promise<Route | { readonly kind: "escalate"; readonly issue: string }>;
}

export interface RouteRegistry<Request, T> {
  resolve(route: Route): {
    readonly holon: Holon;
    infer(request: Request, route: Route): Promise<RoutedResult<T>>;
  };
}

export async function runMembraneRouting<Request, T>(
  request: Request,
  router: MembraneRouter<Request>,
  registry: RouteRegistry<Request, T>,
  maxRoutes: number,
  context: LoopContext,
): Promise<LoopResult<T>> {
  assertPositiveSafeInteger(maxRoutes, "Membrane routing maxRoutes");
  const loop = "membrane-routing";
  const attempts: RouteAttempt[] = [];
  const evidence: Evidence[] = [];
  await record(context, "loop.started", loop, { maxRoutes });

  for (let routeNumber = 1; routeNumber <= maxRoutes; routeNumber += 1) {
    const route = await router.classify(request, attempts);
    if ("kind" in route) {
      await record(context, "loop.escalated", loop, { issue: route.issue }, evidence);
      return escalated(route.issue, evidence);
    }

    assertConfidence(route.acceptanceThreshold);
    const target = registry.resolve(route);
    const heldScope = new Set(target.holon.scope);
    const excessScope = route.scope.filter((scope) => !heldScope.has(scope));
    if (
      target.holon.identity !== route.holonId ||
      !target.holon.capabilities.includes(route.capability) ||
      !target.holon.authority.includes(route.authority) ||
      excessScope.length > 0
    ) {
      const issue = `Route ${routeNumber} exceeds ${target.holon.identity} identity, scope, capability, or authority`;
      await record(context, "loop.escalated", loop, { issue }, evidence);
      return escalated(issue, evidence);
    }

    const result = await target.infer(request, route);
    assertConfidence(result.confidence);
    evidence.push(...result.evidence);

    await record(
      context,
      "loop.transition",
      loop,
      {
        routeNumber,
        target: target.holon.identity,
        confidence: result.confidence,
        threshold: route.acceptanceThreshold,
      },
      result.evidence,
      target.holon.identity,
    );

    if (result.confidence >= route.acceptanceThreshold) {
      await record(context, "loop.completed", loop, { routeNumber }, evidence);
      return completed(result.artifact, evidence);
    }

    attempts.push({
      holonId: target.holon.identity,
      evidence: result.evidence,
      uncertainty: result.uncertainty,
    });
  }

  const issue = "Membrane route budget exhausted";
  await record(
    context,
    "loop.budget_exhausted",
    loop,
    { issue, attempts: toJson(attempts) },
    evidence,
  );
  return exhausted(issue, evidence);
}
