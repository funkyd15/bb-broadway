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
} from '@wix/design-system';
import { Refresh } from '@wix/wix-ui-icons-common/odeditor';
import '@wix/design-system/styles.global.css';

import {
  loadLabelSummary,
  queryContactsByFilter,
  type LabelRow,
  type LabelSummary,
  type ContactRow,
} from '../../../../public/lib/contacts';

const NOT_LABELLED_KEY = '__not_labelled__';

const DashboardPage: FC = () => {
  const [status, setStatus] = useState<string>('Ready');
  const [loadingLabels, setLoadingLabels] = useState<boolean>(false);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [summary, setSummary] = useState<LabelSummary | null>(null);
  const [labelSearch, setLabelSearch] = useState<string>('');
  const [selected, setSelected] = useState<{ key: string; name: string } | null>(null);
  const [contactRows, setContactRows] = useState<ContactRow[]>([]);

  const labelNames = useMemo(
    () => new Map((summary?.labels || []).map(l => [l.key, l.displayName])),
    [summary]
  );

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

  async function selectLabel(key: string, name: string, filter: Record<string, any>) {
    setSelected({ key, name });
    setContactRows([]);
    setLoadingContacts(true);
    try {
      setContactRows(await queryContactsByFilter(filter, labelNames, setStatus));
    } catch (error) {
      console.error('queryContactsByFilter', error);
      setStatus(`Error loading contacts: ${(error as Error)?.message || error}`);
    } finally {
      setLoadingContacts(false);
    }
  }

  const filteredLabels = (summary?.labels || []).filter(l =>
    l.displayName.toLowerCase().includes(labelSearch.toLowerCase())
  );

  const labelColumns = [
    { title: 'Label', render: (row: LabelRow) => row.displayName },
    { title: 'Type', render: (row: LabelRow) => (row.labelType === 'USER_DEFINED' ? 'Custom' : 'System') },
    { title: 'Contacts', render: (row: LabelRow) => row.count.toLocaleString('en-GB'), align: 'end' as const },
  ];

  const contactColumns = [
    { title: 'Name', render: (row: ContactRow) => row.name },
    { title: 'Email', render: (row: ContactRow) => row.email },
    { title: 'Phone', render: (row: ContactRow) => row.phone },
    { title: 'Labels', render: (row: ContactRow) => row.labels },
    { title: 'Created', render: (row: ContactRow) => row.createdDate },
    { title: 'Last activity', render: (row: ContactRow) => row.lastActivity },
  ];

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="BB Broadway Contacts"
          subtitle="See how contacts are labelled, and who is in each label"
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
              <Card>
                <Card.Header title="Labels" subtitle="Click a label to see its contacts" />
                <Table
                  data={filteredLabels}
                  columns={labelColumns}
                  onRowClick={(row: LabelRow) => selectLabel(row.key, row.displayName, row.queryFilter)}
                  isRowActive={(row: LabelRow) => row.key === selected?.key}
                >
                  <TableToolbar>
                    <TableToolbar.ItemGroup position="start">
                      <TableToolbar.Item>
                        <Search
                          size="small"
                          placeholder="Search labels"
                          value={labelSearch}
                          onChange={e => setLabelSearch(e.target.value)}
                          onClear={() => setLabelSearch('')}
                        />
                      </TableToolbar.Item>
                    </TableToolbar.ItemGroup>
                    <TableToolbar.ItemGroup position="end">
                      <TableToolbar.Item>
                        <Button
                          size="small"
                          priority="secondary"
                          disabled={!summary?.notLabelledFilter || loadingContacts}
                          onClick={() =>
                            summary?.notLabelledFilter &&
                            selectLabel(NOT_LABELLED_KEY, 'Not labelled', summary.notLabelledFilter)
                          }
                        >
                          Not labelled
                        </Button>
                      </TableToolbar.Item>
                    </TableToolbar.ItemGroup>
                  </TableToolbar>
                  <Table.Content />
                </Table>
              </Card>
            </Cell>

            <Cell span={7}>
              <Card>
                <Card.Header
                  title={selected ? `Contacts: ${selected.name}` : 'Contacts'}
                  subtitle={
                    selected
                      ? loadingContacts
                        ? 'Loading...'
                        : `${contactRows.length.toLocaleString('en-GB')} contacts`
                      : undefined
                  }
                />
                {selected ? (
                  <Table data={contactRows} columns={contactColumns}>
                    <Table.Content />
                  </Table>
                ) : (
                  <Card.Content>
                    <EmptyState
                      title="No label selected"
                      subtitle="Pick a label on the left to list its contacts."
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
