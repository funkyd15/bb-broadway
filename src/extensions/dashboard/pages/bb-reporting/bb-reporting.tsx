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
  Accordion,
  accordionItemBuilder,
  Heading,
} from '@wix/design-system';

import type { TableColumn } from '@wix/patterns';

import '@wix/design-system/styles.global.css';
import { queryExtendedBookings } from "../../../../public/lib/bookings";
import { queryStoresOrders } from "../../../../public/lib/stores";
import { queryEventsOrders } from "../../../../public/lib/events";
import { queryInvoices } from "../../../../public/lib/invoices";
import { YYYYMMDD, formatGBP, parseDateRange } from "../../../../public/lib/utilities";
import MultiCheckbox from "../../../../public/lib/multiCheckbox";
import { sumAmountReceived, aggregateCollection, aggregateAnalyticsCollections, aggregateBookingsServiceLocation, getCreatedDateRange, aggregateCollectionWithMembershipValue } from "../../../../public/lib/data-utilities";
import DatePickerWithShortcuts from "../../../../public/lib/datePicker";
import { queryPricingPlans } from "../../../../public/lib/pricingPlans";
import { exportToCSV } from "../../../../public/lib/csv";

const w1 = "240px";

const CMSlink = "https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/wix-cms/folders/53822ca6-21cc-415e-acfe-ec828e1e60fe?apps-override=aad90d5f-bb9e-4dc3-b308-a33ff43ec1da";

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
  const [dateRange, setDateRange] = useState<String>("");

  const [bookingsDateRange, setBookingsDateRange] = useState<String>("Hello");
  const [storesDateRange, setStoresDateRange] = useState<String>("");
  const [eventsDateRange, setEventsDateRange] = useState<String>("");
  const [invoicesDateRange, setInvoicesDateRange] = useState<String>("");
  const [pricingPlansDateRange, setPricingPlansDateRange] = useState<String>("");

  const [apps, setApps] = useState<string[]>([
    // 'bookings',
    // 'stores',
    // 'events',
    // 'invoices',
    // 'pricingPlans',
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
  const [serviceTypeLocationRows, setServiceTypeLocationRows] = useState<any[]>([]);
  const [storesRows, setStoresRows] = useState<any[]>([]);

  useEffect(() => {
    setDateRange(parseDateRange(startDate, endDate));

    const timeout = setTimeout(() => {
      if (!running) {
        runSums();
      }

    }, 300);

    return () => clearTimeout(timeout);
  }, [startDate, endDate]);
  useEffect(() => {

    if (!running) {
      setStatus("Ready");
      setSubStatus("");
    }

  }, [running]);


  async function runSums() {
    const start = YYYYMMDD(startDate);
    const end = YYYYMMDD(endDate);

    // console.log("start:end", start, end);


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

      serviceTypeLocationRows, //16
      storesRows, //17

      bookingsDateRange,//18
      storesDateRange,//19
      eventsDateRange,//20
      invoicesDateRange,//21
      pricingPlansDateRange,//22

    ] = await Promise.all([
      sumAmountReceived('bookingsAnalytics', start, end), // 0
      sumAmountReceived('storesAnalytics', start, end), // 1
      sumAmountReceived('eventsAnalytics', start, end), // 2
      sumAmountReceived('invoicesAnalytics', start, end), // 3
      sumAmountReceived('pricingPlanAnalytics', start, end), // 4

      aggregateCollectionWithMembershipValue('bookingsAnalytics', start, end, 'teacher'), // 5
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

      aggregateBookingsServiceLocation(start, end), // 16

      aggregateCollection('storesAnalytics', start, end, 'name'), // 17

      getCreatedDateRange('bookingsAnalytics'), //18
      getCreatedDateRange('storesAnalytics'),//19
      getCreatedDateRange('eventsAnalytics'),//20
      getCreatedDateRange('invoicesAnalytics'),//21
      getCreatedDateRange('pricingPlanAnalytics'),//22

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

    setServiceTypeLocationRows(serviceTypeLocationRows); // 16
    setStoresRows(storesRows); // 17

    setBookingsDateRange(bookingsDateRange) //18
    setStoresDateRange(storesDateRange)//19
    setEventsDateRange(eventsDateRange)//20
    setInvoicesDateRange(invoicesDateRange)//21
    setPricingPlansDateRange(pricingPlansDateRange)//22

    console.log("Teacher Rows", teacherRows);


  }


  function sumRows(rows: any[], key: string) {
    const sumReceived = rows.reduce(
      (accumulator, currentItem) => accumulator + currentItem[key] || 0,
      0,
    );
    return sumReceived;
  }

  async function runExportToCSV() {
    setRunning(true);
    setStatus("Exporting...");
    try {
      await exportToCSV(startDate, endDate, setSubStatus);

    } catch (error) {
      console.error(error);

    }
    setStatus("Complete");
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

    setSubStatus("Running Aggregate");

    await runSums();

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
    {
      id: 'membershipBenefitValueSum',
      title: `Membership Value (${formatGBP(sumRows(teacherRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      width: '250px',
      infoTooltipProps: {
        content:
          'The value of bookings from membership benefits',
      }
    },
    {
      id: 'sumAmountAndValue',
      title: `Sum (${formatGBP(sumRows(teacherRows, 'amountAndMembershipValueSum'))})`,
      render: (item) => formatGBP(item.amountAndMembershipValueSum),
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
      title: `Amount Received (${formatGBP(sumRows(taxYearRows, 'amountReceivedSum'))})`,
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
      title: `Amount Received (${formatGBP(sumRows(taxQuarterRows, 'amountReceivedSum'))})`,
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
      id: 'planName',
      title: `Pricing Plans (${invoiceRows.length})`,
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
  const storesColumns: TableColumn<any>[] = [
    {
      id: 'name',
      title: `Stores (${storesRows.length})`,
      render: (item) => item.name,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received (${formatGBP(sumStores)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];

  const serviceTypeLocationColumns: TableColumn<any>[] = [
    {
      id: 'serviceType',
      title: `Service Type (${serviceTypeLocationRows.length})`,
      render: (item) => item.serviceType,
      width: '250px',
    },
    {
      id: 'parseLocation',
      title: `Location`,
      render: (item) => item.parseLocation,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Amount Received`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];

  const taxTables = [
    { title: `Tax Years`, rows: taxYearRows, columns: taxYearColumns },
    { title: `Tax Quarters`, rows: taxQuarterRows, columns: taxQuarterColumns, accordian: true },
  ]

  const bookingsTables = [
    { title: `Teachers`, rows: teacherRows, columns: teacherColumns, accordian: true },
    { title: `Locations`, rows: locationRows, columns: locationColumns, accordian: true },
    { title: `Service Type`, rows: serviceTypeRows, columns: serviceTypeColumns, accordian: true },
    { title: `Service Type & Location`, rows: serviceTypeLocationRows, columns: serviceTypeLocationColumns, accordian: true },
    { title: `Service`, rows: serviceRows, columns: serviceColumns, accordian: true },
    { title: `Term`, rows: termRows, columns: termColumns, accordian: true },
    { title: `Term & Year`, rows: termYearRows, columns: termYearColumns, accordian: true },
  ]

  const eventTables = [
    { title: `Events`, rows: eventRows, columns: eventColumns, accordian: true },
  ]

  const storesTables = [
    { title: `Stores`, rows: storesRows, columns: storesColumns, accordian: true },
  ]

  const pricingPlanTables = [
    { title: `Pricing Plans`, rows: pricingPlanRows, columns: pricingPlanColumns, accordian: true },
  ]
  const invoiceTables = [
    { title: `Invoices`, rows: invoiceRows, columns: invoiceColumns, accordian: true },
  ]


  const mapTables = (table: any, index: number) => {
    const content = table.accordian ? (
      <Accordion
        items={[
          accordionItemBuilder({
            title: table.title,
            children: (
              <Card>
                <Table
                  data={table.rows}
                  columns={table.columns}
                />
              </Card>
            ),
          }),

        ]}
      />
    ) : (
      <Card>
        <Table
          data={table.rows}
          columns={table.columns}
        />
      </Card>
    );

    return (
      <Cell span={12} key={index}>
        {content}
      </Cell>
    );
  };

  return (
    <WixDesignSystemProvider>
      <Page>
        <Page.Header
          title="BB Broadway Reporting"
          subtitle="Bookings, Events & Stores Reporting"
        />

        <Page.Content>

          <Layout gap="SP4">

            <Cell span={12}>
              <Card>
                <Accordion
                  items={[
                    accordionItemBuilder({
                      title: 'Data Processing',
                      children: (
                        <Box padding="SP4" direction="vertical" gap="SP4">
                          <Box padding="SP3">
                            <MultiCheckbox
                              items={[
                                { label: `Bookings (${bookingsDateRange})`, value: 'bookings' },
                                { label: `Stores (${storesDateRange})`, value: 'stores' },
                                { label: `Events (${eventsDateRange})`, value: 'events' },
                                { label: `Invoices (${invoicesDateRange})`, value: 'invoices' },
                                { label: `Pricing Plans (${pricingPlansDateRange})`, value: 'pricingPlans' },
                              ]}
                              selectedValues={apps}
                              onChange={setApps}
                              disabled={running}
                            />
                          </Box>

                          <Box width={w1}>
                            <Button
                              onClick={runReport}
                              disabled={running}
                            >
                              {running ? 'Running...' : 'Process Data'}
                            </Button>
                          </Box>
                        </Box>
                      ),
                    }),
                  ]}
                />
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">

                  <Box direction="vertical" gap="SP1">
                    <Text weight="bold">{status}</Text>
                    <Text secondary>{subStatus}</Text>
                  </Box>
                </Box>


              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">

                  <Box
                    direction="horizontal"
                    gap="SP3"

                    align="right"
                  >
                    <Button onClick={runExportToCSV} disabled={running}>
                      Export CSV
                    </Button>

                    <Button onClick={() => window.open(CMSlink, "_blank")}>
                      Open CMS
                    </Button>
                  </Box>
                </Box>

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">


                  <DatePickerWithShortcuts
                    label="Start Date"
                    value={startDate}
                    onChange={setStartDate}
                    width={w1}
                    mode="start"
                    quarterEndMonths={[3, 6, 9, 12]} // VAT quarters ending Mar, Jun, Sep, Dec
                    disabled={running}
                  />

                  <DatePickerWithShortcuts
                    label="End Date"
                    value={endDate}
                    onChange={setEndDate}
                    width={w1}
                    mode="end"
                    quarterEndMonths={[3, 6, 9, 12]} // VAT quarters ending Mar, Jun, Sep, Dec
                    disabled={running}
                  />



                </Box>
              </Card>
            </Cell>



            <Cell span={12}>
              <Card>
                <Box padding="SP3" direction="vertical" gap="SP2">
                  <Heading size="medium" >{dateRange}</Heading>

                  <Box paddingTop="SP1" paddingBottom="SP1">
                    <Divider />
                  </Box>

                  <Text>Bookings: {formatGBP(sumBookings)}</Text>
                  <Text>Events: {formatGBP(sumEvents)}</Text>
                  <Text>Invoices: {formatGBP(sumInvoices)}</Text>
                  <Text>Stores: {formatGBP(sumStores)}</Text>
                  <Text>Pricing Plans: {formatGBP(sumPricingPlans)}</Text>

                  <Box paddingTop="SP2" paddingBottom="SP2">
                    <Divider />
                  </Box>

                  <Text weight="bold">
                    Total: {formatGBP(sumRows(taxYearRows, 'amountReceivedSum'))}
                  </Text>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">
                  <>
                    {taxTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP3" direction="vertical" gap="SP2">

                  <Heading size="medium" >Bookings</Heading>
                  <Box padding="SP4" direction="vertical" gap="SP4">
                    <>
                      {bookingsTables.map(mapTables)}
                    </>
                  </Box>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">
                  <>
                    {eventTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">
                  <>
                    {invoiceTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">
                  <>
                    {storesTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP4" direction="vertical" gap="SP4">
                  <>
                    {pricingPlanTables.map(mapTables)}
                  </>
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
