// @vitest-environment jsdom
//
// Unit spec for `footprintOf` over the radial circle node types (requirement
// 2026-06-30-1104; plan Interaction wiring [H3] / Acceptance #8). `footprintOf`
// is what `boundsOf` reads to frame the circle on a mode flip; it must return the
// SQUARE BADGE_SIZE/DOT_SIZE/CENTER_SIZE for the new node types instead of the
// grid's 260×108 card footprint, or the camera frame would be mis-padded.
//
// RED until footprintOf is taught the new sizes (today it returns NODE_W×NODE_H
// for any non-day/standings node), so the badge/dot/center assertions fail on the
// WRONG (card-sized) footprint — not an import error.
import { describe, expect, it } from 'vitest';
import { teamRef } from '@/domain/types';
import { footprintOf } from './useFocusCamera';
import { BADGE_SIZE, DOT_SIZE, CENTER_SIZE } from '../layout/radial-constants';
import { NODE_W, NODE_H } from '../layout/layout-constants';
import type { FinalCenterFlowNode, MatchDotFlowNode, TeamBadgeFlowNode } from '../graph-model';

const ARG = teamRef({ id: 't-arg', name: 'Argentina', code: 'ARG', flagUrl: null });
const FRA = teamRef({ id: 't-fra', name: 'France', code: 'FRA', flagUrl: null });

const badge: TeamBadgeFlowNode = {
  id: 'badge-wc2026-r32-1-home',
  type: 'team-badge',
  position: { x: 0, y: 0 },
  data: {
    matchId: 'wc2026-r32-1',
    teamId: 't-arg',
    team: ARG,
    code: 'ARG',
    flagUrl: null,
    side: 'home',
    eliminated: false,
  },
};

const dot: MatchDotFlowNode = {
  id: 'wc2026-r16-1',
  type: 'match-dot',
  position: { x: 0, y: 0 },
  data: {
    matchId: 'wc2026-r16-1',
    stage: 'ROUND_OF_16',
    roundLabel: 'Round of 16',
    status: 'finished',
    home: ARG,
    away: FRA,
  },
};

const center: FinalCenterFlowNode = {
  id: 'wc2026-f-1',
  type: 'final-center',
  position: { x: 0, y: 0 },
  data: { matchId: 'wc2026-f-1', status: 'live', home: ARG, away: FRA },
};

describe('footprintOf — radial node sizes [H3 / Acceptance #8]', () => {
  it('returns the square BADGE_SIZE for a team-badge node', () => {
    expect(footprintOf(badge)).toEqual({ w: BADGE_SIZE, h: BADGE_SIZE });
    // Guard: NOT the grid card footprint (the bug this change fixes).
    expect(footprintOf(badge)).not.toEqual({ w: NODE_W, h: NODE_H });
  });

  it('returns the square DOT_SIZE for a match-dot node', () => {
    expect(footprintOf(dot)).toEqual({ w: DOT_SIZE, h: DOT_SIZE });
    expect(footprintOf(dot)).not.toEqual({ w: NODE_W, h: NODE_H });
  });

  it('returns the square CENTER_SIZE for a final-center node', () => {
    expect(footprintOf(center)).toEqual({ w: CENTER_SIZE, h: CENTER_SIZE });
    expect(footprintOf(center)).not.toEqual({ w: NODE_W, h: NODE_H });
  });
});
