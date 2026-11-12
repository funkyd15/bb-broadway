import React, { type FC, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  DatePicker,
  FormField,
  LinearProgressBar,
  SectionHelper,
  SegmentedToggle,
  StatisticsWidget,
  Table,
  Tag,
  Text,
} from '@wix/design-system';
import {
  previewOrderLabels,
  applyOrderLabels,
  previewTotals,
  type OrderLabelResult,
  type ApplySummary,
} from '../../../../public/lib/orderLabels';

type Props = {
  // Called after labels are added, so the page can reload its label counts.
  onLabelled: () => void;
  // Lower-case names of every label on the site, to show which labels a run would create.
  existingLabelNames: Set<string>;
};

type Status = OrderLabelResult['status'];

const statusSkin: Record<Status, 'standard' | 'neutralLight' | 'success' | 'danger'> = {
  ready: 'standard',
  current: 'neutralLight',
  skipped: 'neutralLight',
  labelled: 'success',
  failed: 'danger',
};

const statusText: Record<Status, string> = {
  ready: 'To add',
  current: 'Up to date',
  skipped: 'Skipped',
  labelled: 'Labelled',
  failed: 'Failed',
};

type TagKind = 'created' | 'add' | 'has';

const tagSkin: Record<TagKind, 'success' | 'standard' | 'neutral'> = {
  created: 'success',
  add: 'standard',
  has: 'neutral',
};

// Labels as bubble tags, coloured by what happens to them.
const LabelTags: FC<{ labels: string[]; kindOf: (label: string) => TagKind; size: 'tiny' | 'small' }> = ({
  labels,
  kindOf,
  size,
}) => (
  <Box gap="SP1" flexWrap="wrap" paddingTop="SP1" paddingBottom="SP1">
    {labels.map(l => (
      <Tag key={l} id={l} size={size} removable={false} skin={tagSkin[kindOf(l)]}>
        {l}
      </Tag>
    ))}
  </Box>
);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const nf = (n: number) => n.toLocaleString('en-GB');

