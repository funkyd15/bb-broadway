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
  NumberInput,

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
  Saved,
  StatusWarningFilled,
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
  aggregateCollectionWithMembershipValueAndExpenses,
  getCollectionFields,
  duplicateCMSItems,
  countCMSItemsToDuplicate,
  aggregateExpenses,
  aggregateEvents
} from "../../../../public/lib/data-utilities";
import DatePickerWithShortcuts from "../../../../public/lib/datePicker";
import { queryPricingPlans } from "../../../../public/lib/pricingPlans";
import { exportToCSV } from "../../../../public/lib/csv";
import KeyValueInput from "../../../../public/lib/keyValueInput";


const w1 = "240px";

const CMSlink = "https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/wix-cms/folders/53822ca6-21cc-415e-acfe-ec828e1e60fe?apps-override=aad90d5f-bb9e-4dc3-b308-a33ff43ec1da";
const backupsLink = "https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/wix-cms/data-backups";

const DashboardPage: FC = () => {
  const analyticsCollections = [
    'bookingsAnalytics',
    'eventsAnalytics',
    'storesAnalytics',
    'invoicesAnalytics',
    'pricingPlanAnalytics',
    'expensesAnalytics',
    'b2bAnalytics',
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

  function addToFilter(value: string, key: string, filter: any, setFilterFunction: Function) {

    let valuesArray = filter[key] || [];
    valuesArray.push(value);
    valuesArray = [...new Set(valuesArray)];
    valuesArray.sort();

    setFilterFunction({ ...filter, [key]: valuesArray });
  }

  function removeFromFilter(value: string, key: string, filter: any, setFilterFunction: Function) {

    let valuesArray = filter[key] || [];
    if (valuesArray.includes(value)) {
      valuesArray = valuesArray.filter(i => i !== value);
      valuesArray.sort();
    }


    setFilterFunction({ ...filters, [key]: valuesArray });
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
  const [showWarning, setShowWarning] = useState<Boolean>(false);

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
  const [sumB2B, setSumB2B] = useState<Number>(0);

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
  const [B2BRows, setB2BRows] = useState<any[]>([]);
  const [expensesRows, setExpensesRows] = useState<any[]>([]);
  const [expensesTypeRows, setExpensesTypeRows] = useState<any[]>([]);
  const [expensesTypeSubTypeRows, setExpensesTypeSubTypeRows] = useState<any[]>([]);
  const [expensesSubTypeRows, setExpensesSubTypeRows] = useState<any[]>([]);

  const [expensesFields, setExpensesFields] = useState<any[]>([]);
  const [duplicateExpensesQueryOptions, setDuplicateExpensesQueryOptions] = useState<any[]>([]);
  const [duplicateExpensesModifyOptions, setDuplicateExpensesModifyOptions] = useState<any[]>([]);
  const [duplicateExpensesOptions, setDuplicateExpensesOptions] = useState<any>({ timeUnit: 'DAYS', value: 30, itterations: 1 });
  const [duplicateCollection, setDuplicateCollection] = useState<string>('expensesAnalytics');
  const [duplicateCountItems, setDuplicateCountItems] = useState<Number>(0);

  const [eventByTitleRows, setEventByTitleRows] = useState<any[]>([]);
  const [eventByTitleFilteredRows, setEventByTitleFilteredRows] = useState<any[]>([]);


  interface sortingKeyValue {
    key: string;
    direction: 'A-Z' | 'Z-A';
  }


  const [filters, setFilters] = useState<{}>({});
  const [sorting, setSorting] = useState<sortingKeyValue>({
    key: "amountReceivedSum",
    direction: 'Z-A',
  });

  const [eventsTitlefilters, setEventsTitleFilters] = useState<{}>({});
  const [eventsTitleSorting, setEventsTitleSorting] = useState<sortingKeyValue>({
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
      sumB2B,//25
      B2BRows,//26
      expensesRows,//27
      expensesTypeRows,//28
      expensesTypeSubTypeRows,//29
      expensesSubTypeRows,//30

      eventByTitleRows, //31


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
      sumAmountReceived('b2bAnalytics', start, end), // 25

      aggregateCollectionWithMembershipValueAndExpenses('b2bAnalytics', start, end, 'B2BTitle'), // 26
      aggregateExpenses(start, end, ['title']), // 27
      aggregateExpenses(start, end, ['type']),//28
      aggregateExpenses(start, end, ['type', 'subType']),//29
      aggregateExpenses(start, end, ['subType']),//30

      aggregateEvents(start, end) //31

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
    setSumB2B(sumB2B)//25
    setB2BRows(B2BRows)//26



    let summary = [
      { title: "Bookings", value: sumBookings },
      { title: "Events", value: sumEvents },
      { title: "B2B", value: sumB2B },
      { title: "Invoices", value: sumInvoices },
      { title: "Pricing Plans", value: sumPricingPlans },
      { title: "Stores", value: sumStores },
      { title: "All Expenses", amountExpensedSum: sumExpenses },
    ];


    summary.forEach(summaryItem => {
      const findExpenseByType = expensesTypeRows.find(i => i.type === summaryItem.title);
      if (findExpenseByType?.amountExpensedSum) {
        summaryItem.amountExpensedSum = findExpenseByType?.amountExpensedSum || 0;
        summaryItem.sum = summaryItem.value + summaryItem.amountExpensedSum;
      }
    });


    setShowWarning(`${bookingsDateRange}${eventsDateRange}`.includes("⚠️"));


    setSummaryRows(summary);

    setSumRevenue(sumRows(taxYearRows, 'amountReceivedSum'))

    // expensesRows.sort(function (a, b) {
    //   const sortKey = "amountExpensedSum";
    //   if (a[sortKey] < b[sortKey]) { return -1; }
    //   if (a[sortKey] > b[sortKey]) { return 1; }
    //   return 0;
    // })

    setExpensesRows(expensesRows)//27
    setExpensesTypeRows(expensesTypeRows)//28
    setExpensesTypeSubTypeRows(expensesTypeSubTypeRows)//29
    setExpensesSubTypeRows(expensesSubTypeRows)//30

    setEventByTitleRows(processRows(eventByTitleRows)) //31
    // console.log("locationRows", locationRows);

  }

  useEffect(() => {
    getCollectionFields(duplicateCollection).then((fields: any) => {
      setExpensesFields(fields);
    });

    countCMSItemsToDuplicateFunction([]);
  }, []);

  useEffect(() => {
    countCMSItemsToDuplicateFunction(duplicateExpensesQueryOptions);
  }, [duplicateCollection, duplicateExpensesQueryOptions]);

  useEffect(() => {

    getCollectionFields(duplicateCollection).then((fields: any) => {
      setExpensesFields(fields);
    });

  }, [duplicateCollection]);

  async function duplicateExpensesItems() {
    setRunning(true);
    setStatus("Duplicating Expenses...");
    const queryOptions = duplicateExpensesQueryOptions.filter(i => i.value);
    const modifyOptions = duplicateExpensesModifyOptions.filter(i => i.value);
    const results = await duplicateCMSItems(duplicateCollection, queryOptions, modifyOptions, duplicateExpensesOptions);

    setStatus("Duplicated Expenses");
    setSubStatus(`${results?.duplicatedItems?.length} Items Created`);

    await runSums();

    setTimeout(() => {
      setRunning(false);

    }, 2000);


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
      title: `Received`,
      render: (item) => Math.abs(item.value) > 0 ? formatGBP(item.value) : undefined,
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed`,
      render: (item) => Math.abs(item.amountExpensedSum) > 0 ? formatGBP(item.amountExpensedSum) : undefined,
      // width: '250px',
    },
    {
      id: 'sum',
      title: `Sum`,
      render: (item) => Math.abs(item.sum) > 0 ? formatGBP(item.sum) : undefined,
      infoTooltipProps: tooltips.sum,
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

  const expensesColumns: TableColumn<any>[] = [
    {
      id: 'title',
      title: `Title (${expensesRows.length})`,
      render: (item) => item.title,
      width: '250px',
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumExpenses)})`,
      render: (item) => formatGBP(item.amountExpensedSum),
      width: '250px',
    },
  ];

  const expensesTypeColumns: TableColumn<any>[] = [
    {
      id: 'Type',
      title: `Type (${expensesTypeRows.length})`,
      render: (item) => item.type,
      width: '250px',
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumExpenses)})`,
      render: (item) => formatGBP(item.amountExpensedSum),
      width: '250px',
    },
  ];
  const expensesSubTypeColumns: TableColumn<any>[] = [
    {
      id: 'subType',
      title: `Sub Type (${expensesSubTypeRows.length})`,
      render: (item) => item.subType,
      width: '250px',
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumExpenses)})`,
      render: (item) => formatGBP(item.amountExpensedSum),
      width: '250px',
    },
  ];

  const expensesTypeSubTypeColumns: TableColumn<any>[] = [
    {
      id: 'type',
      title: `Type (${expensesTypeSubTypeRows.length})`,
      render: (item) => item.type,
      width: '250px',
    },
    {
      id: 'subType',
      title: `Sub Type`,
      render: (item) => item.subType,
      width: '250px',
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumExpenses)})`,
      render: (item) => formatGBP(item.amountExpensedSum),
      width: '250px',
    },
  ];

  const B2BColumns: TableColumn<any>[] = [
    {
      id: 'title',
      title: `Title (${B2BRows.length})`,
      render: (item) => item.B2BTitle,
      width: '250px',
    },
    {
      id: 'amountReceivedSum',
      title: `Received (${formatGBP(sumB2B)})`,
      render: (item) => formatGBP(item.amountReceivedSum),
      width: '250px',
    },
    {
      id: 'amountExpensedSum',
      title: `Expensed (${formatGBP(sumRows(B2BRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
    },
    {
      id: 'sum',
      title: `Sum (${formatGBP(sumRows(B2BRows, 'sum'))})`,
      render: (item) => formatGBP(item.sum),
      infoTooltipProps: tooltips.sum,
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

  const eventByTitleColumns: TableColumn<any>[] = [
    {
      id: 'title',
      title: `Title (${eventByTitleFilteredRows.length})`,
      render: (item) => item.eventTitle,
      width: '250px',
    },
    {
      id: 'serviceType',
      title: `Service`,
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
      width: '100px',
    },
    {
      id: 'mainCategory',
      title: `Category`,
      render: (item) => item.mainCategory,
      width: '75px',
    },
    {
      id: 'amountReceivedSum',
      title: `R (${formatGBP(sumRows(eventByTitleFilteredRows, 'amountReceivedSum'))})`,
      render: (item) => formatGBP(item.amountReceivedSum),

    },
    {
      id: 'amountExpensedSum',
      title: `E (${formatGBP(sumRows(eventByTitleFilteredRows, 'amountExpensedSum'))})`,
      render: (item) => formatGBP(item.amountExpensedSum),
    },
    {
      id: 'sum',
      title: `S (${formatGBP(sumRows(eventByTitleFilteredRows, 'sum'))})`,
      render: (item) => formatGBP(item.sum),
    },
  ];


  function getDropdownOptionsFromRows(rows: any[], key: string, allValue?: string) {
    const values = [...new Set(rows.map(i => i[key]))].sort();
    // const options = values.map((i: any, index: number) => ({ id: (index + 1).toString(), value: i }));
    const options = values.map((i: any, index: number) => ({ id: i, value: i })).filter(i => i.value);
    if (allValue) {
      options.unshift({ id: "0", value: allValue });
    }

    return options;

  }


  useEffect(() => {
    filterRows(serviceTermYearLocationRows, filters, sorting, setServiceTermYearLocationFilteredRows);
  }, [serviceTermYearLocationRows, filters, sorting]);


  useEffect(() => {
    filterRows(eventByTitleRows, eventsTitlefilters, eventsTitleSorting, setEventByTitleFilteredRows);
  }, [eventByTitleRows, eventsTitlefilters, eventsTitleSorting]);

  useEffect(() => {
    console.log(duplicateExpensesOptions);

  }, [duplicateExpensesOptions]);


  function filterRows(sourceRows: any[], filter: any, sort: sortingKeyValue, setFunction: Function,) {
    let filteredRows = structuredClone(sourceRows);

    for (const [key, value] of Object.entries(filter)) {
      if (value && value.length > 0) {
        filteredRows = filteredRows.filter(i => i[key] && value.includes(i[key]));
      }
    }

    filteredRows.sort(function (a, b) {
      const sortKey = sort.key;
      if (a[sortKey] < b[sortKey]) { return sort.direction === "A-Z" ? -1 : 1; }
      if (a[sortKey] > b[sortKey]) { return sort.direction === "A-Z" ? 1 : -1; }
      return 0;
    })

    setFunction(filteredRows);
  }

  const makeMultiCheckbox = (key: string, placeholder: string, rows: any[], filter: any, setFilterFunction: Function) => {
    return (<MultiSelectCheckbox
      size="medium"
      placeholder={placeholder}
      selectedOptions={filter[key] || []}
      onSelect={(value) => addToFilter(value, key, filter, setFilterFunction)}
      onDeselect={(value) => removeFromFilter(value, key, filter, setFilterFunction)}
      options={getDropdownOptionsFromRows(rows, key)}
      clearButton
      onClear={() => setFilterFunction({ ...filter, [key]: [] })}
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
          {makeMultiCheckbox("serviceType", "Service Type", serviceTermYearLocationRows, filters, setFilters)}
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("year", "Year", serviceTermYearLocationRows, filters, setFilters)}
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("term", "Term", serviceTermYearLocationRows, filters, setFilters)}
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("parseLocation", "Locations", serviceTermYearLocationRows, filters, setFilters)}
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

  const tableEventsTitleFilters =
    <TableToolbar>
      <TableToolbar.ItemGroup position="start">
        <TableToolbar.Item>
          <Filter />
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("eventTitle", "Event Title", eventByTitleRows, eventsTitlefilters, setEventsTitleFilters)}
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("serviceType", "Service", eventByTitleRows, eventsTitlefilters, setEventsTitleFilters)}
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("mainCategory", "Category", eventByTitleRows, eventsTitlefilters, setEventsTitleFilters)}
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("year", "Year", eventByTitleRows, eventsTitlefilters, setEventsTitleFilters)}
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("term", "Term", eventByTitleRows, eventsTitlefilters, setEventsTitleFilters)}
        </TableToolbar.Item>

        <TableToolbar.Item>
          {makeMultiCheckbox("parseLocation", "Locations", eventByTitleRows, eventsTitlefilters, setEventsTitleFilters)}


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
            selectedId={eventsTitleSorting?.key}
            border="round"
            size="small"
            popoverProps={{ appendTo: 'window' }}
            onSelect={(key) => setEventsTitleSorting({ ...eventsTitleSorting, ...{ key: key.id } })}
            valueParser={({ value }) => value}
          />
        </TableToolbar.Item>
        <TableToolbar.Item>
          <Dropdown
            options={[
              { id: 'Z-A', value: 'Z-A' },
              { id: 'A-Z', value: 'A-Z' },
            ]}
            selectedId={eventsTitleSorting?.direction}
            border="round"
            size="small"
            popoverProps={{ appendTo: 'window' }}
            onSelect={(direction) => setEventsTitleSorting({ ...eventsTitleSorting, ...{ direction: direction.value } })}
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
    { title: `Events By Title`, rows: eventByTitleFilteredRows, columns: eventByTitleColumns, accordion: true, toolbar: tableEventsTitleFilters },
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
  const B2BTables = [
    { title: `B2B`, rows: B2BRows, columns: B2BColumns, accordion: true },
  ]
  const expensesTables = [
    { title: `Expenses: Type, Sub Type`, rows: expensesTypeSubTypeRows, columns: expensesTypeSubTypeColumns, accordion: true },
    { title: `Expenses: Type`, rows: expensesTypeRows, columns: expensesTypeColumns, accordion: true },
    { title: `Expenses: Sub Type`, rows: expensesSubTypeRows, columns: expensesSubTypeColumns, accordion: true },
    { title: `Expenses: Title`, rows: expensesRows, columns: expensesColumns, accordion: true },
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
                < Dismiss />
              </Button>
            </>
          }
        />

        <Box paddingTop="SP1" paddingBottom="SP1">
          <Divider />
        </Box>

        <Box padding="SP4" direction="vertical" gap="SP3">


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


  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  async function countCMSItemsToDuplicateFunction(value: any[]) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      const totalCount = await countCMSItemsToDuplicate(
        duplicateCollection,
        value // use the latest value, not state
      );

      setDuplicateCountItems(Number(totalCount));
    }, 1000);
  }

  const duplicateExpensesUI = <Box padding="SP1" direction="vertical" gap="SP3">

    <Box
      direction="vertical" gap="SP1">
      <Text secondary>Collection</Text>
      <Box direction="horizontal" gap="SP3" width="400px">
        <FormField>
          <Dropdown
            options={[
              { id: "expensesAnalytics", value: "Expenses" },
              { id: "b2bAnalytics", value: "B2B" },
            ]}
            selectedId={duplicateCollection}
            popoverProps={{ appendTo: 'window' }}
            onSelect={(value: any) => {
              setDuplicateCollection(value.id)
            }}
            valueParser={({ value }) => value}
          >
          </Dropdown>
        </FormField>


        <Box
          width={w1}
        >

          <Button
            priority="secondary"
            onClick={() => { countCMSItemsToDuplicateFunction(duplicateExpensesQueryOptions) }}
            disabled={running}>
            Found {duplicateCountItems.toString()} Items
            <Refresh />
          </Button>
        </Box>
      </Box>


    </Box>

    <Divider />

    <FormField
      label="Filter Values"
    >
      <KeyValueInput
        items={expensesFields}
        onChange={(value) => {
          setDuplicateExpensesQueryOptions(value);
          // countCMSItemsToDuplicateFunction(value);
        }}
      >
      </KeyValueInput>
    </FormField>



    <Divider />
    <FormField
      label="Modify Values"
    >

      <KeyValueInput
        items={expensesFields}
        onChange={(value) => {
          setDuplicateExpensesModifyOptions(value);

        }}
      >
      </KeyValueInput>
    </FormField>

    <Divider />



    <Box
      padding="SP1" direction="vertical" gap="SP3"
    >

      <Box
        padding="SP1" direction="horizontal" gap="SP3"
      >



        <Box
          padding="SP1" direction="vertical" gap="SP1">
          <Text secondary>Time Unit</Text>
          <FormField>
            <Dropdown
              options={[
                { id: "DAYS", value: "DAYS" },
                { id: "MONTHS", value: "MONTHS" },
                { id: "YEARS", value: "YEARS" },
              ]}
              selectedId={duplicateExpensesOptions.timeUnit}
              popoverProps={{ appendTo: 'window' }}
              onSelect={(value: any) => {
                setDuplicateExpensesOptions({ ...duplicateExpensesOptions, timeUnit: value.id })
              }}
              valueParser={({ value }) => value}
            >
            </Dropdown>
          </FormField>
        </Box>



        <Box
          padding="SP1" direction="vertical" gap="SP1">
          <Text secondary>Add {duplicateExpensesOptions.timeUnit?.toLowerCase()}</Text>
          <FormField>
            <NumberInput
              value={duplicateExpensesOptions.value.toString()}
              onChange={(value: string) => {
                setDuplicateExpensesOptions({ ...duplicateExpensesOptions, value: Number(value) })
              }}
            >
            </NumberInput>
          </FormField>
        </Box>

        <Box
          padding="SP1" direction="vertical" gap="SP1">
          <Text secondary>Itterations</Text>
          <FormField>
            <NumberInput
              value={duplicateExpensesOptions.itterations.toString()}
              onChange={(value: string) => {
                setDuplicateExpensesOptions({ ...duplicateExpensesOptions, itterations: Number(value) })
              }}
            >
            </NumberInput>
          </FormField>
        </Box>




      </Box>


      <Box
        padding="SP1" direction="horizontal" gap="SP3"
      >



        <Button
          onClick={duplicateExpensesItems}
          disabled={running}
          prefixIcon={<DataCollection />}

        >
          Duplicate Items ({(duplicateCountItems * duplicateExpensesOptions.itterations).toString()})

        </Button>
      </Box>



    </Box>


  </Box>


  return (
    <WixDesignSystemProvider>
      <Page height="100vh">
        <Page.Header
          title="BB Broadway"
          subtitle="Income & Expenses Reporting"
          actionsBar={
            <>

              <Box direction="horizontal" gap="SP1">
                <Button onClick={runExportToCSV} disabled={running} priority="secondary">
                  Export CSV
                  <UploadExport />
                </Button>

                <Button onClick={() => window.open(CMSlink, "_blank")} priority="secondary">
                  Open CMS
                  <DataCollection />
                </Button>

                <Button onClick={() => window.open(backupsLink, "_blank")} priority="secondary">
                  Backups
                  <Saved />
                </Button>

                <Button priority="secondary" onClick={runSums} disabled={running}>
                  Refresh
                  <Refresh />
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

          <Layout gap="SP2">

            <Cell span={12}>

              <Card>
                <Card.Header
                  title={status}
                  subtitle={subStatus}
                  suffix={
                    <Box padding="SP1" direction="vertical" gap="SP1">

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


              <Card>

                <Accordion
                  items={[
                    accordionItemBuilder({
                      title: `Process WIX App Data${showWarning ? '⚠️' : ''}`,
                      children: (
                        <Box padding="SP1" direction="vertical" gap="SP3">
                          <Heading size="medium">By Date of Purchase: {dateRange}</Heading>
                          {showWarning ? <Text>⚠️ Data may be out-of-date</Text> : undefined}
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

              <Card>

                <Accordion
                  items={[
                    accordionItemBuilder({
                      title: 'Duplicate Expenses',
                      children: (
                        duplicateExpensesUI
                      ),
                    }),
                  ]}
                />


              </Card>

            </Cell>


            <Cell span={12}>
              <Card              >
                <Card.Header
                  title={`${dateRange}`}
                  subtitle={`${formatGBP(sumRevenue + sumExpenses)} (+${formatGBP(sumRevenue)}, ${formatGBP(sumExpenses)})`}
                />
                <Box padding="SP1" direction="vertical" gap="SP1">

                  <Accordion
                    items={[
                      accordionItemBuilder({
                        title: "Summary by Area",
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
                <Box padding="SP1" direction="vertical" gap="SP1">
                  <>
                    {taxTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP1" direction="vertical" gap="SP1">
                  <>
                    {bookingsTables.map(mapTables)}
                  </>
                </Box>

              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP1" direction="vertical" gap="SP1">
                  <>
                    {eventTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP1" direction="vertical" gap="SP1">
                  <>
                    {B2BTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP1" direction="vertical" gap="SP1">
                  <>
                    {invoiceTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP1" direction="vertical" gap="SP1">
                  <>
                    {storesTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Box padding="SP1" direction="vertical" gap="SP1">
                  <>
                    {pricingPlanTables.map(mapTables)}
                  </>
                </Box>
              </Card>
            </Cell>
            <Cell span={12}>
              <Card>
                <Box padding="SP1" direction="vertical" gap="SP1">
                  <>
                    {expensesTables.map(mapTables)}
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
