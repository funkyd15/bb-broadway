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
  Dropdown,
  TableToolbar,
  ToggleButton,
  MultiSelectCheckbox,
  FormField,
  Modal,

} from '@wix/design-system';

import {
  Filter,
  SortAZ,
  SortZA,
  Dismiss,
  UploadExport,
  DataCollection,
  Refresh,
  DateSmall,
} from "@wix/wix-ui-icons-common/odeditor";

import type { TableColumn } from '@wix/patterns';

import '@wix/design-system/styles.global.css';
import { queryExtendedBookings } from "../../../../public/lib/bookings";
import { queryStoresOrders } from "../../../../public/lib/stores";
import { queryEventsOrders } from "../../../../public/lib/events";
import { queryInvoices } from "../../../../public/lib/invoices";
import { YYYYMMDD, formatGBP, parseDateRange } from "../../../../public/lib/utilities";
import MultiCheckbox from "../../../../public/lib/multiCheckbox";
import {
  sumAmountReceived,
  aggregateCollection,
  aggregateAnalyticsCollections,
  aggregateBookingsServiceLocation,
  aggregateBookingsServiceTermYearLocation,
  getCreatedDateRange,
  aggregateCollectionWithMembershipValue,
  bulkRemoveAnalytics,
  bulkLockOrUnlockAnalytics,
  sumAmountExpensed,
  aggregateCollectionWithMembershipValueAndExpenses
} from "../../../../public/lib/data-utilities";
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
    'expensesAnalytics',
  ];

  const tooltips = {
    sum: {
      content:
        'Received - Expensed',
    },
    membershipBenefitValue: {
      content:
        'The value of bookings from membership benefits',
    }
  }

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

  const previousFinancialYearStartDate = (date: Date): Date => {
    const year = date.getFullYear();

    const currentBoundary = new Date(year, 3, 1);

    return date > currentBoundary
      ? currentBoundary
      : new Date(year - 1, 3, 1);

  };

  function addToFilter(value: string, key: string) {

    let valuesArray = filters[key] || [];
    valuesArray.push(value);
    valuesArray = [...new Set(valuesArray)];
    valuesArray.sort();

    setFilters({ ...filters, [key]: valuesArray });
  }

  function removeFromFilter(value: string, key: string) {

    let valuesArray = filters[key] || [];
    if (valuesArray.includes(value)) {
      valuesArray = valuesArray.filter(i => i !== value);
      valuesArray.sort();
    }


    setFilters({ ...filters, [key]: valuesArray });
  }

  function processRows(rows: any[]) {
    rows.forEach(r => {
      r.amountReceivedSum = r.amountReceivedSum || 0;
      r.membershipBenefitValueSum = r.membershipBenefitValueSum || 0;
      r.amountExpensedSum = r.amountExpensedSum || 0;
      r.sum = r.amountReceivedSum + r.amountExpensedSum; //+r.membershipBenefitValueSum ;
    });
    return rows
  }


  const [running, setRunning] = useState<Boolean>(false);
  const [startDate, setStartDate] = useState<Date>(previousFinancialYearStartDate(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfDay(new Date()));
  const [status, setStatus] = useState<String>("Ready");
  const [subStatus, setSubStatus] = useState<String>("Ready");
  const [dateRange, setDateRange] = useState<String>("");

  const [bookingsDateRange, setBookingsDateRange] = useState<String>("");
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
  const [sumExpenses, setSumExpenses] = useState<Number>(0);
  const [sumRevenue, setSumRevenue] = useState<Number>(0);

  const [summaryRows, setSummaryRows] = useState<any[]>([]);
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
  const [serviceTermYearLocationRows, setServiceTermYearLocationRows] = useState<any[]>([]);
  const [serviceTermYearLocationFilteredRows, setServiceTermYearLocationFilteredRows] = useState<any[]>([]);
  const [storesRows, setStoresRows] = useState<any[]>([]);
  const [filters, setFilters] = useState<{}>({});
  const [sorting, setSorting] = useState<{
    key: string;
    direction: 'A-Z' | 'Z-A';
  }>({
    key: "amountReceivedSum",
    direction: 'Z-A',
  });

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
    console.log("startDate:endDate", start, end);


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

      serviceTermYearLocationRows,//23

      sumExpenses,//24


    ] = await Promise.all([
      sumAmountReceived('bookingsAnalytics', start, end), // 0
      sumAmountReceived('storesAnalytics', start, end), // 1
      sumAmountReceived('eventsAnalytics', start, end), // 2
      sumAmountReceived('invoicesAnalytics', start, end), // 3
      sumAmountReceived('pricingPlanAnalytics', start, end), // 4

      aggregateCollectionWithMembershipValueAndExpenses('bookingsAnalytics', start, end, 'teacher'), // 5
      aggregateCollectionWithMembershipValueAndExpenses('bookingsAnalytics', start, end, 'parseLocation'), // 6
      aggregateCollectionWithMembershipValueAndExpenses('bookingsAnalytics', start, end, 'serviceTitle'), // 7
      aggregateCollectionWithMembershipValueAndExpenses('bookingsAnalytics', start, end, 'serviceType'), // 8
      aggregateCollectionWithMembershipValueAndExpenses('bookingsAnalytics', start, end, 'term'), //9
      aggregateCollectionWithMembershipValueAndExpenses('bookingsAnalytics', start, end, 'termYear'), // 10

      aggregateCollectionWithMembershipValueAndExpenses('eventsAnalytics', start, end, 'eventTitle'), // 11
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

      aggregateBookingsServiceTermYearLocation(start, end), // 23

      sumAmountExpensed('expensesAnalytics', start, end), // 24


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

    setTaxYearRows(processRows(taxYearRows)); // 14
    setTaxQuarterRows(processRows(taxQuarterRows)); // 15

    setServiceTypeLocationRows(serviceTypeLocationRows); // 16
    setStoresRows(storesRows); // 17

    setBookingsDateRange(bookingsDateRange) //18
    setStoresDateRange(storesDateRange)//19
    setEventsDateRange(eventsDateRange)//20
    setInvoicesDateRange(invoicesDateRange)//21
    setPricingPlansDateRange(pricingPlansDateRange)//22

    setServiceTermYearLocationRows(processRows(serviceTermYearLocationRows))//23


    setSumExpenses(sumExpenses)//24

    const summary = [
      { title: "Bookings", value: sumBookings },
      { title: "Events", value: sumEvents },
      { title: "Invoices", value: sumInvoices },
      { title: "Pricing Plans", value: sumPricingPlans },
      { title: "Stores", value: sumStores },
      { title: "Expenses", value: sumExpenses },
    ];

    setSummaryRows(summary);

    setSumRevenue(sumRows(taxYearRows, 'amountReceivedSum'))

    // console.log("locationRows", locationRows);


  }


  function sumRows(rows: any[], key: string) {
    return rows.reduce(
      (accumulator, currentItem) => accumulator + (currentItem[key] ?? 0),
      0,
    );
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

    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    console.log("runReport startDate:endDate", start, end);

    setStatus("Running Report...");
    if (apps.includes("bookings")) {
      setStatus("Bookings...");
      const result = await queryExtendedBookings(start, end, setSubStatus);
      // console.log(result);
    }

    if (apps.includes("stores")) {
      setStatus("Stores...");
      const result = await queryStoresOrders(start, end, setSubStatus);
      // console.log(result);
    }

    if (apps.includes("events")) {
      setStatus("Events...");
      const result = await queryEventsOrders(start, end, setSubStatus);
      // console.log(result);
    }

    if (apps.includes("invoices")) {
      setStatus("Invoices...");
      const result = await queryInvoices(start, end, setSubStatus);
      // console.log(result);
    }

    if (apps.includes("pricingPlans")) {
      setStatus("Pricing Plans...");
      const result = await queryPricingPlans(start, end, setSubStatus);
      // console.log(result);
    }

    setSubStatus("Running Aggregate");

    await runSums();

    setStatus("Completed");
    setSubStatus("");

    setRunning(false);
  }

  async function removeAnalytics() {
    setRunning(true);

    const start = YYYYMMDD(startOfDay(startDate));
    const end = YYYYMMDD(endOfDay(endDate));
    console.log("removeAnalytics startDate:endDate", start, end);

    setStatus("Removing Analytics...");
    if (apps.includes("bookings")) {
      setStatus("Bookings...");
      const result = await bulkRemoveAnalytics('bookingsAnalytics', start, end, setSubStatus);
    }

    if (apps.includes("stores")) {
      setStatus("Stores...");
      const result = await bulkRemoveAnalytics('storesAnalytics', start, end, setSubStatus);
    }

    if (apps.includes("events")) {
      setStatus("Events...");
      const result = await bulkRemoveAnalytics('eventsAnalytics', start, end, setSubStatus);
    }

    if (apps.includes("invoices")) {
      setStatus("Invoices...");
      const result = await bulkRemoveAnalytics('invoicesAnalytics', start, end, setSubStatus);
    }

    if (apps.includes("pricingPlans")) {
      setStatus("Pricing Plans...");
      const result = await bulkRemoveAnalytics('pricingPlanAnalytics', start, end, setSubStatus);
    }

    setSubStatus("Running Aggregate");

    await runSums();

    setStatus("Completed");
    setSubStatus("");

    setRunning(false);
  }

  async function lockOrUnlockAnalytics(lock: Boolean) {
    setRunning(true);

    const start = YYYYMMDD(startOfDay(startDate));
    const end = YYYYMMDD(endOfDay(endDate));
    console.log("lockOrUnlockAnalytics startDate:endDate", start, end);

    setStatus("Removing Analytics...");
    if (apps.includes("bookings")) {
      setStatus("Bookings...");
      const result = await bulkLockOrUnlockAnalytics('bookingsAnalytics', start, end, lock, setSubStatus);
    }

    if (apps.includes("stores")) {
      setStatus("Stores...");
      const result = await bulkLockOrUnlockAnalytics('storesAnalytics', start, end, lock, setSubStatus);
    }

    if (apps.includes("events")) {
      setStatus("Events...");
      const result = await bulkLockOrUnlockAnalytics('eventsAnalytics', start, end, lock, setSubStatus);
    }

    if (apps.includes("invoices")) {
      setStatus("Invoices...");
      const result = await bulkLockOrUnlockAnalytics('invoicesAnalytics', start, end, lock, setSubStatus);
    }

    if (apps.includes("pricingPlans")) {
      setStatus("Pricing Plans...");
      const result = await bulkLockOrUnlockAnalytics('pricingPlanAnalytics', start, end, lock, setSubStatus);
    }

    setSubStatus("Running Aggregate");

    await runSums();

    setStatus("Completed");
    setSubStatus("");

    setRunning(false);
  }

  const summaryColumns: TableColumn<any>[] = [
    {
      id: 'title',
      title: `Title`,
      render: (item) => item.title,
      width: "250px"
    },
    {
      id: 'value',
      title: `Amount (${formatGBP(sumRows(summaryRows, 'value'))})`,
      render: (item) => formatGBP(item.value),
    },

  ];
  const teacherColumns: TableColumn<any>[] = [
    {
      id: 'teacher',
      title: `Teacher (${teacherRows.length})`,
      render: (item) => item.teacher,
      // width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      // width: '250px',
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumRows(teacherRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
      // width: '250px',
    },
    {
      id: 'sum',
      title: `Sum (${formatGBP(sumRows(teacherRows, 'sum'))})`,
      render: (item) => formatGBP(item.sum),
      infoTooltipProps: tooltips.sum,
    },
    {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(teacherRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      infoTooltipProps: tooltips.membershipBenefitValue,
    },
  ];


  const locationColumns: TableColumn<any>[] = [
    {
      id: 'location',
      title: `Location (${locationRows.length})`,
      render: (item) => item.parseLocation,
    },
    {
      id: 'amountReceivedSum',
      title: `Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
    },
    {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(locationRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      infoTooltipProps: tooltips.membershipBenefitValue,
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
      title: `Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
    {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(serviceRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      width: '250px',
      infoTooltipProps: {
        content:
          'The value of bookings from membership benefits',
      }
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
      title: `Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    }, {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(termRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      width: '250px',
      infoTooltipProps: {
        content:
          'The value of bookings from membership benefits',
      }
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
      title: `Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    }, {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(termYearRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      width: '250px',
      infoTooltipProps: {
        content:
          'The value of bookings from membership benefits',
      }
    },

  ];
  const taxYearColumns: TableColumn<any>[] = [
    {
      id: 'Tax Year',
      title: `Tax Year (${taxYearRows.length})`,
      render: (item) => item.taxYear,
    },
    {
      id: 'amountReceivedSum',
      title: `Received (${formatGBP(sumRows(taxYearRows, 'amountReceivedSum'))})`,
      render: (item) => formatGBP(item.amountReceivedSum),
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumRows(taxYearRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
    },
    {
      id: 'sum',
      title: `Sum (${formatGBP(sumRows(taxYearRows, 'sum'))})`,
      render: (item) => formatGBP(item.sum),
      infoTooltipProps: tooltips.sum,
    },
    {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(taxYearRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      infoTooltipProps: tooltips.membershipBenefitValue,
    },

  ];
  const taxQuarterColumns: TableColumn<any>[] = [
    {
      id: 'Tax Quarter',
      title: `Tax Quarter (${taxQuarterRows.length})`,
      render: (item) => item.taxQuarter,
    },
    {
      id: 'amountReceivedSum',
      title: `Received (${formatGBP(sumRows(taxQuarterRows, 'amountReceivedSum'))})`,
      render: (item) => formatGBP(item.amountReceivedSum),
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumRows(taxQuarterRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
    },
    {
      id: 'sum',
      title: `Sum (${formatGBP(sumRows(taxQuarterRows, 'sum'))})`,
      render: (item) => formatGBP(item.sum),
      infoTooltipProps: tooltips.sum,
    },
    {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(taxQuarterRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      infoTooltipProps: tooltips.membershipBenefitValue,
    },

  ];
  const serviceTypeColumns: TableColumn<any>[] = [
    {
      id: 'Service Type',
      title: `Service Type (${serviceTypeRows.length})`,
      render: (item) => item.serviceType,
    },
    {
      id: 'amountReceivedSum',
      title: `Received (${formatGBP(sumBookings)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
    },
    {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(serviceTypeRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      infoTooltipProps: tooltips.membershipBenefitValue,
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumRows(serviceTypeRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
    },
  ];


  const eventColumns: TableColumn<any>[] = [
    {
      id: 'eventTitle',
      title: `Event (${eventRows.length})`,
      render: (item) => item.eventTitle,
      width: "500px"
    },
    {
      id: 'amountReceivedSum',
      title: `Received (${formatGBP(sumEvents)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumRows(eventRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
    },
    {
      id: 'sum',
      title: `Sum (${formatGBP(sumRows(eventRows, 'sum'))})`,
      render: (item) => formatGBP(item.sum),
      infoTooltipProps: tooltips.sum,
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
      title: `Received (${formatGBP(sumInvoices)})`,
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
      title: `Received (${formatGBP(sumPricingPlans)})`,
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
      title: `Received (${formatGBP(sumStores)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
  ];

  const serviceTypeLocationColumns: TableColumn<any>[] = [
    {
      id: 'serviceType',
      title: `Service Type (${serviceTypeLocationRows.length})`,
      render: (item) => item.serviceType,
    },
    {
      id: 'parseLocation',
      title: `Location`,
      render: (item) => item.parseLocation,
      width: "275px"
    },
    {
      id: 'amountReceivedSum',
      title: `Received`,
      render: (item) => formatGBP(item.amountReceivedSum),
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumRows(serviceTypeLocationRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
    },
    {
      id: 'sum',
      title: `Sum (${formatGBP(sumRows(serviceTypeLocationRows, 'sum'))})`,
      render: (item) => formatGBP(item.sum),
      infoTooltipProps: tooltips.sum,
    },
    {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(serviceTypeLocationRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
      infoTooltipProps: tooltips.membershipBenefitValue,
    },
  ];

  const serviceTermYearLocationColumns: TableColumn<any>[] = [
    {
      id: 'serviceType',
      title: `Service (${serviceTermYearLocationFilteredRows.length})`,
      render: (item) => item.serviceType,
      width: '100px',
    },
    {
      id: 'year',
      title: `Year`,
      render: (item) => item.year,
      width: '75px',
    },
    {
      id: 'term',
      title: `Term`,
      render: (item) => item.term,
      width: '75px',
    },
    {
      id: 'parseLocation',
      title: `Location`,
      render: (item) => item.parseLocation,
      width: '275px',
    },
    {
      id: 'amountReceivedSum',
      title: `R (${formatGBP(sumRows(serviceTermYearLocationFilteredRows, 'amountReceivedSum'))})`,
      render: (item) => formatGBP(item.amountReceivedSum),

    },
    {
      id: 'amountExpensedSum',
      title: `E (${formatGBP(sumRows(serviceTermYearLocationFilteredRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
    },
    {
      id: 'sum',
      title: `S (${formatGBP(sumRows(serviceTermYearLocationFilteredRows, 'sum'))})`,
      render: (item) => formatGBP(item.sum),
    },
    {
      id: 'membershipBenefitValueSum',
      title: `MV (${formatGBP(sumRows(serviceTermYearLocationFilteredRows, 'membershipBenefitValueSum'))})`,
      render: (item) => formatGBP(item.membershipBenefitValueSum),
    },
  ];


  function getDropdownOptionsFromRows(rows: any[], key: string, allValue?: string) {
    const values = [...new Set(rows.map(i => i[key]))].sort();
    // const options = values.map((i: any, index: number) => ({ id: (index + 1).toString(), value: i }));
    const options = values.map((i: any, index: number) => ({ id: i, value: i }));
    if (allValue) {
      options.unshift({ id: "0", value: allValue });
    }

    return options;

  }


  useEffect(() => {
    filterAndSortServiceTermYearLocationRow();
  }, [serviceTermYearLocationRows]);


  useEffect(() => {
    filterAndSortServiceTermYearLocationRow();
  }, [filters, sorting]);

  function filterAndSortServiceTermYearLocationRow() {
    let filteredRows = structuredClone(serviceTermYearLocationRows);

    for (const [key, value] of Object.entries(filters)) {
      //if not any
      // if (value.id !== "0") {
      //   filteredRows = filteredRows.filter(i => i[key] && i[key] === value.value);
      // }
      if (value && value.length > 0) {
        filteredRows = filteredRows.filter(i => i[key] && value.includes(i[key]));
      }
    }

    filteredRows.sort(function (a, b) {
      const sortKey = sorting.key;
      if (a[sortKey] < b[sortKey]) { return sorting.direction === "A-Z" ? -1 : 1; }
      if (a[sortKey] > b[sortKey]) { return sorting.direction === "A-Z" ? 1 : -1; }
      return 0;
    })

    setServiceTermYearLocationFilteredRows(filteredRows);
  }

  const makeMultiCheckbox = (key: string, placeholder: string) => {
    return (<MultiSelectCheckbox
      size="medium"
      placeholder={placeholder}
      selectedOptions={filters[key] || []}
      onSelect={(value) => addToFilter(value, key)}
      onDeselect={(value) => removeFromFilter(value, key)}
      options={getDropdownOptionsFromRows(serviceTermYearLocationRows, key)}
      clearButton
      onClear={() => setFilters({ ...filters, [key]: [] })}
      popoverProps={{ appendTo: 'window' }}

    />);
  }



  const tableFilters =
    <TableToolbar>
      <TableToolbar.ItemGroup position="start">
        <TableToolbar.Item>
          <Filter />
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("serviceType", "Service Type")}
       
        </TableToolbar.Item>
        <TableToolbar.Item>
          {makeMultiCheckbox("year", "Year")}
         
        </TableToolbar.Item>
        <TableToolbar.Item>
          {makeMultiCheckbox("term", "Term")}
         
        </TableToolbar.Item>
        <TableToolbar.Item>
          {makeMultiCheckbox("parseLocation", "Locations")}
         

        </TableToolbar.Item>

      </TableToolbar.ItemGroup>

      <TableToolbar.ItemGroup position="start">
        <TableToolbar.Item>
          {sorting.direction === "A-Z" ? <SortAZ /> : <SortZA />}
        </TableToolbar.Item>
        <TableToolbar.Item>
          <Dropdown
            options={[
              { id: 'amountReceivedSum', value: 'Received' },
              { id: 'amountExpensedSum', value: 'Expensed' },
              { id: 'sum', value: 'Sum' },
              { id: 'parseLocation', value: 'Location' },
              { id: 'serviceType', value: 'Service' },
              { id: 'year', value: 'Year' },
              { id: 'term', value: 'Term' },
            ]}
            selectedId={sorting?.key}
            border="round"
            size="small"
            popoverProps={{ appendTo: 'window' }}
            onSelect={(key) => setSorting({ ...sorting, ...{ key: key.id } })}
            valueParser={({ value }) => value}
          />
        </TableToolbar.Item>
        <TableToolbar.Item>
          <Dropdown
            options={[
              { id: 'Z-A', value: 'Z-A' },
              { id: 'A-Z', value: 'A-Z' },
            ]}
            selectedId={sorting?.direction}
            border="round"
            size="small"
            popoverProps={{ appendTo: 'window' }}
            onSelect={(direction) => setSorting({ ...sorting, ...{ direction: direction.value } })}
            valueParser={({ value }) => value}
          />
        </TableToolbar.Item>
      </TableToolbar.ItemGroup>

    </TableToolbar>


  const taxTables = [
    { title: `Tax Years`, rows: taxYearRows, columns: taxYearColumns, accordion: true },
    { title: `Tax Quarters`, rows: taxQuarterRows, columns: taxQuarterColumns, accordion: true },
  ]

  const bookingsTables = [
    { title: `Service Type, Term, Year & Location`, rows: serviceTermYearLocationFilteredRows, columns: serviceTermYearLocationColumns, accordion: true, toolbar: tableFilters },
    { title: `Teachers`, rows: teacherRows, columns: teacherColumns, accordion: true },
    { title: `Locations`, rows: locationRows, columns: locationColumns, accordion: true },
    { title: `Service Type`, rows: serviceTypeRows, columns: serviceTypeColumns, accordion: true },
    { title: `Service Type & Location`, rows: serviceTypeLocationRows, columns: serviceTypeLocationColumns, accordion: true },
    { title: `Service`, rows: serviceRows, columns: serviceColumns, accordion: true },
    { title: `Term`, rows: termRows, columns: termColumns, accordion: true },
    { title: `Term & Year`, rows: termYearRows, columns: termYearColumns, accordion: true },
  ]

  const eventTables = [
    { title: `Events`, rows: eventRows, columns: eventColumns, accordion: true },
  ]

  const storesTables = [
    { title: `Stores`, rows: storesRows, columns: storesColumns, accordion: true },
  ]

  const pricingPlanTables = [
    { title: `Pricing Plans`, rows: pricingPlanRows, columns: pricingPlanColumns, accordion: true },
  ]
  const invoiceTables = [
    { title: `Invoices`, rows: invoiceRows, columns: invoiceColumns, accordion: true },
  ]



  const mapTables = (table: any, index: number) => {
    const tbl = (
      <Table
        data={table.rows}
        columns={table.columns}
      >
        {table.toolbar && (
          <TableToolbar>
            {table.toolbar}
          </TableToolbar>
        )}

        <Table.Content />
      </Table>
    );

    const content = table.accordion ? (
      <Accordion
        items={[
          accordionItemBuilder({
            title: table.title,
            children: (
              <Card>
                {tbl}
              </Card>
            ),
          }),

        ]}
      />
    ) : (
      <Card>
        {tbl}
      </Card>
    );

    return (
      <Cell span={12} key={index}>
        {content}
      </Cell>
    );
  };

  const [isModalOpened, setModalOpened] = React.useState(false);

  const openModal = () => setModalOpened(true);
  const closeModal = () => setModalOpened(false);

  const renderModalContent = () => (
    datePickerUI
  );


  const datePickerUI =

    <Cell span={12}>

      <Card>
        <Card.Header
          title="Dates of Purchase"
          subtitle={dateRange}
          suffix={
            <>
              <Button size="small" priority="secondary" onClick={closeModal} >
                Close
                < Dismiss/>
              </Button>
            </>
          }
        />

        <Box paddingTop="SP1" paddingBottom="SP1">
          <Divider />
        </Box>

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




  return (
    <WixDesignSystemProvider>
      <Page height="100vh">
        <Page.Header
          title="BB Broadway Reporting"
          subtitle="Bookings, Events & Stores Reporting"
          actionsBar={
            <>

              <Box direction="horizontal" gap="SP1">
              <Button onClick={runExportToCSV} disabled={running} priority="secondary">
                Export CSV
                <UploadExport/>
              </Button>

              <Button onClick={() => window.open(CMSlink, "_blank")} priority="secondary">
                Open CMS
                <DataCollection/>
              </Button>
                <Button priority="secondary" onClick={runSums} disabled={running}>
                  Refresh
                  <Refresh/>
                </Button>

                <Button onClick={openModal} disabled={running} prefixIcon={<DateSmall />}>
                  {dateRange}
                </Button>

                <Modal
                  isOpen={isModalOpened}
                  onRequestClose={closeModal}
                >
                  {renderModalContent()}
                </Modal>
              </Box>

            </>
          }
        />

        <Page.Content>

          <Layout gap="SP4">

            <Cell span={12}>
              <Card>
                <Accordion
                  items={[
                    accordionItemBuilder({
                      title: 'Data Processing (Date of Purchase)',
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

                          <Box display="flex" gap="12px">
                            <Button
                              onClick={runReport}
                              disabled={running}
                            >
                              {running ? 'Running...' : 'Process Data'}
                            </Button>

                            <Button
                              onClick={removeAnalytics}
                              disabled={running}
                              skin="destructive"
                            >
                              {running ? 'Running...' : 'Remove Analytics'}
                            </Button>
                          </Box>



                          <Box display="flex" gap="12px">
                            <Button
                              onClick={() => lockOrUnlockAnalytics(true)}
                              disabled={running}
                              priority="secondary"
                            >
                              {running ? 'Running...' : 'Lock'}
                            </Button>
                            <Button
                              onClick={() => lockOrUnlockAnalytics(false)}
                              disabled={running}
                              priority="secondary"
                            >
                              {running ? 'Running...' : 'Unlock'}
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
                <Card.Header
                  title={status}
                  subtitle={subStatus}
                  suffix={
                    <Box padding="SP4" direction="vertical" gap="SP4">

                      <Box
                        direction="horizontal"
                        gap="SP3"

                        align="right"
                      >
                        {/* <Button onClick={runExportToCSV} disabled={running}>
                          Export CSV
                        </Button>

                        <Button onClick={() => window.open(CMSlink, "_blank")}>
                          Open CMS
                        </Button> */}
                      </Box>
                    </Box>
                  }
                />
              </Card>


            </Cell>




            <Cell span={12}>
              <Card              >
                <Card.Header
                  title={`${formatGBP(sumRevenue + sumExpenses)}`}
                  subtitle={`+${formatGBP(sumRevenue)}, ${formatGBP(sumExpenses)}`}
                />
                <Box padding="SP4" direction="vertical" gap="SP4">

                  <Accordion
                    items={[
                      accordionItemBuilder({
                        title: "Summary",
                        children: (
                          <Table
                            data={summaryRows}
                            columns={summaryColumns}
                          ></Table>
                        ),
                      }),

                    ]}
                  />
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
                <Box padding="SP4" direction="vertical" gap="SP4">
                  <>
                    {bookingsTables.map(mapTables)}
                  </>
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
