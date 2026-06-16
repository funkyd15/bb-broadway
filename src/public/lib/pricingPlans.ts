import { orders } from "@wix/pricing-plans";
import { items as wixData } from '@wix/data';
import { bulkSaveSets, sumAmountReceived } from "./data-utilities";
import { getUKTaxYear, TaxYearFormat, config } from "./utilities";
import { contacts } from "@wix/crm";

const anaylticsCollection = "pricingPlanAnalytics";
const limit = 50;

export async function queryPricingPlans(startDate: Date, endDate: Date, statusState: Function) {
    await wixData.truncate(anaylticsCollection);

    let allItems: any[] = [];

    function updateStatus(status?: String) {
        statusState(status);
    }

    async function parseAndSavePricingPlans(items: orders.Order[]) {

        let parsedItems = [];
        items.forEach((i: any) => {
            const cycles = i.cycles || [];

            cycles.forEach((cycle: any, index: number) => {
                const createdDate = cycle.startedDate;
                const createdDateYYYYMMDD = createdDate.toISOString().split("T")[0];

                const planStartDate = i.startDate;
                const planEndDate = i.endDate;

                const amountReceived = Number(i.priceDetails.total);
                const subscriptionId = i.subscriptionId;
                const _id = `${i._id}-${index.toString().padStart(4, '0')}`;

                const parsedItem = {
                    _id,
                    subscriptionId,
                    orderId: i._id,
                    createdDate: createdDateYYYYMMDD,
                    taxYear: getUKTaxYear(createdDate, TaxYearFormat.Year),
                    taxQuarter: getUKTaxYear(createdDate, TaxYearFormat.Quarter),
                    taxMonth: getUKTaxYear(createdDate, TaxYearFormat.Month),
                    link: `https://manage.wix.com/dashboard/0210b701-c715-482e-bdcf-2e8185181308/subscriptions/${subscriptionId}`,
                    planName: i.planName,
                    planStartDate,
                    planEndDate,
                    amountReceived,
                    cyclesLength: cycles.length,
                    //    order: config.includeOrder ? findOrder : undefined,
                    // item: config.includeItem ? i : undefined,
                    buyerContact: i.buyer?.contactId,
                    item: i,

                }
                parsedItems.push(parsedItem);

            });

        });

        allItems.push(...parsedItems);
    }

    const filter = {
        "status": "CONFIRMED",
        "$and": [{
            "createdDate": {
                "$gte": startDate
            }
        },
        {
            "createdDate": {
                "$lte": endDate
            }
        }
        ]
    }

    let page = 0;
    const query = { filter, cursorPaging: { limit: limit } }
    // const query = { filter, paging: { limit: 100,offset:0 } }
    let options = { fieldSet: "FULL", offset: (page * limit) }
    let response = await orders.managementListOrders(options);
    console.log("orders.managementListOrders", response);
    updateStatus(`Page: ${page}, (${allItems.length}/${response.pagingMetadata?.total})`);
    await parseAndSavePricingPlans(response.orders);

    while (response.pagingMetadata?.hasNext) {
        page++;
        options.offset = (page * limit);
        response = await orders.managementListOrders(options);
        updateStatus(`Page: ${page}, (${allItems.length}/${response.pagingMetadata?.total})`);
        await parseAndSavePricingPlans(response.orders);

    }

    if (allItems.length > 0) {
        try {
            const contactIds: string[] = allItems
                .map(i => i.buyerContact)
                .filter(Boolean);

            if (contactIds.length > 0) {
                const contactsQuery = {
                    filter: {
                        _id: { $in: contactIds }
                    },
                    paging: {
                        limit: 1000
                    }
                };

                const contactsResponse = await contacts.queryContacts(contactsQuery);
                const contactItems = contactsResponse?.contacts;

                allItems.forEach(i => {
                    const findContact = contactItems?.find(
                        c => c._id === i.buyerContact
                    );

                    if (findContact) {
                        i.email = findContact.primaryEmail;
                    }
                });
            }
        } catch (error) {
            console.error("contacts", error);
        }
    }


    statusState(`Saving: ${allItems.length}`)

    await bulkSaveSets(allItems, anaylticsCollection, statusState);

    return allItems;
}