import React, { type FC, useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  type LabelMode,
} from '../../../../public/lib/labels';

type MatchMode = 'all' | 'any';
type ParsedLabelRow = LabelRow & ParsedLabel;
type CriteriaKey = keyof LabelCriteria;

const ANY = '';
const ALL_GROUPS = '__all__';

const DashboardPage: FC = () => {
  const [status, setStatus] = useState<string>('Ready');
  const [loadingLabels, setLoadingLabels] = useState<boolean>(false);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [summary, setSummary] = useState<LabelSummary | null>(null);

  const [finderTab, setFinderTab] = useState<string>('builder');
  const [labelMode, setLabelMode] = useState<LabelMode>('bookings');
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

  // All values seen in labels for the current mode (before narrowing).
  const builderValues = useMemo(() => {
    const modeLabels = parsedLabels.filter(l => l.mode === labelMode);
    const terms = new Set(modeLabels.map(l => l.term));
    return {
      type: uniqueSorted(modeLabels.map(l => l.type)),
      location: uniqueSorted(modeLabels.map(l => l.location)),
      year: uniqueSorted(modeLabels.map(l => l.year)).reverse(),
      term: TERMS.filter(t => terms.has(t)) as string[],
    };
  }, [parsedLabels, labelMode]);

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

  const resolve = useCallback(
    (c: LabelCriteria) => {
      const { names, problem, approximate } = labelNamesForCriteria(c, labelMode);
      const found: ParsedLabelRow[] = [];
      const missing: string[] = [];
      names.forEach(n => {
        const label = labelByName.get(n.toLowerCase());
        if (label) found.push(label);
        else missing.push(n);
      });
      return { names, found, missing, problem, approximate };
    },
    [labelMode, labelByName]
  );

  // A combination is possible when every label it needs exists and has contacts.
  // A term without a year is possible if it works for at least one year.
  const isPossible = useCallback(
    (c: LabelCriteria): boolean => {
      if (c.term && !c.year) return builderValues.year.some(y => isPossible({ ...c, year: y }));
      const r = resolve(c);
      return !r.problem && r.names.length > 0 && r.missing.length === 0 && r.found.every(l => l.count > 0);
    },
    [resolve, builderValues]
  );

  // Live options: only values that still lead to existing labels given the other choices.
  const optionsFor = (key: CriteriaKey, anyLabel: string) => {
    const options = builderValues[key]
      .filter(v => isPossible({ ...criteria, [key]: v }))
      .map(v => {
        const r = resolve({ ...criteria, [key]: v });
        const count = r.found.length === 1 && !r.problem ? r.found[0].count : undefined;
        return { id: v, value: count !== undefined ? `${v} (${count.toLocaleString('en-GB')})` : v };
      });
    return [{ id: ANY, value: anyLabel }, ...options];
  };

  const resolved = useMemo(() => resolve(criteria), [resolve, criteria]);

  function updateCriteria(key: CriteriaKey, value: string) {
    setCriteria({ ...criteria, [key]: value || undefined });
  }

  function changeLabelMode(mode: LabelMode) {
    setLabelMode(mode);
    setCriteria({});
  }

  // Builder drives the selection whenever it resolves to labels.
  useEffect(() => {
    if (finderTab !== 'builder') return;
    setSelectedKeys(resolved.missing.length || resolved.problem ? [] : resolved.found.map(l => l.key));
    setMatchMode('all');
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
    setSelectedKeys(keys => (keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key]));
  }

  // ---- Contacts ----

  // Find contacts automatically whenever the selection or match mode changes.
  // Debounced, and only the latest request may update the table.
  const requestRef = useRef(0);
  const selectionKey = selectedKeys.join('|');

  useEffect(() => {
    const keys = selectionKey ? selectionKey.split('|') : [];
    const requestId = ++requestRef.current;
    const isLatest = () => requestId === requestRef.current;

    if (!keys.length) {
      setContactRows(null);
      setLoadingContacts(false);
      return;
    }

    setLoadingContacts(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await queryContactsByFilter(
          labelKeysFilter(keys, matchMode),
          labelNames,
          (s: string) => isLatest() && setStatus(s)
        );
        if (isLatest()) setContactRows(rows);
      } catch (error) {
        console.error('queryContactsByFilter', error);
        if (isLatest()) setStatus(`Error loading contacts: ${(error as Error)?.message || error}`);
      } finally {
        if (isLatest()) setLoadingContacts(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [selectionKey, matchMode, labelNames]);

  // ---- Columns ----

  const browseColumns = [
    { title: 'Group', render: (row: ParsedLabelRow) => row.group, width: '35%' },
    {
      title: 'Label',
      render: (row: ParsedLabelRow) => (row.group === OTHER_GROUP ? row.displayName : row.value),
    },
    { title: 'Contacts', render: (row: ParsedLabelRow) => row.count.toLocaleString('en-GB'), align: 'end' as const },
  ];

  const contactColumns = [
    { title: 'Name', render: (row: ContactRow) => row.name, width: '25%' },
    { title: 'Email', render: (row: ContactRow) => row.email, width: '40%' },
    { title: 'Phone', render: (row: ContactRow) => row.phone },
    { title: 'Created', render: (row: ContactRow) => row.createdDate },
  ];

  // ---- Render pieces ----

  const dropdown = (key: CriteriaKey, label: string, anyLabel: string) => (
    <FormField label={label}>
      <Dropdown
        options={optionsFor(key, anyLabel)}
        selectedId={criteria[key] || ANY}
        onSelect={o => updateCriteria(key, String(o.id))}
      />
    </FormField>
  );

  const builder = (
    <Box direction="vertical" gap="SP3" padding="SP4">
      <SegmentedToggle
        size="small"
        selected={labelMode}
        onClick={(_e, value) => changeLabelMode(value as LabelMode)}
      >
        <SegmentedToggle.Button value="bookings">Bookings</SegmentedToggle.Button>
        <SegmentedToggle.Button value="freeTrials">Free trials</SegmentedToggle.Button>
      </SegmentedToggle>

      <Layout gap="18px">
        <Cell span={6}>{dropdown('type', 'Course type', 'Any course type')}</Cell>
        {builderValues.location.length > 0 && (
          <Cell span={6}>{dropdown('location', 'Location', 'Any location')}</Cell>
        )}
        <Cell span={6}>{dropdown('term', 'Term', 'Any term')}</Cell>
        <Cell span={6}>{dropdown('year', 'Year', 'Any year')}</Cell>
      </Layout>

      {resolved.problem && <SectionHelper appearance="warning">{resolved.problem}</SectionHelper>}

      {!resolved.problem && resolved.names.length === 0 && (
        <Text size="small" secondary>Pick a course type, location, term or year to find the matching label.</Text>
      )}

      {resolved.missing.length > 0 && (
        <SectionHelper appearance="danger">
          No contacts have this label yet: {resolved.missing.join(' / ')}
        </SectionHelper>
      )}

      {resolved.found.length > 0 && resolved.missing.length === 0 && !resolved.problem && (
        <Box direction="vertical" gap="SP1">
          <Text size="small" weight="bold">Matching label{resolved.found.length > 1 ? 's' : ''}</Text>
          {resolved.found.map(l => (
            <Text size="small" key={l.key}>
              {l.displayName} ({l.count.toLocaleString('en-GB')} contacts)
            </Text>
          ))}
        </Box>
      )}

      {resolved.approximate && resolved.missing.length === 0 && (
        <SectionHelper appearance="standard">
          No single label covers this combination, so this finds contacts with all of these labels. They may
          match through different bookings in the same period.
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
            <Box width="200px">
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

  const selectedCard = (
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
                <Tag key={key} id={key} size="small" removable onRemove={toggleSelected}>
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
                onClick={(_e, value) => setMatchMode(value as MatchMode)}
              >
                <SegmentedToggle.Button value="all">All of these</SegmentedToggle.Button>
                <SegmentedToggle.Button value="any">Any of these</SegmentedToggle.Button>
              </SegmentedToggle>
            </Box>
          )}

          <Box gap="SP2">
            <Button
              size="small"
              priority="secondary"
              disabled={!selectedKeys.length}
              onClick={() => {
                setSelectedKeys([]);
                setCriteria({});
              }}
            >
              Clear
            </Button>
          </Box>
        </Box>
      </Card.Content>
    </Card>
  );

  const contactsCard = (
    <Card>
      <Card.Header
        title="Contacts"
        subtitle={
          loadingContacts
            ? 'Finding contacts...'
            : contactRows
              ? `${contactRows.length.toLocaleString('en-GB')} contacts found`
              : undefined
        }
      />
      {contactRows && contactRows.length > 0 ? (
        <Table data={contactRows} columns={contactColumns}>
          <Table.Content />
        </Table>
      ) : (
        <Card.Content>
          <EmptyState
            title={loadingContacts ? 'Finding contacts...' : contactRows ? 'No contacts found' : 'No labels selected'}
            subtitle={
              loadingContacts
                ? undefined
                : contactRows
                  ? 'No contacts have this combination of labels.'
                  : 'Choose labels on the left to see their contacts.'
            }
            skin="section"
          />
        </Card.Content>
      )}
    </Card>
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

            <Cell span={5}>
              <Box direction="vertical" gap="SP4">
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
                {selectedCard}
              </Box>
            </Cell>

            <Cell span={7}>{contactsCard}</Cell>
          </Layout>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
