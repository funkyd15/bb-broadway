import React, { type FC, useEffect, useState } from 'react';
import { Box, SectionHelper, Tag, Text } from '@wix/design-system';
import { findUnlabelledLocations, type UnlabelledLocation } from '../../../../public/lib/orderLabels';
import { openLocationsCms } from '../../../../public/lib/dashboardLinks';

type Props = {
  // Change this number to check again (e.g. when the page's Refresh is clicked).
  refreshKey: number;
};

// Yellow warning when a venue in the locations CMS has no label.
// Bookings at that venue get no Location or "Type, Location and Term" labels until it's filled in.
const UnlabelledLocationsCard: FC<Props> = ({ refreshKey }) => {
  const [locations, setLocations] = useState<UnlabelledLocation[]>([]);

  useEffect(() => {
    let current = true;
    findUnlabelledLocations()
      .then(list => current && setLocations(list))
      .catch(error => console.error('findUnlabelledLocations', error));
    return () => {
      current = false;
    };
  }, [refreshKey]);

  if (!locations.length) return null;

  return (
    <SectionHelper
      appearance="warning"
      title={`${locations.length} location${locations.length === 1 ? ' has' : 's have'} no label in the CMS`}
      actionText="Open locations in CMS"
      onAction={openLocationsCms}
    >
      <Box direction="vertical" gap="SP2">
        <Text size="small">
          Bookings at these locations won't get location labels. Fill in the "label" field for each one, then
          click Refresh.
        </Text>
        <Box gap="SP1" flexWrap="wrap">
          {locations.map(l => (
            <Tag key={l.id} id={l.id} size="small" removable={false} skin="warning">
              {l.name}
            </Tag>
          ))}
        </Box>
      </Box>
    </SectionHelper>
  );
};

export default UnlabelledLocationsCard;
