import type * as Shared from 'shared';
import type { Wire } from 'shared';

// Dates cross the wire as ISO strings; Wire<> makes that translation.
export type PublicIllustration = Wire<Shared.PublicIllustration>;

// `?v=` is the same cache-bust scheme the server uses for `coverUrl`: the image
// route is immutable, so a replaced row must change the URL.
export const illustrationImageUrl = (item: PublicIllustration): string =>
  `/api/illustrations/${item.id}/image?v=${Date.parse(item.updatedAt)}`;
