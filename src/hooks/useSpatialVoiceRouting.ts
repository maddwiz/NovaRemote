import { useCallback } from "react";

import {
  findPanelByTarget,
  normalizeForMatch,
  resolveSpatialVoiceRoute as resolveSpatialVoiceRouteCore,
  VoiceRoute,
  VoiceRoutePanel,
  VoiceRouteServerTarget,
} from "../spatialVoiceRoutingCore";

export type SpatialVoicePanel = VoiceRoutePanel;
export type SpatialVoiceRoute = VoiceRoute;
export type SpatialVoiceServerTarget = VoiceRouteServerTarget;

type ResolveSpatialVoiceRouteArgs = {
  transcript: string;
  panels: SpatialVoicePanel[];
  focusedPanelId: string | null;
  serverTargets?: SpatialVoiceServerTarget[];
};

export function resolveSpatialVoiceRoute({
  transcript,
  panels,
  focusedPanelId,
  serverTargets,
}: ResolveSpatialVoiceRouteArgs): SpatialVoiceRoute {
  return resolveSpatialVoiceRouteCore({
    transcript,
    panels,
    focusedPanelId,
    serverTargets,
  });
}

type UseSpatialVoiceRoutingArgs = {
  panels: SpatialVoicePanel[];
  focusedPanelId: string | null;
  serverTargets?: SpatialVoiceServerTarget[];
};

export function useSpatialVoiceRouting({ panels, focusedPanelId, serverTargets }: UseSpatialVoiceRoutingArgs) {
  const routeTranscript = useCallback(
    (transcript: string) =>
      resolveSpatialVoiceRoute({
        transcript,
        panels,
        focusedPanelId,
        serverTargets,
      }),
    [focusedPanelId, panels, serverTargets]
  );

  return {
    routeTranscript,
  };
}

export const spatialVoiceRoutingTestUtils = {
  findPanelByTarget,
  normalizeForMatch,
  resolveSpatialVoiceRoute,
};
