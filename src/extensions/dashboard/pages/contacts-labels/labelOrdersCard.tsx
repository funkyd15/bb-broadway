import React, { type FC, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  DatePicker,
  FormField,
  LinearProgressBar,
  SectionHelper,
  StatisticsWidget,
  Table,
  Text,
} from '@wix/design-system';
import {
  previewOrderLabels,
  applyOrderLabels,
  type OrderLabelResult,
  type ApplySummary,
} from '../../../../public/lib/orderLabels';

type Props = {
  // Called after labels are added, so the page can reload its label counts.
  onLabelled: () => void;
  // Lower-case names of every label on the site, to show which labels a run would create.
  existingLabelNames: Set<string>;
};

const statusSkin: Record<OrderLabelResult['status'], 'standard' | 'neutralLight' | 'success' | 'danger'> = {
  ready: 'standard',
  skipped: 'neutralLight',
  labelled: 'success',
  failed: 'danger',
};

const statusText: Record<OrderLabelResult['status'], string> = {
  ready: 'Ready',
  skipped: 'Skipped',
  labelled: 'Labelled',
  failed: 'Failed',
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

  const count = (s: OrderLabelResult['status']) => (results || []).filter(r => r.status === s).length;
  const ready = count('ready');

  async function preview() {
    setBusy('preview');
    setConfirming(false);
    setProgress(null);
    setApplied(null);
    setResults(null);
    try {
      setResults(await previewOrderLabels(since, setStatus));
    } catch (error) {
      console.error('previewOrderLabels', error);
      setStatus(`Error loading orders: ${(error as Error)?.message || error}`);
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!results) return;
    setBusy('apply');
    setConfirming(false);
    setProgress({ done: 0, total: ready });
    setStatus('Adding labels...');
    try {
      const result = await applyOrderLabels(results, (done, total, updated) => {
        setProgress({ done, total });
        setResults(rows => (rows || []).map(r => (r.orderId === updated.orderId ? updated : r)));
      });
      setApplied(result);
      setStatus(
        'Done.' + (result.failedOrders ? ` ${result.failedOrders} orders failed, see the list below.` : '')
      );
      onLabelled();
    } catch (error) {
      console.error('applyOrderLabels', error);
      setStatus(`Error adding labels: ${(error as Error)?.message || error}`);
    } finally {
      setBusy(null);
    }
  }

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
      render: (r: OrderLabelResult) =>
        r.message ? (
          <Text size="small" secondary>{r.message}</Text>
        ) : (
          <Text size="tiny">{r.labels.join(' · ')}</Text>
        ),
    },
    ...(applied
      ? [
          {
            title: 'New to contact',
            width: '110px',
            align: 'end' as const,
            render: (r: OrderLabelResult) => (r.added === undefined ? '' : String(r.added)),
          },
        ]
      : []),
    {
      title: 'Status',
      width: '95px',
      align: 'end' as const,
      render: (r: OrderLabelResult) => (
        <Badge size="tiny" skin={statusSkin[r.status]}>{statusText[r.status]}</Badge>
      ),
    },
  ];

  // Labels the preview would need that don't exist on the site yet.
  const wouldCreate =
    results && existingLabelNames.size
      ? [
          ...new Set(
            results
              .filter(r => r.status === 'ready')
              .flatMap(r => r.labels)
              .filter(n => !existingLabelNames.has(n.toLowerCase()))
          ),
        ].sort()
      : [];

  const summary = results
    ? `${results.length} bookings orders · ${ready} ready · ${count('skipped')} skipped` +
      (count('labelled') ? ` · ${count('labelled')} labelled` : '') +
      (count('failed') ? ` · ${count('failed')} failed` : '')
    : undefined;

  return (
    <Card>
      <Card.Header
        title="Label orders since a date"
        subtitle="Adds the course, term, location and discount labels from bookings orders to each buyer's contact"
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
              {busy === 'preview' ? 'Loading...' : 'Preview'}
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!!busy || !ready || confirming}>
              {`Add labels to ${ready} order${ready === 1 ? '' : 's'}`}
            </Button>
          </Box>

          {confirming && (
            <SectionHelper
              appearance="warning"
              title={`Add labels to the buyers of ${ready} orders?`}
              actionText="Yes, add labels"
              onAction={apply}
              showCloseButton
              onClose={() => setConfirming(false)}
            >
              Labels are only added, never removed. Contacts that already have a label keep it.
            </SectionHelper>
          )}

          {progress && (
            <LinearProgressBar
              value={progress.total ? Math.round((progress.done / progress.total) * 100) : 100}
              showProgressIndication
            />
          )}

          {applied && (
            <StatisticsWidget
              items={[
                { value: String(applied.newLabels.length), description: 'New labels created' },
                { value: applied.contactsUpdated.toLocaleString('en-GB'), description: 'Contacts given new labels' },
                { value: applied.labelsAdded.toLocaleString('en-GB'), description: 'Labels added in total' },
                { value: applied.contactsUnchanged.toLocaleString('en-GB'), description: 'Contacts already labelled' },
              ]}
            />
          )}
          {applied && applied.newLabels.length > 0 && (
            <Text size="tiny" secondary>New labels: {applied.newLabels.join(' · ')}</Text>
          )}

          <Text size="small" secondary>{status}</Text>
          {summary && <Text size="small" weight="bold">{summary}</Text>}
          {!applied && results && (
            <Text size="small">
              {wouldCreate.length
                ? `${wouldCreate.length} new label${wouldCreate.length === 1 ? '' : 's'} will be created: ${wouldCreate.join(' · ')}`
                : 'No new labels will be created. All of these labels already exist.'}
            </Text>
          )}
        </Box>
      </Card.Content>
      {results && results.length > 0 && (
        <Table data={results} columns={columns} rowVerticalPadding="tiny">
          <Table.Content />
        </Table>
      )}
    </Card>
  );
};

export default LabelOrdersCard;
