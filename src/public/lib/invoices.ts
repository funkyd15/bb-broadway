import { items } from '@wix/data';
import { bulkSaveSets } from "./data-utilities";
import { getUKTaxYear, TaxYearFormat, config, YYYYMMDD } from "./utilities";

const sourceCollection = "invoices";
const anaylticsCollection = "invoicesAnalytics";
const limit = 1000;

export async function queryInvoices(startDate: Date, endDate: Date, statusState: Function) {
    statusState("Running queryInvoices...");

    let allItems = [];

    function updateStatus(page?: Number) {
        statusState(`Page: ${page}, (${allItems.length})`);
    }

    async function parseAndSaveInvoices(invoiceItems: any) {

        let parsedItems = [];
        invoiceItems.forEach((i: any) => {
            const invoice = i.invoice;
            const lineItems = invoice.lineItems;
            const lineItemNames = lineItems.filter((i:any)=>i.name).map((i:any)=>i.name.trim()).join(";");
            const payments = invoice?.payments || [];
            if(payments.length > 0){

                payments.forEach((payment: any) => {
                    const createdDate = payment.date ? new Date(payment.date) : new Date(invoice.dates.issueDate);
                    const createdDateYYYYMMDD = YYYYMMDD(createdDate);
    
                    const paymentStatus =invoice.status;
                    const amountReceived =paymentStatus === "Void" ? 0 :  payment.amount ;
                    const parsedItem = {
                        _id: payment.id,
                        invoiceId:invoice.id.id,
                        invoiceNumber: invoice.number,
                        createdDate: createdDateYYYYMMDD,
                        taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
                        taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
                        taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
                        link: `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/wix-invoices`,
                        paymentStatus,
                        title:invoice.title || invoice.number,
                        amountReceived,
                        email: invoice.customer.email,
                        item: config.includeItem ? invoice : undefined,
                        lineItems,
                        lineItemNames,
    
                    }
                    parsedItems.push(parsedItem);
                });
            }

        });

        allItems.push(...parsedItems);
    }


    let page = 0;
//
    let results = await items.query(sourceCollection).ge('issueDate', YYYYMMDD(startDate)).le('issueDate', YYYYMMDD(endDate)).limit(limit).find();
    console.log("invoice", results);
    updateStatus(page);
    await parseAndSaveInvoices(results.items);

    while (results.hasNext()) {
        page++;
        results = await results.next();
        updateStatus(page);
        await parseAndSaveInvoices(results.items);

    }

    statusState(`Saving: ${allItems.length}`)

    await bulkSaveSets(allItems, anaylticsCollection,statusState);

    return allItems;

}

