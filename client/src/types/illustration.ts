import type * as Shared from 'shared';
import type { Wire } from 'shared';

// Dates cross the wire as ISO strings; Wire<> makes that translation.
export type PublicIllustration = Wire<Shared.PublicIllustration>;

// No `?v=`: an Illustration's bytes never change (only caption, order and
// delete exist), so the URL depends on the id alone and a caption save does
// not re-download the picture.
export const illustrationImageUrl = (item: PublicIllustration): string =>
  `/api/illustrations/${item.id}/image`;