const LabelOrdersCard: FC<Props> = ({ onLabelled, existingLabelNames }) => {
  const [since, setSince] = useState<Date>(() => {
    const d = startOfToday();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [results, setResults] = useState<OrderLabelResult[] | null>(null);
  const [status, setStatus] = useState<string>('Pick a date, then Preview to see the labels before anything changes.');
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [applied, setApplied] = useState<ApplySummary | null>(null);
  const [show, setShow] = useState<'changes' | 'all'>('changes');

  // Totals from the preview (taken before applying, so they stay as the plan).
  const [planned, setPlanned] = useState<ReturnType<typeof previewTotals> | null>(null);

  async function preview() {
    setBusy('preview');
    setConfirming(false);
    setProgress(null);
    setApplied(null);
    setResults(null);
    setPlanned(null);
    try {
      const rows = await previewOrderLabels(since, setStatus);
      setResults(rows);
      setPlanned(previewTotals(rows));
    } catch (error) {
      console.error('previewOrderLabels', error);
      setStatus(`Error loading orders: ${(error as Error)?.message || error}`);
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!results || !planned) return;
    setBusy('apply');
    setConfirming(false);
    setProgress({ done: 0, total: 0 });
    setStatus('Adding labels...');
    try {
      const result = await applyOrderLabels(results, (done, total, updated) => {
        setProgress({ done, total });
        setResults(rows => (rows || []).map(r => (r.orderId === updated.orderId ? updated : r)));
      });
      setApplied(result);
      setStatus('Done.' + (result.failedOrders ? ` ${result.failedOrders} orders failed, see the list below.` : ''));
      onLabelled();
    } catch (error) {
      console.error('applyOrderLabels', error);
      setStatus(`Error adding labels: ${(error as Error)?.message || error}`);
    } finally {
      setBusy(null);
    }
  }

  // Labels that don't exist on the site yet (before a run), or that the run created (after).
  const newLabelList = useMemo(() => {
    if (applied) return applied.newLabels;
    if (!results || !existingLabelNames.size) return [];
    return [
      ...new Set(
        results.flatMap(r => r.missing).filter(n => !existingLabelNames.has(n.toLowerCase()))
      ),
    ].sort();
  }, [applied, results, existingLabelNames]);
  const newLabelSet = useMemo(() => new Set(newLabelList), [newLabelList]);

  const shownRows = useMemo(
    () =>
      (results || []).filter(r =>
        show === 'all' ? true : r.missing.length > 0 || r.status === 'failed' || r.status === 'labelled'
      ),
    [results, show]
  );

  const toUpdate = planned?.contactsToUpdate || 0;

  const columns = [
    { title: 'Order', render: (r: OrderLabelResult) => `#${r.orderNumber}`, width: '80px' },
    { title: 'Date', render: (r: OrderLabelResult) => r.createdDate, width: '95px' },
    {
      title: 'Buyer',
      width: '220px',
      render: (r: OrderLabelResult) => (
        <Box direction="vertical">
          <Text size="small">{r.buyerName || '-'}</Text>
          <span style={{ wordBreak: 'break-all' }}>
            <Text size="tiny" secondary>{r.buyerEmail}</Text>
          </span>
        </Box>
      ),
    },
    {
      title: 'Labels',
      render: (r: OrderLabelResult) => {
        if (r.message) return <Text size="small" secondary>{r.message}</Text>;
        const missing = new Set(r.missing);
        return (
          <LabelTags
            labels={r.labels}
            size="tiny"
            kindOf={l => (newLabelSet.has(l) ? 'created' : missing.has(l) ? 'add' : 'has')}
          />
        );
      },
    },
    {
      title: 'Status',
      width: '110px',
      align: 'end' as const,
      render: (r: OrderLabelResult) => (
        <Box direction="vertical" align="right" gap="SP1">
          <Badge size="tiny" skin={statusSkin[r.status]}>{statusText[r.status]}</Badge>
          {r.missing.length > 0 && <Text size="tiny" secondary>{`+${r.missing.length} label${r.missing.length === 1 ? '' : 's'}`}</Text>}
        </Box>
      ),
    },
  ];

  return (
    <Card>
      <Card.Header
        title="Label orders since a date"
        subtitle="Checks bookings orders against each buyer's contact and adds only the labels they're missing. Labels are never removed."
      />
      <Card.Content>
        <Box direction="vertical" gap="SP3">
          <Box gap="SP3" verticalAlign="bottom">
            <FormField label="Orders created on or after">
              <DatePicker
                width="200px"
                value={since}
                dateStyle="medium"
                disabled={!!busy}
                onChange={(d: Date) => {
                  if (!d) return;
                  const day = new Date(d);
                  day.setHours(0, 0, 0, 0);
                  setSince(day);
                }}
              />
            </FormField>
            <Button priority="secondary" onClick={preview} disabled={!!busy}>
              {busy === 'preview' ? 'Checking...' : 'Preview'}
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!!busy || !toUpdate || confirming || !!applied}>
              {`Add labels to ${nf(toUpdate)} contact${toUpdate === 1 ? '' : 's'}`}
            </Button>
          </Box>

          {confirming && planned && (
            <SectionHelper
              appearance="warning"
              title={`Add ${nf(planned.labelsToAdd)} missing labels to ${nf(planned.contactsToUpdate)} contacts?`}
              actionText="Yes, add labels"
              onAction={apply}
              showCloseButton
              onClose={() => setConfirming(false)}
            >
              Only labels a contact doesn't already have are added. Nothing is removed.
            </SectionHelper>
          )}

          {progress && progress.total > 0 && (
            <LinearProgressBar
              value={Math.round((progress.done / progress.total) * 100)}
              showProgressIndication
            />
          )}

          <Text size="small" secondary>{status}</Text>

          {planned && results && !applied && (
            <StatisticsWidget
              items={[
                { value: nf(results.length), description: 'Bookings orders checked' },
                { value: nf(planned.contactsUpToDate), description: 'Contacts already up to date' },
                { value: nf(planned.contactsToUpdate), description: 'Contacts missing labels' },
                { value: nf(planned.labelsToAdd), description: 'Labels to add' },
              ]}
            />
          )}

          {applied && (
            <StatisticsWidget
              items={[
                { value: nf(applied.contactsUpdated), description: 'Contacts given missing labels' },
                { value: nf(applied.labelsAdded), description: 'Labels added' },
                { value: String(applied.newLabels.length), description: 'New labels created' },
                { value: nf(applied.failedOrders), description: 'Orders failed' },
              ]}
            />
          )}

          {results && (
            <Box direction="vertical" gap="SP2">
              <Text size="small" weight="bold">
                {newLabelList.length
                  ? `${newLabelList.length} new label${newLabelList.length === 1 ? '' : 's'} ${applied ? 'created' : 'will be created'}`
                  : applied
                    ? 'No new labels were created'
                    : 'No new labels will be created. All of these labels already exist.'}
              </Text>
              {newLabelList.length > 0 && <LabelTags labels={newLabelList} kindOf={() => 'created'} size="small" />}
              <Box gap="SP2" verticalAlign="middle">
                <Tag id="key-created" size="tiny" removable={false} skin="success">New label</Tag>
                <Tag id="key-add" size="tiny" removable={false} skin="standard">Will be added to contact</Tag>
                <Tag id="key-has" size="tiny" removable={false} skin="neutral">Contact already has it</Tag>
              </Box>
            </Box>
          )}

          {results && results.length > 0 && (
            <Box gap="SP2" verticalAlign="middle">
              <Text size="small">Show</Text>
              <SegmentedToggle
                size="small"
                selected={show}
                onClick={(_e, value) => setShow(value as 'changes' | 'all')}
              >
                <SegmentedToggle.Button value="changes">{`Orders with changes (${nf(
                  results.filter(r => r.missing.length > 0 || r.status === 'failed').length
                )})`}</SegmentedToggle.Button>
                <SegmentedToggle.Button value="all">{`All orders (${nf(results.length)})`}</SegmentedToggle.Button>
              </SegmentedToggle>
            </Box>
          )}
        </Box>
      </Card.Content>
      {shownRows.length > 0 && (
        <Table data={shownRows} columns={columns} rowVerticalPadding="tiny">
          <Table.Content />
        </Table>
      )}
    </Card>
  );
};

export default LabelOrdersCard;
