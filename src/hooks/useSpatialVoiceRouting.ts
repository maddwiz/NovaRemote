import { useCallback } from "react";

import {
  findPanelByTarget,
  normalizeForMatch,
  resolveSpatialVoiceRoute as resolveSpatialVoiceRouteCore,
  VoiceRoute,
  VoiceRoutePanel,
} from "../spatialVoiceRoutingCore";

export type SpatialVoicePanel = VoiceRoutePanel;
export type SpatialVoiceRoute = VoiceRoute;

type ResolveSpatialVoiceRouteArgs = {
  transcript: string;
  panels: SpatialVoicePanel[];
  focusedPanelId: string | null;
};

export function resolveSpatialVoiceRoute({
  transcript,
  panels,
  focusedPanelId,
}: ResolveSpatialVoiceRouteArgs): SpatialVoiceRoute {
  return resolveSpatialVoiceRouteCore({
    transcript,
    panels,
    focusedPanelId,
  });
}

type UseSpatialVoiceRoutingArgs = {
  panels: SpatialVoicePanel[];
  focusedPanelId: string | null;
};

export function useSpatialVoiceRouting({ panels, focusedPanelId }: UseSpatialVoiceRoutingArgs) {
  const routeTranscript = useCallback(
    (transcript: string) =>
      resolveSpatialVoiceRoute({
        transcript,
        panels,
        focusedPanelId,
      }),
    [focusedPanelId, panels]
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
