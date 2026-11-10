import React, { type FC, useEffect, useState } from 'react';
import { dashboard } from '@wix/dashboard';
import { contacts } from '@wix/crm';
import {
  WixDesignSystemProvider,
  Text,
  Box,
  CustomModalLayout,
  Loader,
  Heading,
  Divider,
  Tag,
  SectionHelper,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import config from './contact-details.config.ts';
import { openContactInWix, type ContactDetailsParams } from '../../../../public/lib/dashboardLinks';
import { parseLabel, STRUCTURED_GROUPS, OTHER_GROUP } from '../../../../public/lib/labels';

const { height, title } = config;

const formatDate = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '');

function formatAddress(a?: contacts.Address) {
  if (!a) return '';
  const street =
    a.addressLine || [a.streetAddress?.number, a.streetAddress?.name].filter(Boolean).join(' ');
  return [street, a.addressLine2, a.city, a.postalCode, a.country].filter(Boolean).join(', ');
}

const Row: FC<{ label: string; value?: string | null }> = ({ label, value }) =>
  value ? (
    <Box gap="SP2">
      <Box width="120px" flexShrink={0}>
        <Text size="small" secondary>{label}</Text>
      </Box>
      <Text size="small">{value}</Text>
    </Box>
  ) : null;

const Modal: FC = () => {
  const [params, setParams] = useState<ContactDetailsParams | null>(null);
  const [contact, setContact] = useState<contacts.Contact | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    dashboard.observeState(state => setParams(state as unknown as ContactDetailsParams));
  }, []);

  useEffect(() => {
    if (!params?.contactId) return;
    contacts
      .getContact(params.contactId)
      .then(c => setContact(c))
      .catch(e => setError((e as Error)?.message || String(e)));
  }, [params?.contactId]);

  // Group the contact's labels, structured groups first.
  const groupedLabels = new Map<string, string[]>();
  (params?.labelNames || []).forEach(name => {
    const p = parseLabel(name);
    const value = p.group === OTHER_GROUP ? name : p.value;
    groupedLabels.set(p.group, [...(groupedLabels.get(p.group) || []), value]);
  });
  const groupOrder = [...STRUCTURED_GROUPS, OTHER_GROUP].filter(g => groupedLabels.has(g));

  const info = contact?.info;
  const name = [info?.name?.first, info?.name?.last].filter(Boolean).join(' ') || contact?.primaryInfo?.email || '';

  const content = error ? (
    <SectionHelper appearance="danger">Could not load this contact: {error}</SectionHelper>
  ) : !contact ? (
    <Box align="center" padding="SP6">
      <Loader size="small" />
    </Box>
  ) : (
    <Box direction="vertical" gap="SP4">
      <Box direction="vertical" gap="SP2">
        <Heading size="small">{name}</Heading>
        <Row label="Company" value={info?.company} />
        <Row label="Job title" value={info?.jobTitle} />
        {(info?.emails?.items || []).map((e, i) => (
          <Row key={`e${i}`} label={i === 0 ? 'Email' : ''} value={e.email} />
        ))}
        {(info?.phones?.items || []).map((p, i) => (
          <Row key={`p${i}`} label={i === 0 ? 'Phone' : ''} value={p.phone} />
        ))}
        {(info?.addresses?.items || []).map((a, i) => (
          <Row key={`a${i}`} label={i === 0 ? 'Address' : ''} value={formatAddress(a.address)} />
        ))}
        <Row label="Birthday" value={info?.birthdate ? formatDate(info.birthdate) : ''} />
        <Row label="Created" value={formatDate(contact._createdDate)} />
        <Row label="Last activity" value={formatDate(contact.lastActivity?.activityDate)} />
      </Box>

      <Divider />

      <Box direction="vertical" gap="SP3">
        <Text weight="bold">Labels ({params?.labelNames.length || 0})</Text>
        {groupOrder.map(group => (
          <Box direction="vertical" gap="SP1" key={group}>
            <Text size="small" secondary>{group}</Text>
            <Box gap="SP1" flexWrap="wrap">
              {groupedLabels.get(group)!.sort().map(v => (
                <Tag key={v} id={v} size="tiny" removable={false}>
                  {v}
                </Tag>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <CustomModalLayout
        width="100%"
        height={height}
        title={title}
        primaryButtonText="Open in Wix"
        primaryButtonProps={{ disabled: !params?.contactId }}
        primaryButtonOnClick={() => params?.contactId && openContactInWix(params.contactId)}
        secondaryButtonText="Close"
        secondaryButtonOnClick={() => dashboard.closeModal()}
        onCloseButtonClick={() => dashboard.closeModal()}
        overflowY="auto"
        content={content}
      />
    </WixDesignSystemProvider>
  );
};

export default Modal;
