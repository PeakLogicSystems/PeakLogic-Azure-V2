import { useSitePhotos as useSharedSitePhotos } from '@shared/ui/sitePhoto';

export type { SitePhoto } from '@shared/ui/sitePhoto';

// Site photos — READ ONLY on the customer side.
//
// Photos are taken by whoever is physically at the site, which is the service
// partner's technician, not the equipment owner. So this portal displays the
// set and offers no upload or delete: a control that looks like it works but
// has nobody behind it is worse than no control.
//
// The full read/write implementation — including the cross-origin broker
// protocol both portals speak (peakview360/public/photo-broker.html) — lives
// once in packages/ui/sitePhoto.ts. This wrapper just drops add/remove/error/
// busy from what it returns, so this portal can never wire up the controls it
// deliberately doesn't offer.
export function useSitePhotos(siteId: string) {
  return useSharedSitePhotos(siteId).photos;
}
