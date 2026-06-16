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
  Table,
  Divider,
} from '@wix/design-system';

import type { TableColumn } from '@wix/patterns';

import '@wix/design-system/styles.global.css';
import { queryExtendedBookings } from "../../../../public/lib/bookings";
import { queryStoresOrders } from "../../../../public/lib/stores";
import { queryEventsOrders } from "../../../../public/lib/events";
import { queryInvoices } from "../../../../public/lib/invoices";
import { YYYYMMDD, formatGBP } from "../../../../public/lib/utilities";
import MultiCheckbox from "../../../../public/lib/multiCheckbox";
import { sumAmountReceived, aggregateCollection, aggregateAnalyticsCollections } from "../../../../public/lib/data-utilities";
import DatePickerWithShortcuts from "../../../../public/lib/datePicker";
import { queryPricingPlans } from "../../../../public/lib/pricingPlans";
import { exportToCSV } from "../../../../public/lib/csv";

const w1 = "240px";

const DashboardPage: FC = () => {
  const analyticsCollections = [
    'bookingsAnalytics',
    'eventsAnalytics',
    'storesAnalytics',
    'invoicesAnalytics',
    'pricingPlanAnalytics',
  ];

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
  const startOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const endOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const getStartOfPreviousQuarter = (date = new Date()) => {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0–11

    const currentQuarter = Math.floor(month / 3);
    const previousQuarter = (currentQuarter + 3) % 4;

    const startYear = currentQuarter === 0 ? year - 1 : year;
    const startMonth = previousQuarter * 3;

    return startOfDay(new Date(startYear, startMonth, 1));
  };


  const [running, setRunning] = useState<Boolean>(false);
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date("1 April 2025")));
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date("31 March 2026")));
  const [status, setStatus] = useState<String>("Ready");
  const [subStatus, setSubStatus] = useState<String>("Ready");

  const [apps, setApps] = useState<string[]>([
    'bookings',
     'stores', 
     'events',
    'invoices',
    'pricingPlans',
  ]);

  const [sumBookings, setSumBookings] = useState<Number>(0);
  const [sumStores, setSumStores] = useState<Number>(0);
  const [sumEvents, setSumEvents] = useState<Number>(0);
  const [sumInvoices, setSumInvoices] = useState<Number>(0);
  const [sumPricingPlans, setSumPricingPlans] = useState<Number>(0);

  const [teacherRows, setTeacherRows] = useState<any[]>([]);
  const [eventRows, setEventRows] = useState<any[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<any[]>([]);
  const [pricingPlanRows, setPricingPlanRows] = useState<any[]>([]);
  const [locationRows, setLocationRows] = useState<any[]>([]);
  const [serviceRows, setServiceRows] = useState<any[]>([]);
  const [serviceTypeRows, setServiceTypeRows] = useState<any[]>([]);
  const [termRows, setTermRows] = useState<any[]>([]);
  const [termYearRows, setTermYearRows] = useState<any[]>([]);
  const [taxYearRows, setTaxYearRows] = useState<any[]>([]);
  const [taxQuarterRows, setTaxQuarterRows] = useState<any[]>([]);

  useEffect(() => {
    if (!running) {
      runSums();
    }
  }, [running, startDate, endDate]);

  async function runSums() {
    const start = YYYYMMDD(startDate);
    const end = YYYYMMDD(endDate);

    console.log("start:end", start, end);


    const [
      sumBookings,      // 0
      sumStores,        // 1
      sumEvents,        // 2
      sumInvoices,      // 3
      sumPricingPlans,      // 4

      teacherRows,      // 5
      locationRows,     // 6
      serviceRows,      // 7
      serviceTypeRows,  // 8
      termRows,         // 9
      termYearRows,     // 10
      eventRows,        // 11
      invoiceRows,      // 12
      pricingPlanRows,      // 13

      taxYearRows,      // 14
      taxQuarterRows,   // 15
    ] = await Promise.all([
      sumAmountReceived('bookingsAnalytics', start, end), // 0
      sumAmountReceived('storesAnalytics', start, end), // 1
      sumAmountReceived('eventsAnalytics', start, end), // 2
      sumAmountReceived('invoicesAnalytics', start, end), // 3
      sumAmountReceived('pricingPlanAnalytics', start, end), // 4

      aggregateCollection('bookingsAnalytics', start, end, 'teacher'), // 5
      aggregateCollection('bookingsAnalytics', start, end, 'parseLocation'), // 6
      aggregateCollection('bookingsAnalytics', start, end, 'serviceTitle'), // 7
      aggregateCollection('bookingsAnalytics', start, end, 'serviceType'), // 8
      aggregateCollection('bookingsAnalytics', start, end, 'term'), //9
      aggregateCollection('bookingsAnalytics', start, end, 'termYear'), // 10
      aggregateCollection('eventsAnalytics', start, end, 'eventTitle'), // 11
      aggregateCollection('invoicesAnalytics', start, end, 'title'), // 12
      aggregateCollection('pricingPlanAnalytics', start, end, 'planName'), // 13

      aggregateAnalyticsCollections(analyticsCollections, start, end, 'taxYear'), // 14
      aggregateAnalyticsCollections(analyticsCollections, start, end, 'taxQuarter'), // 15
    ]);

    setSumBookings(sumBookings); // 0
    setSumStores(sumStores); // 1
    setSumEvents(sumEvents); // 2
    setSumInvoices(sumInvoices); // 3
    setSumPricingPlans(sumPricingPlans); // 4

    setTeacherRows(teacherRows); // 5
    setLocationRows(locationRows); // 6
    setServiceRows(serviceRows); // 7
    setServiceTypeRows(serviceTypeRows); // 8
    setTermRows(termRows); // 9
    setTermYearRows(termYearRows); // 10
    setEventRows(eventRows); // 11
    setInvoiceRows(invoiceRows); // 12
    setPricingPlanRows(pricingPlanRows); // 13

    setTaxYearRows(taxYearRows); // 14
    setTaxQuarterRows(taxQuarterRows); // 15
  }

  function sumRows(rows: any[]) {
    const sumReceived = rows.reduce(
      (accumulator, currentItem) => accumulator + currentItem.amountReceivedSum,
      0,
    );
    return sumReceived;
  }

  async function runExportToCSV() {
    setRunning(true);
    try {
      await exportToCSV(startDate, endDate, setSubStatus);
      
    } catch (error) {
      console.error(error);
      
    }
    setRunning(false);
  }


  async function runReport() {
    setRunning(true);
    console.log(startDate, endDate);

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

    if (apps.includes("invoices")) {
      setStatus("Invoices...");
      const result = await queryInvoices(startDate, endDate, setSubStatus);
      console.log(result);
    }

    if (apps.includes("pricingPlans")) {
      setStatus("Pricing Plans...");
      const result = await queryPricingPlans(startDate, endDate, setSubStatus);
      console.log(result);
    }

    setStatus("Completed");
    setSubStatus("");
    setRunning(false);
  }

  const teacherColumns: TableColumn<any>[] = [
    {
      id: 'teacher',
      title: `Teacher (${teacherRows.length})`,
      render: (item) => item.teacher,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];


  const locationColumns: TableColumn<any>[] = [
    {
      id: 'location',
      title: `Location (${locationRows.length})`,
      render: (item) => item.parseLocation,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];

  const serviceColumns: TableColumn<any>[] = [
    {
      id: 'Service',
      title: `Service (${serviceRows.length})`,
      render: (item) => item.serviceTitle,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];

  const termColumns: TableColumn<any>[] = [
    {
      id: 'Term',
      title: `Term (${termRows.length})`,
      render: (item) => item.term,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];
  const termYearColumns: TableColumn<any>[] = [
    {
      id: 'Term Year',
      title: `Term Year (${termYearRows.length})`,
      render: (item) => item.termYear,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];
  const taxYearColumns: TableColumn<any>[] = [
    {
      id: 'Tax Year',
      title: `Tax Year (${taxYearRows.length})`,
      render: (item) => item.taxYear,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumRows(taxYearRows))})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];
  const taxQuarterColumns: TableColumn<any>[] = [
    {
      id: 'Tax Quarter',
      title: `Tax Quarter (${taxQuarterRows.length})`,
      render: (item) => item.taxQuarter,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumRows(taxQuarterRows))})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];
  const serviceTypeColumns: TableColumn<any>[] = [
    {
      id: 'Service Type',
      title: `Service Type (${serviceTypeRows.length})`,
      render: (item) => item.serviceType,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];

  const eventColumns: TableColumn<any>[] = [
    {
      id: 'eventTitle',
      title: `Event (${eventRows.length})`,
      render: (item) => item.eventTitle,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumEvents)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];
  const invoiceColumns: TableColumn<any>[] = [
    {
      id: 'title',
      title: `Invoice (${invoiceRows.length})`,
      render: (item) => item.title,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumInvoices)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];
  const pricingPlanColumns: TableColumn<any>[] = [
    {
      id: 'title',
      title: `Pricing Plans (${pricingPlanRows.length})`,
      render: (item) => item.planName,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumPricingPlans)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];



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
                      { label: 'Invoices', value: 'invoices' },
                      { label: 'Pricing Plans', value: 'pricingPlans' },
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

                  <DatePickerWithShortcuts
                    label="Start Date"
                    value={startDate}
                    onChange={setStartDate}
                    width={w1}
                    mode="start"
                    quarterEndMonths={[3, 6, 9, 12]} // VAT quarters ending Mar, Jun, Sep, Dec
                  />

                  <DatePickerWithShortcuts
                    label="End Date"
                    value={endDate}
                    onChange={setEndDate}
                    width={w1}
                    mode="end"
                    quarterEndMonths={[3, 6, 9, 12]} // VAT quarters ending Mar, Jun, Sep, Dec
                  />

                  {/* <Box direction="vertical" gap="SP1">
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
                  </Box> */}

                  {/* <Box
                    width={w1}>

                    <Button
                      onClick={runReport}
                      disabled={running}
                    >
                      {running ? 'Running...' : 'Process Data'}
                    </Button>
                  </Box> */}

                  <Box
                    width={w1}>

                    <Button
                      onClick={runExportToCSV}
                      disabled={running}
                    >
                      Export CSV
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
                  <Text>Invoices: {formatGBP(sumInvoices)}</Text>
                  <Text>Pricing Plans: {formatGBP(sumPricingPlans)}</Text>

                  <Box paddingTop="SP2" paddingBottom="SP2">
                    <Divider />
                  </Box>

                  <Text weight="bold">
                    Total: {formatGBP(sumRows(taxYearRows))}
                  </Text>
                </Box>
              </Card>
            </Cell>





            <Cell span={12}>
              <Card>
                <Table
                  data={taxYearRows}
                  columns={taxYearColumns}
                />

              </Card>
            </Cell>
            <Cell span={12}>
              <Card>
                <Table
                  data={taxQuarterRows}
                  columns={taxQuarterColumns}
                />

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Table
                  data={pricingPlanRows}
                  columns={pricingPlanColumns}
                />

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Table
                  data={teacherRows}
                  columns={teacherColumns}
                />

              </Card>
            </Cell>


            <Cell span={12}>
              <Card>
                <Table
                  data={serviceTypeRows}
                  columns={serviceTypeColumns}
                />

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Table
                  data={termRows}
                  columns={termColumns}
                />

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Table
                  data={termYearRows}
                  columns={termYearColumns}
                />

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Table
                  data={serviceRows}
                  columns={serviceColumns}
                />

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Table
                  data={locationRows}
                  columns={locationColumns}
                />

              </Card>
            </Cell>


            <Cell span={12}>
              <Card>
                <Table
                  data={eventRows}
                  columns={eventColumns}
                />

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Table
                  data={invoiceRows}
                  columns={invoiceColumns}
                />

              </Card>
            </Cell>



          </Layout>





        </Page.Content>
      </Page>


    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
