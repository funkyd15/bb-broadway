import React, { type FC, useState, useEffect, useMemo, useCallback } from 'react';
import {
  Page,
  WixDesignSystemProvider,
  Button,
  Text,
  Card,
  Box,
  Cell,
  Layout,
  Table,
  TableToolbar,
  Search,
  StatisticsWidget,
  EmptyState,
  Tabs,
  Dropdown,
  FormField,
  Tag,
  SegmentedToggle,
  SectionHelper,
} from '@wix/design-system';
import { Refresh } from '@wix/wix-ui-icons-common/odeditor';
import '@wix/design-system/styles.global.css';

import {
  loadLabelSummary,
  queryContactsByFilter,
  labelKeysFilter,
  type LabelRow,
  type LabelSummary,
  type ContactRow,
} from '../../../../public/lib/contacts';
import {
  parseLabel,
  labelNamesForCriteria,
  uniqueSorted,
  TERMS,
  STRUCTURED_GROUPS,
  OTHER_GROUP,
  type ParsedLabel,
  type LabelCriteria,
} from '../../../../public/lib/labels';

type MatchMode = 'all' | 'any';
type ParsedLabelRow = LabelRow & ParsedLabel;

const ANY = '';
const ALL_GROUPS = '__all__';

const anyOption = (label: string) => ({ id: ANY, value: label });
const toOptions = (values: string[]) => values.map(v => ({ id: v, value: v }));

