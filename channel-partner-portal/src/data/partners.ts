import type { Partner } from './types';
import { ACE } from './ace';
import { WTRDR } from './wtrdr';

// The partner registry. Both partners run on the same PeakLogicSystems core; the
// portal renders as whichever is active. In production a partner resolves from
// its own subdomain/slug + PartnerPool auth — here they're switchable in the
// demo to show the separation on a shared platform.
export const PARTNERS: Partner[] = [ACE, WTRDR];

export const DEFAULT_PARTNER_ID = 'ace';

export const partnerById = (id: string): Partner | undefined => PARTNERS.find((p) => p.id === id);
