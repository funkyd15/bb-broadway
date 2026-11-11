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
  Search,
  StatisticsWidget,
  EmptyState,
  Tabs,
  Dropdown,
  FormField,
  Tag,
  SegmentedToggle,
  SectionHelper,
  TextButton,
  Badge,
} from '@wix/design-system';
import { Refresh } from '@wix/wix-ui-icons-common/odeditor';
import { ExternalLinkSmall, DuplicateSmall, ConfirmSmall } from '@wix/wix-ui-icons-common';
import { openContactInWix, openContactDetails, openWixContacts } from '../../../../public/lib/dashboardLinks';
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
  const [browseSort, setBrowseSort] = useState<'count' | 'az'>('count');

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>('all');
  const [contactRows, setContactRows] = useState<ContactRow[] | null>(null);

  // Contact search runs over ALL contacts (not just the filtered ones).
  const [contactSearch, setContactSearch] = useState<string>('');
  const [allContacts, setAllContacts] = useState<ContactRow[] | null>(null);
  const [loadingAll, setLoadingAll] = useState<boolean>(false);
  const allRequestRef = useRef(0);

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

  function refreshAll() {
    allRequestRef.current++;
    setAllContacts(null);
    setLoadingAll(false);
    refreshLabels();
  }

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

  // Every label in this mode that mentions all the chosen values (for reference only, not selected).
  const relatedLabels = useMemo(() => {
    const keys = (Object.keys(criteria) as CriteriaKey[]).filter(k => criteria[k]);
    if (!keys.length) return [];
    const groupRank = (g: string) => {
      const i = STRUCTURED_GROUPS.indexOf(g);
      return i === -1 ? STRUCTURED_GROUPS.length : i;
    };
    return parsedLabels
      .filter(l => l.mode === labelMode && keys.every(k => l[k] === criteria[k]))
      .sort(
        (a, b) =>
          groupRank(a.group) - groupRank(b.group) ||
          (b.year || '').localeCompare(a.year || '') ||
          a.displayName.localeCompare(b.displayName)
      );
  }, [parsedLabels, labelMode, criteria]);

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
    const rows = parsedLabels.filter(
      l =>
        (browseGroup === ALL_GROUPS || l.group === browseGroup) &&
        (!search || l.displayName.toLowerCase().includes(search))
    );
    // A-Z uses the text shown in the list (the value, or the full name for Other labels).
    const shown = (l: ParsedLabelRow) => (l.group === OTHER_GROUP ? l.displayName : l.value);
    return browseSort === 'az'
      ? [...rows].sort(
          (a, b) =>
            shown(a).localeCompare(shown(b), 'en-GB', { sensitivity: 'base', numeric: true }) ||
            a.group.localeCompare(b.group)
        )
      : [...rows].sort((a, b) => b.count - a.count);
  }, [parsedLabels, browseGroup, browseSearch, browseSort]);

  function resetFinder() {
    if (finderTab === 'builder') setCriteria({});
    else {
      setBrowseGroup(ALL_GROUPS);
      setBrowseSearch('');
    }
  }

  // Copy one label's name, ready to paste into the Wix Contacts label filter.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  async function copyLabel(key: string) {
    const text = labelByKey.get(key)?.displayName || key;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for when the clipboard API is blocked inside the dashboard iframe.
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 2000);
  }

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

  // ---- Contact search ----

  const searchText = contactSearch.trim().toLowerCase();
  const searching = searchText.length > 0;

  // Load every contact once in the background after the labels, so searching is instant.
  useEffect(() => {
    if (allContacts || loadingAll || !labelNames.size || loadingLabels) return;
    const requestId = ++allRequestRef.current;
    const isLatest = () => requestId === allRequestRef.current;
    setLoadingAll(true);
    queryContactsByFilter({}, labelNames, () => {})
      .then(rows => isLatest() && setAllContacts(rows))
      .catch(error => {
        console.error('load all contacts', error);
        if (isLatest()) setStatus(`Error loading contacts: ${(error as Error)?.message || error}`);
      })
      .finally(() => isLatest() && setLoadingAll(false));
  }, [allContacts, loadingAll, labelNames, loadingLabels]);

  // Does this contact match the selected labels (using the current All / Any setting)?
  const inFilter = useCallback(
    (row: ContactRow) =>
      selectedKeys.length > 0 &&
      (matchMode === 'all'
        ? selectedKeys.every(k => row.labelKeys.includes(k))
        : selectedKeys.some(k => row.labelKeys.includes(k))),
    [selectedKeys, matchMode]
  );

  const searchRows = useMemo(() => {
    if (!searching || !allContacts) return null;
    const digits = searchText.replace(/\D/g, '');
    const rows = allContacts.filter(
      r =>
        r.name.toLowerCase().includes(searchText) ||
        r.email.toLowerCase().includes(searchText) ||
        r.company.toLowerCase().includes(searchText) ||
        (digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits))
    );
    // Contacts inside the label filter first.
    return [...rows.filter(inFilter), ...rows.filter(r => !inFilter(r))];
  }, [searching, searchText, allContacts, inFilter]);

  const shownRows = searching ? searchRows : contactRows;
  const shownLoading = searching ? !searchRows : loadingContacts;
  const searchInFilterCount = searchRows ? searchRows.filter(inFilter).length : 0;

  // ---- Columns ----

  const browseColumns = [
    {
      title: 'Label',
      render: (row: ParsedLabelRow) => (
        <Box direction="vertical">
          <Text size="small">{row.group === OTHER_GROUP ? row.displayName : row.value}</Text>
          <Text size="tiny" secondary>{row.group}</Text>
        </Box>
      ),
    },
    { title: 'Contacts', render: (row: ParsedLabelRow) => row.count.toLocaleString('en-GB'), align: 'end' as const, width: '90px' },
  ];

  const contactColumns = [
    { title: 'Name', render: (row: ContactRow) => row.name },
    {
      title: 'Email / phone',
      render: (row: ContactRow) => (
        <Box direction="vertical">
          <span style={{ wordBreak: 'break-all' }}>
            <Text size="small">{row.email}</Text>
          </span>
          {row.phone && <Text size="tiny" secondary>{row.phone}</Text>}
        </Box>
      ),
    },
    { title: 'Created', render: (row: ContactRow) => row.createdDate, width: '95px' },
    ...(searching && selectedKeys.length
      ? [
          {
            title: 'Labels',
            width: '95px',
            render: (row: ContactRow) =>
              inFilter(row) ? (
                <Badge size="tiny" skin="success">In filter</Badge>
              ) : (
                <Badge size="tiny" skin="neutralLight">Outside</Badge>
              ),
          },
        ]
      : []),
    {
      title: '',
      align: 'end' as const,
      width: '120px',
      render: (row: ContactRow) => (
        <span onClick={e => e.stopPropagation()}>
          <TextButton size="small" suffixIcon={<ExternalLinkSmall />} onClick={() => openContactInWix(row._id)}>
            Open in Wix
          </TextButton>
        </span>
      ),
    },
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

      <Box direction="vertical" gap="SP2">
        {dropdown('type', 'Course type', 'Any course type')}
        {builderValues.location.length > 0 && dropdown('location', 'Location', 'Any location')}
        {dropdown('term', 'Term', 'Any term')}
        {dropdown('year', 'Year', 'Any year')}
      </Box>

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
    </Box>
  );

  const browse = (
    <Table
      data={browseRows}
      columns={browseColumns}
      onRowClick={(row: ParsedLabelRow) => toggleSelected(row.key)}
      isRowActive={(row: ParsedLabelRow) => selectedKeys.includes(row.key)}
    >
      <Box direction="vertical" gap="SP2" padding="SP3 SP4">
        <Dropdown
          size="small"
          options={groupOptions}
          selectedId={browseGroup}
          onSelect={o => setBrowseGroup(String(o.id))}
        />
        <Search
          size="small"
          placeholder="Search labels"
          value={browseSearch}
          onChange={e => setBrowseSearch(e.target.value)}
          onClear={() => setBrowseSearch('')}
        />
        <Box gap="SP2" verticalAlign="middle">
          <Box flexShrink={0}>
            <Text size="small" secondary>Sort by</Text>
          </Box>
          <Box gap="SP1">
            <Button
              size="tiny"
              priority={browseSort === 'count' ? 'primary' : 'secondary'}
              onClick={() => setBrowseSort('count')}
            >
              Most contacts
            </Button>
            <Button
              size="tiny"
              priority={browseSort === 'az' ? 'primary' : 'secondary'}
              onClick={() => setBrowseSort('az')}
            >
              A-Z
            </Button>
          </Box>
        </Box>
      </Box>
      <Table.Content />
    </Table>
  );

  // Every label related to the chosen values, in its own card below Selected labels.
  const relatedCard =
    finderTab === 'builder' && relatedLabels.length > 0 ? (
      <Card>
        <Card.Header
          title={`All related labels (${relatedLabels.length})`}
          subtitle="Click a label to add it to (or remove it from) the selected labels"
        />
        <Card.Content>
          <Box direction="vertical" gap="SP1" maxHeight="420px" overflowY="auto">
            {relatedLabels.map(l => {
              const selected = selectedKeys.includes(l.key);
              return (
                <div
                  key={l.key}
                  role="button"
                  title={selected ? 'Remove from selected labels' : 'Add to selected labels'}
                  onClick={() => toggleSelected(l.key)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 6,
                    padding: '2px 6px',
                    background: selected ? 'var(--wds-color-fill-primary-hover, #e7f0ff)' : undefined,
                  }}
                >
                  <Box gap="SP2" verticalAlign="middle">
                    <Box direction="vertical" flexGrow={1}>
                      <Text size="small" weight={selected ? 'bold' : undefined}>{l.value}</Text>
                      <Text size="tiny" secondary>{l.group}</Text>
                    </Box>
                    <Text size="small" secondary>{l.count.toLocaleString('en-GB')}</Text>
                  </Box>
                </div>
              );
            })}
          </Box>
        </Card.Content>
      </Card>
    ) : null;

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
            <Box direction="vertical" gap="SP1">
              {selectedKeys.map(key => (
                <Box key={key} gap="SP1" verticalAlign="middle">
                  <Tag id={key} size="small" removable onRemove={toggleSelected}>
                    {labelByKey.get(key)?.displayName || key}
                  </Tag>
                  <TextButton
                    size="tiny"
                    prefixIcon={copiedKey === key ? <ConfirmSmall /> : <DuplicateSmall />}
                    onClick={() => copyLabel(key)}
                  >
                    {copiedKey === key ? 'Copied' : 'Copy'}
                  </TextButton>
                </Box>
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

  const subtitle = searching
    ? !searchRows
      ? 'Loading all contacts to search...'
      : `${searchRows.length.toLocaleString('en-GB')} matching "${contactSearch.trim()}"` +
        (selectedKeys.length ? ` (${searchInFilterCount.toLocaleString('en-GB')} in filter)` : '')
    : loadingContacts
      ? 'Finding contacts...'
      : contactRows
        ? `${contactRows.length.toLocaleString('en-GB')} contacts found`
        : undefined;

  const emptyTitle = shownLoading
    ? searching
      ? 'Loading all contacts...'
      : 'Finding contacts...'
    : searching
      ? 'No contacts match your search'
      : contactRows
        ? 'No contacts found'
        : 'No labels selected';

  const emptySubtitle = shownLoading
    ? undefined
    : searching
      ? 'Search looks at every contact, by name, email, phone or company.'
      : contactRows
        ? 'No contacts have this combination of labels.'
        : 'Choose labels on the left, or search for a contact.';

  const contactsCard = (
    <Card>
      <Card.Header
        title="Contacts"
        subtitle={subtitle}
        suffix={
          <Box width="280px">
            <Search
              size="small"
              placeholder="Search all contacts"
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              onClear={() => setContactSearch('')}
            />
          </Box>
        }
      />
      {shownRows && shownRows.length > 0 ? (
        <Table
          data={shownRows}
          columns={contactColumns}
          onRowClick={(row: ContactRow) => openContactDetails({ contactId: row._id, labelNames: row.labelList })}
        >
          <Table.Content />
        </Table>
      ) : (
        <Card.Content>
          <EmptyState title={emptyTitle} subtitle={emptySubtitle} skin="section" />
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
            <Box gap="SP2">
              <Button priority="secondary" suffixIcon={<ExternalLinkSmall />} onClick={openWixContacts}>
                Wix Contacts
              </Button>
              <Button prefixIcon={<Refresh />} onClick={refreshAll} disabled={loadingLabels}>
                Refresh
              </Button>
            </Box>
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

            <Cell span={4}>
              <Box direction="vertical" gap="SP4">
                <Card>
                  <Card.Header
                    title="Find a label"
                    suffix={
                      <Button size="small" priority="secondary" onClick={resetFinder}>
                        Reset
                      </Button>
                    }
                  />
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
                {relatedCard}
              </Box>
            </Cell>

            <Cell span={8}>{contactsCard}</Cell>
          </Layout>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
