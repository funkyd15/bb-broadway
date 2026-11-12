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
      title={`${locations.length} location${locations.length === 1 ? ' has' : 's have'} no label in the CMS: ${locations
        .map(l => l.name)
        .join(', ')}`}
      actionText="Open locations in CMS"
      onAction={openLocationsCms}
    >
      <Box direction="vertical" gap="SP2">
        <Text size="small">
          Bookings at these locations won't get location labels. Fill in the "label" field for each one, then
          click Refresh.
        </Text>
        <Box direction="vertical" gap="SP1">
          {locations.map(l => (
            <Box key={l.id} gap="SP2" verticalAlign="middle">
              <Tag id={l.id} size="small" removable={false} skin="warning">
                {l.name}
              </Tag>
              {l.address && <Text size="tiny" secondary>{l.address}</Text>}
            </Box>
          ))}
        </Box>
      </Box>
    </SectionHelper>
  );
};

export default UnlabelledLocationsCard;
