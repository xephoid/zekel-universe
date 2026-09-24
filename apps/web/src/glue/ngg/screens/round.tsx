// NGnG screens: round. See docs/design/SCREEN-ROUTING.md for the routes.

import type { ComponentType } from 'react';
import type { ScreenCtx } from '../ctx';
import type { ScreenKey } from '../route';

export const ROUND_SCREENS: Partial<Record<ScreenKey, ComponentType<{ ctx: ScreenCtx }>>> = {};
