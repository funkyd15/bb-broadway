import React, { type FC, useState, useEffect, useCallback } from "react";
import {
  EmptyState,
  Page,
  PageSection,
  WixDesignSystemProvider,
  Button,
  Text,
  DatePicker,
  Card,
  Box,
  Cell,
  Layout,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { queryExtendedBookings } from "../../../../public/lib/bookings";
import { queryStoresOrders } from "../../../../public/lib/stores";
import { queryEventsOrders } from "../../../../public/lib/events";
import { YYYYMMDD, formatGBP } from "../../../../public/lib/utilities";
import MultiCheckbox from "../../../../public/lib/multiCheckbox";
import { sumAmountReceived } from "../../../../public/lib/data-utilities";

const w1 = "240px";

const DashboardPage: FC = () => {

  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  const startOfYear = new Date(
    new Date().getFullYear(),
    0,
    1
  );

  const [running, setRunning] = useState<Boolean>(false);
  const [startDate, setStartDate] = useState<Date>(startOfMonth);
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [status, setStatus] = useState<String>("Ready");
  const [subStatus, setSubStatus] = useState<String>("Ready");

  const [apps, setApps] = useState<string[]>([
    'bookings', 'stores', 'events',
  ]);

  const [sumBookings, setSumBookings] = useState<Number>(0);
  const [sumStores, setSumStores] = useState<Number>(0);
  const [sumEvents, setSumEvents] = useState<Number>(0);

  useEffect(() => {
    if (!running) {
      runSums();
    }
  }, [running, startDate, endDate]);


  async function runSums() {
    setSumBookings(await sumAmountReceived('bookingsAnalytics', YYYYMMDD(startDate), YYYYMMDD(endDate)));
    setSumStores(await sumAmountReceived('storesAnalytics', YYYYMMDD(startDate), YYYYMMDD(endDate)));
    setSumEvents(await sumAmountReceived('eventsAnalytics', YYYYMMDD(startDate), YYYYMMDD(endDate)));

  }

  async function runReport() {
    setRunning(true);
    setStatus("Running Report...");
    if (apps.includes("bookings")) {
      setStatus("Bookings...");
      const result = await queryExtendedBookings(startDate, endDate, setSubStatus);
      console.log(result);
    }

    if (apps.includes("stores")) {
      setStatus("Stores...");
      const result = await queryStoresOrders(startDate, endDate, setSubStatus);
      console.log(result);
    }

    if (apps.includes("events")) {
      setStatus("Events...");
      const result = await queryEventsOrders(startDate, endDate, setSubStatus);
      console.log(result);
    }


    setStatus("Completed");
    setRunning(false);
  }

  return (
    <WixDesignSystemProvider>
      <Page>
        <Page.Header
          title="BB Broadway Reporting"
          subtitle="Bookings, Events & Stores Reporting"
        />

        <Page.Content>
          <Page.Section title="Inputs" > </Page.Section>
          <Layout gap="SP4">
            <Cell span={12}>
              <Card>
                <Box padding="SP3">
                  <MultiCheckbox
                    items={[
                      { label: 'Bookings', value: 'bookings' },
                      { label: 'Stores', value: 'stores' },
                      { label: 'Events', value: 'events' },
                    ]}
                    selectedValues={apps}
                    onChange={setApps}
                  />
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">
                  <Box direction="vertical" gap="SP1">
                    <Text weight="bold">{status}</Text>
                    <Text secondary>{subStatus}</Text>
                  </Box>

                  <Box direction="vertical" gap="SP1">
                    <Text secondary>Start Date</Text>
                    <DatePicker
                      width={w1}
                      dateStyle="medium"
                      filterDate={(date) => date < new Date()}
                      value={startDate}
                      onChange={setStartDate}
                    />
                  </Box>

                  <Box direction="vertical" gap="SP1">
                    <Text secondary>End Date</Text>
                    <DatePicker
                      width={w1}
                      dateStyle="medium"
                      filterDate={(date) => date < new Date()}
                      value={endDate}
                      onChange={setEndDate}
                    />
                  </Box>
                  <Box
                    width={w1}>

                    <Button
                      onClick={runReport}
                      disabled={running}
                    >
                      {running ? 'Running...' : 'Process Data'}
                    </Button>
                  </Box>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP3" direction="vertical" gap="SP2">
                  <Text>Bookings: {formatGBP(sumBookings)}</Text>
                  <Text>Stores: {formatGBP(sumStores)}</Text>
                  <Text>Events: {formatGBP(sumEvents)}</Text>
                </Box>
              </Card>
            </Cell>
          </Layout>

        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