const DashboardPage: FC = () => {
  const [status, setStatus] = useState<string>('Ready');
  const [loadingLabels, setLoadingLabels] = useState<boolean>(false);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [summary, setSummary] = useState<LabelSummary | null>(null);

  const [finderTab, setFinderTab] = useState<string>('builder');
  const [criteria, setCriteria] = useState<LabelCriteria>({});
  const [browseGroup, setBrowseGroup] = useState<string>(ALL_GROUPS);
  const [browseSearch, setBrowseSearch] = useState<string>('');

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>('all');
  const [contactRows, setContactRows] = useState<ContactRow[] | null>(null);

  // ---- Labels ----

  const parsedLabels: ParsedLabelRow[] = useMemo(
    () => (summary?.labels || []).map(l => ({ ...l, ...parseLabel(l.displayName) })),
    [summary]
  );

  const labelByKey = useMemo(() => new Map(parsedLabels.map(l => [l.key, l])), [parsedLabels]);
  const labelByName = useMemo(
    () => new Map(parsedLabels.map(l => [l.displayName.toLowerCase(), l])),
    [parsedLabels]
  );
  const labelNames = useMemo(() => new Map(parsedLabels.map(l => [l.key, l.displayName])), [parsedLabels]);

  const builderOptions = useMemo(() => {
    const terms = new Set(parsedLabels.map(l => l.term));
    return {
      types: uniqueSorted(parsedLabels.map(l => l.type)),
      locations: uniqueSorted(parsedLabels.map(l => l.location)),
      years: uniqueSorted(parsedLabels.map(l => l.year)).reverse(),
      terms: TERMS.filter(t => terms.has(t)),
    };
  }, [parsedLabels]);

  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    parsedLabels.forEach(l => counts.set(l.group, (counts.get(l.group) || 0) + 1));
    const groups = [...STRUCTURED_GROUPS, OTHER_GROUP].filter(g => counts.has(g));
    return [
      { id: ALL_GROUPS, value: `All groups (${parsedLabels.length})` },
      ...groups.map(g => ({ id: g, value: `${g} (${counts.get(g)})` })),
    ];
  }, [parsedLabels]);

  const refreshLabels = useCallback(async () => {
    setLoadingLabels(true);
    try {
      setSummary(await loadLabelSummary(setStatus));
    } catch (error) {
      console.error('loadLabelSummary', error);
      setStatus(`Error loading labels: ${(error as Error)?.message || error}`);
    } finally {
      setLoadingLabels(false);
    }
  }, []);

  useEffect(() => {
    refreshLabels();
  }, [refreshLabels]);

  // ---- Builder: criteria -> labels ----

  const resolved = useMemo(() => {
    const { names, problem } = labelNamesForCriteria(criteria);
    const found: ParsedLabelRow[] = [];
    const missing: string[] = [];
    names.forEach(n => {
      const label = labelByName.get(n.toLowerCase());
      if (label) found.push(label);
      else missing.push(n);
    });
    return { names, found, missing, problem };
  }, [criteria, labelByName]);

  function updateCriteria(key: keyof LabelCriteria, value: string) {
    const next = { ...criteria, [key]: value || undefined };
    setCriteria(next);
  }

  // Builder drives the selection whenever it resolves to labels.
  useEffect(() => {
    if (finderTab !== 'builder') return;
    setSelectedKeys(resolved.missing.length ? [] : resolved.found.map(l => l.key));
    setMatchMode('all');
    setContactRows(null);
  }, [resolved, finderTab]);

  // ---- Browse ----

  const browseRows = useMemo(() => {
    const search = browseSearch.trim().toLowerCase();
    return parsedLabels.filter(
      l =>
        (browseGroup === ALL_GROUPS || l.group === browseGroup) &&
        (!search || l.displayName.toLowerCase().includes(search))
    );
  }, [parsedLabels, browseGroup, browseSearch]);

  function toggleSelected(key: string) {
    setContactRows(null);
    setSelectedKeys(keys => (keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key]));
  }

  // ---- Contacts ----

  async function findContacts() {
    if (!selectedKeys.length) return;
    setLoadingContacts(true);
    setContactRows(null);
    try {
      const rows = await queryContactsByFilter(labelKeysFilter(selectedKeys, matchMode), labelNames, setStatus);
      setContactRows(rows);
    } catch (error) {
      console.error('queryContactsByFilter', error);
      setStatus(`Error loading contacts: ${(error as Error)?.message || error}`);
    } finally {
      setLoadingContacts(false);
    }
  }

  // ---- Columns ----

  const browseColumns = [
    { title: 'Group', render: (row: ParsedLabelRow) => row.group, width: '30%' },
    {
      title: 'Label',
      render: (row: ParsedLabelRow) => (row.group === OTHER_GROUP ? row.displayName : row.value),
    },
    { title: 'Contacts', render: (row: ParsedLabelRow) => row.count.toLocaleString('en-GB'), align: 'end' as const },
  ];

  const contactColumns = [
    { title: 'Name', render: (row: ContactRow) => row.name },
    { title: 'Email', render: (row: ContactRow) => row.email },
    { title: 'Phone', render: (row: ContactRow) => row.phone },
    { title: 'Created', render: (row: ContactRow) => row.createdDate },
    { title: 'Last activity', render: (row: ContactRow) => row.lastActivity },
  ];

  // ---- Render pieces ----

  const builder = (
    <Box direction="vertical" gap="SP3" padding="SP4">
      <Layout gap="18px">
        <Cell span={6}>
          <FormField label="Course type">
            <Dropdown
              options={[anyOption('Any course type'), ...toOptions(builderOptions.types)]}
              selectedId={criteria.type || ANY}
              onSelect={o => updateCriteria('type', String(o.id))}
            />
          </FormField>
        </Cell>
        <Cell span={6}>
          <FormField label="Location">
            <Dropdown
              options={[anyOption('Any location'), ...toOptions(builderOptions.locations)]}
              selectedId={criteria.location || ANY}
              onSelect={o => updateCriteria('location', String(o.id))}
            />
          </FormField>
        </Cell>
        <Cell span={6}>
          <FormField label="Term">
            <Dropdown
              options={[anyOption('Any term'), ...toOptions(builderOptions.terms)]}
              selectedId={criteria.term || ANY}
              onSelect={o => updateCriteria('term', String(o.id))}
            />
          </FormField>
        </Cell>
        <Cell span={6}>
          <FormField label="Year">
            <Dropdown
              options={[anyOption('Any year'), ...toOptions(builderOptions.years)]}
              selectedId={criteria.year || ANY}
              onSelect={o => updateCriteria('year', String(o.id))}
            />
          </FormField>
        </Cell>
      </Layout>

      {resolved.problem && <SectionHelper appearance="warning">{resolved.problem}</SectionHelper>}

      {!resolved.problem && resolved.names.length === 0 && (
        <Text size="small" secondary>Pick a course type, location or year to find the matching label.</Text>
      )}

      {resolved.missing.length > 0 && (
        <SectionHelper appearance="danger">
          No contacts have this label yet: {resolved.missing.join(' / ')}
        </SectionHelper>
      )}

      {resolved.found.length > 0 && resolved.missing.length === 0 && (
        <Box direction="vertical" gap="SP1">
          <Text size="small" weight="bold">Matching label{resolved.found.length > 1 ? 's' : ''}</Text>
          {resolved.found.map(l => (
            <Text size="small" key={l.key}>
              {l.displayName} ({l.count.toLocaleString('en-GB')} contacts)
            </Text>
          ))}
        </Box>
      )}

      {criteria.type && criteria.location && (
        <SectionHelper appearance="standard">
          There is no single label for a course type at a location. This finds contacts with both labels, so
          they may have booked the course type at a different location in the same period.
        </SectionHelper>
      )}

      <Box>
        <Button size="small" priority="secondary" onClick={() => setCriteria({})}>
          Reset
        </Button>
      </Box>
    </Box>
  );

  const browse = (
    <Table
      data={browseRows}
      columns={browseColumns}
      onRowClick={(row: ParsedLabelRow) => toggleSelected(row.key)}
      isRowActive={(row: ParsedLabelRow) => selectedKeys.includes(row.key)}
    >
      <TableToolbar>
        <TableToolbar.ItemGroup position="start">
          <TableToolbar.Item>
            <Box width="220px">
              <Dropdown
                size="small"
                options={groupOptions}
                selectedId={browseGroup}
                onSelect={o => setBrowseGroup(String(o.id))}
              />
            </Box>
          </TableToolbar.Item>
          <TableToolbar.Item>
            <Search
              size="small"
              placeholder="Search labels"
              value={browseSearch}
              onChange={e => setBrowseSearch(e.target.value)}
              onClear={() => setBrowseSearch('')}
            />
          </TableToolbar.Item>
        </TableToolbar.ItemGroup>
      </TableToolbar>
      <Table.Content />
    </Table>
  );

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="BB Broadway Contacts"
          subtitle="Find the right label, then list the contacts who have it"
          actionsBar={
            <Button prefixIcon={<Refresh />} onClick={refreshLabels} disabled={loadingLabels}>
              Refresh
            </Button>
          }
        />
        <Page.Content>
          <Layout>
            <Cell span={12}>
              <Card>
                <StatisticsWidget
                  isLoading={loadingLabels && !summary}
                  items={[
                    { value: (summary?.totalContacts || 0).toLocaleString('en-GB'), description: 'Total contacts' },
                    { value: String(summary?.labels.length || 0), description: 'Labels' },
                    { value: (summary?.notLabelled || 0).toLocaleString('en-GB'), description: 'Not labelled' },
                  ]}
                />
              </Card>
            </Cell>

            <Cell span={12}>
              <Text size="small" secondary>{status}</Text>
            </Cell>

            <Cell span={6}>
              <Card>
                <Card.Header title="Find a label" />
                <Box paddingLeft="SP4" paddingRight="SP4">
                  <Tabs
                    activeId={finderTab}
                    onClick={item => setFinderTab(String(item.id))}
                    items={[
                      { id: 'builder', title: 'By course' },
                      { id: 'browse', title: 'Browse all labels' },
                    ]}
                  />
                </Box>
                {finderTab === 'builder' ? builder : browse}
              </Card>
            </Cell>

            <Cell span={6}>
              <Box direction="vertical" gap="SP4">
                <Card>
                  <Card.Header
                    title="Selected labels"
                    subtitle={finderTab === 'browse' ? 'Click labels in the list to add or remove them' : undefined}
                  />
                  <Card.Content>
                    <Box direction="vertical" gap="SP3">
                      {selectedKeys.length === 0 ? (
                        <Text size="small" secondary>No labels selected yet.</Text>
                      ) : (
                        <Box gap="SP1" flexWrap="wrap">
                          {selectedKeys.map(key => (
                            <Tag
                              key={key}
                              id={key}
                              size="small"
                              removable
                              onRemove={toggleSelected}
                            >
                              {labelByKey.get(key)?.displayName || key}
                            </Tag>
                          ))}
                        </Box>
                      )}

                      {selectedKeys.length > 1 && (
                        <Box gap="SP2" verticalAlign="middle">
                          <Text size="small">Contacts with</Text>
                          <SegmentedToggle
                            size="small"
                            selected={matchMode}
                            onClick={(_e, value) => {
                              setMatchMode(value as MatchMode);
                              setContactRows(null);
                            }}
                          >
                            <SegmentedToggle.Button value="all">All of these</SegmentedToggle.Button>
                            <SegmentedToggle.Button value="any">Any of these</SegmentedToggle.Button>
                          </SegmentedToggle>
                        </Box>
                      )}

                      <Box gap="SP2">
                        <Button
                          size="small"
                          onClick={findContacts}
                          disabled={!selectedKeys.length || loadingContacts}
                        >
                          {loadingContacts ? 'Finding contacts...' : 'Find contacts'}
                        </Button>
                        <Button
                          size="small"
                          priority="secondary"
                          disabled={!selectedKeys.length}
                          onClick={() => {
                            setSelectedKeys([]);
                            setContactRows(null);
                          }}
                        >
                          Clear
                        </Button>
                      </Box>
                    </Box>
                  </Card.Content>
                </Card>
              </Box>
            </Cell>

            <Cell span={12}>
                <Card>
                  <Card.Header
                    title="Contacts"
                    subtitle={
                      contactRows ? `${contactRows.length.toLocaleString('en-GB')} contacts found` : undefined
                    }
                  />
                  {contactRows && contactRows.length > 0 ? (
                    <Table data={contactRows} columns={contactColumns}>
                      <Table.Content />
                    </Table>
                  ) : (
                    <Card.Content>
                      <EmptyState
                        title={contactRows ? 'No contacts found' : 'No search yet'}
                        subtitle={
                          contactRows
                            ? 'No contacts have this combination of labels.'
                            : 'Choose labels, then click Find contacts.'
                        }
                        skin="section"
                      />
                    </Card.Content>
                  )}
                </Card>
            </Cell>
          </Layout>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
